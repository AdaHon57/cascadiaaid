import { sampleRecoveryCase } from "@/data/sample-recovery-case";
import { calculateHouseholdRecovery } from "@/lib/recovery-workflow";

// Compatibility export; applicability and completion now come from household rules.
export const sampleRecoveryNodeFacts = calculateHouseholdRecovery(sampleRecoveryCase).facts;
