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
It does not derive requiredness from a `RecoveryEdge.type`.

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

`nodeId` links a set of inputs to the matching `RecoveryNodeDefinition.id`. The caller
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

## Dashboard integration

`/` redirects to `/dashboard`; navigation has one Dashboard entry. Intake stays
at `/intake`, accessible from the Dashboard or Settings.

`lib/dashboard-steps.ts` ranks the visible engine-backed tasks through
`rankRecoveryNodes`. Dashboard shows a scrolling list in that order, including
gray cards for tasks with unmet prerequisites. Each blocked card has an info
control that reveals the engine's direct and upstream dependency explanations.
Starting a blocked step is disabled in the UI and rejected by the API.
Completed and inapplicable tasks are omitted unless a separate follow-up remains.
Urgent housing remains at the top until skipped. Unconfirmed households get an
intake step, and an empty recovery list offers an information-review step.

Skip moves a step below the unskipped list without changing recovery facts,
completion, or dependency satisfaction. Restore returns it to the priority order.
Both groups preserve priority order internally. Skipping the current task advances
to the next unblocked, unskipped task. If none exists, there is no current step.
“Work on this step” explicitly selects current work and opens the step's destination.
Dashboard and Roadmap share the same selection function; Roadmap draws a green
ring and glow around that task, independently of which map card is inspected.

`PUT /api/intake/dashboard` saves skip/restore/start actions in the existing
household payload with the existing origin, session and revision checks.
The optional `dashboard` field keeps older records compatible. It does not modify
engine progress. Wiping the household removes these preferences; randomizing
intake resets them. No database schema migration is required.

`data/dashboard-priorities.ts` holds editable **starter assessments**, separate
from the engine's fixed weights and node definitions. They are initial product
judgments, not verified household assessments. Deadline and requiredness inputs
currently give no bonus; recorded deadlines are not yet translated into urgency
scores. Each of the eight factors is explicit. Replace these assessments as the
scoring policy is refined. The list function also accepts a ratings object for
testing or a future household-specific scoring source.

The Dashboard recalculates on household refresh, including window focus and the
existing 30-second refresh, and immediately after a successful Dashboard action.
