# Image capture and analysis

Cascadia Aid now has two tools at `/documents`: turn a document photo into editable text, or produce a draft of visible damage observations from a house photo. Both use the same OpenAI API credential on the server. These tools do not change recovery-node facts, statuses, dependencies, or priority scores.

An image is a grid of colored pixels. Text extraction asks a vision model to read the letter shapes in those pixels. House-photo analysis asks that model to describe visible features. Neither operation proves that its interpretation is correct: users review document text, and a qualified professional assesses property condition.

The flow is:

1. **Capture:** choose an image, or open the camera on a supported phone. Desktop browsers can show a file picker instead.
2. **Prepare and preview:** the browser opens the image and redraws its pixels as a JPEG. This applies the browser's orientation handling and drops the original file's embedded metadata. The original file is not overwritten. This does not remove personal details visible in the picture.
3. **Submit:** the user enters an access code, agrees to send the selected image to OpenAI, and clicks Extract text or Analyze house photo. Choosing a file alone does not send it for analysis.
4. **Analyze:** a server endpoint checks the request, adds the private API key, and asks OpenAI for a result with a specific structure. A schema defines that structure: which fields must exist and which values are allowed. The server checks the returned fields again before displaying them.
5. **Review and download:** users correct document text and download a `.txt` file. Property reports remain AI drafts, with their limitations included in the download.

Images and results are temporary page state. They are discarded when users clear them, change tools, choose another image, or leave the page. There is no account storage, document history, database write, or automatic evidence verification. A downloaded file is saved by the user's browser on their device.

## Setup

The developer configuration belongs in ignored `.env.local`, copied from `.env.example`. Production configuration belongs in the hosting environment's runtime settings. The same three names apply in both places:

| Variable                     | Meaning                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`             | The private credential that authorizes and bills both document and house-photo requests. It stays on the server.                                             |
| `OPENAI_VISION_MODEL`        | The API model used for both tools. The example uses `gpt-4.1-mini`; the selected model must support image input and structured Responses API output.         |
| `IMAGE_ANALYSIS_ACCESS_CODE` | A separate random code for authorized testers, 24–128 printable non-space ASCII characters. Users enter this in the app; they never enter the API key there. |

The access code protects the paid endpoint while the app has no user sign-in. It is a shared tester credential, not a household identity system. Keep it private and rotate it if disclosed. The API also limits each running server instance to two concurrent requests and ten accepted requests per minute. Those counters reset when an instance restarts and are not a global spending limit. Configure an appropriate usage budget for the API project before wider use.

An ignored `.env.local` has been prepared for this implementation, with a generated access code and model setting. Add your API key to that file locally, then restart `npm run dev`. The secret values are not committed or sent in chat. Open `/documents` and enter the generated access code from the local file.

If copying this repository elsewhere, create the file with `cp .env.example .env.local`. Generate your own access code with `node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))'`, put it in the file, and add your API key.

`GET /api/image-analysis` reports only whether the three settings are present and well formed. It does not check whether the key is valid, whether billing is enabled, or whether the account can use the selected model. Missing configuration disables submission and shows a setup message instead of a sample result.

## Request and result fields

`POST /api/image-analysis` accepts a JSON object. JSON is a text format for named values; it is how the browser sends the image request to the server.

| Request field  | Meaning                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode`         | `document` requests transcription; `house` requests visible-damage observations.                                |
| `documentKind` | For document mode: `ID`, `UTILITY_BILL`, or `OTHER`. This is the user's label, not a verified classification.   |
| `image`        | The prepared JPEG encoded as a data URL: the image bytes represented as text. External image URLs are rejected. |
| `consent`      | Must be `true`, recording agreement to submit this image for processing.                                        |

The request also sends the tester access code in the `X-Analysis-Code` header. Headers are request metadata; the server reads the code there without putting it in a URL. The browser sends its origin, which must match the app's origin. The server sends its own separate API credential only to OpenAI's fixed Responses API endpoint.

| Document result field | Meaning                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                | A literal transcription draft, up to 24,000 characters. The model is instructed to mark uncertain spans `[unreadable]` rather than guess identifiers. Users can edit this text. |
| `imageQuality`        | `CLEAR`, `LIMITED`, or `UNREADABLE`: the model's description of readability, not proof of accuracy or authenticity. An unreadable result must have empty text.                  |
| `limitations`         | Up to eight notes about problems such as glare, cropping, blur, uncertain characters, or incomplete transcription.                                                              |

The “I compared this text” checkbox records a local review acknowledgement. Editing the text resets it. It changes the download filename from draft to reviewed; it does not verify identity, occupancy, or any recovery requirement. Names and identifiers remain plain text, not automatically populated intake fields.

| House-photo result field     | Meaning                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `subject`                    | `BUILDING`, `OTHER`, or `UNCLEAR`: whether the image shows a building.                                                                          |
| `imageQuality`               | `CLEAR`, `LIMITED`, or `UNUSABLE`: whether this view supports visual observations.                                                              |
| `summary`                    | A short description of the visible situation.                                                                                                   |
| `observations`               | Up to twelve individual visible features that may represent damage. Other subjects or unusable images cannot have observations.                 |
| `observations[].location`    | Where in the visible building the feature appears, such as the roof edge.                                                                       |
| `observations[].description` | The concrete visual evidence, such as a visible gap in roof covering.                                                                           |
| `observations[].certainty`   | `LOW`, `MEDIUM`, or `HIGH`: the model's qualitative certainty about seeing that feature. This is not a calibrated probability or safety rating. |
| `limitations`                | One to eight statements about what the photo does not establish.                                                                                |

The house-photo UI and downloaded report always include a fixed limitation: this is not a determination of structural safety, habitability, hidden damage, hazardous materials, cost, or aid eligibility. A photo with no discernible damage does not establish that there is no damage. Prompts constrain the model's task, but they cannot guarantee factual correctness or replace professional inspection.

## Files

| File                                         | Role in simple terms                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/image-capture.ts`                     | Reusable TypeScript definitions for document kinds, document text results, and house-photo observations/results. Types tell other code which fields to expect.                   |
| `components/documents/image-picker.tsx`      | Camera and file-picker buttons, with labels and supported-format guidance.                                                                                                       |
| `components/documents/capture-workspace.tsx` | The interactive screen: tool selection, preview, consent, access code, progress, cancellation, errors, editable text, and downloads.                                             |
| `lib/image-capture.ts`                       | Checks selected file type/size, prepares the JPEG preview, releases temporary image URLs, and downloads text.                                                                    |
| `lib/image-analysis.ts`                      | Server-side request validation, separate document/damage instructions and schemas, OpenAI call, timeout, concurrency control, and error handling.                                |
| `lib/document-text-result.ts`                | Checks document results at runtime and returns only supported fields.                                                                                                            |
| `lib/damage-photo-result.ts`                 | Checks house-photo results at runtime and contains the fixed photo-assessment limitation shown in the UI and report.                                                             |
| `app/api/image-analysis/route.ts`            | The API endpoint. Reads private server configuration and connects HTTP requests to the analysis handler.                                                                         |
| `app/documents/page.tsx`                     | Mounts the capture workspace in the existing Documents route.                                                                                                                    |
| `components/layout/app-shell.tsx`            | Updates the shared shell's old “no product logic” wording now that tools exist.                                                                                                  |
| `.env.example`                               | Documents configuration names with empty secret values.                                                                                                                          |
| `.env.local`                                 | Ignored local settings, including the private API key once supplied. It must not be committed.                                                                                   |
| `tests/image-capture.test.mjs`               | Tests image validation/preparation, result validation, request authorization, both OpenAI request formats, malformed responses, and failures using simulated provider responses. |
| `README.md`                                  | Links this guide and describes the expanded app scope and setup.                                                                                                                 |
| `docs/image-capture.md`                      | This explanation and the limits of the implementation.                                                                                                                           |

## Limits and validation

The picker accepts one JPEG, PNG, or WebP at a time, up to 15 MB. Images over 50 megapixels are rejected after browser decoding. Preparation reduces the longest side to at most 3,200 pixels for documents or 2,048 for house photos. The server accepts a prepared JPEG of at most 4 MB and reads at most 6 MB of request data, even without a Content-Length header. It verifies the JPEG signature; the image service performs full decoding. HEIC, PDFs, multi-page processing, persistent storage, and automatic form filling are not implemented.

Provider requests time out after 45 seconds; the browser waits up to 55 seconds. Cancel prevents a late result from replacing current work and aborts the browser request. A request already sent to OpenAI may still be processed or billed. The server rejects refusals, incomplete responses, malformed output, and contradictory result fields instead of presenting them as successful analysis.

Cascadia Aid does not intentionally persist or log the image payload, extracted text, report, access code, or API key. Responses have `Cache-Control: no-store`. Requests use `store: false`, which disables Responses API response storage; it is not a promise that the provider retains no data. Provider handling is governed by the account's data controls and policies. See the [OpenAI data controls documentation](https://developers.openai.com/api/docs/guides/your-data).

The integration follows the official [image-input documentation](https://developers.openai.com/api/docs/guides/images-vision) and [structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Automated tests use simulated OpenAI responses and do not measure real transcription or damage-recognition accuracy.

Live connection checks on September 12, 2026 passed through the local app using the configured OpenAI credential. A synthetic utility bill returned all five expected fields exactly: customer name, address, account number, amount, and due date. A synthetic house drawing returned observations about its cracked window and roof opening, with an explicit limitation acknowledging that it was a drawing. Both requests returned HTTP 200. Separate requests confirmed rejection of an incorrect access code (401) and missing consent (400). These checks establish that the integration works; they do not measure accuracy on real documents or real property photos. Representative evaluation images are still needed for that validation. No personal documents were used for these checks.

For judges: “A resident photographs a document or property. Our server sends that image to a vision model using a private credential. Documents become editable text; property photos become visible-damage observations with explicit uncertainty. The user reviews the output, and the recovery graph remains separate from these unverified drafts.”
