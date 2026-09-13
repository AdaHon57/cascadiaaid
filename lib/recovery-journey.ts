import { journeyWorkflows, outcomeDocumentTypes } from "@/data/journey-workflows";
import { dashboardPriorityFactors } from "@/data/dashboard-priorities";
import { activeAnswers, intakeQuestions } from "@/data/intake-questions";
import { calculatePriority, PRIORITY_WEIGHTS, rankRecoveryNodes } from "@/lib/priority-engine";
import { documentConflicts, intakeToRecovery } from "@/lib/intake-recovery";
import { validateDraft } from "@/lib/intake-validation";
import type { IntakeRecord, IntakeDocument, IntakeAnswers } from "@/types/intake";
import type {
  JourneyDefinition,
  JourneyTask,
  JourneyStatus,
  RecoveryJourney,
  JourneyArtifact,
} from "@/types/journey";
import type { PriorityFactors } from "@/types/priority";
import type { MapBadge } from "@/lib/intake-map";
import { organizationForTask } from "@/lib/household-organizations";

const propertyTasks = new Set(["hazards", "cleanup", "permits", "rebuilding", "safe-property"]);

const programStages = ["application", "review", "appeal", "funds"];
export const baseTaskId = (id: string) => id.split(":")[0];
export function journeyDefinitions(record: IntakeRecord): JourneyDefinition[] {
  const apps = record.confirmed?.applications ?? [];
  return journeyWorkflows.flatMap((def) =>
    !programStages.includes(def.id) || !apps.length
      ? [def]
      : apps.map((app) => ({
          ...def,
          id: `${def.id}:${app.id}`,
          title: `${def.title}: ${app.organization || "Unnamed program"}`,
          recipient: app.organization || def.recipient,
          prerequisites: def.prerequisites.map((p) => ({ ...p, id: `${p.id}:${app.id}` })),
        })),
  );
}
export function journeyNow(record: IntakeRecord, now = new Date()) {
  return new Date(now.getTime() + (record.journey?.demo.dayOffset ?? 0) * 86400000);
}
export function getJourney(record: IntakeRecord): RecoveryJourney {
  if (record.journey) return record.journey;
  const tasks: Record<string, JourneyTask> = {};
  const a = activeAnswers(record.confirmed?.answers ?? {});
  const at = record.confirmedAt || new Date(0).toISOString();
  const submission: Record<string, boolean> = {
    claim: a.claimSubmitted === "yes",
    "tax-relief": a.taxRequested === "yes",
    permits: ["requested", "issued"].includes(String(a.permitStatus)),
    identity: a.replacementRequested === "yes",
  };
  for (const def of journeyDefinitions(record)) {
    const oldProgress = record.caseRecord.progress.find((p) => p.nodeId === def.engineId);
    const app = record.confirmed?.applications.find((p) => def.id.endsWith(`:${p.id}`));
    const submitted =
      submission[def.id] ||
      (baseTaskId(def.id) === "application" &&
        app &&
        ["submitted", "information", "approved", "denied", "appealing", "received"].includes(
          app.status,
        ));
    tasks[def.id] = {
      notes: "",
      ...(oldProgress?.started ? { startedAt: at } : {}),
      ...(submitted ? { submittedAt: at } : {}),
    };
    // Old COMPLETE represented a milestone, not necessarily a final outcome.
    if (oldProgress?.milestoneReached)
      tasks[def.id].notes =
        "An earlier milestone was recorded. Confirm the final outcome and its supporting evidence here.";
    if (app?.deadline) tasks[def.id].dueDate = app.deadline;
    if (["claim-outcome", "tax-determination"].includes(def.id)) {
      const due = a[def.id === "claim-outcome" ? "claimDeadline" : "taxDeadline"];
      if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due)) tasks[def.id].dueDate = due;
    }
  }
  return {
    version: 1,
    tasks,
    events: [],
    operationIds: [],
    activeTaskId: null,
    skippedIds: record.dashboard?.skippedStepIds ?? [],
    demo: { enabled: false, dayOffset: 0 },
  };
}
function applies(
  def: JourneyDefinition,
  record: IntakeRecord,
  journey: RecoveryJourney,
): boolean | null {
  const a = activeAnswers(record.confirmed?.answers ?? {});
  const app = record.confirmed?.applications.find((item) => def.id.endsWith(`:${item.id}`));
  switch (def.applicability) {
    case "housing":
      return a.accommodationHelp === "yes" || ["no", "unknown"].includes(String(a.safeTonight))
        ? true
        : a.accommodationHelp === "no" && a.safeTonight === "yes"
          ? false
          : null;
    case "damage":
      return a.condition === "undamaged" &&
        Array.isArray(a.affected) &&
        a.affected.every((v) => v === "evacuated")
        ? false
        : a.condition
          ? true
          : null;
    case "identity":
      return a.recordsLost === "no"
        ? false
        : Array.isArray(a.lostTypes)
          ? a.lostTypes.some((t) => ["id", "birth", "unknown", "other"].includes(t))
          : null;
    case "occupancy":
      return a.occupancyNeeded === "no" ? false : a.occupancyNeeded === "yes" ? true : null;
    case "insurance":
      return a.insurance === "no" ? false : a.insurance === "yes" ? true : null;
    case "assistance":
      return app
        ? true
        : a.assistanceInterest === "no" && a.assistanceApplied === "no"
          ? false
          : a.assistanceInterest === "yes" || a.assistanceApplied === "yes"
            ? true
            : null;
    case "followup": {
      const id = def.id.replace(/^appeal/, "review");
      const applicationId = def.id.replace(/^appeal/, "application");
      return (
        [journey.tasks[id]?.response, journey.tasks[applicationId]?.response, app?.status].some(
          (v) => v && ["information", "denied", "appealing"].includes(v),
        ) || !!journey.tasks[def.id]?.startedAt
      );
    }
    case "property":
      return a.propertyWork === "no" || (a.relationship === "renter" && a.repairRole === "no")
        ? false
        : a.propertyWork === "yes" || a.relationship === "owner"
          ? true
          : null;
    case "permits":
      return a.permitsRequired === "no" ||
        a.rebuild === "not-rebuilding" ||
        (a.relationship === "renter" && a.repairRole === "no")
        ? false
        : a.permitsRequired === "yes"
          ? true
          : null;
    case "repairs":
      return a.rebuild === "not-rebuilding" ||
        (a.relationship === "renter" && a.repairRole === "no")
        ? false
        : ["repair", "rebuild"].includes(String(a.rebuild))
          ? true
          : null;
    case "tax":
      return a.taxInterest === "no" ||
        a.taxSeeking === "no" ||
        (a.relationship === "renter" && a.taxInterest !== "yes")
        ? false
        : a.relationship === "owner" || a.taxInterest === "yes"
          ? true
          : null;
    default:
      return true;
  }
}
export function usableDocument(doc: IntakeDocument, record: IntakeRecord) {
  return (
    !!doc.confirmedAt &&
    doc.recipientStatus !== "rejected" &&
    (record.journey?.demo.enabled || !doc.testData) &&
    (documentConflicts(doc, activeAnswers(record.confirmed?.answers ?? {}), record.documents)
      .length === 0 ||
      !!doc.conflictAcknowledgment.trim())
  );
}
export interface EvaluatedJourneyTask {
  definition: JourneyDefinition;
  task: JourneyTask;
  status: JourneyStatus;
  blockers: { id: string; title: string; reason: string }[];
  applicable: boolean | null;
  score: number;
  factors: PriorityFactors;
  priorityReason: string;
  skipped: boolean;
  overdue: boolean;
}
export function evaluateJourney(record: IntakeRecord, now = new Date()): EvaluatedJourneyTask[] {
  const journey = getJourney(record);
  const defs = journeyDefinitions(record);
  const a = activeAnswers(record.confirmed?.answers ?? {});
  const clock = journeyNow(record, now).getTime();
  const statuses = new Map<string, JourneyStatus>();
  const resolving = new Set<string>();
  const applicable = (def: JourneyDefinition) =>
    propertyTasks.has(def.id)
      ? true
      : journey.tasks[def.id]?.notApplicable
        ? false
        : applies(def, record, journey);
  const relevantPrerequisites = (def: JourneyDefinition) =>
    propertyTasks.has(def.id) ? [] : def.prerequisites.filter((p) => !p.when || a[p.when] !== "no");
  const satisfied = (p: JourneyDefinition["prerequisites"][number]) => {
    const def = defs.find((d) => d.id === p.id);
    if (!def || applicable(def) === false) return true;
    const status = getStatus(def);
    if (p.milestone === "submitted") return !!journey.tasks[p.id]?.submittedAt;
    return status === "achieved";
  };
  const getStatus = (def: JourneyDefinition): JourneyStatus => {
    if (statuses.has(def.id)) return statuses.get(def.id)!;
    if (resolving.has(def.id)) return "blocked";
    resolving.add(def.id);
    const task = journey.tasks[def.id];
    let status: JourneyStatus = "ready";
    if (applicable(def) === false) status = "not-applicable";
    else if (task?.outcome?.kind === "closed") status = "closed";
    else if (task?.outcome?.kind === "achieved") {
      status = task.outcome.documentIds.every((id) =>
        record.documents.some((doc) => doc.id === id && usableDocument(doc, record)),
      )
        ? "achieved"
        : "information";
    } else if (!relevantPrerequisites(def).every(satisfied)) status = "blocked";
    else if (task?.response) status = task.response;
    else if (task?.submittedAt) status = "waiting";
    resolving.delete(def.id);
    statuses.set(def.id, status);
    return status;
  };
  const results = defs.map((definition) => {
    const task = journey.tasks[definition.id] ?? { notes: "" };
    const status = getStatus(definition);
    const blockers = relevantPrerequisites(definition)
      .filter((p) => !satisfied(p))
      .map((p) => ({
        id: p.id,
        title: defs.find((d) => d.id === p.id)?.title || p.id,
        reason:
          p.milestone === "submitted"
            ? "Record this submission first."
            : "Record this prerequisite's achieved outcome first. Closing it without success does not unlock this action.",
      }));
    const due = task.dueDate ? Date.parse(`${task.dueDate}T23:59:59Z`) : NaN;
    const days = (due - clock) / 86400000;
    const factors = { ...dashboardPriorityFactors[definition.engineId] };
    factors.deadline_score = Number.isFinite(days)
      ? days <= 1
        ? 10
        : days <= 7
          ? 8
          : days <= 30
            ? 4
            : 1
      : 0;
    factors.uncertainty_penalty = applicable(definition) === null ? 8 : 0;
    if (definition.id === "temporary-housing" && a.safeTonight !== "yes") factors.safety_score = 10;
    if (task.submittedAt)
      factors.waiting_time_score = Math.min(
        10,
        Math.max(0, Math.floor((clock - Date.parse(task.submittedAt)) / 86400000 / 3)),
      );
    if (task.ratings) Object.assign(factors, task.ratings);
    // Immediate housing safety remains a floor even with a custom assessment.
    if (definition.id === "temporary-housing" && a.safeTonight !== "yes") factors.safety_score = 10;
    return {
      definition,
      task,
      status,
      blockers,
      applicable: applicable(definition),
      skipped: journey.skippedIds.includes(definition.id),
      overdue: days < 0 && !["achieved", "closed", "not-applicable"].includes(status),
      factors,
    };
  });
  const ranked = rankRecoveryNodes(
    results.map((r) => ({ nodeId: r.definition.id, factors: r.factors })),
  );
  return ranked
    .map((r) => {
      const item = results.find((v) => v.definition.id === r.nodeId)!;
      return {
        ...item,
        score: r.score,
        priorityReason: `${item.task.dueDate ? `Recorded deadline ${item.task.dueDate}; urgency ${item.factors.deadline_score}/10. ` : "No known deadline bonus. "}${item.applicable === null ? "Applicability still needs confirmation. " : ""}${item.task.ratings ? "Uses your saved task ratings (automatic ratings are paused)." : "Uses initial task ratings adjusted for deadlines, waiting, and uncertainty."} The eight priority weights stay fixed.`,
      };
    })
    .sort((a, b) => Number(a.skipped) - Number(b.skipped));
}
export function currentJourneyTask(record: IntakeRecord, evaluated = evaluateJourney(record)) {
  const journey = getJourney(record);
  const candidates = evaluated.filter(
    (t) => !t.skipped && !["blocked", "achieved", "closed", "not-applicable"].includes(t.status),
  );
  return candidates.find((t) => t.definition.id === journey.activeTaskId) ?? candidates[0];
}
export function journeyBadges(record: IntakeRecord): Record<string, MapBadge> {
  const evaluated = evaluateJourney(record);
  return Object.fromEntries(
    journeyWorkflows.map((def) => {
      const group = evaluated.filter((r) => baseTaskId(r.definition.id) === def.id);
      const achieved = group.filter((r) => r.status === "achieved").length;
      const actionable = group.find(
        (r) => !["achieved", "not-applicable", "closed"].includes(r.status),
      );
      const status =
        actionable?.status ??
        (achieved === group.length
          ? "achieved"
          : group.some((r) => r.status === "closed")
            ? "closed"
            : "not-applicable");
      const tone: MapBadge["tone"] =
        status === "achieved"
          ? "complete"
          : status === "blocked" || status === "denied" || status === "information"
            ? "blocked"
            : ["waiting", "approved", "partial"].includes(status)
              ? "waiting"
              : status === "not-applicable"
                ? "not-applicable"
                : status === "closed"
                  ? "unknown"
                  : "ready";
      const labels: Record<JourneyStatus, string> = {
        ready: "Available action",
        blocked: "Prerequisites needed",
        waiting: "Awaiting response",
        information: "Information requested",
        denied: "Decision needs follow-up",
        approved: "Approved; outcome pending",
        partial: "Partial outcome",
        achieved: "Goal achieved",
        closed: "Closed without goal",
        "not-applicable": "Not applicable",
      };
      return [
        def.id,
        {
          tone,
          label: `${labels[status]}${group.length > 1 ? ` (${achieved}/${group.length} goals)` : ""}`,
          detail: [def.goal, ...(actionable?.blockers.map((b) => b.reason) ?? [])],
        },
      ];
    }),
  );
}
function text(value: unknown, max = 12000): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid text value.");
  return value.trim();
}
function documents(value: unknown, record: IntakeRecord): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((id) => typeof id !== "string") ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid document selection.");
  for (const id of value)
    if (!record.documents.some((doc) => doc.id === id && usableDocument(doc, record)))
      throw new Error("Invalid document: confirm its information and resolve conflicts first.");
  return value;
}
export function prepareJourneyArtifact(
  record: IntakeRecord,
  id: string,
  recipient?: string,
  now = new Date(),
): JourneyArtifact {
  const def = journeyDefinitions(record).find((d) => d.id === id);
  if (!def) throw new Error("Unknown recovery task.");
  const a = activeAnswers(record.confirmed?.answers ?? {});
  const task = getJourney(record).tasks[id];
  const assignedRecipient =
    recipient ||
    organizationForTask(record, id).name ||
    (getJourney(record).demo.enabled ? def.recipient : "");
  const docs = record.documents.filter(
    (doc) => def.evidenceTypes.includes(doc.type) && usableDocument(doc, record),
  );
  const fields = ["affectedStreet", "affectedCity", "affectedZip", ...def.questions].flatMap(
    (key) => {
      const value = a[key];
      if (!value || value === "unknown" || value === "skipped") return [];
      return [
        `${intakeQuestions.find((q) => q.id === key)?.label || key}: ${Array.isArray(value) ? value.join(", ") : value}`,
      ];
    },
  );
  const body = [
    `${def.packet}`,
    "Prepared materials: not an official form or submission.",
    "",
    ...(assignedRecipient ? [`To: ${assignedRecipient}`] : []),
    "",
    `I am requesting assistance with ${def.title.toLowerCase()}.`,
    `My goal: ${def.goal}.`,
    "",
    "Confirmed household information",
    ...fields,
    ...(fields.length
      ? []
      : ["No confirmed details yet. Add the relevant information before sharing."]),
    "",
    "Household notes",
    task?.notes || "[Add the specific request, loss inventory, scope, or question here.]",
    "",
    "Supporting documents",
    ...docs.map(
      (doc) =>
        `${doc.type}: ${doc.id}${doc.testData ? " (SIMULATED)" : ""}${doc.reviewedText ? `\nReviewed source notes: ${doc.reviewedText.slice(0, 2000)}` : ""}`,
    ),
    "",
    "Please confirm receipt and tell me what additional information or next steps are needed.",
    "",
    "Thank you.",
  ].join("\n");
  if (body.length > 12000)
    throw new Error(
      "Invalid packet size: shorten notes or reduce supporting documents before preparing.",
    );
  return {
    id: crypto.randomUUID(),
    version: (task?.artifact?.version ?? 0) + 1,
    recipient: assignedRecipient,
    text: body,
    documentIds: docs.map((d) => d.id),
    preparedAt: now.toISOString(),
    simulated: getJourney(record).demo.enabled,
  };
}
/** One server-authoritative command; the API supplies revision and idempotency checks. */
export function applyJourneyCommand(
  input: IntakeRecord,
  raw: Record<string, unknown>,
  now = new Date(),
): IntakeRecord {
  const operationId = text(raw.operationId, 100);
  if (!operationId || !/^[a-zA-Z0-9_-]+$/.test(operationId))
    throw new Error("Invalid operation ID.");
  const existing = getJourney(input);
  if (existing.operationIds.includes(operationId)) return input;
  const record = structuredClone(input);
  record.journey = structuredClone(existing);
  const j = record.journey;
  const at = journeyNow(record, now).toISOString();
  const kind = text(raw.kind, 40);
  const id = typeof raw.taskId === "string" ? raw.taskId : "";
  const def = journeyDefinitions(record).find((d) => d.id === id);
  if (!["answers", "application", "demo-time", "demo-enable"].includes(kind) && !def)
    throw new Error("Unknown recovery task.");
  const task = j.tasks[id] ?? { notes: "" };
  if (def) j.tasks[id] = task;
  const evaluated = def
    ? evaluateJourney(record, now).find((r) => r.definition.id === id)!
    : undefined;
  let detail = kind;
  let simulated = false;
  let artifactSnapshot: JourneyArtifact | undefined;
  const canAct = () => {
    if (evaluated && ["blocked", "not-applicable", "achieved", "closed"].includes(evaluated.status))
      throw new Error("Invalid action: review this task and its prerequisites first.");
  };
  if (kind === "answers") {
    if (
      !raw.answers ||
      typeof raw.answers !== "object" ||
      Array.isArray(raw.answers) ||
      raw.confirm !== true
    )
      throw new Error("Invalid confirmed answers.");
    const answers = { ...(record.confirmed?.answers ?? {}), ...(raw.answers as IntakeAnswers) };
    const draft = { answers, applications: record.confirmed?.applications ?? [], stage: 3 };
    validateDraft(draft);
    record.confirmed = draft;
    record.confirmedAt = at;
    record.draft = {
      ...record.draft,
      answers: { ...record.draft.answers, ...(raw.answers as IntakeAnswers) },
    };
    record.caseRecord = intakeToRecovery(draft, record.caseRecord, record.documents);
    detail = "Household confirmed updated information.";
  } else if (kind === "application") {
    const organization = text(raw.organization, 160);
    if (!organization || !record.confirmed)
      throw new Error("Invalid application: confirm household information first.");
    if (record.confirmed.applications.length >= 30)
      throw new Error("Invalid application: limit reached.");
    const app = {
      id: crypto.randomUUID(),
      organization,
      status: "preparing",
      outstanding: "no",
      action: "",
      deadline: "",
    };
    record.confirmed.applications.push(app);
    record.draft.applications.push(structuredClone(app));
    detail = `Added application: ${organization}`;
  } else if (kind === "demo-enable") {
    if (raw.confirm !== true) throw new Error("Invalid demo confirmation.");
    j.demo.enabled = true;
    detail = "Simulation controls enabled. No external messages will be sent.";
    simulated = true;
  } else if (kind === "demo-time") {
    if (
      !j.demo.enabled ||
      !Number.isInteger(raw.days) ||
      Number(raw.days) < 1 ||
      Number(raw.days) > 30
    )
      throw new Error("Invalid simulated time change.");
    j.demo.dayOffset += Number(raw.days);
    detail = `Advanced demo clock ${raw.days} days.`;
    simulated = true;
  } else if (kind === "skip" || kind === "restore") {
    j.skippedIds =
      kind === "skip" ? [...new Set([...j.skippedIds, id])] : j.skippedIds.filter((v) => v !== id);
    if (kind === "skip" && j.activeTaskId === id) j.activeTaskId = null;
    detail =
      kind === "skip"
        ? "Deferred without completing or unlocking dependent work."
        : "Restored to the priority list.";
  } else if (kind === "start") {
    canAct();
    j.activeTaskId = id;
    task.startedAt ||= at;
    j.skippedIds = j.skippedIds.filter((v) => v !== id);
    detail = "Started work.";
  } else if (kind === "ratings") {
    if (raw.ratings === null) {
      delete task.ratings;
      detail = "Restored automatic priority ratings.";
    } else {
      try {
        calculatePriority(raw.ratings as PriorityFactors);
      } catch {
        throw new Error("Invalid priority ratings: provide all eight numbers between 0 and 10.");
      }
      task.ratings = Object.fromEntries(
        Object.keys(PRIORITY_WEIGHTS).map((key) => [
          key,
          (raw.ratings as Record<string, number>)[key],
        ]),
      ) as unknown as PriorityFactors;
      detail = "Saved all eight priority ratings for this task.";
    }
  } else if (kind === "notes") {
    task.notes = text(raw.notes);
    task.dueDate = text(raw.dueDate ?? "", 10);
    if (
      task.dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ||
        !Number.isFinite(Date.parse(task.dueDate)) ||
        new Date(task.dueDate).toISOString().slice(0, 10) !== task.dueDate)
    )
      throw new Error("Invalid deadline.");
    detail = "Saved working notes and follow-up date.";
  } else if (kind === "prepare") {
    task.artifact = prepareJourneyArtifact(record, id, undefined, new Date(at));
    detail = "Prepared an editable packet from confirmed household information.";
  } else if (kind === "edit-artifact") {
    if (!task.artifact) throw new Error("Invalid action: prepare a packet first.");
    task.artifact = {
      ...task.artifact,
      id: crypto.randomUUID(),
      version: task.artifact.version + 1,
      text: text(raw.text),
      recipient: organizationForTask(record, id).name || text(raw.recipient, 200),
      documentIds: documents(raw.documentIds, record),
      approvedAt: undefined,
      receipt: undefined,
    };
    detail = "Edited packet; previous approval does not apply to this version.";
  } else if (kind === "submit") {
    canAct();
    if (
      !j.demo.enabled ||
      raw.confirm !== true ||
      !task.artifact ||
      task.artifact.id !== raw.artifactId ||
      !task.artifact.recipient ||
      !task.artifact.text
    )
      throw new Error("Invalid submission: review the exact packet and enable simulation first.");
    documents(task.artifact.documentIds, record);
    if (task.artifact.receipt)
      throw new Error("Invalid submission: this packet version already has a receipt.");
    task.artifact.approvedAt = at;
    task.artifact.simulated = true;
    task.artifact.receipt = `DEMO-${operationId}`;
    artifactSnapshot = structuredClone(task.artifact);
    task.submittedAt = at;
    task.response = undefined;
    task.responseNote = undefined;
    task.dueDate ||= new Date(Date.parse(at) + 7 * 86400000).toISOString().slice(0, 10);
    simulated = true;
    detail = `Approved simulated delivery to ${task.artifact.recipient}. Receipt ${task.artifact.receipt}. Nothing was sent externally.`;
  } else if (kind === "response") {
    canAct();
    if (
      !j.demo.enabled ||
      !["information", "denied", "approved", "partial"].includes(String(raw.response))
    )
      throw new Error("Invalid simulated response.");
    const submitted =
      task.submittedAt || def?.prerequisites.some((p) => !!j.tasks[p.id]?.submittedAt);
    if (!submitted) throw new Error("Invalid response: record a submission first.");
    task.response = raw.response as JourneyTask["response"];
    task.responseNote = text(raw.note, 2000);
    detail = `Simulated ${task.response}: ${task.responseNote}`;
    simulated = true;
  } else if (kind === "outcome" || kind === "close") {
    canAct();
    const note = text(raw.note, 2000);
    if (raw.confirm !== true || note.length < 12)
      throw new Error("Invalid outcome: confirm and explain what happened.");
    const ids = documents(raw.documentIds ?? [], record);
    if (
      kind === "outcome" &&
      (!ids.length ||
        !ids.some((docId) =>
          (outcomeDocumentTypes[baseTaskId(id)] || []).includes(
            record.documents.find((d) => d.id === docId)!.type,
          ),
        ))
    )
      throw new Error("Invalid outcome: select relevant confirmed supporting evidence.");
    if (
      baseTaskId(id) === "hazards" &&
      kind === "outcome" &&
      record.confirmed?.answers.removalRequired === "yes" &&
      !ids.some(
        (docId) => record.documents.find((d) => d.id === docId)?.type === "asbestos-clearance",
      )
    )
      throw new Error("Invalid outcome: record completion of the required professional removal.");
    if (
      baseTaskId(id) === "safe-property" &&
      kind === "outcome" &&
      !ids.some((docId) => record.documents.find((d) => d.id === docId)?.type === "final-approval")
    )
      throw new Error("Invalid outcome: a final approval record is required.");
    simulated = ids.some(
      (docId) => record.documents.find((d) => d.id === docId)?.testData === true,
    );
    task.outcome = {
      kind: kind === "outcome" ? "achieved" : "closed",
      note,
      documentIds: ids,
      at,
      simulated,
    };
    if (["claim", "application", "tax-relief"].includes(baseTaskId(id)) && kind === "outcome")
      task.submittedAt ||= at;
    if (j.activeTaskId === id) j.activeTaskId = null;
    detail = `${kind === "outcome" ? "Goal recorded as achieved" : "Closed without achieving the goal"}: ${note}`;
  } else if (kind === "reopen") {
    const note = text(raw.note, 2000);
    if (note.length < 12) throw new Error("Invalid reopening: explain the correction.");
    task.outcome = undefined;
    task.notApplicable = false;
    task.response = "information";
    task.responseNote = note;
    detail = `Reopened: ${note}`;
  } else if (kind === "not-applicable") {
    const note = text(raw.note, 2000);
    if (raw.confirm !== true || note.length < 12)
      throw new Error("Invalid applicability: confirm and explain.");
    // Do not allow a manual exemption to silently satisfy another task's prerequisite.
    if (journeyDefinitions(record).some((d) => d.prerequisites.some((p) => p.id === id)))
      throw new Error(
        "Invalid exemption: update the relevant household answer so dependencies can be reassessed.",
      );
    task.notApplicable = true;
    detail = `Household reports not applicable: ${note}`;
  } else if (kind === "demo-evidence") {
    if (!j.demo.enabled || record.documents.length >= 50)
      throw new Error("Invalid simulation: enable demo controls and keep fewer than 50 documents.");
    const type =
      baseTaskId(id) === "hazards" && record.confirmed?.answers.removalRequired === "yes"
        ? "asbestos-clearance"
        : outcomeDocumentTypes[baseTaskId(id)][0];
    record.documents.push({
      id: crypto.randomUUID(),
      type,
      testData: true,
      uploadedAt: at,
      confirmedAt: at,
      fields: {
        name: "Demo household",
        address: "100 Example Lane, Spokane",
        date: at.slice(0, 10),
        dateMeaning: "issued",
        scope: type === "replacement-id" || type === "id" ? "household" : "affected-property",
      },
      recipientStatus: "unknown",
      recipient: "",
      conflictAcknowledgment: "Fictional demo evidence; not a real record.",
    });
    detail = `Created labeled simulated ${type} evidence. This does not complete the task.`;
    simulated = true;
  } else throw new Error("Unknown recovery action.");
  j.events.push({
    id: operationId,
    taskId: id,
    kind,
    detail,
    at,
    simulated,
    ...(artifactSnapshot ? { artifact: artifactSnapshot } : {}),
  });
  j.operationIds.push(operationId);
  // Bound persisted data explicitly instead of silently dropping history.
  if (j.events.length > 1000)
    throw new Error("Invalid action: demo history limit reached. Start a fresh demo household.");
  if (new TextEncoder().encode(JSON.stringify(record)).length > 1500000)
    throw new Error(
      "Invalid action: this household has reached the saved demo size limit. Export packets before starting a fresh household.",
    );
  return record;
}
