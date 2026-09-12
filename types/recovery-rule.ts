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
}

export interface RecoveryCaseEvaluation {
  facts: RecoveryNodeFacts[];
  states: RecoveryNodeEvaluation[];
}
