import assert from "node:assert/strict";
import test from "node:test";
import { calculatePriority, rankRecoveryNodes } from "../lib/priority-engine.ts";

const zeroFactors = Object.freeze({
  safety_score: 0,
  deadline_score: 0,
  dependency_unlock_score: 0,
  financial_impact: 0,
  required_score: 0,
  waiting_time_score: 0,
  quick_win_score: 0,
  uncertainty_penalty: 0,
});

test("applies the requested formula and explains every contribution", () => {
  const result = calculatePriority({
    safety_score: 5,
    deadline_score: 4,
    dependency_unlock_score: 3,
    financial_impact: 2,
    required_score: 5,
    waiting_time_score: 4,
    quick_win_score: 3,
    uncertainty_penalty: 2,
  });
  assert.deepEqual(result, {
    score: 81,
    contributions: {
      safety_score: 25,
      deadline_score: 20,
      dependency_unlock_score: 12,
      financial_impact: 6,
      required_score: 15,
      waiting_time_score: 8,
      quick_win_score: 3,
      uncertainty_penalty: -8,
    },
  });
  assert.equal(
    Object.values(result.contributions).reduce((sum, value) => sum + value, 0),
    result.score,
  );
});

test("supports zero, maximum benefits, fractional inputs, and negative totals", () => {
  assert.equal(calculatePriority(zeroFactors).score, 0);
  assert.equal(
    calculatePriority({
      safety_score: 10,
      deadline_score: 10,
      dependency_unlock_score: 10,
      financial_impact: 10,
      required_score: 10,
      waiting_time_score: 10,
      quick_win_score: 10,
      uncertainty_penalty: 0,
    }).score,
    230,
  );
  assert.equal(calculatePriority({ ...zeroFactors, uncertainty_penalty: 10 }).score, -40);
  assert.equal(calculatePriority({ ...zeroFactors, safety_score: 5.5 }).score, 27.5);
});

test("rejects missing, non-numeric, non-finite, and out-of-range factors", () => {
  for (const key of Object.keys(zeroFactors)) {
    for (const value of [undefined, null, "3", NaN, Infinity, -Infinity, -1, 10.1]) {
      assert.throws(() => calculatePriority({ ...zeroFactors, [key]: value }), {
        name: "RangeError",
        message: `${key} must be a finite number between 0 and 10.`,
      });
    }
    const incomplete = { ...zeroFactors };
    delete incomplete[key];
    assert.throws(() => calculatePriority(incomplete), RangeError);
  }
  for (const value of [null, undefined, [], 5]) {
    assert.throws(() => calculatePriority(value), TypeError);
  }
});

test("ranks by score with deterministic ID ties, preserving frozen input records", () => {
  const candidates = Object.freeze([
    Object.freeze({ nodeId: "z-low", factors: zeroFactors }),
    Object.freeze({
      nodeId: "b-high",
      factors: Object.freeze({ ...zeroFactors, safety_score: 5 }),
    }),
    Object.freeze({
      nodeId: "a-high",
      factors: Object.freeze({ ...zeroFactors, deadline_score: 5 }),
    }),
    Object.freeze({
      nodeId: "uncertain",
      factors: Object.freeze({ ...zeroFactors, uncertainty_penalty: 5 }),
    }),
  ]);
  const before = structuredClone(candidates);
  const ranked = rankRecoveryNodes(candidates);
  assert.deepEqual(
    ranked.map(({ nodeId, score }) => [nodeId, score]),
    [
      ["a-high", 25],
      ["b-high", 25],
      ["z-low", 0],
      ["uncertain", -20],
    ],
  );
  assert.deepEqual(candidates, before);
  assert.deepEqual(rankRecoveryNodes([...candidates].reverse()), ranked);
  assert.notEqual(ranked[0].contributions, candidates[2].factors);
});

test("increasing uncertainty reduces priority by four points per unit", () => {
  const certain = { ...zeroFactors, financial_impact: 5, uncertainty_penalty: 1 };
  const uncertain = { ...certain, uncertainty_penalty: 2 };
  assert.equal(calculatePriority(certain).score - calculatePriority(uncertain).score, 4);
});

test("handles an empty ranking and rejects duplicate or empty IDs", () => {
  assert.deepEqual(rankRecoveryNodes([]), []);
  assert.throws(
    () =>
      rankRecoveryNodes([
        { nodeId: "same", factors: zeroFactors },
        { nodeId: "same", factors: zeroFactors },
      ]),
    /Duplicate priority candidate/,
  );
  for (const nodeId of ["", "   ", undefined, 42]) {
    assert.throws(() => rankRecoveryNodes([{ nodeId, factors: zeroFactors }]), TypeError);
  }
});
