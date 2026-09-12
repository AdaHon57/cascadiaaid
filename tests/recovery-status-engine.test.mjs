import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecoveryNodeStates } from "../lib/recovery-status-engine.ts";
import { recoveryNodes } from "../data/recovery-nodes.ts";
import { recoveryEdges } from "../data/recovery-edges.ts";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { sampleRecoveryNodeFacts } = await importTypeScript("data/recovery-node-facts");

const node = (id) => ({ id, title: id, description: "", requiredEvidence: [], sourceUrl: null });
const fact = (nodeId, overrides = {}) => ({
  nodeId,
  applicable: true,
  started: false,
  completed: false,
  ...overrides,
});
const states = (nodes, edges, facts) =>
  Object.fromEntries(
    calculateRecoveryNodeStates(nodes, edges, facts).map((s) => [s.nodeId, s.status]),
  );

test("calculates all five statuses for the ten existing sample workflows", () => {
  assert.deepEqual(states(recoveryNodes, recoveryEdges, sampleRecoveryNodeFacts), {
    "damage-documentation": "COMPLETE",
    "identity-replacement": "IN_PROGRESS",
    "proof-of-occupancy": "BLOCKED",
    "insurance-claim": "READY",
    "public-disaster-assistance": "BLOCKED",
    "temporary-housing": "READY",
    "hazardous-material-assessment-removal": "READY",
    "property-tax-relief": "NOT_APPLICABLE",
    "building-permits": "BLOCKED",
    "repair-rebuilding": "BLOCKED",
  });
});

test("changing completion unlocks only the satisfied steps in a dependency chain", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [
    { from: "a", to: "b", type: "REQUIRED" },
    { from: "b", to: "c", type: "REQUIRED" },
  ];
  assert.deepEqual(states(nodes, edges, [fact("a"), fact("b"), fact("c")]), {
    a: "READY",
    b: "BLOCKED",
    c: "BLOCKED",
  });
  assert.deepEqual(states(nodes, edges, [fact("a", { completed: true }), fact("b"), fact("c")]), {
    a: "COMPLETE",
    b: "READY",
    c: "BLOCKED",
  });
  assert.deepEqual(
    states(nodes, edges, [
      fact("a", { completed: true }),
      fact("b", { completed: true }),
      fact("c"),
    ]),
    {
      a: "COMPLETE",
      b: "COMPLETE",
      c: "READY",
    },
  );
});

test("each blocking edge category requires completion or explicit non-applicability", () => {
  const nodes = [node("a"), node("b")];
  for (const type of ["REQUIRED", "LEGAL", "SAFETY", "FINANCIAL"]) {
    const edges = [{ from: "a", to: "b", type }];
    for (const overrides of [{}, { started: true }, { applicable: null, completed: true }]) {
      assert.equal(states(nodes, edges, [fact("a", overrides), fact("b")]).b, "BLOCKED");
    }
    for (const overrides of [{ completed: true }, { applicable: false }]) {
      assert.equal(states(nodes, edges, [fact("a", overrides), fact("b")]).b, "READY");
    }
    assert.equal(states(nodes, edges, [fact("b")]).b, "BLOCKED");
  }
  assert.equal(
    states(nodes, [{ from: "a", to: "b", type: "RECOMMENDED" }], [fact("b")]).b,
    "READY",
  );
});

test("all blocking incoming edges must be satisfied, independently of recommended edges", () => {
  const nodes = [node("a"), node("b"), node("c"), node("d")];
  const edges = [
    { from: "a", to: "d", type: "LEGAL" },
    { from: "b", to: "d", type: "FINANCIAL" },
    { from: "c", to: "d", type: "RECOMMENDED" },
  ];
  assert.equal(
    states(nodes, edges, [fact("a", { completed: true }), fact("b"), fact("d")]).d,
    "BLOCKED",
  );
  assert.equal(
    states(nodes, edges, [
      fact("a", { completed: true }),
      fact("b", { applicable: false }),
      fact("d"),
    ]).d,
    "READY",
  );
});

test("status precedence handles unknown applicability, completion, and started but blocked work", () => {
  const nodes = [node("a"), node("b")];
  const edges = [{ from: "a", to: "b", type: "SAFETY" }];
  const cases = [
    [{ applicable: false, completed: true, started: true }, "NOT_APPLICABLE"],
    [{ applicable: null, completed: true, started: true }, "BLOCKED"],
    [{ completed: true }, "COMPLETE"],
    [{ started: true }, "BLOCKED"],
  ];
  for (const [overrides, expected] of cases) {
    assert.equal(states(nodes, edges, [fact("b", overrides)]).b, expected);
  }
  assert.equal(states([node("a")], [], []).a, "BLOCKED");
  assert.equal(states([node("a")], [], [fact("a", { started: true })]).a, "IN_PROGRESS");
  assert.equal(states([node("a")], [], [fact("a")]).a, "READY");
});

test("cycles stay blocked without recursion or automatic completion", () => {
  const nodes = [node("a"), node("b")];
  const edges = [
    { from: "a", to: "b", type: "REQUIRED" },
    { from: "b", to: "a", type: "REQUIRED" },
  ];
  assert.deepEqual(states(nodes, edges, [fact("a"), fact("b")]), { a: "BLOCKED", b: "BLOCKED" });
  assert.equal(
    states([node("a")], [{ from: "a", to: "a", type: "REQUIRED" }], [fact("a")]).a,
    "BLOCKED",
  );
});

test("rejects invalid IDs, broken edge references, invalid categories, and malformed facts", () => {
  assert.throws(() => calculateRecoveryNodeStates([node("a"), node("a")], [], []), TypeError);
  assert.throws(() => calculateRecoveryNodeStates([node(" ")], [], []), TypeError);
  assert.throws(() => calculateRecoveryNodeStates([node("a")], [], [fact("x")]), TypeError);
  assert.throws(
    () => calculateRecoveryNodeStates([node("a")], [], [fact("a"), fact("a")]),
    TypeError,
  );
  for (const edge of [
    { from: "x", to: "a", type: "REQUIRED" },
    { from: "a", to: "x", type: "REQUIRED" },
    { from: "a", to: "a", type: "TYPO" },
  ])
    assert.throws(() => calculateRecoveryNodeStates([node("a")], [edge], []), TypeError);
  for (const overrides of [
    { applicable: undefined },
    { applicable: "yes" },
    { started: 1 },
    { completed: undefined },
  ]) {
    assert.throws(
      () => calculateRecoveryNodeStates([node("a")], [], [fact("a", overrides)]),
      TypeError,
    );
  }
  assert.deepEqual(calculateRecoveryNodeStates([], [], []), []);
});

test("calculation preserves inputs, returns fresh outputs, and ignores input ordering", () => {
  const freeze = (value) => {
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") freeze(child);
    });
    return Object.freeze(value);
  };
  const [nodes, edges, facts] = freeze(
    structuredClone([recoveryNodes, recoveryEdges, sampleRecoveryNodeFacts]),
  );
  const first = calculateRecoveryNodeStates(nodes, edges, facts);
  const second = calculateRecoveryNodeStates(nodes, [...edges].reverse(), [...facts].reverse());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert.deepEqual(
    calculateRecoveryNodeStates([...nodes].reverse(), edges, facts),
    [...first].reverse(),
  );
});
