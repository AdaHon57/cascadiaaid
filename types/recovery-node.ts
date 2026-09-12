export type RecoveryNodeStatus =
  "READY" | "BLOCKED" | "IN_PROGRESS" | "COMPLETE" | "NOT_APPLICABLE";

export type RecoveryEdgeType = "REQUIRED" | "LEGAL" | "SAFETY" | "FINANCIAL" | "RECOMMENDED";

/** Shared workflow content, independent of relationships and household progress. */
export interface RecoveryNodeDefinition {
  id: string;
  title: string;
  description: string;
  /** Evidence labels only; these are not uploaded documents. */
  requiredEvidence: string[];
  /** Reference URL, or null when no verified source has been attached. */
  sourceUrl: string | null;
}

/** One directed relationship. Its category applies only to this edge. */
export interface RecoveryEdge {
  /** ID of the prerequisite node. */
  from: string;
  /** ID of the node that depends on it. */
  to: string;
  type: RecoveryEdgeType;
}

/** Explicit facts for one node within a recovery case; not a computed status. */
export interface RecoveryNodeFacts {
  nodeId: string;
  /** null means applicability has not been established. */
  applicable: boolean | null;
  started: boolean;
  completed: boolean;
}

/** Calculated status for one node within a recovery case. */
export interface RecoveryNodeState {
  nodeId: string;
  status: RecoveryNodeStatus;
}

/** @deprecated Use RecoveryNodeDefinition. Status and relationships live separately. */
export type RecoveryNode = RecoveryNodeDefinition;
