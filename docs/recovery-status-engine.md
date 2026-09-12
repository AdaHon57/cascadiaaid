# Recovery status engine

The application now accepts household answers, evidence records, and progress,
rather than asking a caller to decide whether each task applies or is complete.
Use `calculateHouseholdRecovery(caseRecord)` from `lib/recovery-workflow.ts`.

See the [household model guide](recovery-household-model.md) for every input and
output field, all ten rules, examples, and the file-by-file explanation.

## Two stages

1. `evaluateRecoveryCase` checks input records and applies each task's draft rule.
   It derives applicability and completion from answers, an explicit milestone,
   and accepted evidence linked to that case and task.
2. `calculateRecoveryNodeStates` checks direct prerequisites and assigns statuses.
   This lower-level function remains available for compatibility, but application
   callers should use the household entry point so evidence rules are applied.

Both functions return fresh results without editing inputs or saving anything.
Use `updateHouseholdRecovery(caseRecord, changes)` to apply answer, evidence, or
progress edits and return a freshly evaluated graph with before/after results
for changed nodes. See the [recalculation guide](recovery-recalculation.md).

## Status precedence

The first matching rule wins:

1. Explicitly not applicable → `NOT_APPLICABLE`.
2. Unknown applicability → `BLOCKED`.
3. Completion conditions met → `COMPLETE`.
4. An unsatisfied mandatory prerequisite → `BLOCKED`.
5. Work started → `IN_PROGRESS`.
6. Otherwise → `READY`.

Required evidence is needed for completion, not to start gathering it. A missing
conditional answer prevents completion but does not prevent starting an otherwise
ready task. Missing applicability answers do prevent readiness.

`recoveryEdgeBlocks` defines the existing illustrative policy: `REQUIRED`,
`LEGAL`, `SAFETY`, and `FINANCIAL` block; `RECOMMENDED` never blocks. Every mandatory
prerequisite must be complete or explicitly not applicable. Unknown applicability,
ready status, and work in progress cannot satisfy a prerequisite.

A task can be blocked after work has started. A task whose own completion conditions
are met remains complete if a prerequisite changes. Removing or rejecting its own
required evidence can remove completion. Unfinished cycles remain blocked without
recursive traversal or automatic completion.

## Explanations and scope

Results include `missingAnswers`, `unmetEvidence`, `blockingNodeIds`, and readable
`reasons`. These distinguish unanswered questions from unfinished prerequisites
and documents still needed for completion. `blockingDependencies` adds upstream
prerequisites with their titles, statuses, reasons, and one shortest path per
task. This explanation traversal handles cycles and ignores recommendations;
it does not change status precedence or complete downstream tasks automatically.

All rules and nine relationships remain illustrative. No eligibility, legal,
coverage, safety, or permit requirement is inferred. An accepted evidence record
represents an explicit human review, not authentication or agency approval.
Image extraction does not automatically populate these records.

The sample exports now run through the household rules and still demonstrate all
five statuses. Actual cases must provide their own input; there is no live intake
form, persistence, or dashboard status wiring in this step. Priority scoring is
separate and unchanged.
