import type { RecoveryEdge } from "@/types/recovery-node";

// Illustrative relationships migrated from the original sample nodes.
// These are not verified legal or program requirements. Each type comes from
// the former edgeType of the dependent (to) node; no new relationships are added.
export const recoveryEdges: RecoveryEdge[] = [
  { from: "identity-replacement", to: "proof-of-occupancy", type: "REQUIRED" },
  { from: "damage-documentation", to: "insurance-claim", type: "REQUIRED" },
  { from: "proof-of-occupancy", to: "public-disaster-assistance", type: "REQUIRED" },
  {
    from: "damage-documentation",
    to: "hazardous-material-assessment-removal",
    type: "RECOMMENDED",
  },
  { from: "damage-documentation", to: "property-tax-relief", type: "REQUIRED" },
  {
    from: "hazardous-material-assessment-removal",
    to: "building-permits",
    type: "SAFETY",
  },
  { from: "insurance-claim", to: "repair-rebuilding", type: "REQUIRED" },
  { from: "public-disaster-assistance", to: "repair-rebuilding", type: "REQUIRED" },
  { from: "building-permits", to: "repair-rebuilding", type: "REQUIRED" },
];
