import type { HouseholdAnswerKey } from "@/types/recovery-case";

/** Shared wording for missing-answer explanations; no answers or policy inferred. */
export const householdQuestions: Record<HouseholdAnswerKey, string> = {
  hasDisasterDamage: "Does your household have disaster damage?",
  identityDocumentsLostOrDamaged: "Were your identity documents lost or damaged?",
  needsOccupancyProof: "Do you need proof of occupancy?",
  hasRelevantInsurance: "Do you have insurance relevant to this damage?",
  seekingPublicAssistance: "Are you seeking public disaster assistance?",
  needsTemporaryHousing: "Do you need temporary housing?",
  needsHazardAssessment: "Do you need a hazardous-material assessment?",
  hazardRemovalRequired: "Has hazardous-material removal been determined to be required?",
  ownsAffectedProperty: "Do you own the affected property?",
  seekingPropertyTaxRelief: "Are you seeking property-tax relief?",
  plansRepairOrRebuilding: "Are you planning repairs or rebuilding?",
  permitsRequired: "Have permits been determined to be required for the planned work?",
};
