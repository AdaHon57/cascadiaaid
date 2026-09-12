/** IDs connect records; the engine checks their references at runtime. */
export type RecoveryCaseId = string;
export type RecoveryNodeId = string;
export type EvidenceId = string;
export type RecoverySourceId = string;

export const householdAnswerKeys = [
  "hasDisasterDamage",
  "identityDocumentsLostOrDamaged",
  "needsOccupancyProof",
  "hasRelevantInsurance",
  "seekingPublicAssistance",
  "needsTemporaryHousing",
  "needsHazardAssessment",
  "hazardRemovalRequired",
  "ownsAffectedProperty",
  "seekingPropertyTaxRelief",
  "plansRepairOrRebuilding",
  "permitsRequired",
] as const;
export type HouseholdAnswerKey = (typeof householdAnswerKeys)[number];
/** null or an omitted answer means unknown, never false. */
export type HouseholdAnswers = Partial<Record<HouseholdAnswerKey, boolean | null>>;

export const evidenceKinds = [
  "DAMAGE_PHOTO",
  "DAMAGE_INVENTORY",
  "IDENTITY_RECORD",
  "REPLACEMENT_ID",
  "LEASE",
  "OWNERSHIP_RECORD",
  "UTILITY_BILL",
  "INSURANCE_POLICY",
  "CLAIM_RECEIPT",
  "RECOVERY_NEEDS",
  "ASSISTANCE_RECEIPT",
  "HOUSEHOLD_DETAILS",
  "HOUSING_CONFIRMATION",
  "HAZARD_ASSESSMENT",
  "REMOVAL_RECORD",
  "PROPERTY_ASSESSMENT",
  "TAX_RELIEF_RECEIPT",
  "CONSTRUCTION_PLANS",
  "SITE_ASSESSMENT",
  "PERMIT_RECORD",
  "REPAIR_SCOPE",
  "WORK_ESTIMATE",
  "WORK_COMPLETION_RECORD",
] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

/** Acceptance records a human review, not authenticity or agency approval. */
export type EvidenceReview =
  { status: "PENDING" } | { status: "ACCEPTED" | "REJECTED"; reviewedBy: string };

export interface RecoveryEvidence {
  id: EvidenceId;
  caseId: RecoveryCaseId;
  kind: EvidenceKind;
  /** Explicitly attach a record to each task it is intended to support. */
  nodeIds: RecoveryNodeId[];
  origin: "USER_UPLOAD" | "MANUAL_RECORD" | "IMAGE_EXTRACTION";
  review: EvidenceReview;
  /** Policy references, separate from the document's origin. */
  sourceIds: RecoverySourceId[];
}

export interface RecoveryNodeProgress {
  nodeId: RecoveryNodeId;
  started: boolean;
  /** The named milestone in this node's rule was explicitly recorded. */
  milestoneReached: boolean;
}

export interface RecoveryCase {
  id: RecoveryCaseId;
  answers: HouseholdAnswers;
  evidence: RecoveryEvidence[];
  progress: RecoveryNodeProgress[];
}

export interface RecoverySource {
  id: RecoverySourceId;
  title: string;
  url: string | null;
  /** The current dataset uses ILLUSTRATIVE only. */
  kind: "ILLUSTRATIVE" | "REFERENCE";
}
