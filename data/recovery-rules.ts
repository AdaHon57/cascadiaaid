import type { RecoveryNodeRule } from "@/types/recovery-rule";

// Draft planning rules, not eligibility determinations or jurisdiction policy.
// Prerequisites live exclusively in recovery-edges.ts: no duplicate dependency list.
export const recoveryRules: RecoveryNodeRule[] = [
  {
    nodeId: "damage-documentation",
    applicability: { all: ["hasDisasterDamage"] },
    completion: {
      milestone: "Damage record reviewed by the household",
      evidence: [
        { id: "photos", label: "Damage photos", acceptedKinds: ["DAMAGE_PHOTO"] },
        { id: "inventory", label: "Damage inventory", acceptedKinds: ["DAMAGE_INVENTORY"] },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "identity-replacement",
    applicability: { all: ["identityDocumentsLostOrDamaged"] },
    completion: {
      milestone: "Replacement identity document received",
      evidence: [
        {
          id: "replacement",
          label: "Replacement identity record",
          acceptedKinds: ["REPLACEMENT_ID"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "proof-of-occupancy",
    applicability: { all: ["needsOccupancyProof"] },
    completion: {
      milestone: "Occupancy evidence gathered and reviewed",
      evidence: [
        {
          id: "occupancy",
          label: "Lease, ownership record, or utility bill",
          acceptedKinds: ["LEASE", "OWNERSHIP_RECORD", "UTILITY_BILL"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "insurance-claim",
    applicability: { all: ["hasDisasterDamage", "hasRelevantInsurance"] },
    completion: {
      milestone: "Claim submitted and submission recorded (not a coverage decision)",
      evidence: [
        {
          id: "policy",
          label: "Insurance policy information",
          acceptedKinds: ["INSURANCE_POLICY"],
        },
        { id: "inventory", label: "Damage inventory", acceptedKinds: ["DAMAGE_INVENTORY"] },
        { id: "submission", label: "Claim submission receipt", acceptedKinds: ["CLAIM_RECEIPT"] },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "public-disaster-assistance",
    applicability: { all: ["seekingPublicAssistance"] },
    completion: {
      milestone: "Assistance request submitted and recorded (not aid approval)",
      evidence: [
        {
          id: "occupancy",
          label: "Occupancy record",
          acceptedKinds: ["LEASE", "OWNERSHIP_RECORD", "UTILITY_BILL"],
        },
        { id: "needs", label: "Summary of recovery needs", acceptedKinds: ["RECOVERY_NEEDS"] },
        {
          id: "submission",
          label: "Assistance submission receipt",
          acceptedKinds: ["ASSISTANCE_RECEIPT"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "temporary-housing",
    applicability: { all: ["needsTemporaryHousing"] },
    completion: {
      milestone: "Temporary accommodation arrangement confirmed by the household",
      evidence: [
        {
          id: "household",
          label: "Household size and accommodation needs",
          acceptedKinds: ["HOUSEHOLD_DETAILS"],
        },
        {
          id: "housing",
          label: "Accommodation confirmation",
          acceptedKinds: ["HOUSING_CONFIRMATION"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "hazardous-material-assessment-removal",
    applicability: { all: ["needsHazardAssessment"] },
    completion: {
      milestone: "Professional assessment and any required removal recorded",
      evidence: [
        {
          id: "assessment",
          label: "Professional hazard assessment",
          acceptedKinds: ["HAZARD_ASSESSMENT"],
        },
        {
          id: "removal",
          label: "Removal completion record",
          acceptedKinds: ["REMOVAL_RECORD"],
          when: "hazardRemovalRequired",
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "property-tax-relief",
    applicability: {
      all: ["ownsAffectedProperty", "hasDisasterDamage", "seekingPropertyTaxRelief"],
    },
    completion: {
      milestone: "Tax-relief request submitted and recorded (not relief approval)",
      evidence: [
        {
          id: "assessment",
          label: "Property assessment record",
          acceptedKinds: ["PROPERTY_ASSESSMENT"],
        },
        {
          id: "damage",
          label: "Damage documentation",
          acceptedKinds: ["DAMAGE_PHOTO", "DAMAGE_INVENTORY"],
        },
        {
          id: "submission",
          label: "Tax-relief submission receipt",
          acceptedKinds: ["TAX_RELIEF_RECEIPT"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "building-permits",
    applicability: { all: ["plansRepairOrRebuilding", "permitsRequired"] },
    completion: {
      milestone: "Required permit issuance recorded",
      evidence: [
        {
          id: "plans",
          label: "Proposed construction plans",
          acceptedKinds: ["CONSTRUCTION_PLANS"],
        },
        { id: "site", label: "Site assessment record", acceptedKinds: ["SITE_ASSESSMENT"] },
        { id: "permit", label: "Issued permit record", acceptedKinds: ["PERMIT_RECORD"] },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
  {
    nodeId: "repair-rebuilding",
    applicability: { all: ["plansRepairOrRebuilding"] },
    completion: {
      milestone:
        "Planned repair or rebuilding work recorded as finished (not a safety certification)",
      evidence: [
        { id: "scope", label: "Repair scope", acceptedKinds: ["REPAIR_SCOPE"] },
        { id: "estimate", label: "Work estimate", acceptedKinds: ["WORK_ESTIMATE"] },
        {
          id: "permit",
          label: "Permit records where required",
          acceptedKinds: ["PERMIT_RECORD"],
          when: "permitsRequired",
        },
        {
          id: "finished",
          label: "Work completion record",
          acceptedKinds: ["WORK_COMPLETION_RECORD"],
        },
      ],
    },
    sourceIds: ["illustrative-workflows-v1"],
  },
];
