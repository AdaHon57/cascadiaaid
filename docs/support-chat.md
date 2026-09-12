# Continual support chat

“Ask Cascadia” is mounted once in `AppShell`, so a conversation stays available
when navigating between pages. The panel supports follow-up questions, source
links, suggested questions, minimizing, keyboard submission (Shift+Enter adds a
line), request retry, and New chat. It is a nonmodal dialog: the page remains
usable. Escape minimizes it and returns focus to the launcher.

## How retrieval-augmented generation works

1. `data/support-knowledge.ts` contains curated site guidance and imports the
   existing illustrative recovery-node definitions. It also contains reviewed
   Washington DOL replacement guidance for ID cards and driver licenses, linked
   directly to the official pages and dated with `reviewedAt`. `/support` renders
   these records and links. This is a curated snapshot, not live web retrieval.
2. `lib/support-retrieval.ts` ranks matching passages with BM25, a keyword search
   formula that gives uncommon matching words more weight. Small synonym groups
   help bridge everyday wording. Brief referential follow-ups use the previous
   user question; new subjects do not inherit old topics. At most four passages
   are selected. There is no vector database or external crawler.
3. `lib/support-chat.ts` sends those passages, the question, and up to eight recent
   messages to the Responses API. Structured output asks for an answer plus
   source IDs. The server rejects unknown or missing citations, refusals,
   incomplete output, and answers longer than 600 characters. Instructions ask
   for the next action first, usually 2–3 sentences and at most 70 words, with
   one or two relevant citations. All links come from the local
   source registry, never from generated URLs. The UI renders plain text.
4. If no source matches, the assistant acknowledges the gap. If the model is
   unavailable or not configured, it displays the best match's concise reviewed
   summary with its source link and a source-summary notice.
   An insufficient-evidence model response is replaced with the no-match answer.

The structured output format follows the official
[Responses API guidance](https://developers.openai.com/api/docs/guides/structured-outputs).
Citation validation checks source identity, not whether every generated claim is
entailed by its sources. Only records marked `official` contain reviewed agency
guidance, limited to their stated topic and jurisdiction. Workflow examples are
not agency requirements. Washington guidance must not be applied to other states
or document types. Do not add policy claims without authoritative source review. Add or
edit source records and deploy to update the library; chat messages never train
or automatically modify it.

## Configuration and routes

Set `OPENAI_API_KEY` and `OPENAI_SUPPORT_MODEL` on the server to enable generation.
The model must support structured Responses API output. An existing image-model
setting is not automatically reused: support generation is an explicit runtime
choice because this endpoint is available to site visitors. Leave the support
model blank to use retrieval and excerpts without paid model calls.

`POST /api/support-chat` accepts `{ message, history }`. The Next route and the
Cloudflare Worker both use the same handler. The Worker reads runtime bindings
and falls back to local process environment values. No key is sent to the client.

## Conversation lifetime and privacy

The most recent 24 messages live in this tab's `sessionStorage`, surviving page
navigation and reloads. This is explicitly device-local state, not a server-side
chat database or cross-device history. The API receives at most 12 prior messages
and forwards at most eight to the model. Closing a tab normally ends this session;
browser session restoration may restore it. New chat clears the transcript and
cancels pending work. Wipe user data clears this tab's transcript after successful
household deletion. If browser storage is unavailable, the panel reports that
reloads may lose the conversation. New chat does not erase provider records.

Only text deliberately entered in chat is sent. The assistant does not fetch
household answers, uploaded documents, or application records. It cannot modify
records or contact organizations. Requests use `store: false`; provider retention
policies still apply. There is no automatic transcript logging in this code.

## Limits and verification

Requests require the same origin, JSON, a body no larger than 64,000 bytes, a
question no longer than 2,000 characters, and validated user/assistant roles.
The handler allows three concurrent requests and 30 requests per minute per
worker. Provider calls time out after 25 seconds and fall back to excerpts;
client requests time out after 35 seconds. Responses are not cached.

The in-memory budget is not a distributed quota, user authentication, or strong
abuse prevention. Non-browser clients can forge Origin. Configure a deployment
edge quota and provider spending limits before enabling generation at significant
public traffic. A shared worker budget can also temporarily limit unrelated users.

`tests/support-chat.test.mjs` covers retrieval, topic continuity, unrelated queries,
input limits, forged roles, same-origin checks, provider payloads, source validation,
fallbacks, lost-ID and license retrieval, concise response limits, trusted external
citations, rate limits, and safe session restoration. API tests mock the provider;
they do not establish real-provider answer quality or perform browser UI testing.
