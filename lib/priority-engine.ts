import type {
  PriorityCandidate,
  PriorityFactors,
  PriorityScore,
  RankedRecoveryNode,
} from "@/types/priority";

export const PRIORITY_FACTOR_MIN = 0;
export const PRIORITY_FACTOR_MAX = 10;

/** The numeric formula is authoritative. These weights are fixed at runtime. */
export const PRIORITY_WEIGHTS: Readonly<PriorityFactors> = Object.freeze({
  safety_score: 5,
  deadline_score: 5,
  dependency_unlock_score: 4,
  financial_impact: 3,
  required_score: 3,
  waiting_time_score: 2,
  quick_win_score: 1,
  uncertainty_penalty: -4,
});

/** Calculate priority from explicit inputs without reading or changing node status. */
export function calculatePriority(factors: Readonly<PriorityFactors>): PriorityScore {
  if (factors === null || typeof factors !== "object" || Array.isArray(factors)) {
    throw new TypeError("Priority factors must be an object containing all eight scores.");
  }

  // Start with a fresh object so the caller's inputs are never modified.
  const contributions: PriorityFactors = { ...PRIORITY_WEIGHTS };
  let score = 0;

  for (const key of Object.keys(PRIORITY_WEIGHTS) as (keyof PriorityFactors)[]) {
    const value = factors[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < PRIORITY_FACTOR_MIN ||
      value > PRIORITY_FACTOR_MAX
    ) {
      throw new RangeError(
        `${key} must be a finite number between ${PRIORITY_FACTOR_MIN} and ${PRIORITY_FACTOR_MAX}.`,
      );
    }

    // Normalize negative zero for a readable zero uncertainty contribution.
    contributions[key] = value === 0 ? 0 : value * PRIORITY_WEIGHTS[key];
    score += contributions[key];
  }

  return { score, contributions };
}

/**
 * Rank all supplied candidates by descending score, then ascending node ID.
 * This is an importance ranking, not a list of tasks confirmed ready to start.
 * No status filtering, dependency traversal, or eligibility inference occurs here.
 */
export function rankRecoveryNodes(candidates: readonly PriorityCandidate[]): RankedRecoveryNode[] {
  const seenIds = new Set<string>();
  const ranked = candidates.map(({ nodeId, factors }) => {
    if (typeof nodeId !== "string" || nodeId.trim().length === 0) {
      throw new TypeError("Each priority candidate must have a non-empty nodeId.");
    }
    if (seenIds.has(nodeId)) {
      throw new Error(`Duplicate priority candidate nodeId: ${nodeId}`);
    }
    seenIds.add(nodeId);

    return { nodeId, ...calculatePriority(factors) };
  });

  // Sort the new results, preserving the original input order and records.
  return ranked.sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });
}
