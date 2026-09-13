import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importTypeScript } from "./helpers/import-typescript.mjs";
import { publicAddress, publicUrl, supportedValue } from "../automation/security.mjs";
import { verifyCompletion } from "../automation/browser.mjs";
import { createAutomationService } from "../automation/server.mjs";

const { journeyAutomation } = await importTypeScript("data/journey-automation");
const { roadmapNodes } = await importTypeScript("lib/recovery-roadmap");
const { automationTask, mergeAutomation } = await importTypeScript("lib/journey-automation");
const { emptyIntake } = await importTypeScript("lib/intake-recovery");
const { getJourney } = await importTypeScript("lib/recovery-journey");
const { loadJourneyDemo } = await importTypeScript("lib/journey-demo");

test("all 21 roadmap nodes have explicit internal, request, or follow-up automation", () => {
  assert.deepEqual(
    new Set(Object.keys(journeyAutomation)),
    new Set(roadmapNodes.map((node) => node.id)),
  );
  assert.equal(
    Object.values(journeyAutomation).filter((plan) => plan.mode !== "document").length,
    18,
  );
  for (const id of ["review", "claim-outcome", "funds", "tax-outcome"])
    assert.equal(journeyAutomation[id].mode, "followup");
});

test("automation rejects unconfirmed households and sample scenarios", () => {
  assert.throws(() => automationTask(emptyIntake("test"), "temporary-housing"), /confirm real/);
  assert.throws(
    () => automationTask(loadJourneyDemo(emptyIntake("test"), "owner"), "temporary-housing"),
    /confirm real/,
  );
});

test("public destination validation blocks private networks and unsafe URL protocols", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.2.3",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(address), false, address);
  for (const value of [
    "http://example.com",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com:8443",
  ])
    await assert.rejects(publicUrl(value));
  await assert.rejects(publicUrl("https://example.com", async () => [{ address: "127.0.0.1" }]));
  assert.equal(
    (await publicUrl("https://example.com/form", async () => [{ address: "93.184.216.34" }]))
      .hostname,
    "example.com",
  );
});

test("form answers require confirmed facts and cannot use inherited or invented values", () => {
  const facts = { householdSize: "3", "document:1": "Tenant: Example Person" };
  assert.equal(supportedValue(facts, "householdSize", "4"), false);
  assert.equal(supportedValue(facts, "householdSize", "3"), true);
  assert.equal(supportedValue(facts, "document:1", "Example Person"), true);
  assert.equal(supportedValue(facts, "toString", "yes"), false);
});

test("a model claim of success cannot replace receiving-site evidence", () => {
  const action = {
    outcome: "submitted",
    reference: "CASE-12",
    evidence: "Your request was received. Reference CASE-12.",
  };
  assert.throws(() => verifyCompletion(action, { text: "Try again" }, true), /verifiable/);
  assert.throws(
    () => verifyCompletion(action, { text: action.evidence }, false),
    /not been confirmed/,
  );
  verifyCompletion(action, { text: action.evidence }, true);
  assert.throws(
    () =>
      verifyCompletion(
        { ...action, reference: "", evidence: "Your request was not submitted." },
        { text: "Your request was not submitted." },
        true,
      ),
    /not been confirmed/,
  );
  assert.throws(
    () => verifyCompletion({ ...action, reference: "invented" }, { text: action.evidence }, true),
    /verifiable/,
  );
});

test("automation receipts preserve concurrent edits and never achieve a recovery goal", () => {
  const record = emptyIntake("case");
  record.journey = getJourney(record);
  record.journey.tasks.claim = {
    notes: "New household note",
    automation: { id: "job", version: 2, status: "working" },
  };
  const result = {
    id: "job",
    version: 3,
    status: "submitted",
    receipt: {
      at: "2026-09-12T12:00:00Z",
      evidence: "Received",
      reference: "123",
      url: "https://example.com",
    },
  };
  const next = mergeAutomation(record, "claim", result);
  assert.equal(next.journey.tasks.claim.notes, "New household note");
  assert.equal(next.journey.tasks.claim.submittedAt, result.receipt.at);
  assert.equal(next.journey.tasks.claim.outcome, undefined);
  assert.equal(record.journey.tasks.claim.submittedAt, undefined);
  assert.equal(mergeAutomation(next, "claim", { ...result, id: "other" }), next);
  assert.equal(mergeAutomation(next, "claim", { ...result, version: 1 }), next);
});

test("runner start is idempotent, copied data is encrypted, restart cannot replay, and erase removes it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cascadia-automation-"));
  const config = {
    directory,
    token: "t".repeat(40),
    apiKey: "unused-test-key",
    model: "unused-test-model",
  };
  const service = createAutomationService(config);
  const id = crypto.randomUUID();
  const payload = {
    id,
    task: { id: "claim", title: "Claim" },
    plan: { mode: "request" },
    facts: { name: "Private Test Person" },
    documents: [],
  };
  try {
    const [a, b] = await Promise.all([
      service.dispatch(id, { action: "start", payload }),
      service.dispatch(id, { action: "start", payload }),
    ]);
    assert.deepEqual(a, b);
    const bytes = await readFile(join(directory, `${id}.enc`));
    assert.equal(bytes.includes(Buffer.from("Private Test Person")), false);
    const restarted = createAutomationService(config);
    const recovered = await restarted.dispatch(id, { action: "status" });
    assert.equal(recovered.status, "uncertain");
    const erased = await restarted.dispatch(id, { action: "erase" });
    assert.equal(erased.status, "cancelled");
    assert.equal((await restarted.dispatch(id, { action: "start", payload })).status, "cancelled");
    await restarted.close();
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
