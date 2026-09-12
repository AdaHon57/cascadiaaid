import type {
  EvidenceId,
  HouseholdAnswerKey,
  RecoveryCase,
  RecoveryEvidence,
  RecoveryNodeId,
  RecoveryNodeProgress,
} from "@/types/recovery-case";
import type { RecoveryCaseEvaluation, RecoveryNodeEvaluation } from "@/types/recovery-rule";

/** Explicit edits to facts; calculated statuses cannot be supplied as edits. */
export type RecoveryCaseChange =
  | { type: "SET_ANSWER"; key: HouseholdAnswerKey; value: boolean | null }
  | { type: "UPSERT_EVIDENCE"; evidence: RecoveryEvidence }
  | { type: "REMOVE_EVIDENCE"; evidenceId: EvidenceId }
  | { type: "SET_PROGRESS"; progress: RecoveryNodeProgress };

export interface RecoveryNodeChange {
  nodeId: RecoveryNodeId;
  before: RecoveryNodeEvaluation;
  after: RecoveryNodeEvaluation;
}

export interface RecoveryRecalculation {
  caseRecord: RecoveryCase;
  evaluation: RecoveryCaseEvaluation;
  /** Includes explanation-only changes, even when the status stays the same. */
  nodeChanges: RecoveryNodeChange[];
}
