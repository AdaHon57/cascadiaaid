import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { dashboardSteps, activeDashboardStep, updateDashboardStep } =
  await importTypeScript("lib/dashboard-steps");
const { emptyIntake, intakeToRecovery, evaluateIntake } =
  await importTypeScript("lib/intake-recovery");
const { dashboardPriorityFactors } = await importTypeScript("data/dashboard-priorities");
const { rankRecoveryNodes } = await importTypeScript("lib/priority-engine");
const { mapEngineIds } = await importTypeScript("lib/intake-map");
function household() {
  const record = emptyIntake("steps-test");
  record.confirmed = {
    answers: {
      safeTonight: "yes",
      accommodationHelp: "no",
      affected: ["home"],
      condition: "damaged",
      recordsLost: "yes",
      lostTypes: ["id"],
      replacementRequested: "no",
      occupancyNeeded: "yes",
      insurance: "yes",
      claimSubmitted: "no",
      assistanceInterest: "yes",
    },
    applications: [],
    stage: 3,
  };
  record.caseRecord = intakeToRecovery(record.confirmed, record.caseRecord, []);
  return record;
}
test("dashboard preserves engine priority across both ready and prerequisite-blocked tasks", () => {
  const record = household();
  const steps = dashboardSteps(record);
  const ranked = rankRecoveryNodes(
    steps.map((step) => ({
      nodeId: mapEngineIds[step.id],
      factors: dashboardPriorityFactors[mapEngineIds[step.id]],
    })),
  );
  assert.deepEqual(
    steps.map((step) => mapEngineIds[step.id]),
    ranked.map((step) => step.nodeId),
  );
  const occupancy = steps.find((step) => step.id === "occupancy");
  assert.ok(occupancy.blocked);
  assert.ok(occupancy.prerequisites.some((step) => step.id === "identity" && step.reasons.length));
  assert.equal(activeDashboardStep(record).blocked, false);
});
test("skip advances current work, moves it below unskipped steps, and never changes recovery facts", () => {
  const record = household();
  const original = structuredClone(record);
  const current = activeDashboardStep(record);
  const next = updateDashboardStep(record, "skip", current.id);
  assert.notEqual(activeDashboardStep(next)?.id, current.id);
  assert.equal(dashboardSteps(next).at(-1).id, current.id);
  assert.deepEqual(evaluateIntake(next), evaluateIntake(record));
  assert.deepEqual(record, original);
  assert.ok(dashboardSteps(next).find((step) => step.id === "occupancy").blocked);
  const restored = updateDashboardStep(next, "restore", current.id);
  assert.deepEqual(
    dashboardSteps(restored).map((step) => step.id),
    dashboardSteps(record).map((step) => step.id),
  );
});
test("explicit work selection persists and rejects unmet prerequisites", () => {
  const record = household();
  const choices = dashboardSteps(record).filter((step) => !step.blocked);
  const selected = choices.at(-1);
  const next = updateDashboardStep(record, "start", selected.id);
  assert.equal(activeDashboardStep(JSON.parse(JSON.stringify(next))).id, selected.id);
  assert.throws(() => updateDashboardStep(record, "start", "occupancy"), /prerequisites/);
  assert.throws(() => updateDashboardStep(record, "start", "made-up"), /Invalid/);
});
test("skip all leaves no current glow and restoring a task brings it back", () => {
  let record = household();
  for (const step of dashboardSteps(record)) record = updateDashboardStep(record, "skip", step.id);
  assert.equal(activeDashboardStep(record), undefined);
  assert.ok(dashboardSteps(record).every((step) => step.skipped));
  record = updateDashboardStep(record, "restore", "damage");
  assert.equal(activeDashboardStep(record).id, "damage");
});
test("unconfirmed households can skip and restore intake; urgent housing remains a separate step", () => {
  let record = emptyIntake("new");
  assert.equal(activeDashboardStep(record).id, "intake");
  record.draft.answers.safeTonight = "no";
  assert.equal(activeDashboardStep(record).id, "temporary-housing");
  record = updateDashboardStep(record, "skip", "temporary-housing");
  assert.equal(activeDashboardStep(record).id, "intake");
  assert.equal(record.draft.answers.safeTonight, "no");
});
