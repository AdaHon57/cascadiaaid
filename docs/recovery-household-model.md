# Household facts and workflow rules

CascadiaAid now calculates task status in two stages. First, household answers,
recorded milestones, and reviewed evidence establish whether each task applies
and whether its completion conditions are met. Second, the dependency engine
checks the connections between tasks and calculates a status.

A **type** describes the shape of a record. A **rule** describes how to interpret
that record. An **engine** is a function that applies the rules and returns a new
result. None of these automatically saves data or collects answers from a user.

The application entry point is `calculateHouseholdRecovery(caseRecord)` in
`lib/recovery-workflow.ts`. It accepts actual household input. The existing intake
page is still a placeholder, so there is no form or automatic subscription yet.
The dashboard roadmap remains a separate visual draft; its extra diagram arrows
are not imported as recovery dependencies.

## Scope and policy provenance

All ten node IDs and the nine existing dependency relationships are preserved.
Their rules are **illustrative planning rules**, not verified eligibility, legal,
insurance, permit, or safety requirements. The new rules make the draft behavior
explicit and testable. They do not establish which documents an agency accepts.

`illustrative-workflows-v1` identifies this draft as the origin of the definitions,
edges, and rules. Its source URL is `null`; no official citation has been invented.
Real deployment of jurisdiction-specific rules still requires policy review.

In particular, the existing graph includes insurance and public-assistance tasks
as prerequisites of rebuilding. Those inherited illustrative links must not be
presented as universal requirements. A submitted claim or assistance request does
not mean coverage, aid approval, or funds received.

## Shared records and every field

### IDs

`RecoveryCaseId`, `RecoveryNodeId`, `EvidenceId`, and `RecoverySourceId` are names
for string identifiers. IDs connect records without copying their contents.
These aliases do not authenticate a household or brand a string at runtime.
The engine checks references against the supplied workflow and case.

### Household record: `RecoveryCase`

| Field      | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `id`       | Identifies this recovery case.                                   |
| `answers`  | Household answers indexed by a fixed set of question keys.       |
| `evidence` | Records describing supporting evidence, not uploaded file bytes. |
| `progress` | Explicit records of work started and milestones reached.         |

Each answer is `true`, `false`, or `null`. An omitted answer also means unknown.
The engine rejects misspelled question names and values such as `"yes"`.

| Answer key                       | Meaning of `true`                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `hasDisasterDamage`              | The household reports disaster damage.                                                        |
| `identityDocumentsLostOrDamaged` | Identity documents need replacement.                                                          |
| `needsOccupancyProof`            | The household needs to gather occupancy evidence.                                             |
| `hasRelevantInsurance`           | The household reports insurance relevant to its loss; this is not a coverage decision.        |
| `seekingPublicAssistance`        | The household intends to request assistance; this is not a finding of eligibility.            |
| `needsTemporaryHousing`          | The household needs temporary accommodation.                                                  |
| `needsHazardAssessment`          | The household needs the professional assessment/removal workflow.                             |
| `hazardRemovalRequired`          | Required removal has been established separately, for example from a professional assessment. |
| `ownsAffectedProperty`           | The household reports ownership of the affected property.                                     |
| `seekingPropertyTaxRelief`       | The household intends to request tax relief; this is not an eligibility finding.              |
| `plansRepairOrRebuilding`        | Repair or rebuilding work is planned.                                                         |
| `permitsRequired`                | The permit requirement has been established separately for the proposed work.                 |

The engine trusts these explicit inputs. It does not infer removal or permit
requirements from a photo, location, or general recovery advice. Leave unknown
answers unset until established; there are no default yes/no answers for real cases.

### Evidence record: `RecoveryEvidence`

| Field       | Meaning                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | Unique evidence identifier within the case.                                                                                                          |
| `caseId`    | The case this evidence belongs to. A different case ID is rejected.                                                                                  |
| `kind`      | A shared category, such as `UTILITY_BILL`, `DAMAGE_PHOTO`, or `PERMIT_RECORD`. The full allowed list is `evidenceKinds` in `types/recovery-case.ts`. |
| `nodeIds`   | Tasks this record has explicitly been attached to. One record can support several tasks.                                                             |
| `origin`    | `USER_UPLOAD`, `MANUAL_RECORD`, or `IMAGE_EXTRACTION`; describes where the record came from.                                                         |
| `review`    | `PENDING`, or `ACCEPTED`/`REJECTED` with a nonempty `reviewedBy` identifier.                                                                         |
| `sourceIds` | Optional policy-reference IDs associated with the evidence. An empty array is valid. These are separate from document origin.                        |

Only `ACCEPTED` evidence of a permitted kind, attached to the current task and
case, satisfies a requirement. A human review record is required for acceptance;
the calculation function does not perform that review or verify the reviewer's
identity. Authentication and authorization belong to a future application boundary.
Acceptance here does not prove document authenticity or agency acceptance.

The image-extraction feature remains separate. Its output does not create accepted
evidence, establish applicability, or mark a milestone. A caller can later attach
an extraction as `PENDING`, arrange review, and recalculate with the reviewed record.
No raw identity text, photo bytes, or document content is needed by this engine.

### Progress record: `RecoveryNodeProgress`

| Field              | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `nodeId`           | The task this progress describes.                                                                |
| `started`          | Work on this task has explicitly started.                                                        |
| `milestoneReached` | The rule's named milestone has been explicitly recorded. This alone cannot establish completion. |

A missing progress record means neither flag is set. A reached milestone implies
work started, even if `started` is false. Progress never contains a saved status.

### Workflow definition, edge, and source

| Record                   | Fields and meaning                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecoveryNodeDefinition` | `id`: task identifier; `title`: display name; `description`: task explanation; `requiredEvidence`: legacy preparation hints for display; `sourceUrl`: legacy reference URL, currently null; `sourceIds`: origins/references in the source registry. |
| `RecoveryEdge`           | `from`: prerequisite task ID; `to`: dependent task ID; `type`: dependency category; `sourceIds`: origins/references for that relationship.                                                                                                          |
| `RecoverySource`         | `id`: source identifier; `title`: source name; `url`: HTTP(S) link or null; `kind`: `ILLUSTRATIVE` for a draft or `REFERENCE` for a linked source. A link alone does not mean policy has been verified.                                             |

Node definitions contain no status or duplicate dependency lists. Keep using
`recoveryNodes` and `recoveryEdges`. `requiredEvidence` is retained for compatibility
as preparation text; it is **not** the machine-readable completion checklist.
For example, available identity records may help prepare a replacement request;
the completion rule requires a replacement ID to have been received.

### Rule: `RecoveryNodeRule`

| Field                  | Meaning                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeId`               | The task governed by this rule. Exactly one rule is required per task.                                                                      |
| `applicability.all`    | Question keys whose answers must all be true. Any false makes the task not applicable. Otherwise, any unknown leaves applicability unknown. |
| `completion.milestone` | Plain-language description of the event recorded by `milestoneReached`.                                                                     |
| `completion.evidence`  | Evidence groups needed to complete this task. All active groups must be satisfied.                                                          |
| `sourceIds`            | The origin/references for the rule.                                                                                                         |

Each evidence group has `id` (unique within that rule), `label` (readable description),
`acceptedKinds` (alternative categories, any one of which can satisfy the group),
and optional `when` (a household question controlling whether it is needed).

When `when` is false, skip that group. When true, require it. When unknown, report
the unanswered question and prevent completion even if a matching document exists.
The task can still start if applicability and node prerequisites are satisfied.

Prerequisites live only in the edge file. There is no second rule-level list of
connections to keep in sync.

## All ten draft rules

Every completion below also requires the corresponding milestone to be recorded.
Evidence items separated by semicolons are all needed. Items separated by “or”
are alternatives within one requirement.

| Task                                  | Applies when                                       | Completion milestone                         | Completion evidence                                                   |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Damage documentation                  | Disaster damage reported                           | Household reviewed the damage record         | Damage photos; damage inventory                                       |
| Identity replacement                  | Identity documents lost/damaged                    | Replacement document received                | Replacement ID record                                                 |
| Proof of occupancy                    | Occupancy evidence needed                          | Evidence gathered and reviewed               | Lease or ownership record or utility bill                             |
| Insurance claim                       | Damage reported and relevant insurance reported    | Claim submitted and recorded                 | Policy information; inventory; claim receipt                          |
| Public disaster assistance            | Household seeks assistance                         | Request submitted and recorded               | Occupancy record; recovery needs; assistance receipt                  |
| Temporary housing                     | Temporary accommodation needed                     | Accommodation arrangement confirmed          | Household size/needs record; accommodation confirmation               |
| Hazardous-material assessment/removal | Professional workflow needed                       | Assessment and any required removal recorded | Professional assessment; removal record only when removal is required |
| Property-tax relief                   | Owner, damage reported, and relief sought          | Request submitted and recorded               | Property assessment; damage photo or inventory; tax-relief receipt    |
| Building permits                      | Repairs planned and permit requirement established | Permit issuance recorded                     | Construction plans; site assessment; issued permit                    |
| Repair/rebuilding                     | Work planned                                       | Planned work recorded as finished            | Scope; estimate; permit record where required; work completion record |

These milestones intentionally distinguish submission from approval, and recorded
work completion from a safety certification. Conditional requirements avoid
requiring removal when the supplied facts say none is needed, or permit evidence
when permits are explicitly not required.

## Results and status calculation

`RecoveryCaseEvaluation` contains `facts` and `states`.

Each derived `RecoveryNodeFacts` has `nodeId`, `applicable` (true/false/unknown),
`started`, and `completed`. The last field is calculated from the milestone,
reviewed evidence, and resolved conditions. Applications should pass a
`RecoveryCase`, rather than manually assign these lower-level facts.

Each `RecoveryNodeEvaluation` has:

| Field             | Meaning                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `nodeId`          | Task identifier; join it to a definition's `id` for display.                                              |
| `status`          | One of the five calculated statuses.                                                                      |
| `applicable`      | Result of the task's applicability rule.                                                                  |
| `missingAnswers`  | Unanswered applicability or conditional-evidence questions.                                               |
| `unmetEvidence`   | IDs of evidence groups still lacking accepted records, including potentially required conditional groups. |
| `blockingNodeIds` | Unmet mandatory prerequisite IDs when the task is blocked.                                                |
| `reasons`         | Plain-language explanations of the result and remaining conditions.                                       |

An evidence list describes what is needed for completion, not necessarily why a
node is blocked. An unknown conditional requirement is reported as an unanswered
question even if its evidence is already present.

Status precedence, in order:

1. Applicability is false → `NOT_APPLICABLE`.
2. Applicability is unknown → `BLOCKED`.
3. Completion conditions are met → `COMPLETE`.
4. A mandatory node prerequisite is unsatisfied → `BLOCKED`.
5. Work has started → `IN_PROGRESS`.
6. Otherwise → `READY`.

The existing policy is explicit in `recoveryEdgeBlocks`: `REQUIRED`, `LEGAL`,
`SAFETY`, and `FINANCIAL` block; `RECOMMENDED` does not. All incoming mandatory
prerequisites must be complete or explicitly not applicable. Unknown is not a
waiver. Readiness is never treated as completion. No extra dependency is created
from the roadmap, evidence sharing, or priority score.

A task that has started can be blocked. A task with its own completion conditions
met stays complete even if a prerequisite changes, preserving the previous
engine's precedence. If its own evidence is rejected or removed, recalculation can
remove completion. Results are snapshots, not an immutable history or audit log.
Unfinished cycles stay blocked; the engine does not recursively mark tasks done.

## Calling the engine

```ts
import { calculateHouseholdRecovery } from "@/lib/recovery-workflow";
import type { RecoveryCase } from "@/types/recovery-case";

const household: RecoveryCase = {
  id: "case-123",
  answers: { needsTemporaryHousing: true },
  evidence: [],
  progress: [],
};

const first = calculateHouseholdRecovery(household);
// Temporary housing is READY. Other tasks have unanswered applicability questions.

const second = calculateHouseholdRecovery({
  ...household,
  progress: [{ nodeId: "temporary-housing", started: true, milestoneReached: false }],
});
// Temporary housing is now IN_PROGRESS. The original household object is unchanged.
```

Call again after an answer, review, or progress change. No timer, database, intake
form, UI integration, or automatic evidence verification is included in this step.

## Files and their jobs

| File                                                                    | Job                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/recovery-case.ts`                                                | Shared IDs, allowed questions and evidence categories, household records, reviews, progress, and source records.                                                                        |
| `types/recovery-node.ts`                                                | Definitions, dependency categories, derived facts, and calculated statuses.                                                                                                             |
| `types/recovery-rule.ts`                                                | Rule/evidence requirement shapes, a complete workflow bundle, and explained result shapes.                                                                                              |
| `types/index.ts`                                                        | Re-exports the shared types. The unused scaffold `TaskNode` and `Document` names now alias the recovery definition and evidence types instead of maintaining competing shapes/statuses. |
| `types/priority.ts`                                                     | Uses the same node-ID alias; scoring behavior is unchanged.                                                                                                                             |
| `data/recovery-nodes.ts`                                                | The existing ten descriptions and display hints, now with source IDs.                                                                                                                   |
| `data/recovery-edges.ts`                                                | The existing nine relationships, now with source IDs.                                                                                                                                   |
| `data/recovery-rules.ts`                                                | Applicability, completion milestones, and accepted-evidence groups for all ten tasks.                                                                                                   |
| `data/recovery-sources.ts`                                              | Registry containing the explicit illustrative origin.                                                                                                                                   |
| `data/sample-recovery-case.ts`                                          | Fictional answers, evidence reviews, and progress for demonstrations. Never a new-household default.                                                                                    |
| `data/recovery-node-facts.ts`                                           | Compatibility export of facts derived from the fictional household.                                                                                                                     |
| `data/recovery-node-states.ts`                                          | Compatibility export of explained statuses calculated from that household.                                                                                                              |
| `lib/recovery-case-validation.ts`                                       | Rejects invalid questions, duplicate records, missing rules, unknown references, cross-case evidence, and malformed reviews.                                                            |
| `lib/recovery-case-engine.ts`                                           | Derives applicability/completion from a case, calls the dependency calculation, and adds reasons.                                                                                       |
| `lib/recovery-status-engine.ts`                                         | Applies status precedence and the explicit blocking policy. The existing low-level function remains available.                                                                          |
| `lib/recovery-workflow.ts`                                              | Connects the shared data to the case engine and exposes the application entry point.                                                                                                    |
| `tests/helpers/import-typescript.mjs`                                   | Lets the native test runner load application TypeScript imports without adding a package.                                                                                               |
| `tests/recovery-case-engine.test.mjs`                                   | Checks every workflow, unknown inputs, evidence review, conditional requirements, case isolation, source integrity, and changing facts.                                                 |
| `tests/recovery-status-engine.test.mjs`                                 | Preserves checks for the original dependency behavior and all five sample statuses.                                                                                                     |
| `docs/recovery-household-model.md`                                      | This guide, including every field, workflow, and file.                                                                                                                                  |
| `docs/recovery-status-engine.md`, `docs/recovery-graph.md`, `README.md` | Updated entry guides pointing to the household model.                                                                                                                                   |

For judges: “We store what the household reports, which milestones it has reached,
and which evidence has been reviewed. Each recovery task has explicit rules. The
engine combines those rules with the task connections to calculate its status and
explain what is missing. Our current rules are a clearly labeled demonstration,
ready for policy review before they guide real eligibility decisions.”
