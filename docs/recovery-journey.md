# Recovery journey implementation

The versioned journey model covers all 21 existing roadmap nodes. It is shared by
Dashboard, Roadmap, and Applications. It is a Spokane wildfire demonstration with
real local preparation and explicitly simulated external events, not a verified
eligibility or legal workflow.

## Shared task workspace

Dashboard keeps focused arrow navigation with three always-visible, goal-specific
steps. There is no details toggle. Applications uses the same steps:
prepare a draft, review and take the action, then confirm the outcome with evidence.
`data/journey-steps.ts` supplies concrete actions for all 21 goals. Draft editing
appears when preparing or reviewing a draft. Relevant reviewed documents are
selected automatically; the user can change them. Intake links open household
information or the document stage directly. Ratings, history, and grouped workspace
forms are no longer shown in the steps; saved data remains intact.
Switching steps warns about unsaved edits. The moving green arc follows the
current task, independent of the selected node. Roadmap contains only the map; node
selection highlights the node without opening a workspace. Demo controls, intake
prompts, and other supplementary panels must not be added to Roadmap.

Demo controls enable simulations and advance the demo clock. Loading either the
homeowner or renter scenario requires confirmation before replacing answers,
applications, and recovery progress; real uploads remain. All external events
are simulated and labeled. No agency delivery integration is claimed.

## Definitions, facts, and state

`data/journey-workflows.ts` defines each node's goal, relevant intake questions,
preparation evidence, narrower outcome evidence, packet type, and milestone-based
prerequisites. These are illustrative templates, not claims of agency policy.

`lib/recovery-journey.ts` reads `IntakeRecord.journey` (schema version 1). Older
households are projected into this optional model without destructive migration.
Existing uploads, answers, and progress remain intact. A legacy claim or tax
submission becomes a submission milestone, never a payment or final outcome.
The journey is persisted when its first command succeeds. No D1 SQL migration
is needed because the current storage is a versioned household JSON payload.

States distinguish ready, blocked, preparing, waiting, information requested,
denied, approved, partial, achieved, closed without achievement, and not
applicable. An approval or partial payment cannot silently complete a goal.
Closing a prerequisite without achieving it does not unlock its dependents.
Preparation is available while blocked; starting and completion are rejected.
Outcome evidence must be relevant, user-confirmed, and not rejected by a
recipient. Changing or rejecting referenced evidence prompts re-review.
Professional removal and final property approval require their respective
record types; a damage photo is not site clearance.

Each assistance application gets independent application, review, appeal, and
funds task IDs (`stage:applicationId`). Map badges aggregate these without
completing all programs when only one has an outcome.

Priority uses the existing eight fixed weights and editable baseline ratings.
Known dates add urgency (10 within one day or overdue, 8 within seven days,
4 within thirty days, otherwise 1); absent dates add zero. Unknown applicability
has uncertainty 8, known applicability 0. Elapsed external waiting adds one point
per three days, capped at 10. Skipping never changes facts or prerequisites.

## API contract

All paths are under `/api/intake` and use the existing HttpOnly household session.
Writes require the matching Origin and a current integer `revision`. Unknown
sessions, stale edits, and cross-origin writes are rejected.

- `PUT /journey`: `{ revision, operationId, kind, taskId?, ...fields }`.
  `operationId` is a unique client-generated identifier; replaying a successful
  operation returns the current record without repeating its effects.
- `answers`: partial validated intake answers with `confirm: true`.
- `application`: organization name, creating a separate tracked program.
- `ratings`: all eight numeric ratings (0–10), or `null` to restore automatic ratings. Saved ratings override automatic factors for that task; immediate housing safety retains its floor.
- `start`, `skip`, `restore`: update current work or deferral only.
- `notes`: working notes and `dueDate` in YYYY-MM-DD format (empty clears it).
- `prepare`: produces an editable packet from confirmed facts and usable evidence.
  With `assist: true`, `lib/journey-assistant.ts` asks the configured server AI to
  rewrite that draft. It receives only the prepared text, uses `store: false`, and
  cannot change the recipient, attachments, approval, or outcome. Configuration
  reuses `OPENAI_API_KEY` and `OPENAI_SUPPORT_MODEL`. Missing configuration,
  provider failure, refusal, truncation, or the concurrency limit falls back to
  the filled template, visibly labeled as automatic filling rather than AI writing.
  The final save still checks the original revision after generation.
- `edit-artifact`: exact `text`, `recipient`, and `documentIds`; creates a new
  version and invalidates approval of the previous version.
- `submit`: `artifactId` and `confirm: true`; requires simulation enabled,
  satisfied prerequisites, and reviewed valid attachments. Stores the exact
  approved packet snapshot and a visibly fictional receipt. Makes no network
  call to an outside organization.
- `response`: simulated `information`, `denied`, `approved`, or `partial` plus
  a note. Requires an existing submission (the task's or its prerequisite's).
- `outcome` / `close`: explanatory note, selected evidence IDs, and confirmation.
  Achievement requires relevant confirmed evidence; closure is separately labeled.
- `reopen`: correction note; removes the outcome and requests re-review.
- `demo-enable`, `demo-time`, `demo-evidence`: explicit fictional simulation controls.
- `POST /scenario`: confirmed owner/renter scenario replacement. Deterministic
  fixtures replace household answers and journey history, retaining real uploads.
- `GET /packet?task=...`: household-scoped PDF of the saved packet and selected
  JPEG attachments. PDF bytes are generated on demand from durable source data.
- `GET /calendar?task=...`: downloadable calendar reminder for the saved date.

PDFs embed the bundled OFL-licensed Noto Sans font, paginate text, attach original
UTF-8 packet text, and include selected image evidence. Unsupported glyphs in a
font fallback are represented by Unicode code points, not silently dropped.
Attachments exceeding 30 MB are rejected rather than silently omitted.

Document uploads retain reviewed text/observations only when saved by the user.
The existing consent-gated extraction service remains available; manual notes
and template-based packet preparation require no AI provider. Confirmed source
notes carry document references into prepared packets. AI-assisted drafts require
user review; the model can make mistakes. No automatic email/SMS
or real agency integration has been added.

The existing wipe endpoint deletes the household row, including journey history
and packet source text, and removes uploaded images. Downloaded copies are on the
user's device and are outside server storage.

## Validation

`tests/journey.test.mjs` covers node/evidence coverage, complete homeowner and renter
journeys, submissions versus outcomes, prerequisites, corrections, independent
programs, repeat approval protection, legacy migration, priority updates, Unicode
PDF pagination, and calendar escaping. Intake API tests cover revision conflicts,
idempotent submission replay, cross-household export isolation, and deletion.
A separate HTTP smoke journey exercised every homeowner goal on the running local
Worker, generated a real PDF, and deleted its isolated test household afterward.
PDF first/last pages were rendered and inspected under ignored `outputs/qa/`.

## Reference links checked September 12, 2026

- [Spokane County Oregon & Gray Road fire resources](https://www.spokanecounty.gov/6028/Oregon-Gray-Rd-Fire-Resources)
- [Washington 211 resource directory](https://search.wa211.org/)

These references identify resources; they do not validate the illustrative rules
or establish household eligibility, benefits, deadlines, or availability.
