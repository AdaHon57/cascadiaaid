import { journeyAutomation } from "@/data/journey-automation";
import { journeyConnections } from "@/data/journey-connections";
import { organizationForTask } from "@/lib/household-organizations";
import { intakeQuestions } from "@/data/intake-questions";
import { baseTaskId, evaluateJourney, getJourney, usableDocument } from "@/lib/recovery-journey";
import type { AutomationJob, AutomationPayload } from "@/types/automation";
import type { IntakeRecord } from "@/types/intake";
import type { IntakeEnvironment } from "@/types/intake-storage";

export function automationConfig(env: IntakeEnvironment) {
  const url = env.AUTOMATION_SERVICE_URL ?? process.env.AUTOMATION_SERVICE_URL;
  const token = env.AUTOMATION_SERVICE_TOKEN ?? process.env.AUTOMATION_SERVICE_TOKEN;
  if (!url || !token || token.length < 32) return null;
  const parsed = new URL(url);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)))
  )
    return null;
  return { url: parsed.origin, token };
}

export async function runnerRequest(
  env: IntakeEnvironment,
  id: string,
  command: Record<string, unknown>,
) {
  const config = automationConfig(env);
  if (!config) throw new Error("Automation service is not connected.");
  const response = await fetch(`${config.url}/jobs/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(55_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Automation service is unavailable.");
  const result = (await response.json()) as AutomationJob;
  if (
    result.id !== id ||
    !Number.isInteger(result.version) ||
    result.version < 0 ||
    typeof result.message !== "string" ||
    result.message.length > 2000 ||
    ![
      "discovering",
      "awaiting_authorization",
      "working",
      "needs_input",
      "needs_user",
      "submitted",
      "checked",
      "failed",
      "uncertain",
      "cancelled",
    ].includes(result.status)
  )
    throw new Error("Invalid automation service response.");
  if (
    ["submitted", "checked"].includes(result.status) &&
    (!result.receipt?.evidence || !result.receipt.url.startsWith("https://") || !result.receipt.at)
  )
    throw new Error("Invalid automation confirmation.");
  return result;
}

export function automationTask(record: IntakeRecord, taskId: string) {
  const task = evaluateJourney(record).find((item) => item.definition.id === taskId);
  if (!task) throw new Error("Unknown recovery task.");
  const plan = journeyAutomation[baseTaskId(taskId)];
  if (!plan || plan.mode === "document")
    throw new Error("Invalid action: this task is prepared inside the app.");
  if (
    !record.confirmed ||
    getJourney(record).demo.enabled ||
    record.documents.some((document) => document.testData)
  )
    throw new Error("Invalid action: confirm real household information before using automation.");
  if (
    ["not-applicable", "achieved", "closed", "blocked"].includes(task.status) ||
    task.applicable === null
  )
    throw new Error(
      "Invalid action: confirm this task applies and resolve its prerequisites first.",
    );
  if (task.task.submittedAt && plan.mode === "request")
    throw new Error("Invalid action: a submission is already recorded. Use its follow-up step.");
  return { task, plan };
}

export async function automationPayload(
  record: IntakeRecord,
  taskId: string,
  id: string,
  env: IntakeEnvironment,
): Promise<AutomationPayload> {
  const { task, plan } = automationTask(record, taskId);
  const answers = record.confirmed!.answers;
  const fields = new Set([
    ...task.definition.questions,
    ...plan.contextKeys,
    "affectedStreet",
    "affectedCity",
    "affectedState",
    "affectedZip",
    "householdSize",
  ]);
  const facts: Record<string, string> = {};
  for (const key of fields) {
    const answer = answers[key];
    if (!answer || ["unknown", "skipped"].includes(String(answer))) continue;
    const question = intakeQuestions.find((item) => item.id === key);
    const display = (value: string) =>
      question?.options?.find(([id]) => id === value)?.[1] || value;
    facts[`${key}: ${question?.label || key}`] = Array.isArray(answer)
      ? answer.map(display).join(", ")
      : display(answer);
  }
  const program = record.confirmed!.applications.find((app) => taskId.endsWith(`:${app.id}`));
  if (program) facts["program: existing application"] = JSON.stringify(program);
  const selected = record.documents.filter(
    (document) =>
      usableDocument(document, record) && task.definition.evidenceTypes.includes(document.type),
  );
  if (selected.some((document) => document.testData))
    throw new Error("Invalid action: remove sample documents before a real submission.");
  const documents: AutomationPayload["documents"] = [];
  let size = 0;
  for (const document of selected) {
    const saved = await env.DOCUMENTS.get(`${record.id}/${document.id}`);
    if (!saved) throw new Error("Invalid action: a selected document could not be loaded.");
    const bytes = new Uint8Array(await new Response(saved.body).arrayBuffer());
    size += bytes.length;
    if (size > 16 * 1024 * 1024)
      throw new Error("Invalid action: select fewer documents (16 MB maximum).");
    const text = [document.reviewedText, JSON.stringify(document.fields)]
      .filter(Boolean)
      .join("\n");
    facts[`document:${document.id}`] = text;
    documents.push({
      id: document.id,
      type: document.type,
      text,
      data: Buffer.from(bytes).toString("base64"),
    });
  }
  return {
    id,
    task: { id: taskId, title: task.definition.title, goal: task.definition.goal },
    plan,
    location: [answers.affectedCity, answers.affectedState, answers.affectedZip]
      .filter(Boolean)
      .join(", "),
    organization: organizationForTask(record, taskId).name,
    startingUrls: [
      organizationForTask(record, taskId).url,
      ...journeyConnections[baseTaskId(taskId)].links.map((link) => link.href),
    ].filter((href): href is string => typeof href === "string" && href.startsWith("https://")),
    facts,
    documents,
  };
}

export function mergeAutomation(
  record: IntakeRecord,
  taskId: string,
  result: AutomationJob,
): IntakeRecord {
  const next = structuredClone(record);
  next.journey = getJourney(next);
  const task = next.journey.tasks[taskId];
  if (
    !task?.automation ||
    task.automation.id !== result.id ||
    result.version < task.automation.version
  )
    return record;
  task.automation = result;
  if (result.status === "submitted" && result.receipt) {
    task.submittedAt ||= result.receipt.at;
    // Receipt confirms delivery only. Decisions and real-world outcomes remain separate.
  }
  return next;
}
