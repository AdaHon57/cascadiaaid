import { validateDraft } from "@/lib/intake-validation";
import { emptyIntake, intakeToRecovery } from "@/lib/intake-recovery";
import { getJourney } from "@/lib/recovery-journey";
import type { IntakeRecord, IntakeAnswers } from "@/types/intake";

/** Deterministic fictional scenarios. Actual uploads are retained, never relabeled. */
export function loadJourneyDemo(
  input: IntakeRecord,
  scenario: "owner" | "renter",
  now = new Date(),
): IntakeRecord {
  const record = structuredClone(input);
  const answers: IntakeAnswers = {
    safeTonight: "yes",
    accommodationHelp: "yes",
    householdSize: "3",
    placementNeeds: "One pet; step-free access",
    affectedStreet: "100 Example Lane",
    affectedCity: "Spokane",
    affectedZip: "99201",
    addressKnowledge: "full",
    dateKnowledge: "exact",
    affectedDate: "2023-08-18",
    relationship: scenario === "owner" ? "owner" : "renter",
    affected: ["home", "belongings"],
    condition: "damaged",
    recordsLost: "yes",
    lostTypes: ["id"],
    replacementRequested: "no",
    replacementArrived: "no",
    occupancyNeeded: "yes",
    occupancyRecords: "unavailable",
    insurance: "yes",
    insurerName: "Example insurer (simulation)",
    claimSubmitted: "no",
    claimOutstanding: "no",
    assistanceInterest: "yes",
    assistanceApplied: "no",
    propertyWork: scenario === "owner" ? "yes" : "no",
    repairRole: scenario === "owner" ? "yes" : "no",
    rebuild: scenario === "owner" ? "repair" : "not-rebuilding",
    hazardAssessmentNeeded: scenario === "owner" ? "yes" : "no",
    removalRequired: scenario === "owner" ? "yes" : "no",
    permitsRequired: scenario === "owner" ? "yes" : "no",
    taxInterest: scenario === "owner" ? "yes" : "no",
    taxSeeking: scenario === "owner" ? "yes" : "no",
  };
  // Use only legal option values from the existing intake schema.
  const draft = {
    answers,
    stage: 3,
    applications: [
      {
        id: "demo-program-1",
        organization: "Example housing recovery program (simulation)",
        status: "preparing",
        outstanding: "no",
        action: "",
        deadline: "",
      },
    ],
  };
  validateDraft(draft);
  record.confirmed = structuredClone(draft);
  record.draft = structuredClone(draft);
  record.confirmedAt = now.toISOString();
  record.documents = record.documents.filter((doc) => !doc.testData);
  record.caseRecord = intakeToRecovery(draft, emptyIntake(record.id).caseRecord, record.documents);
  record.dashboard = undefined;
  record.journey = undefined;
  record.journey = getJourney(record);
  record.journey.demo = { enabled: true, dayOffset: 0, scenario };
  record.journey.events.push({
    id: crypto.randomUUID(),
    taskId: "",
    kind: "scenario",
    detail: `Loaded fictional ${scenario} scenario. Existing real uploads retained.`,
    at: now.toISOString(),
    simulated: true,
  });
  return record;
}
