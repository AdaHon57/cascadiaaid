import { additionalDocumentTypes } from "@/data/journey-workflows";
import type { IntakeAnswers } from "@/types/intake";
export const yesNo = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unknown", "Not sure"],
] as const;
type Option = readonly [string, string];
export interface IntakeQuestion {
  id: string;
  label: string;
  stage: 0 | 1;
  section: string;
  kind?: "text" | "date" | "multi";
  options?: readonly Option[];
  hint?: string;
  when?: (answers: IntakeAnswers) => boolean;
}
const has = (a: IntakeAnswers, key: string, value: string) =>
  Array.isArray(a[key]) && a[key].includes(value);
const unsure = (value: unknown) => value == null || value === "unknown" || value === "skipped";
export const needsHousingQuestions = (a: IntakeAnswers) =>
  a.safeTonight === "no" ||
  a.safeTonight === "unknown" ||
  ["unlivable", "destroyed"].includes(String(a.condition)) ||
  has(a, "affected", "evacuated") ||
  a.accommodationHelp === "yes";
export const propertyQuestions = (a: IntakeAnswers) =>
  has(a, "affected", "home") ||
  has(a, "affected", "other") ||
  ["damaged", "unlivable", "destroyed"].includes(String(a.condition)) ||
  a.propertyWork === "yes" ||
  a.propertyWork === "unknown";
export const taxQuestions = (a: IntakeAnswers) =>
  a.relationship === "owner" || a.taxInterest === "yes" || a.taxInterest === "unknown";
const q = (
  id: string,
  label: string,
  section: string,
  extra: Partial<IntakeQuestion> = {},
): IntakeQuestion => ({ id, label, section, stage: 1, options: yesNo, ...extra });
const text = (id: string, label: string, section: string, extra: Partial<IntakeQuestion> = {}) =>
  q(id, label, section, { kind: "text", options: undefined, ...extra });
const insurance = (a: IntakeAnswers) => a.insurance === "yes" || a.insurance === "unknown";
const lost = (a: IntakeAnswers) => a.recordsLost === "yes" || a.recordsLost === "unknown";
const work = propertyQuestions;
const repairs = (a: IntakeAnswers) => work(a) && a.rebuild !== "not-rebuilding";
const tax = taxQuestions;
export const intakeQuestions: IntakeQuestion[] = [
  q("safeTonight", "Do you have somewhere safe to stay tonight?", "Immediate needs", { stage: 0 }),
  text("affectedStreet", "What street address was affected?", "Affected home", {
    stage: 0,
    hint: "Partial information is fine. This is the affected home, not where you are staying now.",
  }),
  text("affectedCity", "City", "Affected home", { stage: 0 }),
  text("affectedZip", "ZIP code", "Affected home", { stage: 0 }),
  q("addressKnowledge", "Do you know the full affected address?", "Affected home", {
    stage: 0,
    options: [
      ["full", "Yes"],
      ["partial", "I don’t know the full address"],
      ["unknown", "Not sure"],
    ],
  }),
  q("dateKnowledge", "When were you affected by the wildfire?", "Affected home", {
    stage: 0,
    options: [
      ["exact", "I know the date"],
      ["approximate", "I know an approximate date"],
      ["unknown", "Not sure"],
    ],
  }),
  text("affectedDate", "Date affected", "Affected home", {
    stage: 0,
    kind: "date",
    when: (a) => a.dateKnowledge === "exact",
  }),
  text("affectedApproximateDate", "Approximate date or time period", "Affected home", {
    stage: 0,
    when: (a) => a.dateKnowledge === "approximate",
    hint: "For example, early August 2026.",
  }),
  q("relationship", "What was your relationship to that home?", "Affected household", {
    stage: 0,
    options: [
      ["owner", "Owner"],
      ["renter", "Renter"],
      ["family", "Staying with family/friends"],
      ["other", "Other arrangement"],
      ["unknown", "Not sure"],
    ],
  }),
  q("mainHome", "Was it your main home when the wildfire affected it?", "Affected household", {
    stage: 0,
  }),
  q("affected", "What was affected? Select all that apply.", "Affected household", {
    stage: 0,
    kind: "multi",
    options: [
      ["home", "Home/building"],
      ["belongings", "Belongings"],
      ["vehicle", "Vehicle"],
      ["other", "Other property"],
      ["evacuated", "Evacuated but no known damage"],
      ["unknown", "Damage not yet known"],
    ],
  }),
  q("condition", "What is the home’s current condition?", "Affected household", {
    stage: 0,
    options: [
      ["undamaged", "Appears undamaged"],
      ["damaged", "Damaged but currently usable"],
      ["unlivable", "Cannot currently live there"],
      ["destroyed", "Destroyed"],
      ["unknown", "Not assessed / not sure"],
    ],
    hint: "This is your report, not an official damage classification or a determination that the property is safe.",
  }),
  q(
    "accommodationHelp",
    "Do you need help finding or extending accommodation?",
    "Safety / housing",
  ),
  text("currentLocation", "Where are you staying now?", "Safety / housing", {
    when: needsHousingQuestions,
    hint: "A city and type of accommodation is enough. Keep this separate from the affected address.",
  }),
  q("housingConfirmed", "Is that arrangement confirmed?", "Safety / housing", {
    when: needsHousingQuestions,
  }),
  text("housingEnd", "When does it end, if known?", "Safety / housing", {
    kind: "date",
    when: needsHousingQuestions,
  }),
  text("householdSize", "How many people need accommodation?", "Safety / housing", {
    when: needsHousingQuestions,
  }),
  text(
    "placementNeeds",
    "Are there accessibility, transportation, household or pet needs that affect suitable placement?",
    "Safety / housing",
    {
      when: needsHousingQuestions,
      hint: "Share practical needs only; no medical records are needed.",
    },
  ),
  q("recordsLost", "Were any needed IDs or important records lost or destroyed?", "ID & documents"),
  q("lostTypes", "Which records were lost or destroyed?", "ID & documents", {
    kind: "multi",
    when: lost,
    options: [
      ["id", "Driver’s license / ID"],
      ["birth", "Birth certificate"],
      ["lease", "Lease / home records"],
      ["insurance", "Insurance records"],
      ["other", "Other important records"],
      ["unknown", "Not sure"],
    ],
  }),
  q("otherId", "Do you have another form of identification available?", "ID & documents", {
    when: lost,
    hint: "Do not enter an ID number.",
  }),
  q("replacementRequested", "Have you already requested replacements?", "ID & documents", {
    when: lost,
  }),
  q("replacementArrived", "Have the replacements you need arrived?", "ID & documents", {
    when: (a) => lost(a) && a.replacementRequested === "yes",
  }),
  q(
    "occupancyRecords",
    "Do you have records showing you lived at the affected address?",
    "ID & documents",
    {
      options: [
        ["available", "Available"],
        ["request", "Can request"],
        ["unavailable", "Unavailable"],
        ["unknown", "Not sure"],
      ],
    },
  ),
  q(
    "occupancyNeeded",
    "Do you need to gather proof that you lived there for a request or application?",
    "ID & documents",
  ),
  q("damageDocumented", "Have you documented damaged property or belongings?", "ID & documents"),
  q("insurance", "Do you have insurance that might cover any of these losses?", "Insurance"),
  q("insurerContacted", "Have you contacted the insurer?", "Insurance", { when: insurance }),
  q("claimSubmitted", "Has a claim been submitted?", "Insurance", { when: insurance }),
  q("claimStatus", "What is happening with the claim now?", "Insurance", {
    when: (a) => insurance(a) && a.claimSubmitted === "yes",
    options: [
      ["evidence", "Evidence requested"],
      ["review", "Inspection or review pending"],
      ["decision", "Decision received"],
      ["payment-pending", "Payment pending"],
      ["partial-payment", "Some payment received"],
      ["resolved", "Resolved"],
      ["unknown", "Not sure"],
    ],
  }),
  q("claimOutstanding", "Are there outstanding requests, disputes or deadlines?", "Insurance", {
    when: insurance,
  }),
  text("claimAction", "What has the insurer asked you to do, or what is disputed?", "Insurance", {
    when: (a) => insurance(a) && a.claimOutstanding === "yes",
  }),
  text("claimDeadline", "What is the deadline, if known?", "Insurance", {
    kind: "date",
    when: (a) => insurance(a) && a.claimOutstanding === "yes",
  }),
  text("insurerName", "Insurer name (optional)", "Insurance", { when: insurance }),
  text("claimReference", "Claim reference (optional)", "Insurance", { when: insurance }),
  q("assistanceApplied", "Have you applied for any disaster assistance?", "Assistance", {
    hint: "You can explore assistance while insurance is pending. Each program decides its own requirements.",
  }),
  q("assistanceInterest", "Would you like to explore assistance options?", "Assistance", {
    when: (a) => a.assistanceApplied !== "yes",
  }),
  q("propertyWork", "Might cleanup or other property work be needed?", "Property", {
    when: (a) =>
      !has(a, "affected", "home") &&
      !has(a, "affected", "other") &&
      !["damaged", "unlivable", "destroyed"].includes(String(a.condition)),
  }),
  q("repairRole", "Are you responsible or authorized to arrange cleanup or repairs?", "Property", {
    when: work,
    hint: "Renters may also have a role in arranging work.",
  }),
  q("accessAllowed", "Have authorities allowed access to the property?", "Property", {
    when: work,
  }),
  q("hazardsKnown", "Are there known hazards or restrictions?", "Property", { when: work }),
  text("hazardDetails", "What hazards or restrictions are known?", "Property", {
    when: (a) => work(a) && a.hazardsKnown === "yes",
  }),
  q(
    "hazardAssessmentNeeded",
    "Have you been told a professional hazard assessment is needed?",
    "Property",
    { when: work },
  ),
  q("householdHazards", "What is the household-hazard removal status?", "Property", {
    when: work,
    options: [
      ["not-started", "Not started"],
      ["scheduled", "Scheduled"],
      ["in-progress", "In progress"],
      ["complete", "Completed"],
      ["not-required", "Told it is not required"],
      ["unknown", "Not sure"],
    ],
  }),
  q("asbestosSurvey", "Has an asbestos survey been completed?", "Property", { when: work }),
  q("asbestosResult", "What were the asbestos survey results?", "Property", {
    when: (a) => work(a) && a.asbestosSurvey === "yes",
    options: [
      ["positive", "Positive"],
      ["negative", "Negative"],
      ["unclear", "Unclear"],
      ["unknown", "Not sure"],
    ],
  }),
  q(
    "removalRequired",
    "Has a professional or authority said hazardous-material removal is required?",
    "Property",
    { when: work },
  ),
  q("asbestosRemoval", "Has any required asbestos removal been completed?", "Property", {
    when: (a) =>
      work(a) &&
      (a.asbestosResult === "positive" || a.removalRequired === "yes" || unsure(a.removalRequired)),
  }),
  q(
    "professionalHazardsComplete",
    "Has a professional recorded the assessment and completion of all required removal?",
    "Property",
    {
      when: (a) => work(a) && (a.asbestosSurvey === "yes" || a.householdHazards === "complete"),
      hint: "A photo or your own impression does not establish this.",
    },
  ),
  q("debrisStatus", "What debris cleanup has already happened?", "Property", {
    when: work,
    options: [
      ["none", "None yet"],
      ["some", "Some cleanup"],
      ["complete", "Reported complete"],
      ["unknown", "Not sure"],
    ],
  }),
  text("debrisDetails", "What cleanup was done, and by whom?", "Property", {
    when: (a) => work(a) && ["some", "complete"].includes(String(a.debrisStatus)),
  }),
  q("rebuild", "Are you planning repairs or rebuilding?", "Property", {
    when: work,
    options: [
      ["repair", "Planning repairs"],
      ["rebuild", "Planning rebuilding"],
      ["undecided", "Undecided"],
      ["not-rebuilding", "Not rebuilding"],
      ["unknown", "Not sure"],
    ],
    hint: "Not rebuilding does not establish that cleanup obligations disappear.",
  }),
  q(
    "permitsRequired",
    "Have you been told permits are required for the planned work?",
    "Property",
    { when: repairs },
  ),
  q("permitStatus", "Have permits been requested or issued?", "Property", {
    when: repairs,
    options: [
      ["not-requested", "Not requested"],
      ["requested", "Requested"],
      ["issued", "Issued"],
      ["unknown", "Not sure"],
    ],
  }),
  text("permitWork", "For what work?", "Property", {
    when: (a) => repairs(a) && ["requested", "issued"].includes(String(a.permitStatus)),
  }),
  q("workStarted", "Has work started?", "Property", { when: repairs }),
  q("workFinished", "Has the planned work been recorded as finished?", "Property", {
    when: (a) => repairs(a) && a.workStarted === "yes",
    hint: "This does not establish that the home is safe for occupancy.",
  }),
  q(
    "inspectionsOutstanding",
    "Are inspections, corrections or final approvals outstanding?",
    "Property",
    { when: repairs },
  ),
  text(
    "inspectionDetails",
    "Which inspections, corrections or approvals are outstanding?",
    "Property",
    { when: (a) => repairs(a) && a.inspectionsOutstanding === "yes" },
  ),
  q("taxInterest", "Do you own or have an interest in affected assessed property?", "Tax", {
    when: (a) => a.relationship !== "owner",
    hint: "For example, another damaged property or an ownership interest separate from your housing arrangement.",
  }),
  q("taxSeeking", "Would you like to pursue or follow up on damaged-property tax relief?", "Tax", {
    when: tax,
  }),
  q(
    "assessorStarted",
    "Has the Assessor contacted you or started a damaged-property review?",
    "Tax",
    { when: tax },
  ),
  q("taxRequested", "Have you submitted a request?", "Tax", { when: tax }),
  q("taxDetermination", "Has a determination been received?", "Tax", { when: tax }),
  q("taxImplemented", "Has any approved adjustment or refund been implemented?", "Tax", {
    when: (a) => tax(a) && a.taxDetermination === "yes",
  }),
  q("taxOutstanding", "Are there outstanding information requests or an appeal?", "Tax", {
    when: tax,
  }),
  text("taxAction", "What information is requested, or what is being appealed?", "Tax", {
    when: (a) => tax(a) && a.taxOutstanding === "yes",
  }),
  text("taxDeadline", "What is the deadline, if known?", "Tax", {
    kind: "date",
    when: (a) => tax(a) && a.taxOutstanding === "yes",
  }),
];
export function visibleQuestions(answers: IntakeAnswers, stage?: number) {
  return intakeQuestions.filter(
    (q) => (stage === undefined || q.stage === stage) && (!q.when || q.when(answers)),
  );
}
export function activeAnswers(answers: IntakeAnswers): IntakeAnswers {
  return Object.fromEntries(
    visibleQuestions(answers)
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => [q.id, answers[q.id]]),
  );
}
export const applicationStatuses = [
  ["not-started", "Not started"],
  ["preparing", "Preparing"],
  ["submitted", "Submitted"],
  ["information", "More information requested"],
  ["approved", "Approved"],
  ["denied", "Denied"],
  ["appealing", "Appealing"],
  ["received", "Funds or services received"],
  ["unknown", "Not sure"],
] as const;
export const documentTypes = [
  ["damage-photo", "Damage photo"],
  ["utility-bill", "Utility bill"],
  ["id", "Driver’s license / ID"],
  ["insurance-policy", "Insurance declarations page"],
  ["inventory", "Home inventory"],
  ["claim-receipt", "Claim acknowledgment letter"],
  ["schedule-loss", "Schedule of loss"],
  ["asbestos-survey", "Asbestos survey / management report"],
  ["asbestos-clearance", "Asbestos clearance certificate / removal letter"],
  ["tax-statement", "Property-tax statement"],
  ...additionalDocumentTypes,
] as const;
