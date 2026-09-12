import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./helpers/import-typescript.mjs";
import { sampleRecoveryCase } from "../data/sample-recovery-case.ts";

const { updateHouseholdRecovery, calculateHouseholdRecovery, recoveryWorkflow } =
  await importTypeScript("lib/recovery-workflow");
const { applyRecoveryCaseChanges } = await importTypeScript("lib/recovery-recalculation");
const sample = () => structuredClone(sampleRecoveryCase);
const state = (result, id) => result.evaluation.states.find((item) => item.nodeId === id);
const changeFor = (result, id) => result.nodeChanges.find((item) => item.nodeId === id);
const answer = (key, value) => ({ type: "SET_ANSWER", key, value });
const progress = (nodeId, milestoneReached, started = true) => ({
  type: "SET_PROGRESS",
  progress: { nodeId, started, milestoneReached },
});
const evidence = (
  input,
  id,
  kind,
  nodeIds,
  review = { status: "ACCEPTED", reviewedBy: "reviewer" },
) => ({
  id,
  caseId: input.id,
  kind,
  nodeIds,
  origin: "IMAGE_EXTRACTION",
  review,
  sourceIds: [],
});
const upsert = (item) => ({ type: "UPSERT_EVIDENCE", evidence: item });

test("an answer refreshes direct and distant blockers even when distant status is unchanged", () => {
  const result = updateHouseholdRecovery(sample(), [
    answer("identityDocumentsLostOrDamaged", false),
  ]);
  assert.equal(state(result, "identity-replacement").status, "NOT_APPLICABLE");
  assert.equal(state(result, "proof-of-occupancy").status, "READY");
  for (const id of ["public-disaster-assistance", "repair-rebuilding"]) {
    const change = changeFor(result, id);
    assert.equal(change.before.status, "BLOCKED");
    assert.equal(change.after.status, "BLOCKED");
    assert.ok(
      change.before.blockingDependencies.some((item) => item.nodeId === "identity-replacement"),
    );
    assert.ok(
      !change.after.blockingDependencies.some((item) => item.nodeId === "identity-replacement"),
    );
  }
  assert.equal(changeFor(result, "temporary-housing"), undefined);
  const restored = updateHouseholdRecovery(result.caseRecord, [
    answer("identityDocumentsLostOrDamaged", null),
  ]);
  assert.equal(state(restored, "proof-of-occupancy").status, "BLOCKED");
  assert.ok(
    state(restored, "public-disaster-assistance").blockingDependencies.some(
      (item) =>
        item.nodeId === "identity-replacement" &&
        item.reasons.some((reason) =>
          reason.includes("Were your identity documents lost or damaged?"),
        ),
    ),
  );
});

test("reviewing, rejecting, and deleting a bill refreshes completion and downstream readiness", () => {
  const input = sample();
  const bill = evidence(input, "bill", "UTILITY_BILL", ["proof-of-occupancy"], {
    status: "PENDING",
  });
  let result = updateHouseholdRecovery(input, [
    answer("identityDocumentsLostOrDamaged", false),
    progress("proof-of-occupancy", true),
    upsert(bill),
  ]);
  assert.equal(state(result, "proof-of-occupancy").status, "IN_PROGRESS");
  assert.equal(state(result, "public-disaster-assistance").status, "BLOCKED");
  result = updateHouseholdRecovery(result.caseRecord, [
    upsert({ ...bill, review: { status: "ACCEPTED", reviewedBy: "reviewer" } }),
  ]);
  assert.equal(state(result, "proof-of-occupancy").status, "COMPLETE");
  assert.equal(state(result, "public-disaster-assistance").status, "READY");
  assert.deepEqual(state(result, "public-disaster-assistance").blockingDependencies, []);
  const completed = result.caseRecord;
  for (const edit of [
    upsert({ ...bill, review: { status: "REJECTED", reviewedBy: "reviewer" } }),
    { type: "REMOVE_EVIDENCE", evidenceId: "bill" },
  ]) {
    result = updateHouseholdRecovery(completed, [edit]);
    assert.equal(state(result, "proof-of-occupancy").status, "IN_PROGRESS");
    assert.equal(state(result, "public-disaster-assistance").status, "BLOCKED");
    assert.ok(
      state(result, "repair-rebuilding").blockingDependencies.some(
        (item) =>
          item.nodeId === "proof-of-occupancy" &&
          item.reasons.some((reason) =>
            reason.includes("Lease, ownership record, or utility bill"),
          ),
      ),
    );
  }
});

test("removing shared evidence updates every linked task and skips recommendation-only effects", () => {
  const result = updateHouseholdRecovery(sample(), [
    { type: "REMOVE_EVIDENCE", evidenceId: "sample-inventory" },
  ]);
  assert.equal(state(result, "damage-documentation").status, "IN_PROGRESS");
  assert.equal(state(result, "insurance-claim").status, "BLOCKED");
  assert.ok(state(result, "insurance-claim").unmetEvidence.includes("inventory"));
  assert.ok(changeFor(result, "repair-rebuilding"));
  assert.equal(changeFor(result, "hazardous-material-assessment-removal"), undefined);
  assert.equal(state(result, "hazardous-material-assessment-removal").status, "READY");
});

test("changing evidence links or kind refreshes both old and new consumers", () => {
  const input = sample();
  const bill = evidence(input, "bill", "UTILITY_BILL", ["proof-of-occupancy"]);
  const initial = updateHouseholdRecovery(input, [
    answer("identityDocumentsLostOrDamaged", false),
    progress("proof-of-occupancy", true),
    upsert(bill),
  ]);
  const relinked = updateHouseholdRecovery(initial.caseRecord, [
    upsert({ ...bill, nodeIds: ["public-disaster-assistance"] }),
  ]);
  assert.equal(state(relinked, "proof-of-occupancy").status, "IN_PROGRESS");
  assert.equal(state(relinked, "public-disaster-assistance").status, "BLOCKED");
  assert.ok(!state(relinked, "public-disaster-assistance").unmetEvidence.includes("occupancy"));
  const reclassified = updateHouseholdRecovery(initial.caseRecord, [
    upsert({ ...bill, kind: "IDENTITY_RECORD" }),
  ]);
  assert.equal(state(reclassified, "proof-of-occupancy").status, "IN_PROGRESS");
});

test("conditional evidence answers refresh safety prerequisites and their explanations", () => {
  const input = sample();
  const initial = updateHouseholdRecovery(input, [
    progress("hazardous-material-assessment-removal", true),
    upsert(
      evidence(input, "assessment", "HAZARD_ASSESSMENT", ["hazardous-material-assessment-removal"]),
    ),
    answer("hazardRemovalRequired", false),
  ]);
  assert.equal(state(initial, "hazardous-material-assessment-removal").status, "COMPLETE");
  assert.equal(state(initial, "building-permits").status, "READY");
  for (const value of [true, null]) {
    const result = updateHouseholdRecovery(initial.caseRecord, [
      answer("hazardRemovalRequired", value),
    ]);
    assert.equal(state(result, "building-permits").status, "BLOCKED");
    assert.ok(changeFor(result, "repair-rebuilding"));
    assert.ok(
      state(result, "hazardous-material-assessment-removal").unmetEvidence.includes("removal"),
    );
    if (value === null)
      assert.ok(
        state(result, "hazardous-material-assessment-removal").reasons.some((reason) =>
          reason.includes("if required; answer needed"),
        ),
      );
  }
});

test("recording and undoing progress recalculates statuses without assigning them directly", () => {
  const input = sample();
  let result = updateHouseholdRecovery(input, [progress("temporary-housing", false)]);
  assert.equal(state(result, "temporary-housing").status, "IN_PROGRESS");
  result = updateHouseholdRecovery(result.caseRecord, [
    upsert(evidence(input, "household", "HOUSEHOLD_DETAILS", ["temporary-housing"])),
    upsert(evidence(input, "housing", "HOUSING_CONFIRMATION", ["temporary-housing"])),
    progress("temporary-housing", true),
  ]);
  assert.equal(state(result, "temporary-housing").status, "COMPLETE");
  result = updateHouseholdRecovery(result.caseRecord, [
    progress("temporary-housing", false, false),
  ]);
  assert.equal(state(result, "temporary-housing").status, "READY");
});

test("reaching one prerequisite does not complete downstream work or remove other blockers", () => {
  const result = updateHouseholdRecovery(sample(), [answer("hasRelevantInsurance", false)]);
  const rebuilding = state(result, "repair-rebuilding");
  assert.equal(rebuilding.status, "BLOCKED");
  assert.deepEqual(rebuilding.blockingNodeIds, ["public-disaster-assistance", "building-permits"]);
  assert.ok(rebuilding.reasons.some((reason) => reason.includes("Building permits")));
  assert.ok(rebuilding.unmetEvidence.length > 0);
});

test("a completed downstream task keeps completion when only an upstream prerequisite changes", () => {
  const input = sample();
  const completed = updateHouseholdRecovery(input, [
    progress("proof-of-occupancy", true),
    upsert(evidence(input, "bill", "LEASE", ["proof-of-occupancy"])),
  ]);
  const result = updateHouseholdRecovery(completed.caseRecord, [
    answer("identityDocumentsLostOrDamaged", null),
  ]);
  assert.equal(state(result, "proof-of-occupancy").status, "COMPLETE");
  assert.deepEqual(state(result, "proof-of-occupancy").blockingDependencies, []);
  assert.equal(changeFor(result, "proof-of-occupancy"), undefined);
});

test("no-op batches return no node changes and ordered batches expose only their final result", () => {
  for (const changes of [
    [],
    [answer("hasDisasterDamage", true)],
    [answer("hasDisasterDamage", false), answer("hasDisasterDamage", true)],
  ]) {
    const result = updateHouseholdRecovery(sample(), changes);
    assert.deepEqual(result.nodeChanges, []);
    assert.deepEqual(result.evaluation, calculateHouseholdRecovery(result.caseRecord));
  }
  const input = sample();
  const result = updateHouseholdRecovery(input, [
    upsert({
      ...input.evidence[0],
      review: { status: "ACCEPTED", reviewedBy: "another-reviewer" },
    }),
  ]);
  assert.deepEqual(result.nodeChanges, []);
  assert.equal(result.caseRecord.evidence[0].review.reviewedBy, "another-reviewer");
});

test("batches are atomic, reject invalid edits, and do not contaminate other households", () => {
  const input = sample();
  const original = structuredClone(input);
  for (const edit of [
    answer("unknown", true),
    answer("needsTemporaryHousing", "yes"),
    answer("needsTemporaryHousing", undefined),
    { type: "REMOVE_EVIDENCE", evidenceId: "missing" },
    { type: "SET_STATUS", nodeId: "temporary-housing", status: "COMPLETE" },
    progress("missing", true),
    upsert({ ...input.evidence[0], caseId: "another-household" }),
    upsert({ ...input.evidence[0], review: { status: "ACCEPTED" } }),
    null,
  ]) {
    assert.throws(
      () => updateHouseholdRecovery(input, [answer("needsTemporaryHousing", false), edit]),
      TypeError,
    );
    assert.deepEqual(input, original);
  }
  assert.throws(() => updateHouseholdRecovery(input, {}), TypeError);
  const other = { id: "another-household", answers: {}, evidence: [], progress: [] };
  const before = calculateHouseholdRecovery(other);
  updateHouseholdRecovery(input, [answer("needsTemporaryHousing", false)]);
  assert.deepEqual(calculateHouseholdRecovery(other), before);
});

test("frozen input and edits stay unchanged and returned case records own their nested values", () => {
  const freeze = (value) => {
    for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
    return Object.freeze(value);
  };
  const input = freeze(sample());
  const edits = freeze([upsert(evidence(input, "bill", "UTILITY_BILL", ["proof-of-occupancy"]))]);
  const result = updateHouseholdRecovery(input, edits);
  result.caseRecord.evidence.at(-1).nodeIds.push("public-disaster-assistance");
  result.caseRecord.evidence[0].review.reviewedBy = "changed";
  assert.deepEqual(edits[0].evidence.nodeIds, ["proof-of-occupancy"]);
  assert.equal(input.evidence[0].review.reviewedBy, "sample-household-reviewer");
});

test("blocker paths reach upstream tasks without duplicating shared ancestors or looping", () => {
  const result = updateHouseholdRecovery(sample(), []);
  const dependencies = state(result, "repair-rebuilding").blockingDependencies;
  assert.deepEqual(dependencies.find((item) => item.nodeId === "identity-replacement").path, [
    "repair-rebuilding",
    "public-disaster-assistance",
    "proof-of-occupancy",
    "identity-replacement",
  ]);
  // Synthetic graphs exercise traversal safeguards; production edges stay unchanged.
  const workflow = structuredClone(recoveryWorkflow);
  const edge = (from, to) => ({
    from,
    to,
    type: "REQUIRED",
    sourceIds: ["illustrative-workflows-v1"],
  });
  workflow.edges = [
    edge("identity-replacement", "proof-of-occupancy"),
    edge("identity-replacement", "public-disaster-assistance"),
    edge("proof-of-occupancy", "repair-rebuilding"),
    edge("public-disaster-assistance", "repair-rebuilding"),
    edge("repair-rebuilding", "identity-replacement"),
  ];
  const cyclic = applyRecoveryCaseChanges(sample(), [], workflow);
  const blockers = state(cyclic, "repair-rebuilding").blockingDependencies;
  assert.equal(blockers.filter((item) => item.nodeId === "identity-replacement").length, 1);
  assert.equal(blockers.length, 3);
  assert.equal(state(cyclic, "repair-rebuilding").status, "BLOCKED");
  workflow.edges = [edge("identity-replacement", "identity-replacement")];
  const self = applyRecoveryCaseChanges(sample(), [], workflow);
  assert.equal(state(self, "identity-replacement").status, "BLOCKED");
  assert.deepEqual(state(self, "identity-replacement").blockingNodeIds, ["identity-replacement"]);
  assert.deepEqual(state(self, "identity-replacement").blockingDependencies, []);
});

test("recalculation works independently of workflow node order", () => {
  const workflow = structuredClone(recoveryWorkflow);
  workflow.nodes.reverse();
  workflow.rules.reverse();
  const edits = [answer("identityDocumentsLostOrDamaged", false)];
  const normal = updateHouseholdRecovery(sample(), edits);
  const reversed = applyRecoveryCaseChanges(sample(), edits, workflow);
  const byId = (items) => Object.fromEntries(items.map((item) => [item.nodeId, item]));
  assert.deepEqual(byId(reversed.evaluation.states), byId(normal.evaluation.states));
  assert.deepEqual(byId(reversed.nodeChanges), byId(normal.nodeChanges));
});
