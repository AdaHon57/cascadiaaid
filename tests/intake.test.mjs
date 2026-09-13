import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { visibleQuestions, activeAnswers, documentTypes } =
  await importTypeScript("data/intake-questions");
const { emptyIntake, intakeToRecovery, documentConflicts, evaluateIntake } =
  await importTypeScript("lib/intake-recovery");
const { personalizeMap } = await importTypeScript("lib/intake-map");
const { validateDraft } = await importTypeScript("lib/intake-validation");
const { handleIntakeRequest } = await importTypeScript("lib/intake-api");
const draft = (answers = {}, applications = []) => ({ answers, applications, stage: 0 });
const app = (status, extra = {}) => ({
  id: "app-1",
  organization: "Example assistance",
  status,
  outstanding: "unknown",
  action: "",
  deadline: "",
  ...extra,
});
const doc = (extra = {}) => ({
  id: "doc-1",
  type: "utility-bill",
  uploadedAt: "2026-09-12",
  confirmedAt: null,
  fields: { name: "", address: "", date: "", dateMeaning: "unknown", scope: "affected-property" },
  recipientStatus: "unknown",
  recipient: "",
  conflictAcknowledgment: "",
  ...extra,
});
const ids = (a) => visibleQuestions(a).map((q) => q.id);
const caseFrom = (d, docs = [], base = emptyIntake("case-a").caseRecord) =>
  intakeToRecovery(d, base, docs);

test("housing questions respond immediately to unsafe/uncertain tonight and displacement", () => {
  for (const answers of [
    { safeTonight: "no" },
    { safeTonight: "unknown" },
    { condition: "unlivable" },
    { affected: ["evacuated"] },
    { accommodationHelp: "yes" },
  ])
    assert.ok(ids(answers).includes("currentLocation"));
  assert.ok(
    !ids({ safeTonight: "yes", condition: "undamaged", accommodationHelp: "no" }).includes(
      "currentLocation",
    ),
  );
});
test("follow-ups are conditional and hidden answers are excluded without deletion", () => {
  const a = {
    insurance: "no",
    claimSubmitted: "yes",
    claimStatus: "review",
    recordsLost: "no",
    replacementRequested: "yes",
  };
  assert.ok(!ids(a).includes("claimStatus"));
  assert.ok(!ids(a).includes("replacementRequested"));
  assert.equal(activeAnswers(a).claimSubmitted, undefined);
  assert.equal(a.claimSubmitted, "yes");
});
test("renters with property work get repair questions; not rebuilding retains cleanup", () => {
  const a = { relationship: "renter", affected: ["home"], rebuild: "not-rebuilding" };
  assert.ok(ids(a).includes("repairRole"));
  assert.ok(ids(a).includes("asbestosSurvey"));
  assert.ok(!ids(a).includes("permitStatus"));
  assert.ok(ids({ relationship: "renter", taxInterest: "yes" }).includes("taxDetermination"));
});
test("unanswered, skipped, unknown and no remain distinct; all-unknown case is never not applicable", () => {
  const d = draft({ insurance: "unknown", recordsLost: "skipped", accommodationHelp: "no" });
  validateDraft(d);
  assert.equal(d.answers.insurance, "unknown");
  assert.equal(d.answers.recordsLost, "skipped");
  assert.equal(d.answers.safeTonight, undefined);
  const c = caseFrom(d);
  assert.equal(c.answers.hasRelevantInsurance, null);
  assert.equal(c.answers.identityDocumentsLostOrDamaged, null);
  const r = emptyIntake("case-a");
  r.caseRecord = caseFrom(draft());
  assert.ok(evaluateIntake(r).states.every((s) => s.status !== "NOT_APPLICABLE"));
});
test("no known damage is not inferred from unanswered damage questions", () => {
  assert.equal(caseFrom(draft({ condition: "undamaged" })).answers.hasDisasterDamage, null);
  assert.equal(
    caseFrom(draft({ affected: ["evacuated"], condition: "undamaged" })).answers.hasDisasterDamage,
    false,
  );
  assert.equal(
    caseFrom(draft({ affected: ["evacuated", "unknown"], condition: "undamaged" })).answers
      .hasDisasterDamage,
    null,
  );
});
test("no insurance decision is needed to record assistance or progress", () => {
  const c = caseFrom(draft({ insurance: "unknown", assistanceApplied: "yes" }, [app("submitted")]));
  assert.equal(c.answers.seekingPublicAssistance, true);
  assert.ok(c.progress.find((p) => p.nodeId === "public-disaster-assistance").started);
  const r = { ...emptyIntake("case-a"), caseRecord: c };
  assert.ok(
    !evaluateIntake(r)
      .states.find((s) => s.nodeId === "public-disaster-assistance")
      .blockingNodeIds.includes("insurance-claim"),
  );
});
test("denied, appealing and unknown applications never become complete", () => {
  for (const status of ["denied", "appealing", "unknown"]) {
    const base = emptyIntake("case-a").caseRecord;
    base.progress = [
      { nodeId: "public-disaster-assistance", started: true, milestoneReached: true },
    ];
    const c = caseFrom(draft({ assistanceApplied: "yes" }, [app(status)]), [], base);
    assert.equal(
      c.progress.find((p) => p.nodeId === "public-disaster-assistance").milestoneReached,
      false,
    );
  }
});
test("changing answers preserves existing progress and non-intake evidence", () => {
  const base = emptyIntake("case-a").caseRecord;
  base.progress = [{ nodeId: "identity-replacement", started: true, milestoneReached: true }];
  base.evidence = [
    {
      id: "outside",
      caseId: "case-a",
      kind: "REPLACEMENT_ID",
      nodeIds: ["identity-replacement"],
      origin: "MANUAL_RECORD",
      review: { status: "ACCEPTED", reviewedBy: "household" },
      sourceIds: [],
    },
  ];
  const c = caseFrom(draft({ recordsLost: "unknown" }), [], base);
  assert.deepEqual(c.progress, base.progress);
  assert.deepEqual(c.evidence, base.evidence);
  assert.equal(c.answers.identityDocumentsLostOrDamaged, null);
});
test("upload, user confirmation, and recipient acceptance are independent", () => {
  let c = caseFrom(draft({ occupancyNeeded: "yes" }), [doc()]);
  assert.equal(c.evidence[0].review.status, "PENDING");
  const reviewed = doc({ confirmedAt: "2026-09-12" });
  c = caseFrom(draft({ occupancyNeeded: "yes" }), [reviewed]);
  assert.equal(c.evidence[0].review.status, "ACCEPTED");
  assert.equal(reviewed.recipientStatus, "unknown");
  const r = { ...emptyIntake("case-a"), caseRecord: c };
  assert.notEqual(
    evaluateIntake(r).states.find((s) => s.nodeId === "proof-of-occupancy").status,
    "COMPLETE",
  );
  c = caseFrom(draft({ occupancyNeeded: "yes" }), [
    doc({ recipientStatus: "accepted", recipient: "Example agency" }),
  ]);
  assert.equal(c.evidence[0].review.status, "PENDING");
});
test("original ten document categories still attach without changing milestones; ID upload is not a replacement", () => {
  assert.ok(documentTypes.length >= 10);
  const docs = documentTypes
    .slice(0, 10)
    .map(([type], i) => doc({ id: `doc-${i}`, type, confirmedAt: "2026-09-12" }));
  const c = caseFrom(draft(), docs);
  assert.equal(c.evidence.length, 10);
  assert.deepEqual(c.progress, []);
  assert.equal(c.evidence.find((e) => e.id === "intake-document:doc-2").kind, "IDENTITY_RECORD");
});
test("conflicts compare names, relevant addresses, wildfire dates and scope", () => {
  const d = doc({
    fields: {
      name: "Sam Example",
      address: "200 Pine St",
      date: "2026-08-02",
      dateMeaning: "wildfire",
      scope: "affected-property",
    },
  });
  const others = [
    doc({
      id: "other",
      confirmedAt: "2026-09-12",
      fields: {
        name: "Alex Example",
        address: "100 Oak St",
        date: "2026-08-01",
        dateMeaning: "wildfire",
        scope: "affected-property",
      },
    }),
  ];
  const conflicts = documentConflicts(
    d,
    { affectedStreet: "100 Oak St", dateKnowledge: "exact", affectedDate: "2026-08-01" },
    others,
  );
  assert.ok(conflicts.some((c) => c.includes("address")));
  assert.ok(conflicts.some((c) => c.includes("Names")));
  assert.ok(conflicts.some((c) => c.includes("date")));
  const issued = { ...d, fields: { ...d.fields, dateMeaning: "issued", date: "2025-01-01" } };
  assert.ok(
    !documentConflicts(issued, { affectedDate: "2026-08-01", dateKnowledge: "exact" }, []).some(
      (c) => c.includes("date"),
    ),
  );
  assert.equal(
    caseFrom(draft(), [
      doc({
        confirmedAt: "2026-09-12",
        fields: { ...d.fields, scope: "other" },
        conflictAcknowledgment: "Another property",
      }),
    ]).evidence[0].review.status,
    "PENDING",
  );
});
test("map waiting states and known requests retain exact deadlines", () => {
  const r = emptyIntake("case-a");
  r.confirmed = draft(
    {
      insurance: "yes",
      claimSubmitted: "yes",
      claimStatus: "review",
      claimOutstanding: "yes",
      claimAction: "Send the repair estimate",
      claimDeadline: "2026-10-01",
    },
    [app("denied", { action: "Request reconsideration", deadline: "2026-10-02" })],
  );
  r.caseRecord = caseFrom(r.confirmed);
  const b = personalizeMap(r);
  assert.equal(b.claim.label, "Action requested");
  assert.match(b.claim.detail[0], /Send the repair estimate.*2026-10-01/);
  assert.equal(b.assistance.label, "Follow-up needed");
});
test("draft validation rejects fabricated answers, duplicate application IDs, and ID-number fields", () => {
  assert.throws(() => validateDraft(draft({ insurance: "maybe" })));
  assert.throws(() => validateDraft(draft({ ssn: "not-allowed" })));
  assert.throws(() => validateDraft(draft({}, [app("submitted"), app("denied")])));
});

function environment() {
  const rows = new Map();
  const images = new Map();
  return {
    DB: {
      prepare(sql) {
        let values = [];
        return {
          bind(...v) {
            values = v;
            return this;
          },
          async first() {
            return rows.get(values[0]) ?? null;
          },
          async run() {
            if (sql.startsWith("CREATE")) return { meta: { changes: 0 } };
            if (sql.startsWith("INSERT")) {
              if (!rows.has(values[0])) rows.set(values[0], { payload: values[2], revision: 0 });
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith("DELETE")) {
              return { meta: { changes: Number(rows.delete(values[0])) } };
            }
            if (sql.startsWith("UPDATE")) {
              const row = rows.get(values[2]);
              if (!row || row.revision !== values[3]) return { meta: { changes: 0 } };
              rows.set(values[2], { payload: values[0], revision: row.revision + 1 });
              return { meta: { changes: 1 } };
            }
            throw new Error(sql);
          },
        };
      },
    },
    DOCUMENTS: {
      async put(key, bytes) {
        images.set(key, bytes);
      },
      async get(key) {
        return images.has(key) ? { body: new Blob([images.get(key)]).stream() } : null;
      },
      async delete(key) {
        images.delete(key);
      },
    },
  };
}

test("automation jobs are household scoped, reserved once, and preserve edits made during a submission", async () => {
  const env = environment();
  env.AUTOMATION_SERVICE_URL = "https://automation.example.test";
  env.AUTOMATION_SERVICE_TOKEN = "x".repeat(40);
  const initial = await session(env);
  let record = await (
    await handleIntakeRequest(
      request("/api/intake", "PUT", initial.cookie, {
        revision: initial.record.revision,
        confirm: true,
        draft: draft({ accommodationHelp: "yes", safeTonight: "no", housingConfirmed: "no" }),
      }),
      env,
    )
  ).json();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let jobId;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://automation.example.test/jobs/"));
    calls++;
    const body = JSON.parse(options.body);
    jobId ||= body.payload.id;
    if (body.action === "advance") {
      const latest = await (
        await handleIntakeRequest(request("/api/intake", "GET", initial.cookie), env)
      ).json();
      const edited = await handleIntakeRequest(
        request("/api/intake/journey", "PUT", initial.cookie, {
          kind: "notes",
          taskId: "temporary-housing",
          notes: "Changed while AI was working",
          operationId: "concurrent-note",
          revision: latest.revision,
        }),
        env,
      );
      assert.equal(edited.status, 200);
    }
    return Response.json({
      id: jobId,
      version: body.action === "start" ? 1 : 2,
      status: body.action === "start" ? "awaiting_authorization" : "submitted",
      message: "Confirmed result",
      startedAt: "2026-09-12T12:00:00Z",
      updatedAt: "2026-09-12T12:01:00Z",
      ...(body.action !== "start"
        ? {
            receipt: {
              reference: "HOUSING-1",
              evidence: "Your housing request was received.",
              url: "https://housing.example.test/receipt",
              at: "2026-09-12T12:01:00Z",
            },
          }
        : {}),
    });
  };
  try {
    const start = () =>
      handleIntakeRequest(
        request("/api/intake/automation", "PUT", initial.cookie, {
          action: "start",
          taskId: "temporary-housing",
          confirm: true,
        }),
        env,
      );
    const started = await start();
    assert.equal(started.status, 200);
    record = await started.json();
    assert.equal(record.journey.tasks["temporary-housing"].automation.id, jobId);
    await start();
    assert.equal(calls, 1);
    const other = await session(env);
    const foreign = await handleIntakeRequest(
      request("/api/intake/automation", "PUT", other.cookie, {
        action: "advance",
        taskId: "temporary-housing",
        id: jobId,
      }),
      env,
    );
    assert.equal(foreign.status, 400);
    assert.equal(calls, 1);
    const advanced = await handleIntakeRequest(
      request("/api/intake/automation", "PUT", initial.cookie, {
        action: "advance",
        taskId: "temporary-housing",
      }),
      env,
    );
    assert.equal(advanced.status, 200);
    record = await advanced.json();
    const task = record.journey.tasks["temporary-housing"];
    assert.equal(task.notes, "Changed while AI was working");
    assert.equal(task.submittedAt, "2026-09-12T12:01:00Z");
    assert.equal(task.outcome, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
const request = (path, method = "GET", cookie, body) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== "GET"
        ? { Origin: "http://localhost", "Content-Type": "application/json" }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function session(env) {
  const res = await handleIntakeRequest(request("/api/intake"), env);
  return { cookie: res.headers.get("Set-Cookie").split(";")[0], record: await res.json() };
}
test("API saves drafts, confirms separately, reloads and rejects stale saves", async () => {
  const env = environment(),
    s = await session(env);
  const d = draft({ safeTonight: "unknown" });
  let res = await handleIntakeRequest(
    request("/api/intake", "PUT", s.cookie, { revision: 0, draft: d }),
    env,
  );
  assert.equal(res.status, 200);
  let saved = await res.json();
  assert.equal(saved.confirmed, null);
  assert.deepEqual(saved.caseRecord.answers, {});
  res = await handleIntakeRequest(
    request("/api/intake", "PUT", s.cookie, { revision: 0, draft: d }),
    env,
  );
  assert.equal(res.status, 409);
  res = await handleIntakeRequest(
    request("/api/intake", "PUT", s.cookie, { revision: 1, draft: d, confirm: true }),
    env,
  );
  saved = await res.json();
  assert.equal(saved.caseRecord.answers.needsTemporaryHousing, true);
  const reload = await (
    await handleIntakeRequest(request("/api/intake", "GET", s.cookie), env)
  ).json();
  assert.equal(reload.revision, 2);
  assert.deepEqual(reload.confirmed, d);
});
test("API isolates households and documents and rejects cross-origin writes", async () => {
  const env = environment(),
    one = await session(env),
    two = await session(env);
  assert.notEqual(one.record.id, two.record.id);
  const upload = new Request("http://localhost/api/intake/documents?type=id", {
    method: "POST",
    headers: { Cookie: one.cookie, Origin: "http://localhost", "Content-Type": "image/jpeg" },
    body: new Uint8Array([255, 216, 255, 1]),
  });
  const uploaded = await (await handleIntakeRequest(upload, env)).json();
  assert.equal(uploaded.documents.length, 1);
  const id = uploaded.documents[0].id;
  assert.equal(
    (await handleIntakeRequest(request(`/api/intake/documents/${id}`, "GET", two.cookie), env))
      .status,
    404,
  );
  assert.equal(
    (await handleIntakeRequest(request(`/api/intake/documents/${id}`, "GET", one.cookie), env))
      .status,
    200,
  );
  const cross = new Request("http://localhost/api/intake", {
    method: "PUT",
    headers: { Origin: "https://other.example", Cookie: one.cookie },
    body: "{}",
  });
  assert.equal((await handleIntakeRequest(cross, env)).status, 403);
});
test("correction to one milestone updates it without resetting other progress", () => {
  const base = emptyIntake("case-a").caseRecord;
  base.progress = [
    { nodeId: "identity-replacement", started: true, milestoneReached: true },
    { nodeId: "temporary-housing", started: true, milestoneReached: true },
  ];
  const c = caseFrom(
    draft({
      recordsLost: "yes",
      lostTypes: ["id"],
      replacementRequested: "yes",
      replacementArrived: "no",
    }),
    [],
    base,
  );
  assert.equal(c.progress.find((p) => p.nodeId === "identity-replacement").milestoneReached, false);
  assert.equal(c.progress.find((p) => p.nodeId === "temporary-housing").milestoneReached, true);
});
test("hidden insurance progress stays saved but does not appear as a current waiting task", () => {
  const r = emptyIntake("case-a");
  r.confirmed = draft({ insurance: "no", claimSubmitted: "yes", claimStatus: "review" });
  r.caseRecord = caseFrom(r.confirmed);
  assert.equal(personalizeMap(r).claim.label, "Not applicable (draft)");
  assert.equal(r.confirmed.answers.claimSubmitted, "yes");
});
test("a household-scoped utility bill cannot prove the affected address", () => {
  const c = caseFrom(draft({ occupancyNeeded: "yes" }), [
    doc({
      confirmedAt: "2026-09-12",
      fields: {
        name: "",
        address: "Current location",
        date: "",
        dateMeaning: "unknown",
        scope: "household",
      },
      conflictAcknowledgment: "For current accommodation",
    }),
  ]);
  assert.equal(c.evidence[0].review.status, "PENDING");
});
test("recipient rejection is a known follow-up without conflating user review", () => {
  const r = emptyIntake("case-a");
  r.confirmed = draft({ occupancyNeeded: "yes" });
  r.documents = [
    doc({ confirmedAt: "2026-09-12", recipientStatus: "rejected", recipient: "Example reviewer" }),
  ];
  r.caseRecord = caseFrom(r.confirmed, r.documents);
  assert.equal(r.caseRecord.evidence[0].review.status, "ACCEPTED");
  assert.equal(personalizeMap(r).occupancy.label, "Document follow-up");
});

test("map outcomes follow confirmed results and keep safety unconfirmed", () => {
  const r = emptyIntake("map-results");
  r.confirmed = draft(
    {
      relationship: "owner",
      affected: ["home"],
      condition: "damaged",
      insurance: "yes",
      claimSubmitted: "yes",
      claimStatus: "resolved",
      debrisStatus: "complete",
      taxDetermination: "yes",
      taxImplemented: "yes",
    },
    [app("received")],
  );
  r.caseRecord = caseFrom(r.confirmed);
  const b = personalizeMap(r);
  for (const id of [
    "claim-outcome",
    "application",
    "review",
    "funds",
    "cleanup",
    "tax-determination",
    "tax-outcome",
  ])
    assert.equal(b[id].tone, "complete", id);
  assert.equal(b["safe-property"].tone, "unknown");
  assert.equal(b["stable-housing"].tone, "unknown");
  r.draft = draft({ claimStatus: "review" });
  assert.equal(personalizeMap(r)["claim-outcome"].tone, "complete");
});

test("map keeps partial assistance and outstanding follow-ups open", () => {
  const r = emptyIntake("map-followups");
  r.confirmed = draft(
    {
      relationship: "owner",
      taxDetermination: "yes",
      taxImplemented: "yes",
      taxOutstanding: "yes",
    },
    [app("received"), app("denied", { id: "app-2", action: "Send missing records" })],
  );
  r.caseRecord = caseFrom(r.confirmed);
  const b = personalizeMap(r);
  assert.equal(b.funds.tone, "waiting");
  assert.equal(b.appeal.tone, "blocked");
  assert.match(b.appeal.detail.join(" "), /Send missing records/);
  assert.equal(b.review.tone, "blocked");
  assert.equal(b["tax-outcome"].tone, "blocked");
});

test("every recovery track node has a personalized status", async () => {
  const { roadmapNodes } = await importTypeScript("lib/recovery-roadmap");
  const r = emptyIntake("map-coverage");
  r.confirmed = draft();
  r.caseRecord = caseFrom(r.confirmed);
  const b = personalizeMap(r);
  for (const node of roadmapNodes.filter((node) => node.lane)) {
    assert.ok(b[node.id], node.id);
    assert.ok(b[node.id].detail.length, node.id);
  }
});

async function uploadedSession(env) {
  const s = await session(env);
  const response = await handleIntakeRequest(
    new Request("http://localhost/api/intake/documents?type=id", {
      method: "POST",
      headers: { Cookie: s.cookie, Origin: "http://localhost", "Content-Type": "image/jpeg" },
      body: new Uint8Array([255, 216, 255, 1]),
    }),
    env,
  );
  return { ...s, record: await response.json() };
}

test("wipe deletes only the current household and its uploaded images, then expires its session", async () => {
  const env = environment();
  const one = await uploadedSession(env);
  const two = await uploadedSession(env);
  const imageKey = `${one.record.id}/${one.record.documents[0].id}`;
  const secondImageKey = `${two.record.id}/${two.record.documents[0].id}`;
  assert.ok(await env.DOCUMENTS.get(imageKey));
  const response = await handleIntakeRequest(request("/api/intake", "DELETE", one.cookie), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie"), /Max-Age=0/);
  assert.equal(await env.DOCUMENTS.get(imageKey), null);
  assert.ok(await env.DOCUMENTS.get(secondImageKey));
  const other = await (
    await handleIntakeRequest(request("/api/intake", "GET", two.cookie), env)
  ).json();
  assert.deepEqual(other, two.record);
  assert.equal(
    (await handleIntakeRequest(request("/api/intake", "GET", one.cookie), env)).status,
    401,
  );
  assert.equal(
    (
      await handleIntakeRequest(
        request("/api/intake", "PUT", one.cookie, { revision: 0, draft: draft() }),
        env,
      )
    ).status,
    401,
  );
  const fresh = await session(env);
  assert.notEqual(fresh.record.id, one.record.id);
  assert.deepEqual(fresh.record.draft.answers, {});
  assert.deepEqual(fresh.record.documents, []);
  assert.equal(
    (await handleIntakeRequest(request("/api/intake", "DELETE", one.cookie), env)).status,
    200,
  );
});

test("wipe rejects requests without a session or from a different origin", async () => {
  const env = environment();
  const s = await uploadedSession(env);
  assert.equal((await handleIntakeRequest(request("/api/intake", "DELETE"), env)).status, 401);
  const foreign = new Request("http://localhost/api/intake", {
    method: "DELETE",
    headers: { Cookie: s.cookie, Origin: "https://other.example" },
  });
  assert.equal((await handleIntakeRequest(foreign, env)).status, 403);
  const missingOrigin = new Request("http://localhost/api/intake", {
    method: "DELETE",
    headers: { Cookie: s.cookie },
  });
  assert.equal((await handleIntakeRequest(missingOrigin, env)).status, 403);
  assert.ok(await env.DOCUMENTS.get(`${s.record.id}/${s.record.documents[0].id}`));
});

test("failed image deletion retains a retryable record and prevents reads and saves", async () => {
  const env = environment();
  const s = await uploadedSession(env);
  const remove = env.DOCUMENTS.delete;
  env.DOCUMENTS.delete = async () => {
    throw new Error("Storage unavailable");
  };
  const failed = await handleIntakeRequest(request("/api/intake", "DELETE", s.cookie), env);
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get("Set-Cookie"), null);
  assert.equal(
    (await handleIntakeRequest(request("/api/intake", "GET", s.cookie), env)).status,
    409,
  );
  assert.equal(
    (
      await handleIntakeRequest(
        request("/api/intake", "PUT", s.cookie, { revision: s.record.revision, draft: draft() }),
        env,
      )
    ).status,
    409,
  );
  env.DOCUMENTS.delete = remove;
  assert.equal(
    (await handleIntakeRequest(request("/api/intake", "DELETE", s.cookie), env)).status,
    200,
  );
  assert.equal(await env.DOCUMENTS.get(`${s.record.id}/${s.record.documents[0].id}`), null);
});

test("randomize persists all stages, preserves uploads and isolates households", async () => {
  const env = environment();
  const one = await uploadedSession(env);
  const two = await session(env);
  const run = (revision) =>
    handleIntakeRequest(request("/api/intake/randomize", "POST", one.cookie, { revision }), env);
  const response = await run(one.record.revision);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.draft.stage, 3);
  assert.deepEqual(saved.confirmed, saved.draft);
  assert.ok(saved.confirmedAt);
  assert.equal(saved.draft.applications.length, 3);
  assert.equal(saved.documents.length, 4);
  assert.deepEqual(saved.documents[0], one.record.documents[0]);
  assert.ok(await env.DOCUMENTS.get(`${one.record.id}/${one.record.documents[0].id}`));
  const sample = saved.documents.find((d) => d.testData);
  const preview = await handleIntakeRequest(
    request(`/api/intake/documents/${sample.id}`, "GET", one.cookie),
    env,
  );
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /TEST DATA/);
  assert.equal(
    (
      await handleIntakeRequest(
        request(`/api/intake/documents/${sample.id}`, "GET", two.cookie),
        env,
      )
    ).status,
    404,
  );
  assert.equal((await run(one.record.revision)).status, 409);
  const again = await (await run(saved.revision)).json();
  assert.equal(again.documents.length, 4);
  assert.deepEqual(again.draft, saved.draft);
  assert.deepEqual(again.documents, saved.documents);
  const reloaded = await (
    await handleIntakeRequest(request("/api/intake", "GET", one.cookie), env)
  ).json();
  assert.deepEqual(reloaded.confirmed, again.draft);
  const other = await (
    await handleIntakeRequest(request("/api/intake", "GET", two.cookie), env)
  ).json();
  assert.deepEqual(other, two.record);
});

test("Dashboard skip and restore persist with revision protection and household isolation", async () => {
  const env = environment();
  const one = await session(env);
  const two = await session(env);
  const write = (revision, action, stepId = "intake") =>
    handleIntakeRequest(
      request("/api/intake/dashboard", "PUT", one.cookie, { revision, action, stepId }),
      env,
    );
  assert.equal((await write(0, "skip")).status, 200);
  const saved = await (
    await handleIntakeRequest(request("/api/intake", "GET", one.cookie), env)
  ).json();
  assert.deepEqual(saved.dashboard, { skippedStepIds: ["intake"], activeStepId: null });
  assert.deepEqual(saved.caseRecord, one.record.caseRecord);
  assert.equal((await write(0, "restore")).status, 409);
  assert.equal((await write(1, "start", "invented")).status, 400);
  assert.equal((await write(1, "restore")).status, 200);
  const restored = await (
    await handleIntakeRequest(request("/api/intake", "GET", one.cookie), env)
  ).json();
  assert.deepEqual(restored.dashboard, { skippedStepIds: [], activeStepId: "intake" });
  const other = await (
    await handleIntakeRequest(request("/api/intake", "GET", two.cookie), env)
  ).json();
  assert.equal(other.dashboard, undefined);
});

test("journey API preserves version checks, approval idempotency, and isolated PDF/calendar access", async () => {
  const env = environment();
  const one = await session(env);
  const two = await session(env);
  const scenario = await handleIntakeRequest(
    request("/api/intake/scenario", "POST", one.cookie, {
      revision: 0,
      scenario: "owner",
      confirm: true,
    }),
    env,
  );
  assert.equal(scenario.status, 200);
  let saved = await scenario.json();
  const send = async (body) =>
    handleIntakeRequest(
      request("/api/intake/journey", "PUT", one.cookie, { revision: saved.revision, ...body }),
      env,
    );
  let response = await send({
    kind: "prepare",
    taskId: "claim",
    operationId: "prepare-a",
    assist: true,
  });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.journey.tasks.claim.artifact.preparation, "autofill");
  assert.equal(saved.journey.tasks.claim.artifact.receipt, undefined);
  const approved = {
    kind: "submit",
    taskId: "claim",
    artifactId: saved.journey.tasks.claim.artifact.id,
    confirm: true,
    operationId: "approve-a",
  };
  const originalRevision = saved.revision;
  response = await send(approved);
  assert.equal(response.status, 200);
  saved = await response.json();
  const replay = await handleIntakeRequest(
    request("/api/intake/journey", "PUT", one.cookie, { ...approved, revision: originalRevision }),
    env,
  );
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).revision, saved.revision);
  const stale = await handleIntakeRequest(
    request("/api/intake/journey", "PUT", one.cookie, {
      kind: "notes",
      taskId: "claim",
      notes: "Late edit",
      dueDate: "",
      operationId: "stale-note",
      revision: originalRevision,
    }),
    env,
  );
  assert.equal(stale.status, 409);
  const pdf = await handleIntakeRequest(
    request("/api/intake/packet?task=claim", "GET", one.cookie),
    env,
  );
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
  assert.equal(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5)), "%PDF-");
  assert.equal(
    (await handleIntakeRequest(request("/api/intake/packet?task=claim", "GET", two.cookie), env))
      .status,
    404,
  );
  const calendar = await handleIntakeRequest(
    request("/api/intake/calendar?task=claim", "GET", one.cookie),
    env,
  );
  assert.equal(calendar.status, 200);
  assert.ok((await calendar.text()).includes("BEGIN:VCALENDAR"));
  assert.equal(
    (await handleIntakeRequest(request("/api/intake/calendar?task=claim", "GET", two.cookie), env))
      .status,
    404,
  );
  const crossOrigin = new Request("http://localhost/api/intake/journey", {
    method: "PUT",
    headers: {
      Cookie: one.cookie,
      Origin: "https://other.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      revision: saved.revision,
      kind: "prepare",
      taskId: "claim",
      operationId: "cross-origin",
    }),
  });
  assert.equal((await handleIntakeRequest(crossOrigin, env)).status, 403);
  const deleted = await handleIntakeRequest(request("/api/intake", "DELETE", one.cookie), env);
  assert.equal(deleted.status, 200);
  assert.equal(
    (await handleIntakeRequest(request("/api/intake/packet?task=claim", "GET", one.cookie), env))
      .status,
    401,
  );
});
