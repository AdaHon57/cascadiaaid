import { recoveryNodes } from "@/data/recovery-nodes";
import { recoveryEdges } from "@/data/recovery-edges";
import { recoveryRules } from "@/data/recovery-rules";
import { recoverySources } from "@/data/recovery-sources";
import { evaluateRecoveryCase } from "@/lib/recovery-case-engine";
import { applyRecoveryCaseChanges } from "@/lib/recovery-recalculation";
import type { RecoveryCaseChange } from "@/types/recovery-update";
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

/** Use the returned caseRecord as the input for the next household edit. */
export function updateHouseholdRecovery(
  input: RecoveryCase,
  changes: readonly RecoveryCaseChange[],
) {
  return applyRecoveryCaseChanges(input, changes, recoveryWorkflow);
}
