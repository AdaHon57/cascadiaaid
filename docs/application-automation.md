# Application automation

All 21 roadmap nodes have an explicit plan in `data/journey-automation.ts`:

| Nodes                                        | Work                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Temporary housing; stable housing            | Discover local intake and submit an accommodation or housing request.                                                    |
| Damage; occupancy; available evidence        | Prepare documents inside the app; these do not themselves have an external application.                                  |
| Identity replacement                         | Find the issuer for the requested document and complete its replacement process.                                         |
| Insurance claim; claim outcome               | Find the named insurer; file an initial claim or follow up on the existing one.                                          |
| Assistance; application                      | Discover the selected program and complete its intake/application.                                                       |
| Review; appeal; funds                        | Work with the existing case and decision, avoiding duplicate applications.                                               |
| Hazards; cleanup                             | Request professional services or enroll in a local program.                                                              |
| Permits; rebuilding; final property approval | Submit permit, assistance/estimate, or inspection requests. Physical work and approvals remain outside the AI’s control. |
| Tax relief; determination; adjustment/refund | Find the local assessor and submit or follow up on the existing request.                                                 |

## What is implemented

The site creates a household-owned job before contacting the automation service. The Node service researches the current official process using live web search. It asks for a missing jurisdiction, program, provider, or document choice instead of guessing. The person sees and authorizes the exact destination before the browser enters data there.

The browser agent observes form controls and current values, proposes one action at a time, fills confirmed answers, selects choices, uploads selected reviewed JPEG records, and clicks submission controls. It has no arbitrary code-execution tool. Literal confirmation text, reference, source URL, and time are saved to the household’s existing D1 record. A submission receipt only records delivery; it does not mark recovery goals achieved.

Three document-preparation nodes use the existing AI draft workflow. Eighteen external-action nodes use the shared browser runner. This is a general automation engine, **not 18 independently certified agency integrations**. Only a controlled form has been tested end to end; real portals require compatibility testing before operational use.

## Run locally

1. Install dependencies with `npm install` and the browser with `npx playwright install chromium`.
2. Set `OPENAI_API_KEY`, `OPENAI_AUTOMATION_MODEL` (or the existing `OPENAI_SUPPORT_MODEL`), `AUTOMATION_SERVICE_TOKEN`, and `AUTOMATION_SERVICE_URL` in ignored `.env.local`. The model must support Responses structured outputs and web search. Generate a random token of at least 32 characters. The example local URL is `http://127.0.0.1:4318`.
3. Run `npm run automation` and `npm run dev` in separate terminals. The automation process reads `.env.local` at startup; restart it after configuration or code changes.
4. Use a confirmed real household. Randomized/sample records and sample documents are rejected for real submissions.
5. In Dashboard or Applications, open a relevant step and choose **Let AI handle this**. Authorize the discovered recipient. The app advances the job while that step is open. Leaving the step pauses further requests; reopening resumes it.

The browser opens on the machine running `npm run automation` when `AUTOMATION_HEADLESS=false`. Complete login, identity verification, CAPTCHA, required personal signature, certification, or payment directly in that browser. Then use the continue control in the app. A separately opened browser tab does not share the automation session. Headless mode cannot offer this local handoff and returns the manual next action instead.

## Deployment

The site remains a Cloudflare Worker. Chromium runs in a separate Node service; Sites does not provision that service. Deploy the service on a trusted isolated machine/container with a writable persistent `AUTOMATION_JOB_DIRECTORY`, then configure the site's hosted `AUTOMATION_SERVICE_URL` with its HTTPS origin and the same `AUTOMATION_SERVICE_TOKEN`. A local loopback URL will not connect a hosted site to a user's computer. Missing configuration leaves AI handling unavailable rather than simulating success.

Use one service instance per job directory; active browser sessions and request serialization belong to that process. Put the service behind authenticated TLS and an outbound network policy that denies private, loopback, link-local, and metadata networks. In-code URL/DNS checks supplement that policy; they are not a network sandbox and do not eliminate DNS-rebinding risk. Origins require authorization, third-party resources are blocked until authorized, service workers and WebSockets are disabled, and browser contexts are isolated per job. Some complex portals will not work under these restrictions.

Job copies are encrypted on disk with a key derived from the service token, and writes are atomic. Keep that token stable while jobs exist. Household data deletion also erases the service's copied facts and documents. The service must be reachable to complete that deletion. Replacing an active household with randomized/demo data requires wiping it first, so copied records are not orphaned.

Jobs are bounded to 80 actions and one hour. A submission attempt is persisted before clicking; a crash or ambiguous result cannot automatically repeat it. A service restart marks unfinished jobs uncertain. The user must check the receiving organization, rather than interpreting an error as proof that no request was sent. Jobs do not automatically restart. Confirmation evidence is taken from the receiving page, not the model's narrative.

## Limits

- No universal government submission API is assumed. Agency accounts, identity checks, signatures, sworn statements, paid transactions, loans, contracts, and professional certifications remain human actions.
- Phone, postal, in-person, signed-PDF, inaccessible, or unsupported browser processes return the specific manual next step. PDF form filling and postal delivery are not implemented.
- The AI cannot arrange an actual housing placement, complete cleanup, issue a permit, approve occupancy, or deliver a tax refund merely by submitting a request.
- Uploads currently use reviewed JPEGs from the existing intake system, up to 16 MB per job. Portals requiring other file types may need manual completion.
- The recipient is discovered from current sources but is still shown to the user for authorization. Discovery is not an eligibility determination.

## Verification and references

Automated tests cover all-node plan coverage, rejection of sample households, URL restrictions, supported answers, idempotent job creation, encrypted copies, restart behavior, deletion, household merges, personal-action handoff, and a real browser filling/uploading/submitting a controlled form. A separate live-model check verifies the model-to-browser loop on an intercepted synthetic form, without sending a real application.

Integration references: [OpenAI computer use](https://developers.openai.com/api/docs/guides/tools-computer-use), [function calling](https://developers.openai.com/api/docs/guides/function-calling), and [Playwright browser contexts](https://playwright.dev/docs/api/class-browsercontext). Official discovery starting points are maintained in `data/journey-connections.ts`.
