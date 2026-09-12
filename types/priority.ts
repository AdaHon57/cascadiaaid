import type { RecoveryNodeId } from "@/types/recovery-case";

/** All factors use a 0–10 scale. Fractions are allowed. */
export interface PriorityFactors {
  /** Risk to housing, health, access, or safety from delaying. */
  safety_score: number;
  /** Urgency of an approaching hard deadline. */
  deadline_score: number;
  /** Supplied assessment of downstream impact, not a raw dependency count. */
  dependency_unlock_score: number;
  /** Potential financial loss from delaying. */
  financial_impact: number;
  /** Strength of the legal or program requirement. */
  required_score: number;
  /** Benefit of starting an external waiting period sooner. */
  waiting_time_score: number;
  /** Ease of completing the task: higher means less effort. */
  quick_win_score: number;
  /** Uncertainty about applicability: higher means less certain. */
  uncertainty_penalty: number;
}

/** Supplied scores for one recovery node, linked by its ID. */
export interface PriorityCandidate {
  readonly nodeId: RecoveryNodeId;
  readonly factors: Readonly<PriorityFactors>;
}

export interface PriorityScore {
  readonly score: number;
  /** Each input multiplied by its weight; uncertainty contributes negatively. */
  readonly contributions: Readonly<PriorityFactors>;
}

export interface RankedRecoveryNode extends PriorityScore {
  readonly nodeId: RecoveryNodeId;
}
