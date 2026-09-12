export type RecoveryNodeStatus =
  "READY" | "BLOCKED" | "IN_PROGRESS" | "COMPLETE" | "NOT_APPLICABLE";

export type RecoveryEdgeType = "REQUIRED" | "LEGAL" | "SAFETY" | "FINANCIAL" | "RECOMMENDED";

/** A recovery task stored as data, with no status or dependency evaluation. */
export interface RecoveryNode {
  id: string;
  title: string;
  description: string;
  status: RecoveryNodeStatus;
  /** IDs of prerequisite nodes. An empty list means none are listed. */
  dependencies: string[];
  /** Category shared by this node's dependencies; unused when that list is empty. */
  edgeType: RecoveryEdgeType;
  /** Evidence labels only; these are not uploaded documents. */
  requiredEvidence: string[];
  /** IDs of downstream nodes this task supports; does not change their status. */
  unlocks: string[];
  /** Reference URL, or null when no verified source has been attached. */
  sourceUrl: string | null;
}
