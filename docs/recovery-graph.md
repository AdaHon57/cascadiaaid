# Recovery graph model

A node describes a recovery task. An edge is a directed link between two tasks.
Runtime state records progress for a particular recovery case. Keeping these
separate lets households share the same workflow without sharing their progress.
TypeScript interfaces describe the expected shape of data during development;
they do not calculate statuses or save progress to a database.

## Types and fields

`types/recovery-node.ts` defines the separate shapes:

| Type                     | Field              | Meaning                                                                    |
| ------------------------ | ------------------ | -------------------------------------------------------------------------- |
| `RecoveryNodeDefinition` | `id`               | Stable task identifier, used to connect records across files.              |
|                          | `title`            | Short task name for display.                                               |
|                          | `description`      | Plain-language explanation of the task.                                    |
|                          | `requiredEvidence` | Illustrative evidence labels, not uploaded files or verified requirements. |
|                          | `sourceUrl`        | Reference link; currently `null` because no verified source is attached.   |
| `RecoveryEdge`           | `from`             | ID of the prerequisite task.                                               |
|                          | `to`               | ID of the task that depends on it.                                         |
|                          | `type`             | Category for this individual relationship.                                 |
| `RecoveryNodeState`      | `nodeId`           | ID of the task whose progress is recorded.                                 |
|                          | `status`           | That task's progress within a recovery case.                               |

`RecoveryEdgeType` allows `REQUIRED`, `LEGAL`, `SAFETY`, `FINANCIAL`, or
`RECOMMENDED`. A task can now have incoming edges with different categories.
The status engine treats `RECOMMENDED` edges as optional and the other categories
as blocking relationships.

`RecoveryNodeStatus` still allows `READY`, `BLOCKED`, `IN_PROGRESS`, `COMPLETE`,
or `NOT_APPLICABLE`. These are now calculated from `RecoveryNodeFacts`
(`nodeId`, `applicable`, `started`, and `completed`) and the edges. Case facts and
calculated state remain separate from the shared definitions. See the
[status engine rules](recovery-status-engine.md) for precedence and unknown inputs.

## Data files

- `data/recovery-nodes.ts` exports `recoveryNodes`: the same ten task IDs,
  titles, descriptions, evidence lists, and source URLs. Definitions contain no
  `status`, `dependencies`, `edgeType`, or `unlocks`.
- `data/recovery-edges.ts` exports `recoveryEdges`: the nine original
  relationships, each stored once. Each edge inherits the former `edgeType`
  of its dependent (`to`) task. Root tasks no longer need a placeholder edge type.
- `data/recovery-node-facts.ts` exports `sampleRecoveryNodeFacts`: explicit
  applicability and progress inputs for one fictional case.
- `data/recovery-node-states.ts` exports `sampleRecoveryNodeStates`: calculated
  from the sample facts and edges when the module loads, not hard-coded statuses.

For example, the existing relationship from `damage-documentation` to
`insurance-claim` is stored as one `REQUIRED` edge. Previously, it appeared both
in the claim's `dependencies` and in documentation's `unlocks`. Those two lists
represented the same link. Keeping one record avoids maintaining duplicate lists.
All migrated relationships remain illustrative, not verified recovery requirements.

## Compatibility and scope

The `recoveryNodes` export and its file path remain available. The old
`RecoveryNode` type name is a deprecated alias for `RecoveryNodeDefinition`;
it does not restore the removed fields. Future displays can match definitions
and state by `id` / `nodeId`, and read relationships from `recoveryEdges`.
No current UI component consumes the recovery model, so no UI changes were needed.

The priority engine still takes explicit scores linked by node ID and is unchanged.
The status engine now checks direct prerequisites and calculates all five
statuses. It does not mutate input data or infer eligibility, completion,
or priority factors.

For judges: “We separate what a task is, how tasks connect, and a household's
progress. The ten tasks are reusable definitions, the arrows are separate typed
relationships, and statuses are calculated from separate household progress facts.”
