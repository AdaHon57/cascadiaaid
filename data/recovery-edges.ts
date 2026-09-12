import type { RecoveryEdge } from "@/types/recovery-node";

// Illustrative relationships migrated from the original sample nodes.
// These are not verified legal or program requirements. Each type comes from
// the former edgeType of the dependent (to) node; no new relationships are added.
export const recoveryEdges: RecoveryEdge[] = [
  {
    from: "identity-replacement",
    to: "proof-of-occupancy",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "damage-documentation",
    to: "insurance-claim",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "proof-of-occupancy",
    to: "public-disaster-assistance",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "damage-documentation",
    to: "hazardous-material-assessment-removal",
    type: "RECOMMENDED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "damage-documentation",
    to: "property-tax-relief",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "hazardous-material-assessment-removal",
    to: "building-permits",
    type: "SAFETY",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "insurance-claim",
    to: "repair-rebuilding",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "public-disaster-assistance",
    to: "repair-rebuilding",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    from: "building-permits",
    to: "repair-rebuilding",
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  },
];
