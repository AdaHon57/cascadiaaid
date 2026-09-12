import { dashboardPriorityFactors } from "@/data/dashboard-priorities";
import { personalizeMap, mapEngineIds } from "@/lib/intake-map";
import { rankRecoveryNodes } from "@/lib/priority-engine";
import { roadmapNodes } from "@/lib/recovery-roadmap";
import type { IntakeRecord } from "@/types/intake";
import type { PriorityFactors } from "@/types/priority";

export function currentNextStep(
  record: IntakeRecord,
  factors: Readonly<Record<string, Readonly<PriorityFactors>>> = dashboardPriorityFactors,
) {
  const answers = record.confirmed?.answers ?? record.draft.answers;
  if (answers.safeTonight === "no" || answers.safeTonight === "unknown") {
    return {
      title: "Find somewhere safe to stay tonight",
      description: "Get help finding temporary housing for your household.",
      href: "tel:211",
      action: "Call 211 for housing help",
    };
  }
  if (!record.confirmed) {
    return {
      title: "Tell us about your situation",
      description: "Answer a few questions so we can find the next step for your household.",
      href: "/intake",
      action: "Continue intake",
    };
  }
  const badges = personalizeMap(record);
  // Readiness and importance are separate. Only engine-backed tasks can be
  // ranked; decorative roadmap milestones are not independent next actions.
  const steps = roadmapNodes.filter((node) => mapEngineIds[node.id]);
  const candidates = [
    steps.filter((node) => badges[node.id]?.tone === "ready"),
    steps.filter((node) => badges[node.id]?.tone === "blocked"),
    steps.filter((node) => badges[node.id]?.label === "Answer needed"),
    steps.filter((node) => badges[node.id]?.tone === "waiting"),
  ].find((group) => group.length);
  const top = rankRecoveryNodes(
    (candidates ?? []).map((node) => {
      const nodeId = mapEngineIds[node.id];
      if (!factors[nodeId]) throw new Error(`Missing Dashboard priority ratings for ${nodeId}`);
      return { nodeId, factors: factors[nodeId] };
    }),
  )[0];
  const next = candidates?.find((node) => mapEngineIds[node.id] === top?.nodeId);
  if (next) {
    const badge = badges[next.id];
    return {
      title:
        badge.tone === "waiting"
          ? `Check on ${next.label.toLowerCase()}`
          : badge.tone === "blocked"
            ? `Resolve what’s blocking ${next.label.toLowerCase()}`
            : badge.label === "Answer needed"
              ? `Clarify your need for ${next.label.toLowerCase()}`
              : next.label,
      description: badge.detail[0] || "Review this step and update your progress.",
      href: `/roadmap#${next.id}`,
      action: "View this step",
    };
  }
  return {
    title: "Check that your information is up to date",
    description:
      "No next action is identified from your current answers. Review any changes to your situation.",
    href: "/intake",
    action: "Review my answers",
  };
}
