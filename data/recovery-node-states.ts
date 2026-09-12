import { sampleRecoveryCase } from "@/data/sample-recovery-case";
import { calculateHouseholdRecovery } from "@/lib/recovery-workflow";

// A calculated demonstration snapshot. Recalculate an actual case when its facts change.
export const sampleRecoveryNodeStates = calculateHouseholdRecovery(sampleRecoveryCase).states;
