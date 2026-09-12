import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";

const { ongoingApplications } = await importTypeScript("lib/ongoing-applications");

function record(status, tasks = {}) {
  return {
    confirmed: { applications: [{ id: "housing", organization: "Housing", status }] },
    journey: { tasks },
  };
}

test("empty and unconfirmed households have no ongoing applications", () => {
  assert.deepEqual(ongoingApplications({ confirmed: null }), []);
  assert.deepEqual(ongoingApplications({ confirmed: { applications: [] } }), []);
});

test("only ongoing intake statuses appear", () => {
  for (const status of ["", "skipped", "unknown", "not-started", "denied", "received"]) {
    assert.deepEqual(ongoingApplications(record(status)), [], status);
  }
  for (const status of ["preparing", "submitted", "information", "approved", "appealing"]) {
    assert.equal(ongoingApplications(record(status)).length, 1, status);
  }
});

test("journey submissions and responses update an application", () => {
  const submitted = { "application:housing": { submittedAt: "2026-09-12" } };
  assert.equal(ongoingApplications(record("preparing", submitted))[0].statusLabel, "Submitted");
  assert.equal(ongoingApplications(record("approved", submitted))[0].statusLabel, "Approved");
  assert.deepEqual(ongoingApplications(record("denied", submitted)), []);
  submitted["review:housing"] = { response: "information" };
  assert.equal(
    ongoingApplications(record("preparing", submitted))[0].statusLabel,
    "More information requested",
  );
});

test("final outcomes disappear while submission milestones remain ongoing", () => {
  for (const kind of ["achieved", "closed"]) {
    assert.deepEqual(
      ongoingApplications(record("approved", { "funds:housing": { outcome: { kind } } })),
      [],
    );
  }
  assert.equal(
    ongoingApplications(
      record("submitted", {
        "application:housing": { outcome: { kind: "achieved" }, submittedAt: "2026-09-12" },
      }),
    ).length,
    1,
  );
});

test("an active appeal brings a denied application back into the list", () => {
  const applications = ongoingApplications(
    record("denied", {
      "review:housing": { response: "denied" },
      "appeal:housing": { startedAt: "2026-09-12" },
    }),
  );
  assert.equal(applications[0].statusLabel, "Appealing");
  assert.equal(applications[0].taskId, "appeal:housing");
});
