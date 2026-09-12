import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./helpers/import-typescript.mjs";
import { householdAnswerKeys } from "../types/recovery-case.ts";
import { sampleRecoveryCase } from "../data/sample-recovery-case.ts";

const { calculateHouseholdRecovery, recoveryWorkflow } =
  await importTypeScript("lib/recovery-workflow");
const { evaluateRecoveryCase } = await importTypeScript("lib/recovery-case-engine");
const empty = () => ({ id: "household-a", answers: {}, evidence: [], progress: [] });
const result = (input, id, workflow = recoveryWorkflow) =>
  evaluateRecoveryCase(input, workflow).states.find((state) => state.nodeId === id);
const accepted = (input, nodeId, kind, id = `${nodeId}-${kind}`) => ({
  id,
  caseId: input.id,
  kind,
  nodeIds: [nodeId],
  origin: "USER_UPLOAD",
  review: { status: "ACCEPTED", reviewedBy: "household-reviewer" },
  sourceIds: [],
});

// Explicit expected completion records for each workflow; not generated from its rule.
const completionCases = [
  ["damage-documentation", "hasDisasterDamage", ["DAMAGE_PHOTO", "DAMAGE_INVENTORY"]],
  ["identity-replacement", "identityDocumentsLostOrDamaged", ["REPLACEMENT_ID"]],
  ["proof-of-occupancy", "needsOccupancyProof", ["UTILITY_BILL"]],
  [
    "insurance-claim",
    "hasRelevantInsurance",
    ["INSURANCE_POLICY", "DAMAGE_INVENTORY", "CLAIM_RECEIPT"],
  ],
  [
    "public-disaster-assistance",
    "seekingPublicAssistance",
    ["LEASE", "RECOVERY_NEEDS", "ASSISTANCE_RECEIPT"],
  ],
  ["temporary-housing", "needsTemporaryHousing", ["HOUSEHOLD_DETAILS", "HOUSING_CONFIRMATION"]],
  [
    "hazardous-material-assessment-removal",
    "needsHazardAssessment",
    ["HAZARD_ASSESSMENT", "REMOVAL_RECORD"],
  ],
  [
    "property-tax-relief",
    "ownsAffectedProperty",
    ["PROPERTY_ASSESSMENT", "DAMAGE_PHOTO", "TAX_RELIEF_RECEIPT"],
  ],
  [
    "building-permits",
    "permitsRequired",
    ["CONSTRUCTION_PLANS", "SITE_ASSESSMENT", "PERMIT_RECORD"],
  ],
  [
    "repair-rebuilding",
    "plansRepairOrRebuilding",
    ["REPAIR_SCOPE", "WORK_ESTIMATE", "PERMIT_RECORD", "WORK_COMPLETION_RECORD"],
  ],
];
function completedCase(nodeId, kinds) {
  const input = empty();
  input.answers = Object.fromEntries(householdAnswerKeys.map((key) => [key, true]));
  input.progress = [{ nodeId, started: false, milestoneReached: true }];
  input.evidence = kinds.map((kind) => accepted(input, nodeId, kind));
  return input;
}

test("new households get ten unknown/blocked tasks, never fictional defaults", () => {
  const evaluation = calculateHouseholdRecovery(empty());
  assert.equal(evaluation.states.length, 10);
  assert.ok(
    evaluation.states.every(
      (state) =>
        state.status === "BLOCKED" && state.applicable === null && state.missingAnswers.length > 0,
    ),
  );
  assert.ok(evaluation.facts.every((fact) => !fact.completed && !fact.started));
});

for (const [nodeId, applicabilityKey, kinds] of completionCases) {
  test(`${nodeId}: derives applicability and requires both milestone and accepted evidence`, () => {
    const input = completedCase(nodeId, kinds);
    assert.equal(result(input, nodeId).status, "COMPLETE");
    input.answers[applicabilityKey] = null;
    assert.equal(result(input, nodeId).status, "BLOCKED");
    assert.equal(result(input, nodeId).applicable, null);
    input.answers[applicabilityKey] = false;
    assert.equal(result(input, nodeId).status, "NOT_APPLICABLE");
    input.answers[applicabilityKey] = true;
    for (const item of input.evidence) {
      item.review = { status: "PENDING" };
      assert.notEqual(result(input, nodeId).status, "COMPLETE");
      assert.ok(result(input, nodeId).unmetEvidence.length);
      item.review = { status: "ACCEPTED", reviewedBy: "reviewer" };
    }
    input.progress[0].milestoneReached = false;
    assert.notEqual(result(input, nodeId).status, "COMPLETE");
  });
}

test("an explicit false in an all-condition excludes a task even when another answer is unknown", () => {
  const input = empty();
  input.answers.hasRelevantInsurance = false;
  const state = result(input, "insurance-claim");
  assert.equal(state.status, "NOT_APPLICABLE");
  assert.deepEqual(state.missingAnswers, []);
});

test("completion evidence is not a prerequisite to starting a ready task", () => {
  const input = empty();
  input.answers.needsTemporaryHousing = true;
  assert.equal(result(input, "temporary-housing").status, "READY");
  input.progress = [{ nodeId: "temporary-housing", started: true, milestoneReached: false }];
  assert.equal(result(input, "temporary-housing").status, "IN_PROGRESS");
});

test("identity completion unlocks occupancy; occupancy completion unlocks assistance only after review", () => {
  const input = structuredClone(sampleRecoveryCase);
  input.progress[1].milestoneReached = true;
  assert.equal(result(input, "proof-of-occupancy").status, "BLOCKED");
  input.evidence.push(accepted(input, "identity-replacement", "REPLACEMENT_ID"));
  assert.equal(result(input, "proof-of-occupancy").status, "READY");
  assert.equal(result(input, "public-disaster-assistance").status, "BLOCKED");
  input.progress.push({ nodeId: "proof-of-occupancy", started: true, milestoneReached: true });
  const bill = accepted(input, "proof-of-occupancy", "UTILITY_BILL");
  bill.origin = "IMAGE_EXTRACTION";
  bill.review = { status: "PENDING" };
  input.evidence.push(bill);
  assert.equal(result(input, "public-disaster-assistance").status, "BLOCKED");
  bill.review = { status: "ACCEPTED", reviewedBy: "reviewer" };
  assert.equal(result(input, "public-disaster-assistance").status, "READY");
  bill.review = { status: "REJECTED", reviewedBy: "reviewer" };
  assert.equal(result(input, "public-disaster-assistance").status, "BLOCKED");
});

test("every occupancy alternative works; an unrelated identity record does not", () => {
  for (const kind of ["LEASE", "OWNERSHIP_RECORD", "UTILITY_BILL"]) {
    const input = completedCase("proof-of-occupancy", [kind]);
    assert.equal(result(input, "proof-of-occupancy").status, "COMPLETE");
  }
  const input = completedCase("proof-of-occupancy", ["IDENTITY_RECORD"]);
  assert.notEqual(result(input, "proof-of-occupancy").status, "COMPLETE");
});

test("conditional removal and permit evidence handle yes, no, and unknown", () => {
  for (const [nodeId, key, kinds] of [
    ["hazardous-material-assessment-removal", "hazardRemovalRequired", ["HAZARD_ASSESSMENT"]],
    [
      "repair-rebuilding",
      "permitsRequired",
      ["REPAIR_SCOPE", "WORK_ESTIMATE", "WORK_COMPLETION_RECORD"],
    ],
  ]) {
    const input = completedCase(nodeId, kinds);
    assert.notEqual(result(input, nodeId).status, "COMPLETE");
    input.answers[key] = false;
    assert.equal(result(input, nodeId).status, "COMPLETE");
    input.answers[key] = null;
    assert.notEqual(result(input, nodeId).status, "COMPLETE");
    assert.ok(result(input, nodeId).missingAnswers.includes(key));
    // Even supplying a record cannot answer whether the conditional requirement applies.
    input.evidence.push(
      accepted(input, nodeId, key === "permitsRequired" ? "PERMIT_RECORD" : "REMOVAL_RECORD"),
    );
    assert.notEqual(result(input, nodeId).status, "COMPLETE");
  }
});

test("recommended edges never block; all four mandatory categories do", () => {
  const input = empty();
  input.answers.hasRelevantInsurance = true;
  input.answers.hasDisasterDamage = true;
  input.answers.needsHazardAssessment = true;
  assert.equal(result(input, "hazardous-material-assessment-removal").status, "READY");
  for (const type of ["REQUIRED", "LEGAL", "SAFETY", "FINANCIAL", "RECOMMENDED"]) {
    const workflow = structuredClone(recoveryWorkflow);
    workflow.edges = [
      {
        from: "damage-documentation",
        to: "insurance-claim",
        type,
        sourceIds: ["illustrative-workflows-v1"],
      },
    ];
    const state = result(input, "insurance-claim", workflow);
    assert.equal(state.status, type === "RECOMMENDED" ? "READY" : "BLOCKED");
    assert.deepEqual(state.blockingNodeIds, type === "RECOMMENDED" ? [] : ["damage-documentation"]);
  }
});

test("explicitly non-applicable prerequisites satisfy the existing illustrative graph", () => {
  const input = empty();
  input.answers.needsOccupancyProof = true;
  input.answers.identityDocumentsLostOrDamaged = false;
  assert.equal(result(input, "proof-of-occupancy").status, "READY");
  delete input.answers.identityDocumentsLostOrDamaged;
  assert.equal(result(input, "proof-of-occupancy").status, "BLOCKED");
});

test("evidence cannot silently cross households or be used for an unlinked node", () => {
  const input = completedCase("proof-of-occupancy", ["UTILITY_BILL"]);
  input.evidence[0].nodeIds = ["public-disaster-assistance"];
  assert.notEqual(result(input, "proof-of-occupancy").status, "COMPLETE");
  input.evidence[0].caseId = "someone-else";
  assert.throws(() => calculateHouseholdRecovery(input), /current recovery case/);
});

test("malformed household, review, progress, and source inputs fail explicitly", () => {
  const changes = [
    (input) => {
      input.answers.needsTemporaryHousing = "yes";
    },
    (input) => {
      input.answers.typo = true;
    },
    (input) => {
      input.answers = [];
    },
    (input) => {
      input.progress[0].milestoneReached = 1;
    },
    (input) => {
      input.progress.push(input.progress[0]);
    },
    (input) => {
      input.progress[0].nodeId = "typo";
    },
    (input) => {
      input.evidence.push(input.evidence[0]);
    },
    (input) => {
      input.evidence[0].review = { status: "ACCEPTED" };
    },
    (input) => {
      input.evidence[0].review.status = "COMPLETE";
    },
    (input) => {
      input.evidence[0].kind = "typo";
    },
    (input) => {
      input.evidence[0].sourceIds = ["missing-source"];
    },
    (input) => {
      input.evidence[0].nodeIds = ["missing-node"];
    },
  ];
  for (const change of changes) {
    const input = completedCase("proof-of-occupancy", ["LEASE"]);
    change(input);
    assert.throws(() => calculateHouseholdRecovery(input), TypeError);
  }
});

test("invalid rule coverage, evidence types, and source references fail explicitly", () => {
  for (const change of [
    (workflow) => {
      workflow.rules.pop();
    },
    (workflow) => {
      workflow.rules.push(workflow.rules[0]);
    },
    (workflow) => {
      workflow.rules[0].applicability.all = ["typo"];
    },
    (workflow) => {
      workflow.rules[0].completion.evidence[0].acceptedKinds = ["typo"];
    },
    (workflow) => {
      workflow.rules[0].completion.evidence[0].when = "typo";
    },
    (workflow) => {
      workflow.rules[0].sourceIds = ["missing"];
    },
    (workflow) => {
      workflow.nodes[0].sourceIds = [];
    },
    (workflow) => {
      workflow.edges[0].sourceIds = ["missing"];
    },
    (workflow) => {
      workflow.edges[0].from = "missing";
    },
    (workflow) => {
      workflow.edges[0].type = "typo";
    },
    (workflow) => {
      workflow.sources[0].url = "javascript:alert(1)";
    },
  ]) {
    const workflow = structuredClone(recoveryWorkflow);
    change(workflow);
    assert.throws(() => evaluateRecoveryCase(empty(), workflow), TypeError);
  }
});

test("preserves the original ten IDs and nine illustrative relationships", () => {
  assert.deepEqual(
    recoveryWorkflow.nodes.map((node) => node.id),
    completionCases.map(([id]) => id),
  );
  assert.deepEqual(
    recoveryWorkflow.edges.map(({ from, to, type }) => [from, to, type]),
    [
      ["identity-replacement", "proof-of-occupancy", "REQUIRED"],
      ["damage-documentation", "insurance-claim", "REQUIRED"],
      ["proof-of-occupancy", "public-disaster-assistance", "REQUIRED"],
      ["damage-documentation", "hazardous-material-assessment-removal", "RECOMMENDED"],
      ["damage-documentation", "property-tax-relief", "REQUIRED"],
      ["hazardous-material-assessment-removal", "building-permits", "SAFETY"],
      ["insurance-claim", "repair-rebuilding", "REQUIRED"],
      ["public-disaster-assistance", "repair-rebuilding", "REQUIRED"],
      ["building-permits", "repair-rebuilding", "REQUIRED"],
    ],
  );
});

test("recalculation is deterministic, fresh, and does not mutate household facts", () => {
  const freeze = (value) => {
    for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
    return Object.freeze(value);
  };
  const input = freeze(structuredClone(sampleRecoveryCase));
  const workflow = freeze(structuredClone(recoveryWorkflow));
  const first = evaluateRecoveryCase(input, workflow);
  const second = evaluateRecoveryCase(input, workflow);
  assert.deepEqual(first, second);
  assert.notEqual(first.states[0], second.states[0]);
  assert.deepEqual(
    new Set(first.states.map((state) => state.status)),
    new Set(["READY", "BLOCKED", "IN_PROGRESS", "COMPLETE", "NOT_APPLICABLE"]),
  );
});
