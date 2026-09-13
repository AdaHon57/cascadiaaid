import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";

const { ongoingApplications } = await importTypeScript("lib/ongoing-applications");

function record(tasks = {}) {
  return {
    confirmed: {
      applications: [{ id: "housing", organization: "Test application", status: "preparing" }],
    },
    journey: { tasks },
  };
}
const draft = (extra = {}) => ({
  artifact: {
    recipient: "Housing support team",
    text: "Please help with temporary housing.",
    simulated: false,
    ...extra,
  },
});

test("intake applications alone never populate the tab", () => {
  assert.deepEqual(ongoingApplications({ confirmed: null }), []);
  assert.deepEqual(ongoingApplications(record()), []);
  assert.deepEqual(ongoingApplications({ confirmed: record().confirmed }), []);
});

test("Dashboard drafts appear even without an intake application", () => {
  const household = record({ "temporary-housing": draft(), "application:housing": draft() });
  const entries = ongoingApplications(household);
  assert.equal(entries.length, 2);
  const housing = entries.find((entry) => entry.id === "temporary-housing");
  assert.equal(housing.organization, "Housing support team");
  assert.equal(housing.text, "Please help with temporary housing.");
  assert.equal(housing.taskId, "temporary-housing");
  assert.equal(housing.statusLabel, "Email draft");
});

test("simulated, empty, completed, and inapplicable drafts are excluded", () => {
  for (const task of [
    draft({ simulated: true }),
    draft({ text: "   " }),
    { ...draft(), outcome: { kind: "achieved" } },
    { ...draft(), outcome: { kind: "closed" } },
    { ...draft(), notApplicable: true },
  ]) {
    assert.deepEqual(ongoingApplications(record({ "temporary-housing": task })), []);
  }
});

test("saved edits are reflected and submitted drafts retain their status", () => {
  const household = record({ "temporary-housing": { ...draft(), submittedAt: "2026-09-12" } });
  household.journey.tasks["temporary-housing"].artifact.text = "Updated email.";
  const [entry] = ongoingApplications(household);
  assert.equal(entry.text, "Updated email.");
  assert.equal(entry.statusLabel, "Submitted · follow-up ongoing");
});

test("retired draft preambles are removed consistently with Dashboard", () => {
  const [entry] = ongoingApplications(
    record({
      "temporary-housing": draft({
        text: "AI draft \u2014 review before use. Not submitted.\n\nHello.",
      }),
    }),
  );
  assert.equal(entry.text, "Hello.");
});
