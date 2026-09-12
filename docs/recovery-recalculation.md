# Graph recalculation

A node is one recovery task. An edge says that one task depends on another.
Household answers, evidence, and recorded progress are inputs; statuses and
blocker explanations are calculated outputs.

`updateHouseholdRecovery(caseRecord, changes)` applies edits and recalculates
all ten tasks. Call it whenever the application changes an answer, evidence,
or progress record. Use its returned `caseRecord` for the next edit. There is no
background watcher: editing an object elsewhere does not trigger this function.

## How it works

1. Evaluate the original household record for comparison.
2. Copy that record and apply edits in order. Validate every edit.
3. Evaluate all ten tasks using the final record and existing rules.
4. Follow unfinished prerequisites to explain blockers further up the graph.
5. Return the updated record, full evaluation, and changed node results.

For ten nodes, evaluating the entire graph is a small, straightforward operation.
It includes every affected node without maintaining a cache that could become
stale. Traversal is used for explanations, not to invent dependencies or complete
downstream tasks automatically.

The batch is **atomic** here: it returns a complete result or throws an error.
It never edits the caller's original record or returns partial updates. This is
not a database transaction and does not coordinate concurrent users; persistence
is a separate future step.

## Supported edits

Each edit has a `type` identifying its operation:

| Type              | Other fields   | Meaning                                                                                              |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `SET_ANSWER`      | `key`, `value` | Set a known question to true, false, or null. Null means unanswered, not no.                         |
| `UPSERT_EVIDENCE` | `evidence`     | Add a complete evidence record, or replace the record with that ID. “Upsert” means insert or update. |
| `REMOVE_EVIDENCE` | `evidenceId`   | Remove an existing record. An unknown ID is an error.                                                |
| `SET_PROGRESS`    | `progress`     | Add or replace a node's started/milestone flags. Set both false to reset progress.                   |

Evidence replacement supplies a complete record, not a partial patch. It can
change kind, linked tasks, or review decision. Both old and new task links are
recalculated. Evidence must belong to the current household. Pending image
extraction stays pending until an explicit human review accepts it.

Statuses cannot be assigned through this API. Validation rejects unknown
questions, malformed values, missing reviewers, and unknown node/source IDs.

```ts
import { updateHouseholdRecovery } from "@/lib/recovery-workflow";

const result = updateHouseholdRecovery(caseRecord, [
  { type: "SET_ANSWER", key: "needsTemporaryHousing", value: true },
]);

// Keep the updated record and its evaluation together in the future application.
const nextCase = result.caseRecord;
const currentTasks = result.evaluation.states;

// Includes status changes AND changed blocker explanations.
for (const change of result.nodeChanges) {
  console.log(change.nodeId, change.before.status, change.after.status);
}

// The next edit uses the returned record, not the old caseRecord.
const nextResult = updateHouseholdRecovery(nextCase, [
  {
    type: "SET_PROGRESS",
    progress: {
      nodeId: "temporary-housing",
      started: true,
      milestoneReached: false,
    },
  },
]);
```

## Returned fields

- `caseRecord`: the new household record with edits applied, without stored statuses.
- `evaluation.facts`: applicability and progress facts derived from that record.
- `evaluation.states`: all ten current statuses and explanations.
- `nodeChanges`: nodes whose calculated result differs from before the batch.
  Each entry has `nodeId`, `before`, and `after`. The last two fields contain
  complete node evaluations so callers can see exactly what changed.

`nodeChanges` is not an audit log of every input edit. Changing a reviewer name
may have no effect on a node. Empty batches and edits that cancel each other can
return no node changes. Results follow definition order, not priority order.

The existing node fields remain: `status`, `applicable`, `missingAnswers`,
`unmetEvidence`, `blockingNodeIds`, and `reasons`. Reasons now use actual question
wording, task titles, and evidence labels. Evidence needed for completion is
distinct from prerequisites blocking starting. An uncertain conditional
requirement is labeled “if required; answer needed.”

Each node also returns `blockingDependencies`. Each entry contains:

- `nodeId`: the unfinished prerequisite task.
- `title`: its readable name.
- `status`: its current calculated status.
- `path`: task IDs from the evaluated task backward through prerequisites.
- `reasons`: that prerequisite's own explanation, including missing answers,
  evidence, and milestones.

For example, the path
`repair-rebuilding → public-disaster-assistance → proof-of-occupancy → identity-replacement`
explains what rebuilding is waiting on. It runs opposite to the stored
prerequisite-to-dependent edge direction.

Each upstream task appears once along one shortest path. A breadth-first search
checks direct prerequisites before distant ones and remembers visited tasks, so
shared ancestors are not repeated and cycles cannot cause infinite loops. The
evaluated task is excluded from its own upstream list. Direct cyclic links remain
visible in `blockingNodeIds` and `reasons` and stay blocked.

## Example behavior

Suppose occupancy has reached its recorded milestone but its utility bill is
pending review. Accepting the bill can complete occupancy and make assistance
ready. Rejecting or deleting it makes occupancy incomplete and assistance blocked
again. Rebuilding may stay blocked throughout, but its changed explanation still
appears in `nodeChanges`.

Completing identity replacement alone does not complete occupancy. Other
prerequisites remain in force. Recommendations never block. Under the existing
precedence, a task whose own completion conditions are met remains complete if
an upstream prerequisite changes; losing its own evidence can remove completion.

## Files in this step

| File                                    | Purpose                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `types/recovery-update.ts`              | Defines edits and the returned record/evaluation/change list. |
| `types/recovery-rule.ts`                | Adds structured upstream blocker details.                     |
| `types/index.ts`                        | Re-exports new types from the shared entry point.             |
| `data/household-questions.ts`           | Readable wording for the twelve existing questions.           |
| `lib/recovery-recalculation.ts`         | Copies, validates, applies edits, recalculates, and compares. |
| `lib/recovery-blockers.ts`              | Follows existing blocking links and builds finite paths.      |
| `lib/recovery-case-engine.ts`           | Produces readable reasons and upstream details.               |
| `lib/recovery-workflow.ts`              | Exposes `updateHouseholdRecovery` for the existing workflows. |
| `tests/recovery-recalculation.test.mjs` | Tests edits, downstream changes, cycles, and isolation.       |
| `docs/recovery-recalculation.md`        | This explanation and usage example.                           |
| `docs/recovery-status-engine.md`        | Connects status calculation to the update function.           |
| `README.md`                             | Lists the capability and guide.                               |

The original ten IDs, nine illustrative edges, rules, and priority weights are
unchanged. This step adds an engine API; it does not connect intake, document
capture, or the draft dashboard to live household state, add storage, or verify
illustrative rules as official policy.

For judges: “When household information changes, we recompute every recovery task
and explain both its missing information and the chain of tasks holding it up.
The explanations refresh even when its status does not change.”
