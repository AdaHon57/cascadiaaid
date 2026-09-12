# Recovery priority engine

A priority score is a number used to compare the importance of recovery tasks.
A factor is one reason a task might matter. A weight controls how much that
factor contributes to the final score. Higher totals rank first.

The engine follows the supplied numeric formula. The separate opening priority
list and qualitative table do not override its weights. In particular, waiting
time has weight 2 and quick wins have weight 1.

## Inputs and weights

Every factor must be supplied as a finite number from 0 to 10; fractions are allowed.
For benefit factors, 0 means no assessed benefit and 10 means the strongest assessed
benefit. Missing information is not automatically treated as zero. The engine
rejects missing or invalid scores instead of guessing.

| Field                     | What it measures                                                    | Weight |
| ------------------------- | ------------------------------------------------------------------- | ------ |
| `safety_score`            | Risk to housing, health, access, or safety if delayed               | 5      |
| `deadline_score`          | Urgency of a known approaching deadline                             | 5      |
| `dependency_unlock_score` | Assessed importance of downstream steps this supports               | 4      |
| `financial_impact`        | Potential loss of aid, coverage, reimbursement, or tax relief       | 3      |
| `required_score`          | How strongly the task is required; 0 is optional, 10 is required    | 3      |
| `waiting_time_score`      | Benefit of starting a long external wait sooner                     | 2      |
| `quick_win_score`         | Ease of completion; 0 means substantial effort, 10 means very quick | 1      |
| `uncertainty_penalty`     | Uncertainty about applicability; 0 is certain, 10 is very uncertain | −4     |

These are supplied assessments, not facts the engine discovers. Dependency impact
is a 0–10 assessment, not the raw number of dependencies. The engine does not look
up deadlines, inspect evidence, determine eligibility, or traverse relationships.
It does not derive requiredness from `edgeType`.

```text
priority = safety_score * 5
         + deadline_score * 5
         + dependency_unlock_score * 4
         + financial_impact * 3
         + required_score * 3
         + waiting_time_score * 2
         + quick_win_score
         - uncertainty_penalty * 4
```

Possible totals range from −40 to 230. Negative scores are preserved. Scores are
comparison values, not percentages or probabilities. Safety and deadlines have
the strongest positive weights, but several other benefits can outweigh them;
this formula does not guarantee safety tasks always rank first.

## Usage

```ts
import { calculatePriority, rankRecoveryNodes } from "@/lib/priority-engine";
import type { PriorityFactors } from "@/types/priority";

// Illustrative inputs only, not a verified assessment of any household.
const factors: PriorityFactors = {
  safety_score: 5,
  deadline_score: 4,
  dependency_unlock_score: 3,
  financial_impact: 2,
  required_score: 5,
  waiting_time_score: 4,
  quick_win_score: 3,
  uncertainty_penalty: 2,
};

const result = calculatePriority(factors);
// result.score === 81
// Contributions: 25 + 20 + 12 + 6 + 15 + 8 + 3 - 8 = 81.
// result.contributions contains those eight weighted values by field name.

const ranked = rankRecoveryNodes([{ nodeId: "temporary-housing", factors }]);
// Each result contains nodeId, score, and contributions.
```

`nodeId` links a set of inputs to the matching `RecoveryNode.id`. The caller
supplies the candidates and is responsible for using IDs from its node data.
Ranking rejects blank IDs and duplicates. It sorts by descending score, then
ascending ID for ties, so input order does not change tied results. It returns
new results and never edits the input list or recovery nodes.

Ranking includes every supplied candidate. It is an importance ranking, not a
ready-to-start task list: a caller could supply a blocked or completed task.
The engine neither filters by status nor changes status. The ten existing sample
nodes remain plain data without invented priority assessments.

## Files

- `types/priority.ts` defines the expected inputs and outputs. `PriorityFactors`
  holds the eight scores; `PriorityCandidate` links scores to a node ID;
  `PriorityScore` holds the total and explanation; `RankedRecoveryNode` adds the ID
  to that result. TypeScript checks these shapes during development.
- `lib/priority-engine.ts` contains the weights, input validation, arithmetic, and
  sorting. Validation also checks actual values when code runs, since TypeScript's
  `number` type alone cannot enforce the 0–10 range.
- `tests/priority-engine.test.mjs` checks a worked example, score boundaries,
  invalid inputs, uncertainty penalties, ranking, ties, and preservation of inputs.
  It uses Node's built-in test runner, with no new dependency.
- `package.json` adds `npm test` to run those checks. The type-stripping flag lets
  Node run the TypeScript engine by removing type annotations; it does not replace
  a TypeScript compiler check.
- `docs/priority-engine.md` is this explanation and usage example.
- `README.md` records the current scope and links here.

For judges: “We give each task eight explicit ratings. The engine applies our
weights, subtracts uncertainty, and orders the tasks by total score. It also shows
every contribution, so we can explain the order. Readiness and eligibility are
separate from importance.”
