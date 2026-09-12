import { activeAnswers, needsHousingQuestions, propertyQuestions } from "@/data/intake-questions";
import { calculateHouseholdRecovery } from "@/lib/recovery-workflow";
import type { HouseholdAnswerKey, RecoveryCase, RecoveryEvidence } from "@/types/recovery-case";
import type { IntakeAnswers, IntakeDocument, IntakeDraft, IntakeRecord } from "@/types/intake";

const bool = (value: unknown): boolean | null =>
  value === "yes" ? true : value === "no" ? false : null;
const selected = (answers: IntakeAnswers, key: string, values: string[]) =>
  Array.isArray(answers[key]) && answers[key].some((v) => values.includes(v));
export function emptyIntake(id: string): IntakeRecord {
  return {
    id,
    revision: 0,
    draft: { answers: {}, applications: [], stage: 0 },
    confirmed: null,
    confirmedAt: null,
    documents: [],
    caseRecord: { id, answers: {}, evidence: [], progress: [] },
  };
}

/** Project only user-confirmed facts; never infer eligibility, safety, or recipient acceptance. */
export function intakeToRecovery(
  draft: IntakeDraft,
  base: RecoveryCase,
  documents: IntakeDocument[],
): RecoveryCase {
  const a = activeAnswers(draft.answers);
  const answers: RecoveryCase["answers"] = { ...base.answers };
  const set = (key: HouseholdAnswerKey, value: boolean | null) => {
    answers[key] = value;
  };
  const damage =
    selected(a, "affected", ["home", "belongings", "vehicle", "other"]) ||
    ["damaged", "destroyed"].includes(String(a.condition));
  set(
    "hasDisasterDamage",
    damage
      ? true
      : selected(a, "affected", ["evacuated"]) &&
          !selected(a, "affected", ["unknown"]) &&
          a.condition === "undamaged"
        ? false
        : null,
  );
  // Lost important records alone do not establish that an identity document was lost.
  set(
    "identityDocumentsLostOrDamaged",
    a.recordsLost === "no"
      ? false
      : a.recordsLost === "yes" && selected(a, "lostTypes", ["id", "birth"])
        ? true
        : a.recordsLost === "yes" &&
            Array.isArray(a.lostTypes) &&
            a.lostTypes.length > 0 &&
            !selected(a, "lostTypes", ["unknown", "other"])
          ? false
          : null,
  );
  set("needsOccupancyProof", bool(a.occupancyNeeded));
  set("hasRelevantInsurance", bool(a.insurance));
  set(
    "seekingPublicAssistance",
    a.assistanceApplied === "yes" ||
      a.assistanceInterest === "yes" ||
      draft.applications.some(
        (app) => !["not-started", "unknown", "skipped", ""].includes(app.status),
      )
      ? true
      : a.assistanceApplied === "no" && a.assistanceInterest === "no"
        ? false
        : null,
  );
  set(
    "needsTemporaryHousing",
    needsHousingQuestions(a)
      ? true
      : a.safeTonight === "yes" && a.accommodationHelp === "no"
        ? false
        : null,
  );
  set(
    "needsHazardAssessment",
    propertyQuestions(a) ? bool(a.hazardAssessmentNeeded) : a.propertyWork === "no" ? false : null,
  );
  set("hazardRemovalRequired", bool(a.removalRequired));
  set(
    "ownsAffectedProperty",
    a.relationship === "owner" ? true : a.taxInterest === "no" ? false : null,
  );
  set("seekingPropertyTaxRelief", bool(a.taxSeeking));
  set(
    "plansRepairOrRebuilding",
    ["repair", "rebuild"].includes(String(a.rebuild))
      ? true
      : a.rebuild === "not-rebuilding"
        ? false
        : null,
  );
  set("permitsRequired", bool(a.permitsRequired));
  const progress = base.progress.map((p) => ({ ...p }));
  function record(nodeId: string, started: boolean, milestone: boolean | null = null) {
    const old = progress.find((p) => p.nodeId === nodeId);
    if (old) {
      old.started ||= started;
      if (milestone !== null) old.milestoneReached = milestone;
    } else if (started || milestone)
      progress.push({
        nodeId,
        started: started || milestone === true,
        milestoneReached: milestone === true,
      });
  }
  record(
    "temporary-housing",
    typeof a.currentLocation === "string" &&
      !["", "unknown", "skipped"].includes(a.currentLocation),
    bool(a.housingConfirmed),
  );
  record("identity-replacement", a.replacementRequested === "yes", bool(a.replacementArrived));
  record("proof-of-occupancy", a.occupancyRecords === "available");
  record("damage-documentation", a.damageDocumented === "yes");
  record(
    "insurance-claim",
    a.insurerContacted === "yes" || a.claimSubmitted === "yes",
    bool(a.claimSubmitted),
  );
  // Per-program outcomes stay in applications. An aggregate node is never completed by a denial.
  record(
    "public-disaster-assistance",
    a.assistanceApplied === "yes" ||
      draft.applications.some(
        (app) => !["not-started", "unknown", "skipped", ""].includes(app.status),
      ),
  );
  if (
    draft.applications.some((app) =>
      ["denied", "appealing", "unknown", "skipped", ""].includes(app.status),
    )
  ) {
    const assistance = progress.find((p) => p.nodeId === "public-disaster-assistance");
    if (assistance) assistance.milestoneReached = false;
  }
  record(
    "hazardous-material-assessment-removal",
    a.asbestosSurvey === "yes" ||
      ["scheduled", "in-progress", "complete"].includes(String(a.householdHazards)),
    bool(a.professionalHazardsComplete),
  );
  record(
    "property-tax-relief",
    a.assessorStarted === "yes" || a.taxRequested === "yes",
    bool(a.taxRequested),
  );
  record(
    "building-permits",
    ["requested", "issued"].includes(String(a.permitStatus)),
    a.permitStatus === "issued"
      ? true
      : ["requested", "not-requested"].includes(String(a.permitStatus))
        ? false
        : null,
  );
  record("repair-rebuilding", a.workStarted === "yes", bool(a.workFinished));
  const evidence = base.evidence.filter((e) => !e.id.startsWith("intake-document:"));
  const mapping: Record<string, { kind: RecoveryEvidence["kind"]; nodeIds: string[] }> = {
    "damage-photo": {
      kind: "DAMAGE_PHOTO",
      nodeIds: ["damage-documentation", "property-tax-relief"],
    },
    "utility-bill": {
      kind: "UTILITY_BILL",
      nodeIds: ["proof-of-occupancy", "public-disaster-assistance"],
    },
    id: { kind: "IDENTITY_RECORD", nodeIds: ["identity-replacement"] },
    "insurance-policy": { kind: "INSURANCE_POLICY", nodeIds: ["insurance-claim"] },
    inventory: {
      kind: "DAMAGE_INVENTORY",
      nodeIds: ["damage-documentation", "insurance-claim", "property-tax-relief"],
    },
    "schedule-loss": {
      kind: "DAMAGE_INVENTORY",
      nodeIds: ["damage-documentation", "insurance-claim"],
    },
    "claim-receipt": { kind: "CLAIM_RECEIPT", nodeIds: ["insurance-claim"] },
    "asbestos-survey": {
      kind: "HAZARD_ASSESSMENT",
      nodeIds: ["hazardous-material-assessment-removal"],
    },
    "asbestos-clearance": {
      kind: "REMOVAL_RECORD",
      nodeIds: ["hazardous-material-assessment-removal"],
    },
    "tax-statement": { kind: "PROPERTY_ASSESSMENT", nodeIds: ["property-tax-relief"] },
  };
  for (const doc of documents) {
    const match = mapping[doc.type];
    if (!match) continue;
    // Scope and unresolved conflicts prevent an unrelated document satisfying a task.
    const relevant =
      doc.fields.scope === "affected-property" ||
      (doc.type === "id" && doc.fields.scope === "household");
    const reviewed =
      !!doc.confirmedAt &&
      relevant &&
      (documentConflicts(doc, a, documents).length === 0 || !!doc.conflictAcknowledgment.trim());
    evidence.push({
      id: `intake-document:${doc.id}`,
      caseId: base.id,
      ...match,
      origin: "USER_UPLOAD",
      review: reviewed ? { status: "ACCEPTED", reviewedBy: "household" } : { status: "PENDING" },
      sourceIds: [],
    });
  }
  return { ...base, answers, progress, evidence };
}
const normalized = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
export function documentConflicts(
  doc: IntakeDocument,
  a: IntakeAnswers,
  docs: IntakeDocument[],
): string[] {
  const conflicts: string[] = [];
  const f = doc.fields;
  const address = [a.affectedStreet, a.affectedCity, a.affectedZip]
    .filter((v) => typeof v === "string" && !["unknown", "skipped"].includes(v))
    .join(" ");
  if (
    f.address &&
    address &&
    f.scope === "affected-property" &&
    !normalized(f.address).includes(normalized(address)) &&
    !normalized(address).includes(normalized(f.address))
  )
    conflicts.push(
      "This address differs from the affected address. Check abbreviations, missing parts, or a different property.",
    );
  if (
    f.date &&
    f.dateMeaning === "wildfire" &&
    a.dateKnowledge === "exact" &&
    a.affectedDate &&
    f.date !== a.affectedDate
  )
    conflicts.push("This wildfire date differs from the date you reported.");
  if (
    f.scope === "other" ||
    f.scope === "unknown" ||
    (f.scope === "household" && doc.type !== "id")
  )
    conflicts.push(
      "Confirm which household or property this document supports before using it as evidence.",
    );
  for (const other of docs) {
    if (other.id === doc.id || !other.confirmedAt) continue;
    if (f.name && other.fields.name && normalized(f.name) !== normalized(other.fields.name)) {
      conflicts.push(
        "Names differ across documents. This may be another household member; explain the relationship.",
      );
      break;
    }
  }
  for (const other of docs) {
    if (other.id === doc.id || !other.confirmedAt) continue;
    if (
      f.address &&
      other.fields.address &&
      f.scope === "affected-property" &&
      other.fields.scope === "affected-property" &&
      normalized(f.address) !== normalized(other.fields.address)
    ) {
      conflicts.push(
        "Affected-property addresses differ across documents. Check whether they concern the same property.",
      );
      break;
    }
  }
  for (const other of docs) {
    if (other.id === doc.id || !other.confirmedAt) continue;
    if (
      f.date &&
      other.fields.date &&
      f.dateMeaning === "wildfire" &&
      other.fields.dateMeaning === "wildfire" &&
      f.date !== other.fields.date
    ) {
      conflicts.push("Wildfire dates differ across documents.");
      break;
    }
  }
  return conflicts;
}
export function evaluateIntake(record: IntakeRecord) {
  return calculateHouseholdRecovery(record.caseRecord);
}
