import { dashboardPriorityFactors } from "@/data/dashboard-priorities";
import { currentNextStep } from "@/lib/current-next-step";
import { evaluateIntake } from "@/lib/intake-recovery";
import { mapEngineIds, personalizeMap } from "@/lib/intake-map";
import { rankRecoveryNodes } from "@/lib/priority-engine";
import { roadmapNodes } from "@/lib/recovery-roadmap";
import type { IntakeRecord } from "@/types/intake";
import type { PriorityFactors } from "@/types/priority";

export interface DashboardStep {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  blocked: boolean;
  prerequisites: { id: string; title: string; reasons: string[] }[];
  skipped: boolean;
}

export function dashboardSteps(
  record: IntakeRecord,
  factors: Readonly<Record<string, Readonly<PriorityFactors>>> = dashboardPriorityFactors,
): DashboardStep[] {
  const skipped = new Set(record.dashboard?.skippedStepIds ?? []);
  const answers = record.confirmed?.answers ?? record.draft.answers;
  const urgent = answers.safeTonight === "no" || answers.safeTonight === "unknown";
  const steps: DashboardStep[] = [];
  if (urgent)
    steps.push({
      id: "temporary-housing",
      title: "Find somewhere safe to stay tonight",
      description: "Get help finding temporary housing for your household.",
      href: "tel:211",
      action: "Call 211 for housing help",
      blocked: false,
      prerequisites: [],
      skipped: skipped.has("temporary-housing"),
    });
  if (!record.confirmed) {
    steps.push({
      id: "intake",
      title: "Tell us about your situation",
      description: "Answer a few questions to personalize your recovery steps.",
      href: "/intake",
      action: "Continue intake",
      blocked: false,
      prerequisites: [],
      skipped: skipped.has("intake"),
    });
  } else {
    const badges = personalizeMap(record);
    const states = evaluateIntake(record).states;
    const candidates = roadmapNodes.filter((node) => {
      if (!mapEngineIds[node.id] || (urgent && node.id === "temporary-housing")) return false;
      const badge = badges[node.id];
      return (
        badge.tone !== "complete" && (badge.tone !== "unknown" || badge.label === "Answer needed")
      );
    });
    const ranked = rankRecoveryNodes(
      candidates.map((node) => ({
        nodeId: mapEngineIds[node.id],
        factors: factors[mapEngineIds[node.id]],
      })),
    );
    for (const rankedNode of ranked) {
      const node = candidates.find(
        (candidate) => mapEngineIds[candidate.id] === rankedNode.nodeId,
      )!;
      const badge = badges[node.id];
      const state = states.find((item) => item.nodeId === rankedNode.nodeId)!;
      steps.push({
        id: node.id,
        title: badge.tone === "waiting" ? `Check on ${node.label.toLowerCase()}` : node.label,
        description: badge.detail[0] || "Review this step and update your progress.",
        href: `/roadmap#${node.id}`,
        action: "Work on this step",
        blocked: state.blockingNodeIds.length > 0,
        prerequisites: state.blockingDependencies.map((dependency) => ({
          id: Object.keys(mapEngineIds).find((id) => mapEngineIds[id] === dependency.nodeId)!,
          title: dependency.title,
          reasons: dependency.reasons,
        })),
        skipped: skipped.has(node.id),
      });
    }
    if (!steps.length)
      steps.push({
        ...currentNextStep(record),
        id: "review",
        blocked: false,
        prerequisites: [],
        skipped: skipped.has("review"),
      });
  }
  // Stable partition: preserve the engine's ordering within each group.
  return [...steps.filter((step) => !step.skipped), ...steps.filter((step) => step.skipped)];
}

export function activeDashboardStep(record: IntakeRecord, steps = dashboardSteps(record)) {
  const available = steps.filter((step) => !step.blocked && !step.skipped);
  return available.find((step) => step.id === record.dashboard?.activeStepId) ?? available[0];
}

export function updateDashboardStep(record: IntakeRecord, action: unknown, stepId: unknown) {
  if (!["skip", "restore", "start"].includes(String(action)) || typeof stepId !== "string")
    throw new Error("Invalid Dashboard action.");
  const steps = dashboardSteps(record);
  const step = steps.find((item) => item.id === stepId);
  if (!step) throw new Error("Invalid Dashboard step.");
  if (action === "start" && step.blocked)
    throw new Error("Invalid action: finish the prerequisites first.");
  const skipped = new Set(record.dashboard?.skippedStepIds ?? []);
  const current = activeDashboardStep(record, steps)?.id ?? null;
  if (action === "skip") skipped.add(stepId);
  else skipped.delete(stepId);
  const next = {
    ...record,
    dashboard: {
      skippedStepIds: [...skipped],
      activeStepId:
        action === "start" ? stepId : action === "skip" && current === stepId ? null : current,
    },
  };
  next.dashboard.activeStepId = activeDashboardStep(next)?.id ?? null;
  return next;
}
