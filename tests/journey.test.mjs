import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { loadJourneyDemo } = await importTypeScript("lib/journey-demo");
const { emptyIntake } = await importTypeScript("lib/intake-recovery");
const {
  evaluateJourney,
  getJourney,
  currentJourneyTask,
  applyJourneyCommand,
  journeyBadges,
  prepareJourneyArtifact,
} = await importTypeScript("lib/recovery-journey");
const { journeyWorkflows, outcomeDocumentTypes } = await importTypeScript("data/journey-workflows");
const { roadmapNodes } = await importTypeScript("lib/recovery-roadmap");
const { documentTypes } = await importTypeScript("data/intake-questions");
const { recoveryPacketPdf, recoveryCalendar } = await importTypeScript("lib/journey-export");
const now = new Date("2026-09-12T12:00:00Z");
let sequence = 0;
const command = (record, kind, taskId, extra = {}) =>
  applyJourneyCommand(record, { kind, taskId, operationId: `test-${++sequence}`, ...extra }, now);
const demo = (scenario = "owner") => loadJourneyDemo(emptyIntake("demo-case"), scenario, now);
function achieve(record, id) {
  record = command(record, "demo-evidence", id);
  const doc = record.documents.at(-1);
  return command(record, "outcome", id, {
    note: "Confirmed fictional outcome using the attached simulated record.",
    documentIds: [doc.id],
    confirm: true,
  });
}
function submit(record, id) {
  record = command(record, "prepare", id);
  return command(record, "submit", id, {
    confirm: true,
    artifactId: record.journey.tasks[id].artifact.id,
  });
}
test("every roadmap node has a working definition and supported outcome evidence", () => {
  assert.deepEqual(
    new Set(journeyWorkflows.map((d) => d.id)),
    new Set(roadmapNodes.map((d) => d.id)),
  );
  for (const d of journeyWorkflows) {
    assert.ok(outcomeDocumentTypes[d.id]?.length);
    for (const type of [...d.evidenceTypes, ...outcomeDocumentTypes[d.id]])
      assert.ok(
        documentTypes.some(([id]) => id === type),
        `${d.id}: ${type}`,
      );
  }
});
test("homeowner and renter demos reach every applicable end goal without dead ends", () => {
  for (const scenario of ["owner", "renter"]) {
    let record = demo(scenario);
    if (scenario === "renter")
      for (const id of ["tax-relief"])
        assert.equal(
          evaluateJourney(record, now).find((r) => r.definition.id === id).status,
          "not-applicable",
        );
    for (let iteration = 0; iteration < 40; iteration++) {
      const pending = evaluateJourney(record, now).filter(
        (r) => !["achieved", "not-applicable", "closed"].includes(r.status),
      );
      if (!pending.length) break;
      const next = pending.find((r) => r.status !== "blocked");
      assert.ok(next, `Dead end: ${pending.map((r) => r.definition.id).join(", ")}`);
      record = command(record, "start", next.definition.id);
      record = submit(record, next.definition.id);
      record = achieve(record, next.definition.id);
    }
    assert.ok(
      evaluateJourney(record, now).every((r) => ["achieved", "not-applicable"].includes(r.status)),
    );
    assert.equal(currentJourneyTask(record, evaluateJourney(record, now)), undefined);
    assert.ok(record.journey.events.some((e) => e.artifact?.receipt));
  }
});
test("submission, approval and partial payment do not establish achieved outcomes", () => {
  let record = submit(demo(), "claim");
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === "claim").status,
    "waiting",
  );
  for (const response of ["approved", "partial"]) {
    record = command(record, "response", "claim-outcome", { response, note: "Fictional response" });
    assert.equal(
      evaluateJourney(record, now).find((r) => r.definition.id === "claim-outcome").status,
      response,
    );
    assert.notEqual(journeyBadges(record)["claim-outcome"].tone, "complete");
  }
});
test("Property steps remain available regardless of answers and prerequisites", () => {
  for (const scenario of ["owner", "renter"]) {
    let record = demo(scenario);
    for (const id of ["hazards", "cleanup", "permits", "rebuilding", "safe-property"]) {
      record.journey.tasks[id] = { notes: "", notApplicable: true };
      const item = evaluateJourney(record, now).find((r) => r.definition.id === id);
      assert.equal(item.status, "ready", id);
      assert.equal(item.applicable, true, id);
      assert.deepEqual(item.blockers, [], id);
      record = command(record, "start", id);
      assert.ok(record.journey.tasks[id].startedAt, id);
    }
  }
});
test("non-Property prerequisites still block starting", () => {
  const record = demo();
  record.journey.tasks.claim = { notes: "" };
  assert.throws(() => command(record, "start", "claim-outcome"), /prerequisites/);
});
test("outcomes require appropriate reviewed evidence; rejection reopens achieved work", () => {
  let record = demo();
  record = command(record, "demo-evidence", "damage");
  const id = record.documents.at(-1).id;
  assert.throws(
    () =>
      command(record, "outcome", "identity", {
        documentIds: [id],
        confirm: true,
        note: "This is not replacement identity evidence.",
      }),
    /relevant confirmed/,
  );
  record = achieve(record, "identity");
  const evidence = record.documents.at(-1);
  evidence.recipientStatus = "rejected";
  evidence.recipient = "Demo recipient";
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === "identity").status,
    "information",
  );
  assert.throws(
    () =>
      command(record, "outcome", "identity", {
        documentIds: [evidence.id],
        confirm: true,
        note: "Trying to reuse a rejected record.",
      }),
    /Invalid document/,
  );
});
test("closed Property outcomes remain distinct while other Property steps stay available", () => {
  let record = command(demo(), "close", "permits", {
    confirm: true,
    note: "Household chose not to pursue this permit.",
    documentIds: [],
  });
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === "permits").status,
    "closed",
  );
  assert.equal(journeyBadges(record).permits.label, "Closed without goal");
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === "rebuilding").status,
    "ready",
  );
});
test("packet approval binds exact version, prevents duplicates and preserves approval history", () => {
  let record = demo();
  record = command(record, "prepare", "claim");
  const old = record.journey.tasks.claim.artifact;
  record = command(record, "edit-artifact", "claim", {
    text: "Reviewed claim packet.",
    recipient: "Example recipient",
    documentIds: [],
  });
  assert.throws(
    () => command(record, "submit", "claim", { artifactId: old.id, confirm: true }),
    /Invalid submission/,
  );
  const body = {
    kind: "submit",
    taskId: "claim",
    confirm: true,
    artifactId: record.journey.tasks.claim.artifact.id,
    operationId: "same-submit",
  };
  record = applyJourneyCommand(record, body, now);
  assert.equal(applyJourneyCommand(record, body, now), record);
  assert.throws(
    () =>
      command(record, "submit", "claim", {
        artifactId: record.journey.tasks.claim.artifact.id,
        confirm: true,
      }),
    /already has a receipt/,
  );
  record = command(record, "prepare", "claim");
  assert.equal(record.journey.tasks.claim.artifact.approvedAt, undefined);
  assert.equal(
    record.journey.events.find((e) => e.id === "same-submit").artifact.text,
    "Reviewed claim packet.",
  );
});
test("programs have independent submissions, decisions, outcomes, and map rollups", () => {
  let record = command(demo(), "application", "", { organization: "Second example program" });
  const apps = record.confirmed.applications;
  record = submit(record, `application:${apps[0].id}`);
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === `review:${apps[1].id}`).status,
    "blocked",
  );
  record = command(record, "response", `review:${apps[0].id}`, {
    response: "denied",
    note: "Demo denial; appeal available in this fictional scenario.",
  });
  assert.notEqual(
    evaluateJourney(record, now).find((r) => r.definition.id === `appeal:${apps[0].id}`).status,
    "not-applicable",
  );
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === `appeal:${apps[1].id}`).status,
    "not-applicable",
  );
  assert.notEqual(journeyBadges(record).funds.tone, "complete");
});
test("confirmed dates change priority while unknown deadlines are not invented", () => {
  let record = demo();
  const before = evaluateJourney(record, now).find((r) => r.definition.id === "tax-relief");
  record = command(record, "notes", "tax-relief", {
    notes: "Call assessor about recorded deadline",
    dueDate: "2026-09-13",
  });
  const after = evaluateJourney(record, now).find((r) => r.definition.id === "tax-relief");
  assert.ok(after.score > before.score);
  assert.equal(after.overdue, false);
  record = command(record, "demo-time", "", { days: 7 });
  assert.equal(
    evaluateJourney(record, now).find((r) => r.definition.id === "tax-relief").overdue,
    true,
  );
  assert.equal(record.journey.tasks.damage.dueDate, undefined);
});
test("legacy submissions migrate without claiming final outcomes or modifying source facts", () => {
  const record = emptyIntake("old");
  record.confirmed = {
    answers: {
      insurance: "yes",
      claimSubmitted: "yes",
      taxRequested: "yes",
      relationship: "owner",
    },
    applications: [],
    stage: 3,
  };
  record.caseRecord.progress = [
    { nodeId: "insurance-claim", started: true, milestoneReached: true },
  ];
  const original = structuredClone(record);
  const journey = getJourney(record);
  assert.ok(journey.tasks.claim.submittedAt);
  assert.equal(journey.tasks["claim-outcome"].outcome, undefined);
  assert.deepEqual(record, original);
});
test("manual preparation works without AI and excludes unconfirmed document suggestions", () => {
  const record = demo();
  record.draft.answers.affectedStreet = "Unconfirmed draft address";
  record.documents.push({
    id: "pending",
    type: "inventory",
    testData: true,
    confirmedAt: null,
    uploadedAt: now.toISOString(),
    fields: { name: "", address: "", date: "", dateMeaning: "unknown", scope: "affected-property" },
    recipientStatus: "unknown",
    recipient: "",
    conflictAcknowledgment: "",
  });
  const packet = prepareJourneyArtifact(record, "damage", undefined, now);
  assert.ok(packet.text.includes("100 Example Lane"));
  assert.ok(!packet.text.includes("Unconfirmed draft address"));
  assert.deepEqual(packet.documentIds, []);
});
test("PDF packet paginates long Unicode content and calendar escapes untrusted text", async () => {
  const record = demo();
  const packet = prepareJourneyArtifact(record, "damage", undefined, now);
  packet.text =
    "Prepared packet for José \u2014 household review.\n" +
    "Evidence reference and detailed observations. ".repeat(500);
  const font = readFileSync(new URL("../public/fonts/NotoSans-Regular.ttf", import.meta.url));
  const bytes = await recoveryPacketPdf(packet, [], font);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
  mkdirSync(new URL("../outputs/qa/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../outputs/qa/recovery-packet.pdf", import.meta.url), bytes);
  const calendar = recoveryCalendar(
    "test",
    "Title\nBEGIN:VEVENT",
    "2026-09-20",
    "Notes, semicolon; more",
  );
  assert.ok(calendar.includes("Title\\nBEGIN:VEVENT"));
  assert.ok(calendar.includes("Notes\\, semicolon\\; more"));
  assert.equal(calendar.split("\r\nBEGIN:VEVENT").length, 2);
});

test("simulation cannot run without explicit enablement and invalid commands leave inputs unchanged", () => {
  const record = emptyIntake("real");
  const original = structuredClone(record);
  assert.throws(() => command(record, "demo-evidence", "damage"), /enable demo/);
  assert.throws(() => command(record, "demo-time", "", { days: 7 }), /Invalid/);
  assert.deepEqual(record, original);
  assert.throws(
    () => command(demo(), "notes", "damage", { notes: "date validation", dueDate: "2026-99-99" }),
    /Invalid deadline/,
  );
});
test("reviewed source notes carry their document reference into a prepared packet", () => {
  let record = command(demo(), "demo-evidence", "damage");
  record.documents.at(-1).reviewedText = "User-reviewed observation: broken west window.";
  const packet = prepareJourneyArtifact(record, "damage", undefined, now);
  assert.ok(packet.text.includes("User-reviewed observation"));
  assert.ok(packet.text.includes(record.documents.at(-1).id));
});

test("editable ratings persist per task, validate every factor, and reset to automation", () => {
  let record = demo();
  const initial = evaluateJourney(record, now).find((t) => t.definition.id === "damage");
  const ratings = Object.fromEntries(
    Object.keys(initial.factors).map((key) => [key, key === "uncertainty_penalty" ? 0 : 10]),
  );
  record = command(record, "ratings", "damage", { ratings });
  const edited = evaluateJourney(record, now).find((t) => t.definition.id === "damage");
  assert.deepEqual(edited.factors, ratings);
  assert.ok(edited.score > initial.score);
  assert.equal(record.journey.tasks.identity?.ratings, undefined);
  for (const bad of [
    {},
    { ...ratings, safety_score: -1 },
    { ...ratings, safety_score: 11 },
    { ...ratings, financial_impact: "5" },
  ]) {
    assert.throws(() => command(record, "ratings", "damage", { ratings: bad }));
  }
  record = command(record, "answers", undefined, { answers: { safeTonight: "no" }, confirm: true });
  record = command(record, "ratings", "temporary-housing", {
    ratings: { ...ratings, safety_score: 0 },
  });
  assert.equal(
    evaluateJourney(record, now).find((t) => t.definition.id === "temporary-housing").factors
      .safety_score,
    10,
  );
  record = command(record, "ratings", "damage", { ratings: null });
  assert.deepEqual(
    evaluateJourney(record, now).find((t) => t.definition.id === "damage").factors,
    initial.factors,
  );
});
