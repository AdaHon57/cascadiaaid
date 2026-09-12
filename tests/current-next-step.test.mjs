import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { currentNextStep } = await importTypeScript("lib/current-next-step");
const { emptyIntake, intakeToRecovery } = await importTypeScript("lib/intake-recovery");
const { personalizeMap } = await importTypeScript("lib/intake-map");

test("an unfinished intake has one next action", () => {
  assert.equal(currentNextStep(emptyIntake("test")).href, "/intake");
});
test("housing tonight takes priority even before intake is confirmed", () => {
  for (const safeTonight of ["no", "unknown"]) {
    const record = emptyIntake("test");
    record.draft.answers.safeTonight = safeTonight;
    assert.equal(currentNextStep(record).href, "tel:211");
  }
});
test("confirmed households get a ready task ahead of blocked or waiting tasks", () => {
  const record = emptyIntake("test");
  record.confirmed = {
    answers: {
      safeTonight: "yes",
      accommodationHelp: "no",
      affected: ["home"],
      condition: "damaged",
      insurance: "yes",
      claimSubmitted: "no",
      assistanceInterest: "yes",
    },
    applications: [],
    stage: 3,
  };
  record.caseRecord = intakeToRecovery(record.confirmed, record.caseRecord, []);
  const step = currentNextStep(record);
  assert.ok(step.href.startsWith("/roadmap#"));
  assert.equal(personalizeMap(record)[step.href.split("#")[1]].tone, "ready");
});

const { dashboardPriorityFactors } = await importTypeScript("data/dashboard-priorities");
const { recoveryNodes } = await importTypeScript("data/recovery-nodes");
const { rankRecoveryNodes } = await importTypeScript("lib/priority-engine");

function confirmedRecord() {
  const record = emptyIntake("ranking-test");
  record.confirmed = {
    answers: {
      safeTonight: "yes",
      accommodationHelp: "no",
      affected: ["home"],
      condition: "damaged",
      recordsLost: "yes",
      lostTypes: ["id"],
      replacementRequested: "no",
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
const zeroFactors = Object.fromEntries(
  Object.keys(dashboardPriorityFactors["damage-documentation"]).map((key) => [key, 0]),
);
function ratingsFor(winner) {
  return Object.fromEntries(
    recoveryNodes.map(({ id }) => [
      id,
      { ...zeroFactors, quick_win_score: id === winner ? 10 : 0 },
    ]),
  );
}

test("every engine task has valid explicit starter ratings", () => {
  assert.equal(
    rankRecoveryNodes(
      recoveryNodes.map(({ id }) => ({
        nodeId: id,
        factors: dashboardPriorityFactors[id],
      })),
    ).length,
    recoveryNodes.length,
  );
});
test("changing priority inputs changes the single next step, regardless of map order", () => {
  const record = confirmedRecord();
  assert.equal(personalizeMap(record).identity.tone, "ready");
  assert.equal(
    currentNextStep(record, ratingsFor("identity-replacement")).href,
    "/roadmap#identity",
  );
  assert.equal(currentNextStep(record, ratingsFor("damage-documentation")).href, "/roadmap#damage");
});
test("a completed high-priority task yields to the next available task", () => {
  const record = confirmedRecord();
  record.caseRecord.progress.push({
    nodeId: "identity-replacement",
    started: true,
    milestoneReached: true,
  });
  record.caseRecord.evidence.push({
    id: "replacement",
    caseId: record.id,
    nodeIds: ["identity-replacement"],
    kind: "REPLACEMENT_ID",
    origin: "MANUAL_RECORD",
    review: { status: "ACCEPTED", reviewedBy: "household" },
    sourceIds: [],
  });
  assert.equal(personalizeMap(record).identity.tone, "complete");
  assert.notEqual(
    currentNextStep(record, ratingsFor("identity-replacement")).href,
    "/roadmap#identity",
  );
});
test("waiting and inapplicable tasks cannot displace an available task", () => {
  const record = confirmedRecord();
  record.confirmed.answers.replacementRequested = "yes";
  record.caseRecord = intakeToRecovery(record.confirmed, record.caseRecord, []);
  for (const winner of ["identity-replacement", "temporary-housing"]) {
    const step = currentNextStep(record, ratingsFor(winner));
    assert.equal(personalizeMap(record)[step.href.split("#")[1]].tone, "ready");
  }
});
test("missing ratings fail explicitly instead of silently reverting to roadmap order", () => {
  assert.throws(() => currentNextStep(confirmedRecord(), {}), /Missing Dashboard priority ratings/);
});
