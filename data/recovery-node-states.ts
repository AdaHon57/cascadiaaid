import { calculateRecoveryNodeStates } from "@/lib/recovery-status-engine";
import { recoveryNodes } from "@/data/recovery-nodes";
import { recoveryEdges } from "@/data/recovery-edges";
import { sampleRecoveryNodeFacts } from "@/data/recovery-node-facts";

// Compatibility export: calculated sample output, never a hand-assigned status list.
// Call the engine again with updated facts whenever a case changes.
export const sampleRecoveryNodeStates = calculateRecoveryNodeStates(
  recoveryNodes,
  recoveryEdges,
  sampleRecoveryNodeFacts,
);
