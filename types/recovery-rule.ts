import type {
  EvidenceKind,
  HouseholdAnswerKey,
  RecoveryNodeId,
  RecoverySourceId,
  RecoverySource,
} from "@/types/recovery-case";
import type {
  RecoveryEdge,
  RecoveryNodeDefinition,
  RecoveryNodeFacts,
  RecoveryNodeState,
  RecoveryNodeStatus,
} from "@/types/recovery-node";

export interface RecoveryWorkflow {
  nodes: readonly RecoveryNodeDefinition[];
  edges: readonly RecoveryEdge[];
  rules: readonly RecoveryNodeRule[];
  sources: readonly RecoverySource[];
}

/** All listed household answers must be true; false wins over unknown. */
export interface RecoveryNodeRule {
  nodeId: RecoveryNodeId;
  applicability: { all: HouseholdAnswerKey[] };
  completion: {
    milestone: string;
    /** Every active group is needed to complete; one accepted kind satisfies a group. */
    evidence: EvidenceRequirement[];
  };
  sourceIds: RecoverySourceId[];
}

export interface EvidenceRequirement {
  id: string;
  label: string;
  acceptedKinds: EvidenceKind[];
  /** Optional conditional requirement. Unknown prevents completion, not starting. */
  when?: HouseholdAnswerKey;
}

export interface RecoveryNodeEvaluation extends RecoveryNodeState {
  applicable: boolean | null;
  missingAnswers: HouseholdAnswerKey[];
  unmetEvidence: string[];
  blockingNodeIds: RecoveryNodeId[];
  reasons: string[];
  /** Direct and upstream unfinished prerequisites, with one shortest path per node. */
  blockingDependencies: RecoveryDependencyBlocker[];
}

export interface RecoveryDependencyBlocker {
  nodeId: RecoveryNodeId;
  title: string;
  status: RecoveryNodeStatus;
  /** Starts at the evaluated task and follows prerequisites upstream. */
  path: RecoveryNodeId[];
  /** That prerequisite's own current reasons, without nested copies of the graph. */
  reasons: string[];
}

export interface RecoveryCaseEvaluation {
  facts: RecoveryNodeFacts[];
  states: RecoveryNodeEvaluation[];
}
