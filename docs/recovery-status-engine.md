# Calculated recovery statuses

The workflow describes tasks and their relationships. Case facts describe what
is known about one household's progress. The status engine combines those inputs
to calculate a status for each task. It cannot discover whether a household is
eligible or whether work has actually been completed.

## Inputs

`RecoveryNodeFacts` in `types/recovery-node.ts` has four fields:

| Field        | Meaning                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `nodeId`     | The workflow task these facts describe.                                                     |
| `applicable` | `true` means it applies, `false` means explicitly not applicable, and `null` means unknown. |
| `started`    | Whether work on this task has started.                                                      |
| `completed`  | Whether this task has been explicitly recorded as complete.                                 |

These facts must come from a caller. The sample facts are fictional inputs, not
defaults for real households. No intake, evidence checking, or persistence is
implemented. A missing facts record is treated as unknown, not as ready.

## Rules, in order

The first matching rule determines the result:

1. Explicitly not applicable → `NOT_APPLICABLE`.
2. Unknown applicability or missing facts → `BLOCKED`.
3. Explicitly complete → `COMPLETE`.
4. Any unsatisfied blocking prerequisite → `BLOCKED`.
5. Work has started → `IN_PROGRESS`.
6. Otherwise → `READY`.

This precedence is intentional. Completion does not require a separate started
flag. Explicit non-applicability wins over progress flags, and unknown
applicability prevents a completion flag from establishing a usable completion.
An unfinished task can be blocked even after work starts. Already completed tasks
remain complete if a prerequisite later changes.

For this illustrative workflow, `REQUIRED`, `LEGAL`, `SAFETY`, and `FINANCIAL`
edges block until their prerequisite is complete or explicitly not applicable.
`RECOMMENDED` edges do not block. Treating a non-applicable prerequisite as
satisfied is an explicit application rule, not a verified legal or program rule.
No existing edges or their categories have changed.

Only direct incoming edges need checking: a prerequisite that is merely ready or
in progress cannot satisfy an edge. Readiness never spreads as completion.
Unfinished cycles, including self-dependencies, remain blocked without recursive
traversal. The engine does not repair invalid workflow design. References to
unknown nodes, duplicate node/fact IDs, unknown edge types, and invalid fact fields
produce errors rather than silently allowing work.

`BLOCKED` can mean unknown applicability or unmet prerequisites. The current five
statuses do not distinguish those reasons in the returned data. `READY` means
ready under these supplied facts and illustrative relationships, not independently
verified safety, eligibility, or evidence sufficiency.

## Usage

```ts
import { calculateRecoveryNodeStates } from "@/lib/recovery-status-engine";
import { recoveryNodes } from "@/data/recovery-nodes";
import { recoveryEdges } from "@/data/recovery-edges";
import { sampleRecoveryNodeFacts } from "@/data/recovery-node-facts";

const updatedFacts = sampleRecoveryNodeFacts.map((fact) =>
  fact.nodeId === "identity-replacement" ? { ...fact, completed: true } : fact,
);
const states = calculateRecoveryNodeStates(recoveryNodes, recoveryEdges, updatedFacts);
// Identity replacement is COMPLETE; proof of occupancy becomes READY.
// Public disaster assistance remains BLOCKED until proof of occupancy is complete.
```

Call the function again whenever case facts change. It returns a fresh array of
`{ nodeId, status }` records in definition order, without changing any input.
It does not maintain an automatic subscription or save the results.

## Files

- `types/recovery-node.ts` defines the facts and calculated state shapes alongside
  the existing definition, edge, and allowed status types.
- `lib/recovery-status-engine.ts` validates the inputs and applies the rules above.
- `data/recovery-node-facts.ts` contains the fictional inputs for the ten tasks.
- `data/recovery-node-states.ts` preserves the `sampleRecoveryNodeStates` export,
  now calculated when the module loads. It is a sample snapshot; changing case
  facts requires another engine call.
- `tests/recovery-status-engine.test.mjs` checks all five results, changing facts,
  edge categories, multiple prerequisites, precedence, cycles, malformed inputs,
  and preservation of inputs.
- `docs/recovery-status-engine.md` explains these rules and how to call the engine.
- `docs/recovery-graph.md` and `README.md` describe the updated project structure.

The existing priority engine stays separate: status describes progress and
readiness; priority compares importance. UI routes remain placeholders.

For judges: “We store facts about a household's progress, then calculate task
statuses from those facts and the workflow connections. Completing a prerequisite
can make the next task ready, without manually editing that next task's status.”
