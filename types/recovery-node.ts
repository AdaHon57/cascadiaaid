import type { RecoveryNodeId, RecoverySourceId } from "@/types/recovery-case";

export type RecoveryNodeStatus =
  "READY" | "BLOCKED" | "IN_PROGRESS" | "COMPLETE" | "NOT_APPLICABLE";

export type RecoveryEdgeType = "REQUIRED" | "LEGAL" | "SAFETY" | "FINANCIAL" | "RECOMMENDED";

/** Shared workflow content, independent of relationships and household progress. */
export interface RecoveryNodeDefinition {
  id: RecoveryNodeId;
  title: string;
  description: string;
  /** Legacy preparation hints for display, not the engine's completion checklist. */
  requiredEvidence: string[];
  /** Reference URL, or null when no verified source has been attached. */
  sourceUrl: string | null;
  sourceIds: RecoverySourceId[];
}

/** One directed relationship. Its category applies only to this edge. */
export interface RecoveryEdge {
  /** ID of the prerequisite node. */
  from: RecoveryNodeId;
  /** ID of the node that depends on it. */
  to: RecoveryNodeId;
  type: RecoveryEdgeType;
  sourceIds: RecoverySourceId[];
}

/** Derived facts for the low-level status engine; use RecoveryCase for household input. */
export interface RecoveryNodeFacts {
  nodeId: RecoveryNodeId;
  /** null means applicability has not been established. */
  applicable: boolean | null;
  started: boolean;
  completed: boolean;
}

/** Calculated status for one node within a recovery case. */
export interface RecoveryNodeState {
  nodeId: RecoveryNodeId;
  status: RecoveryNodeStatus;
}

/** @deprecated Use RecoveryNodeDefinition. Status and relationships live separately. */
export type RecoveryNode = RecoveryNodeDefinition;
