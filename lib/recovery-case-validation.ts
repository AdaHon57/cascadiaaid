import { evidenceKinds, householdAnswerKeys } from "@/types/recovery-case";
import type { RecoveryCase } from "@/types/recovery-case";
import type { RecoveryWorkflow } from "@/types/recovery-rule";

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function uniqueIds(values: readonly { id: string }[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    requireValid(
      nonempty(value.id) && !ids.has(value.id),
      `${label} IDs must be nonempty and unique.`,
    );
    ids.add(value.id);
  }
  return ids;
}

/** Validate the domain boundary even when inputs originated outside TypeScript. */
export function validateRecoveryCase(input: RecoveryCase, workflow: RecoveryWorkflow): void {
  requireValid(input && nonempty(input.id), "A recovery case needs an ID.");
  requireValid(
    input.answers && typeof input.answers === "object" && !Array.isArray(input.answers),
    "Household answers must be an object.",
  );
  requireValid(
    Array.isArray(input.evidence) && Array.isArray(input.progress),
    "Case evidence and progress must be arrays.",
  );
  const nodeIds = uniqueIds(workflow.nodes, "Node");
  const sourceIds = uniqueIds(workflow.sources, "Source");
  const checkSources = (ids: readonly string[], required = true) => {
    requireValid(
      Array.isArray(ids) && (!required || ids.length > 0),
      "Source IDs must be an array; definitions, edges, and rules need an origin.",
    );
    requireValid(
      new Set(ids).size === ids.length && ids.every((id) => sourceIds.has(id)),
      "Source references must be unique and known.",
    );
  };
  for (const source of workflow.sources) {
    requireValid(
      nonempty(source.title) && ["ILLUSTRATIVE", "REFERENCE"].includes(source.kind),
      "Invalid source metadata.",
    );
    if (source.url !== null) {
      let valid = false;
      try {
        valid = ["https:", "http:"].includes(new URL(source.url).protocol);
      } catch {
        /* Invalid URL. */
      }
      requireValid(valid, "Source URLs must be HTTP(S) or null.");
    }
    requireValid(
      source.kind !== "REFERENCE" || nonempty(source.url),
      "A reference source needs a URL.",
    );
  }
  for (const node of workflow.nodes) checkSources(node.sourceIds);
  for (const edge of workflow.edges) checkSources(edge.sourceIds);
  const answerKeys = new Set<string>(householdAnswerKeys);
  for (const [key, answer] of Object.entries(input.answers)) {
    requireValid(
      answerKeys.has(key) && (answer === null || typeof answer === "boolean"),
      "Unknown household question or invalid answer; use booleans or null.",
    );
  }
  const kinds = new Set<string>(evidenceKinds);
  const ruleIds = new Set<string>();
  for (const rule of workflow.rules) {
    requireValid(
      nodeIds.has(rule.nodeId) && !ruleIds.has(rule.nodeId),
      "Rules must reference unique, known nodes.",
    );
    ruleIds.add(rule.nodeId);
    checkSources(rule.sourceIds);
    requireValid(
      Array.isArray(rule.applicability.all) &&
        rule.applicability.all.length > 0 &&
        rule.applicability.all.every((key) => answerKeys.has(key)),
      "Applicability must name known household answers.",
    );
    requireValid(
      nonempty(rule.completion.milestone) &&
        Array.isArray(rule.completion.evidence) &&
        rule.completion.evidence.length > 0,
      "Each rule needs a milestone and evidence requirements.",
    );
    uniqueIds(rule.completion.evidence, "Evidence requirement");
    for (const group of rule.completion.evidence) {
      requireValid(
        nonempty(group.label) &&
          Array.isArray(group.acceptedKinds) &&
          group.acceptedKinds.length > 0 &&
          group.acceptedKinds.every((kind) => kinds.has(kind)),
        "Evidence requirements need labels and known accepted kinds.",
      );
      requireValid(
        group.when === undefined || answerKeys.has(group.when),
        "Unknown conditional evidence question.",
      );
    }
  }
  requireValid(ruleIds.size === nodeIds.size, "Every node needs exactly one rule.");
  const progressIds = new Set<string>();
  for (const progress of input.progress) {
    requireValid(
      nodeIds.has(progress.nodeId) && !progressIds.has(progress.nodeId),
      "Progress must reference unique, known nodes.",
    );
    requireValid(
      typeof progress.started === "boolean" && typeof progress.milestoneReached === "boolean",
      "Progress flags must be booleans.",
    );
    progressIds.add(progress.nodeId);
  }
  uniqueIds(input.evidence, "Evidence");
  for (const evidence of input.evidence) {
    requireValid(
      evidence.caseId === input.id,
      "Evidence must belong to the current recovery case.",
    );
    requireValid(kinds.has(evidence.kind), "Unknown evidence kind.");
    requireValid(
      Array.isArray(evidence.nodeIds) &&
        evidence.nodeIds.length > 0 &&
        new Set(evidence.nodeIds).size === evidence.nodeIds.length &&
        evidence.nodeIds.every((id) => nodeIds.has(id)),
      "Evidence must be linked to unique, known nodes.",
    );
    requireValid(
      ["USER_UPLOAD", "MANUAL_RECORD", "IMAGE_EXTRACTION"].includes(evidence.origin),
      "Unknown evidence origin.",
    );
    requireValid(
      evidence.review && ["PENDING", "ACCEPTED", "REJECTED"].includes(evidence.review.status),
      "Invalid evidence review status.",
    );
    if (evidence.review.status !== "PENDING")
      requireValid(nonempty(evidence.review.reviewedBy), "Reviewed evidence needs a reviewer.");
    checkSources(evidence.sourceIds, false);
  }
}
