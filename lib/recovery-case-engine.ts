import type { HouseholdAnswerKey, RecoveryCase } from "@/types/recovery-case";
import type { RecoveryNodeFacts } from "@/types/recovery-node";
import type { RecoveryCaseEvaluation, RecoveryWorkflow } from "@/types/recovery-rule";
import { calculateRecoveryNodeStates, recoveryEdgeBlocks } from "@/lib/recovery-status-engine";
import { validateRecoveryCase } from "@/lib/recovery-case-validation";

/** Recalculate from a complete case snapshot; never edit or persist the input. */
export function evaluateRecoveryCase(
  input: RecoveryCase,
  workflow: RecoveryWorkflow,
): RecoveryCaseEvaluation {
  validateRecoveryCase(input, workflow);
  const rules = new Map(workflow.rules.map((rule) => [rule.nodeId, rule]));
  const progress = new Map(input.progress.map((item) => [item.nodeId, item]));
  const details = new Map<
    string,
    {
      missingAnswers: HouseholdAnswerKey[];
      unmetEvidence: string[];
      milestoneReached: boolean;
      milestone: string;
    }
  >();

  const facts: RecoveryNodeFacts[] = workflow.nodes.map(({ id: nodeId }) => {
    const rule = rules.get(nodeId)!; // Validation guarantees exactly one rule per node.
    const answers = rule.applicability.all.map((key) => input.answers[key] ?? null);
    const applicable = answers.includes(false) ? false : answers.includes(null) ? null : true;
    const missingAnswers = new Set<HouseholdAnswerKey>();
    if (applicable === null) {
      for (const key of rule.applicability.all) {
        if (input.answers[key] == null) missingAnswers.add(key);
      }
    }
    const unmetEvidence: string[] = [];
    if (applicable !== false) {
      for (const group of rule.completion.evidence) {
        if (group.when && input.answers[group.when] === false) continue;
        if (group.when && input.answers[group.when] == null) missingAnswers.add(group.when);
        const accepted = input.evidence.some(
          (item) =>
            item.nodeIds.includes(nodeId) &&
            item.review.status === "ACCEPTED" &&
            group.acceptedKinds.includes(item.kind),
        );
        if (!accepted) unmetEvidence.push(group.id);
      }
    }
    const recorded = progress.get(nodeId);
    const milestoneReached = recorded?.milestoneReached === true;
    details.set(nodeId, {
      missingAnswers: [...missingAnswers],
      unmetEvidence,
      milestoneReached,
      milestone: rule.completion.milestone,
    });
    return {
      nodeId,
      applicable,
      started: recorded?.started === true || milestoneReached,
      completed:
        applicable === true &&
        milestoneReached &&
        missingAnswers.size === 0 &&
        unmetEvidence.length === 0,
    };
  });

  const calculated = calculateRecoveryNodeStates(workflow.nodes, workflow.edges, facts);
  const factsById = new Map(facts.map((fact) => [fact.nodeId, fact]));
  const states = calculated.map((state) => {
    const fact = factsById.get(state.nodeId)!;
    const detail = details.get(state.nodeId)!;
    const blockingNodeIds =
      state.status === "BLOCKED"
        ? [
            ...new Set(
              workflow.edges
                .filter((edge) => edge.to === state.nodeId && recoveryEdgeBlocks[edge.type])
                .filter((edge) => {
                  const prerequisite = factsById.get(edge.from)!;
                  return prerequisite.applicable !== false && !prerequisite.completed;
                })
                .map((edge) => edge.from),
            ),
          ]
        : [];
    const reasons: string[] = [];
    if (state.status === "NOT_APPLICABLE")
      reasons.push("A supplied household answer excludes this task under the draft rule.");
    else if (state.status === "COMPLETE")
      reasons.push(
        `Recorded milestone and reviewed evidence satisfy the draft rule: ${detail.milestone}.`,
      );
    else {
      if (fact.applicable === null)
        reasons.push("Answer the applicability questions before this task can be ready.");
      if (blockingNodeIds.length)
        reasons.push("Required prerequisites are unfinished or their applicability is unknown.");
      if (detail.missingAnswers.length)
        reasons.push(`Missing answers: ${detail.missingAnswers.join(", ")}.`);
      if (detail.unmetEvidence.length)
        reasons.push(`Evidence still needed for completion: ${detail.unmetEvidence.join(", ")}.`);
      if (!detail.milestoneReached) reasons.push(`Milestone not recorded: ${detail.milestone}.`);
      if (state.status === "READY")
        reasons.push("The task can start under the supplied facts and illustrative prerequisites.");
      if (state.status === "IN_PROGRESS")
        reasons.push("Work has started; completion conditions are not yet satisfied.");
    }
    return {
      ...state,
      applicable: fact.applicable,
      missingAnswers: detail.missingAnswers,
      unmetEvidence: detail.unmetEvidence,
      blockingNodeIds,
      reasons,
    };
  });
  return { facts, states };
}
