import type { RecoveryNodeFacts } from "@/types/recovery-node";

// Explicit inputs for one fictional case, not defaults or verified eligibility.
// Statuses are calculated from these facts and the illustrative edges.
export const sampleRecoveryNodeFacts: RecoveryNodeFacts[] = [
  { nodeId: "damage-documentation", applicable: true, started: true, completed: true },
  { nodeId: "identity-replacement", applicable: true, started: true, completed: false },
  { nodeId: "proof-of-occupancy", applicable: true, started: false, completed: false },
  { nodeId: "insurance-claim", applicable: true, started: false, completed: false },
  { nodeId: "public-disaster-assistance", applicable: true, started: false, completed: false },
  { nodeId: "temporary-housing", applicable: true, started: false, completed: false },
  {
    nodeId: "hazardous-material-assessment-removal",
    applicable: true,
    started: false,
    completed: false,
  },
  { nodeId: "property-tax-relief", applicable: false, started: false, completed: false },
  { nodeId: "building-permits", applicable: true, started: false, completed: false },
  { nodeId: "repair-rebuilding", applicable: true, started: false, completed: false },
];
