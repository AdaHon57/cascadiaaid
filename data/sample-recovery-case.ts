import type { RecoveryCase } from "@/types/recovery-case";

// Fictional demonstration only. An actual new case starts with unanswered questions.
export const sampleRecoveryCase: RecoveryCase = {
  id: "sample-household",
  answers: {
    hasDisasterDamage: true,
    identityDocumentsLostOrDamaged: true,
    needsOccupancyProof: true,
    hasRelevantInsurance: true,
    seekingPublicAssistance: true,
    needsTemporaryHousing: true,
    needsHazardAssessment: true,
    hazardRemovalRequired: null,
    ownsAffectedProperty: false,
    seekingPropertyTaxRelief: false,
    plansRepairOrRebuilding: true,
    permitsRequired: true,
  },
  evidence: [
    {
      id: "sample-photos",
      caseId: "sample-household",
      kind: "DAMAGE_PHOTO",
      nodeIds: ["damage-documentation"],
      origin: "USER_UPLOAD",
      review: { status: "ACCEPTED", reviewedBy: "sample-household-reviewer" },
      sourceIds: [],
    },
    {
      id: "sample-inventory",
      caseId: "sample-household",
      kind: "DAMAGE_INVENTORY",
      nodeIds: ["damage-documentation", "insurance-claim"],
      origin: "MANUAL_RECORD",
      review: { status: "ACCEPTED", reviewedBy: "sample-household-reviewer" },
      sourceIds: [],
    },
  ],
  progress: [
    { nodeId: "damage-documentation", started: true, milestoneReached: true },
    { nodeId: "identity-replacement", started: true, milestoneReached: false },
  ],
};
