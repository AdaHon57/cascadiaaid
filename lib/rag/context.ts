/**
 * Recovery-workflow context: validation, enrichment from workflow definitions, and rendering for
 * retrieval and the prompt. The status engine is not called or changed here; callers pass
 * statuses they already calculated.
 */
import type { RecoveryEdgeType, RecoveryNodeStatus } from "../../types/recovery-node.ts";
import { RagError } from "./errors.ts";
import type { RagContextRelatedNode, RagWorkflowContext, RagWorkflowDefinitions } from "./types.ts";

const STATUSES: readonly RecoveryNodeStatus[] = [
  "READY",
  "BLOCKED",
  "IN_PROGRESS",
  "COMPLETE",
  "NOT_APPLICABLE",
];
const EDGE_TYPES: readonly RecoveryEdgeType[] = [
  "REQUIRED",
  "LEGAL",
  "SAFETY",
  "FINANCIAL",
  "RECOMMENDED",
];
const MAX_TEXT = 500;
const MAX_ITEMS = 20;

/** Validate untrusted context (e.g. from an HTTP body). Returns a clean copy or undefined. */
export function validateWorkflowContext(input: unknown): RagWorkflowContext | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new RagError("INVALID_CONTEXT", "context must be an object.");
  }
  const raw = input as Record<string, unknown>;
  const context: RagWorkflowContext = {};

  const nodeId = optionalText(raw.nodeId, "context.nodeId", 100);
  if (nodeId) context.nodeId = nodeId;
  const nodeTitle = optionalText(raw.nodeTitle, "context.nodeTitle", 200);
  if (nodeTitle) context.nodeTitle = nodeTitle;
  const nodeDescription = optionalText(raw.nodeDescription, "context.nodeDescription", MAX_TEXT);
  if (nodeDescription) context.nodeDescription = nodeDescription;
  if (raw.status !== undefined) context.status = statusValue(raw.status, "context.status");

  if (raw.requiredEvidence !== undefined) {
    context.requiredEvidence = list(raw.requiredEvidence, "context.requiredEvidence").map(
      (item, i) => optionalText(item, `context.requiredEvidence[${i}]`, 200) ?? "",
    );
  }
  if (raw.prerequisites !== undefined) {
    context.prerequisites = relatedNodes(raw.prerequisites, "context.prerequisites");
  }
  if (raw.dependents !== undefined) {
    context.dependents = relatedNodes(raw.dependents, "context.dependents");
  }
  return Object.keys(context).length ? context : undefined;
}

/**
 * Fill in missing node details from workflow definitions (titles, description, evidence labels,
 * prerequisite and dependent nodes). Values supplied by the caller always win.
 */
export function resolveWorkflowContext(
  context: RagWorkflowContext | undefined,
  definitions: RagWorkflowDefinitions,
): RagWorkflowContext | undefined {
  if (!context?.nodeId) return context;
  const nodeId = context.nodeId;
  const titleOf = (id: string) => definitions.nodes.find((n) => n.id === id)?.title;
  const node = definitions.nodes.find((n) => n.id === nodeId);
  const edges = definitions.edges ?? [];

  const withTitles = (items: RagContextRelatedNode[] | undefined) =>
    items?.map((item) => ({ ...item, title: item.title ?? titleOf(item.nodeId) }));

  return {
    ...context,
    nodeTitle: context.nodeTitle ?? node?.title,
    nodeDescription: context.nodeDescription ?? node?.description,
    requiredEvidence: context.requiredEvidence ?? node?.requiredEvidence,
    prerequisites:
      withTitles(context.prerequisites) ??
      edges
        .filter((e) => e.to === nodeId)
        .map((e) => ({ nodeId: e.from, title: titleOf(e.from), edgeType: e.type })),
    dependents:
      withTitles(context.dependents) ??
      edges
        .filter((e) => e.from === nodeId)
        .map((e) => ({ nodeId: e.to, title: titleOf(e.to), edgeType: e.type })),
  };
}

/** Short text added to the retrieval query so vague questions ("what do I need?") find the step. */
export function contextRetrievalText(context: RagWorkflowContext | undefined): string {
  if (!context) return "";
  return [context.nodeTitle, context.nodeDescription].filter(Boolean).join(". ");
}

/** Render context for the prompt. Returns "" when there is nothing useful to say. */
export function renderContextForPrompt(context: RagWorkflowContext | undefined): string {
  if (!context) return "";
  const label = (n: { nodeId: string; title?: string }) =>
    n.title ? `${n.title} (${n.nodeId})` : n.nodeId;
  const related = (n: RagContextRelatedNode) =>
    [label(n), n.edgeType && `relationship: ${n.edgeType}`, n.status && `status: ${n.status}`]
      .filter(Boolean)
      .join(", ");

  const lines: string[] = [];
  if (context.nodeId || context.nodeTitle) {
    lines.push(
      `current_step: ${label({ nodeId: context.nodeId ?? "", title: context.nodeTitle })}`,
    );
  }
  if (context.nodeDescription) lines.push(`step_description: ${context.nodeDescription}`);
  if (context.status) lines.push(`step_status_in_app: ${context.status}`);
  if (context.requiredEvidence?.length) {
    lines.push(`evidence_labels_in_app: ${context.requiredEvidence.join("; ")}`);
  }
  if (context.prerequisites?.length) {
    lines.push(`prerequisite_steps: ${context.prerequisites.map(related).join(" | ")}`);
  }
  if (context.dependents?.length) {
    lines.push(`steps_that_depend_on_this: ${context.dependents.map(related).join(" | ")}`);
  }
  return lines.length ? lines.join("\n") : "";
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string")
    throw new RagError("INVALID_CONTEXT", `${field} must be a string.`);
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length > max) {
    throw new RagError("INVALID_CONTEXT", `${field} must be at most ${max} characters.`);
  }
  return clean || undefined;
}

function statusValue(value: unknown, field: string): RecoveryNodeStatus {
  if (!STATUSES.includes(value as RecoveryNodeStatus)) {
    throw new RagError("INVALID_CONTEXT", `${field} must be one of ${STATUSES.join(", ")}.`);
  }
  return value as RecoveryNodeStatus;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new RagError("INVALID_CONTEXT", `${field} must be an array.`);
  if (value.length > MAX_ITEMS) {
    throw new RagError("INVALID_CONTEXT", `${field} must have at most ${MAX_ITEMS} items.`);
  }
  return value;
}

function relatedNodes(value: unknown, field: string): RagContextRelatedNode[] {
  return list(value, field).map((item, i) => {
    const path = `${field}[${i}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new RagError("INVALID_CONTEXT", `${path} must be an object.`);
    }
    const raw = item as Record<string, unknown>;
    const nodeId = optionalText(raw.nodeId, `${path}.nodeId`, 100);
    if (!nodeId) throw new RagError("INVALID_CONTEXT", `${path}.nodeId is required.`);
    const node: RagContextRelatedNode = { nodeId };
    const title = optionalText(raw.title, `${path}.title`, 200);
    if (title) node.title = title;
    if (raw.status !== undefined) node.status = statusValue(raw.status, `${path}.status`);
    if (raw.edgeType !== undefined) {
      if (!EDGE_TYPES.includes(raw.edgeType as RecoveryEdgeType)) {
        throw new RagError(
          "INVALID_CONTEXT",
          `${path}.edgeType must be one of ${EDGE_TYPES.join(", ")}.`,
        );
      }
      node.edgeType = raw.edgeType as RecoveryEdgeType;
    }
    return node;
  });
}
