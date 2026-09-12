# Intake and the personalized recovery map

Intake is available at `/intake`. `/` redirects to `/dashboard`, the single landing page. `/dashboard` uses the last confirmed
answers, never a sample household. Editing a draft does not silently change the
confirmed map. The three questionnaire stages are followed by a review screen.

## Questions and conditional display

| Stage / topic               | Questions                                                                                                                                                                                                                                                                                  | When shown                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immediate needs             | Safe stay tonight                                                                                                                                                                                                                                                                          | Everyone; No or Not sure immediately displays emergency housing contacts, even before saving or completing intake. Contacts remain available if loading saved intake fails.                                                                                                                                      |
| Affected home and household | Partial street/city/ZIP, full-address knowledge, exact/approximate/unknown wildfire date, owner/renter/family/other relationship, main home, affected property categories, reported condition                                                                                              | Everyone. Only the matching exact or approximate date follow-up appears. The affected address and current location are separate keys. Condition is explicitly a household report.                                                                                                                                |
| Housing                     | Accommodation help; current arrangement, confirmation, ending date, household size and placement needs                                                                                                                                                                                     | The help screen is available to everyone. Detailed questions appear for unsafe/uncertain shelter tonight, an unlivable/destroyed home, evacuation, or requested accommodation help.                                                                                                                              |
| ID and documents            | Lost records, record types, other ID, replacement requests and receipt; occupancy records, need for occupancy proof and damage documentation                                                                                                                                               | Lost-record follow-ups only when loss is Yes/Not sure. Arrival only after a replacement request. No ID numbers are requested.                                                                                                                                                                                    |
| Insurance                   | Possible insurance, contact, claim submission/status, requests/disputes/deadlines, optional insurer and reference                                                                                                                                                                          | Details only with Yes/Not sure coverage; status only after reported submission; action/deadline only with an outstanding matter.                                                                                                                                                                                 |
| Assistance                  | Applied already or interested in exploring; repeatable organization/status/request/deadline records                                                                                                                                                                                        | No insurance gate. Multiple applications preserve independent progress and deadlines, including denials and appeals.                                                                                                                                                                                             |
| Property                    | Responsibility/authorization, authority access, hazards, professional assessment/removal requirements, household hazards, asbestos survey/results/removal, debris, rebuilding plans, permit requirements/status/work, started/finished work, outstanding inspections/corrections/approvals | Property damage or possible property work, regardless of owner/renter status. Results follow completed surveys. Not rebuilding hides construction questions but does not hide cleanup questions. Requirement questions record what authorities/professionals told the household; they do not infer requirements. |
| Tax                         | Interest in assessed property, pursuing relief, Assessor review/contact, request, determination, implementation, requests/appeals/deadlines                                                                                                                                                | Owners or a Yes/Not sure interest in affected assessed property. Implementation follows a determination.                                                                                                                                                                                                         |
| Optional documents          | Ten document categories; extraction review; name, address, relevant date/date meaning, property/household scope; recipient acceptance                                                                                                                                                      | Optional; intake can finish without uploads.                                                                                                                                                                                                                                                                     |

Missing keys mean unanswered. `unknown` and `skipped` are explicit values; `no`
remains a different answer. The engine's narrower boolean schema receives unknown
as null. Hidden answers are retained in the draft and review snapshot, but
`activeAnswers` excludes them from current engine facts and map waiting states.

## Connecting answers to the existing engine

`intakeToRecovery` adapts a reviewed intake into the existing `RecoveryCase`.
`calculateHouseholdRecovery` then uses the existing workflow and deterministic
status engine. Neither intake nor the diagram creates new dependency edges,
eligibility rules, evidence requirements, or automatic completion rules.

| Engine answer                                 | Confirmed intake source                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hasDisasterDamage                             | Selected damaged property or damaged/destroyed home; explicit evacuation without known damage plus apparently undamaged home can produce false; unknown is preserved. |
| identityDocumentsLostOrDamaged                | Lost-record answer plus identity/birth-record selection; unrelated lost records do not automatically imply lost ID.                                                   |
| needsOccupancyProof                           | Explicit need to gather proof of residence.                                                                                                                           |
| hasRelevantInsurance                          | Insurance Yes/No/Not sure.                                                                                                                                            |
| seekingPublicAssistance                       | Applied, interested, or a separately recorded active application; no insurance decision is required.                                                                  |
| needsTemporaryHousing                         | Housing/displacement answers and requested help.                                                                                                                      |
| needsHazardAssessment / hazardRemovalRequired | Explicit reported professional/authority requirements; no inference from an image or positive survey alone.                                                           |
| ownsAffectedProperty                          | Owner relationship establishes true; no assessed-property interest establishes false; another kind of interest alone does not establish ownership.                    |
| seekingPropertyTaxRelief                      | Explicit intent to pursue/follow up.                                                                                                                                  |
| plansRepairOrRebuilding                       | Repair/rebuild vs not rebuilding; undecided stays unknown.                                                                                                            |
| permitsRequired                               | What the user reports being told; no invented permit rule.                                                                                                            |

Started work and explicit recorded milestones are merged with previous progress.
Unrelated edits and unknown answers do not erase prior progress. An explicit
correction to a milestone (for example, replacements have not arrived) corrects
that milestone. Denied, appealing, or unknown applications never cause completion.
Program-level records do not collapse into a single approval or funds-received flag.

The engine currently contains **illustrative draft planning rules**. It still
requires its existing reviewed evidence groups and named milestone for completion.
A claim/tax submission milestone is displayed as “Submission recorded,” not as
completion of the entire claim or tax process. The map separately highlights user-
reported waiting, requests, deadlines, authority restrictions and outstanding
approvals. The diagram's display-only nodes never establish occupancy clearance.

## Document review

The intake reuses `ImagePicker`, `prepareCapture`, the existing image-analysis API,
and the existing result parsers. `analyzeCapture` is shared with the standalone
capture workspace. The ten labels route through its existing ID / utility bill /
other-document transcription modes, or damage-photo review.

Supported formats remain JPEG, PNG and WebP photos, including camera capture.
PDF and HEIC conversion is still required by the existing uploader. Uploaded
images are stored privately. Full extracted text is temporary; only deliberately
saved name/address/date/scope fields are retained in intake. No SSN, banking or ID
number field is introduced. Users are asked to redact those identifiers.

States remain independent:

1. Uploaded: a private image exists.
2. User confirmed: the household checked the information, scope and differences.
3. Recipient acceptance: an identified recipient accepted/rejected it, is reviewing
   it, or acceptance is unknown. User confirmation never sets recipient acceptance.

The schema's evidence `review: ACCEPTED` means human review, not agency acceptance.
Only scoped, user-confirmed documents with resolved differences can satisfy this
review flag. A utility bill for current accommodation cannot prove the affected
address. An ID upload stays `IDENTITY_RECORD`, not `REPLACEMENT_ID`. Uploads do not
create progress milestones. Addresses, names, wildfire dates and scope conflicts
are shown for correction or explanation. Issue dates are not compared to a
wildfire date as though they described the same event.

## Persistence and access

The `DB` D1 binding stores case snapshots and optimistic revision numbers. The
`DOCUMENTS` R2 binding stores images under the household's private key prefix.
`db/schema.ts` and `drizzle/0000_intake.sql` define the table. Runtime initialization
uses a prepared, idempotent CREATE statement.

An opaque, HttpOnly, SameSite=Strict cookie identifies an anonymous household;
only its SHA-256 hash is stored as the lookup key. A one-year cookie resumes that
household in the same browser. HTTPS uses Secure cookies. There is no account-
based cross-device recovery; clearing the cookie removes this browser's access.
No household ID or image key supplied in a URL can grant access to another case.

Writes require same-origin requests. Optimistic revisions reject stale-tab writes
instead of silently overwriting them. The client serializes draft and document
updates, reports save failures, and warns on closing an unsaved draft. Saved
answers stay server-side rather than treating browser storage as the database.

## Validation

`tests/intake.test.mjs` covers conditional visibility, unknown handling, independent
assistance, progress corrections, document states and scope, conflicts, denial,
waiting/request display, persistence, stale revisions, household/image isolation,
and cross-origin writes. Existing engine and extraction tests remain in use.

## Wiping a household

Profile → Wipe user data opens a confirmation dialog. Confirming sends a
same-origin `DELETE /api/intake` using the existing household session cookie.
The server marks the record as deleting with a revision check, blocks further
reads and saves, removes each recorded image, deletes the household row, and
expires the cookie. A full navigation to Dashboard starts a fresh household.
An old session cannot recreate its deleted record. This removes this browser
session's household data, not other households or records held by outside
organizations. No data is deleted just by opening the menu or dialog.

If storage removal fails, the locked record remains available only to deletion
retries, so the user can finish the wipe without losing the image references.
Concurrent uploads that lose their revision check remove their own image.
