import { intakeQuestions, activeAnswers } from "@/data/intake-questions";
import type { IntakeAnswers, IntakeDraft, IntakeDocument } from "@/types/intake";

/** Fictional fixtures only; use the question definitions to keep option values valid. */
export function randomIntake(
  now = new Date(),
  random = Math.random,
): {
  draft: IntakeDraft;
  documents: IntakeDocument[];
} {
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const date = (days: number) =>
    new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const answers: IntakeAnswers = {};
  const text: Record<string, string> = {
    affectedStreet: `${100 + Math.floor(random() * 8900)} Example Lane`,
    affectedCity: "Spokane",
    affectedState: "Washington",
    affectedZip: "99201",
    affectedApproximateDate: date(-30),
    currentLocation: "Spokane: temporary accommodation (test data)",
    householdSize: String(1 + Math.floor(random() * 6)),
    placementNeeds: pick(["Space for one pet", "Step-free access", "No special placement needs"]),
    insurerName: "Example Insurance (test data)",
    claimReference: `TEST-${Math.floor(random() * 1000000)}`,
    claimAction: "Provide a repair estimate (test data)",
    hazardDetails: "Restricted access pending professional assessment (test data)",
    debrisDetails: "Initial debris collection by example contractor (test data)",
    permitWork: "Structural repairs (test data)",
    inspectionDetails: "Final inspection pending (test data)",
    taxAction: "Provide damage documentation (test data)",
  };
  for (const question of intakeQuestions) {
    if (question.options) {
      const options = question.options.map(([id]) => id).filter((id) => id !== "unknown");
      const value = pick(options);
      answers[question.id] = question.kind === "multi" ? [value] : value;
    } else {
      answers[question.id] =
        question.kind === "date"
          ? date(question.id === "affectedDate" ? -30 : 7 + Math.floor(random() * 30))
          : text[question.id] || "Example response (test data)";
    }
  }
  // Keep the core scenario consistent while varying recovery progress.
  Object.assign(answers, {
    addressKnowledge: "full",
    dateKnowledge: "exact",
    relationship: pick(["owner", "renter"]),
    mainHome: "yes",
    affected: ["home", "belongings"],
    condition: "destroyed",
    safeTonight: "yes",
    accommodationHelp: "yes",
    housingConfirmed: "yes",
    recordsLost: "yes",
    lostTypes: ["id"],
    insurance: "yes",
    insurerContacted: "yes",
    claimSubmitted: "yes",
    assistanceApplied: "yes",
  });
  if (answers.claimStatus === "resolved") answers.claimOutstanding = "no";
  if (answers.asbestosResult === "negative") answers.asbestosRemoval = "no";
  if (answers.accessAllowed === "no") {
    answers.workStarted = "no";
    answers.debrisStatus = "none";
  }
  const applications = ["Housing support", "Recovery grant", "Household essentials"].map((name) => {
    const status = pick(["submitted", "information", "approved", "received", "appealing"]);
    const outstanding = ["information", "appealing"].includes(status) ? "yes" : "no";
    return {
      id: crypto.randomUUID(),
      organization: `Example ${name} (test data)`,
      status,
      outstanding,
      action: outstanding === "yes" ? "Send supporting records (test data)" : "",
      deadline: outstanding === "yes" ? date(7 + Math.floor(random() * 30)) : "",
    };
  });
  const documents = ["utility-bill", "insurance-policy", "claim-receipt"].map(
    (type): IntakeDocument => ({
      id: crypto.randomUUID(),
      type,
      uploadedAt: now.toISOString(),
      confirmedAt: now.toISOString(),
      testData: true,
      fields: {
        name: "Example Household (TEST DATA)",
        address: `${answers.affectedStreet}, Spokane, WA 99201`,
        date: date(-7),
        dateMeaning: "issued",
        scope: "affected-property",
      },
      recipientStatus: "pending",
      recipient: "Example reviewer (test data)",
      conflictAcknowledgment: "",
    }),
  );
  return { draft: { answers: activeAnswers(answers), applications, stage: 3 }, documents };
}

/** Text-only samples cannot be mistaken for scans of real evidence. */
export function testDocumentPreview(): string {
  return "TEST DATA: SAMPLE DOCUMENT\n\nFictional household supporting record.\nCreated by Settings → Randomize data.\n\nFor application testing only.\nNot valid evidence or an official record.\n";
}
