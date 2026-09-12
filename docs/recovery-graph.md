# Recovery graph model

A node describes a task. An edge describes a directed prerequisite connection.
A rule describes when a task applies and what completes it. A household case holds
answers, evidence reviews, and progress. Status is calculated from those records.
Keeping these separate lets households share a workflow without sharing progress.

See the [household model guide](recovery-household-model.md) for every field, file,
and rule, and the [status guide](recovery-status-engine.md) for calculation order.

## Shared definitions

`RecoveryNodeDefinition` retains `id`, `title`, `description`, the legacy
`requiredEvidence` display hints, and `sourceUrl`. It now also has `sourceIds`,
which refer to the shared source registry. Definitions contain no `status`,
`dependencies`, `edgeType`, or `unlocks`.

`RecoveryEdge` has `from`, `to`, `type`, and `sourceIds`. Each relationship is
stored once in `data/recovery-edges.ts`. The existing ten workflow IDs and nine
relationships are unchanged. The engine does not use the separate visual roadmap
as a source of extra recovery dependencies.

`RecoveryNodeRule` has `nodeId`, `applicability`, `completion`, and `sourceIds`.
Structured completion evidence lives here. Node `requiredEvidence` strings remain
preparation hints for compatibility, not a second machine-readable checklist.
Prerequisites live exclusively in the edge collection.

All definitions, edges, and rules reference `illustrative-workflows-v1`. This is
an honest origin label for the draft, not an official policy citation. Its URL
is null. No jurisdiction requirements have been verified.

## Household records and calculated state

`RecoveryCase` stores an ID, household answers, evidence records, and explicit
progress. The case engine derives `RecoveryNodeFacts` (`nodeId`, `applicable`,
`started`, `completed`) and passes them to the dependency engine.

`RecoveryNodeState` still has `nodeId` and `status`. The household engine adds
applicability, missing questions, unmet evidence groups, blocking prerequisite
IDs, and readable reasons. Match `nodeId` to a definition's `id` for display.

`REQUIRED`, `LEGAL`, `SAFETY`, and `FINANCIAL` edges block under the existing
illustrative policy. `RECOMMENDED` edges do not. The five allowed statuses remain
`READY`, `BLOCKED`, `IN_PROGRESS`, `COMPLETE`, and `NOT_APPLICABLE`.

## Compatibility

`recoveryNodes`, `recoveryEdges`, `sampleRecoveryNodeFacts`, and
`sampleRecoveryNodeStates` retain their names and paths. Sample facts and states
are now derived from `sampleRecoveryCase`. The old `RecoveryNode` alias still
means `RecoveryNodeDefinition`; it does not restore removed fields.

The unused scaffold `TaskNode` and `Document` types now alias the canonical
recovery definition and evidence types. This removes the competing lowercase
status vocabulary. Existing UI files do not consume those scaffold types.

Priority inputs use the shared node-ID alias. Their formula and behavior remain
unchanged. No UI, intake, storage, or automatic image-to-evidence integration is
part of this model change.
