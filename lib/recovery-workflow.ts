import { recoveryNodes } from "@/data/recovery-nodes";
import { recoveryEdges } from "@/data/recovery-edges";
import { recoveryRules } from "@/data/recovery-rules";
import { recoverySources } from "@/data/recovery-sources";
import { evaluateRecoveryCase } from "@/lib/recovery-case-engine";
import type { RecoveryCase } from "@/types/recovery-case";
import type { RecoveryWorkflow } from "@/types/recovery-rule";

export const recoveryWorkflow: RecoveryWorkflow = {
  nodes: recoveryNodes,
  edges: recoveryEdges,
  rules: recoveryRules,
  sources: recoverySources,
};

/** Application entry point. Pass actual household facts, never the sample as defaults. */
export function calculateHouseholdRecovery(input: RecoveryCase) {
  return evaluateRecoveryCase(input, recoveryWorkflow);
}
