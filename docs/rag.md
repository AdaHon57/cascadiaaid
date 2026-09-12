# Recovery question answering (RAG)

The RAG module answers a household's recovery question from eight approved government web pages
and returns the pages it used. It can also take the user's current workflow step as context.
It does not calculate statuses, decide eligibility, or change any recovery data. The status engine
and priority engine are unchanged.

## One function, one endpoint

```ts
import { askRecoveryQuestion } from "@/lib/rag";
import { recoveryNodes } from "@/data/recovery-nodes";
import { recoveryEdges } from "@/data/recovery-edges";

const result = await askRecoveryQuestion(
  {
    question: "What should I keep track of for this step?",
    context: { nodeId: "insurance-claim", status: "READY" }, // optional
  },
  { workflow: { nodes: recoveryNodes, edges: recoveryEdges } }, // optional
);
```

```http
POST /api/rag/ask
Content-Type: application/json

{ "question": "What should I keep track of for this step?",
  "context": { "nodeId": "insurance-claim", "status": "READY" } }
```

Both return:

```json
{
  "status": "answered",
  "answer": "Keep receipts for emergency repairs … [1]",
  "sources": [
    {
      "title": "Steps to take after home damage or a loss",
      "url": "https://www.insurance.wa.gov/…/steps-take-after-home-damage-or-loss",
      "chunkIds": ["oic-steps-after-home-damage:6de09d95e742"]
    }
  ],
  "warnings": []
}
```

| `status`    | Meaning                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `answered`  | The approved pages support the answer.                                    |
| `partial`   | Only part of the question is covered; the answer says what is missing.    |
| `not_found` | The approved pages do not contain enough information. `sources` is empty. |

Inline markers such as `[1]` refer to positions in `sources`. A page is cited only when the answer
used it, and each page appears once. `warnings` lists non-fatal problems, such as a page that
failed during the last index build.

Errors throw `RagError` (`code`, `httpStatus`, `publicMessage`). The endpoint returns
`{ "error": { "code", "message" } }`:

| Situation                                       | HTTP | `code`                          |
| ----------------------------------------------- | ---- | ------------------------------- |
| Body is not JSON                                | 400  | `INVALID_JSON`                  |
| Missing, empty, or longer than 1,000 characters | 400  | `INVALID_QUESTION`              |
| Malformed context (unknown status, wrong types) | 400  | `INVALID_CONTEXT`               |
| No or rejected OpenAI key                       | 500  | `MODEL_NOT_CONFIGURED`          |
| OpenAI rate limit                               | 503  | `MODEL_RATE_LIMITED`            |
| Model refusal, API error, or malformed output   | 502  | `MODEL_REFUSED` / `MODEL_ERROR` |
| Not enough evidence in the approved pages       | 200  | response `status: "not_found"`  |

## Workflow context

Every field is optional:

| Field                          | Meaning                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `nodeId`                       | Recovery node the user is asking from, e.g. `insurance-claim`.                               |
| `nodeTitle`, `nodeDescription` | Filled in from `recoveryNodes` when only `nodeId` is given.                                  |
| `requiredEvidence`             | Evidence labels; filled in from `recoveryNodes` when omitted.                                |
| `status`                       | The node's status from `calculateRecoveryNodeStates`, if the caller has it.                  |
| `prerequisites`, `dependents`  | `{ nodeId, title?, status?, edgeType? }` lists; filled in from `recoveryEdges` when omitted. |

Context is used in two ways:

1. **Retrieval:** the node title and description are added to the search at half weight, so vague
   questions such as "What do I need for this?" find the right pages.
2. **Prompt:** the model is told which step the user is on, its status, and its neighbouring steps.

Context is app data, not a source. The model is instructed never to cite it or present its
descriptions, evidence labels, statuses, or relationships as official requirements. The workflow
definitions are illustrative, so this matters. The module never calls or changes the status
engine: statuses are only included when the caller passes them.

## How it works

```
npm run rag:index (offline)                        askRecoveryQuestion / POST /api/rag/ask
┌───────────────────────────────────────┐          ┌─────────────────────────────────────────┐
│ sources.ts  exact URL allowlist       │          │ validate question + context             │
│ ingest/scrape.ts  fetch, clean HTML   │          │ retrieve.ts  BM25 + OpenAI embeddings   │
│ ingest/chunk.ts   heading-aware chunks│   ──▶    │ answer.ts    prompt with ONLY retrieved │
│ embeddings.ts     OpenAI vectors      │  bundled │              passages (+ context)       │
│ → data/rag-index.json                 │   JSON   │ llm.ts       OpenAI structured output   │
└───────────────────────────────────────┘          │ verify citations → { answer, sources }  │
                                                   └─────────────────────────────────────────┘
```

**Ingestion** (`npm run rag:index`) downloads exactly the eight URLs in `lib/rag/sources.ts` and
never follows links. For each page it:

- keeps the main content and headings;
- removes scripts, navigation, breadcrumbs, cookie notices, forms, and footers;
- splits the text into overlapping chunks, each with `id`, `content`, `sourceUrl`, `sourceTitle`,
  `heading`, and `fetchedAt`.

Chunk IDs are content hashes, so unchanged text keeps its ID. If any page fails, the script prints
which page failed and why, exits with code 1, and leaves the existing index untouched.
`--allow-partial` writes the index anyway: failed pages keep their previous chunks and are reported
in `warnings`.

**Index:** `data/rag-index.json` is committed and imported as a JSON module. The app runs as a
Cloudflare Worker with no filesystem at request time, so pages are never scraped per request.
Rebuild the index and redeploy when the government pages change.

**Retrieval** combines BM25 keyword search with OpenAI embedding search using rank fusion. It takes
at most three passages per page and ignores any chunk whose URL is no longer allowlisted. Without
an API key, or if the query embedding fails, it falls back to keyword search and adds a warning.

**Answering** sends OpenAI only the question, the retrieved passages with their metadata, and any
context. The system prompt requires the model to:

- answer only from the passages, not from model memory;
- not invent details or infer eligibility;
- say when the answer is not in the approved sources, and mark partial answers;
- cite the passages it used.

The response must match a strict JSON schema. The module then removes citations to passages that
were not supplied, turns an uncited answer into `not_found`, and deduplicates sources.

## Files

- `lib/rag/index.ts` — public exports: `askRecoveryQuestion`, `RagError`, and types.
- `lib/rag/sources.ts` — **the source allowlist** and per-page cleanup rules.
- `lib/rag/answer.ts` — question validation, prompt, citation checks.
- `lib/rag/context.ts` — context validation, enrichment from workflow definitions, rendering.
- `lib/rag/retrieve.ts` — BM25, vector search, fusion, allowlist enforcement.
- `lib/rag/llm.ts`, `embeddings.ts`, `openai-client.ts` — all OpenAI-specific code, behind the
  `AnswerModel` and `EmbeddingProvider` interfaces.
- `lib/rag/config.ts`, `errors.ts`, `types.ts`, `index-format.ts`, `bundled-index.ts` — settings,
  error codes, shared types, and index validation and loading.
- `lib/rag/ingest/` — Node-only scraping, chunking, and index building, never imported by the app.
- `app/api/rag/ask/route.ts` — the HTTP endpoint.
- `scripts/build-rag-index.ts`, `scripts/ask-rag.ts`, `scripts/eval-rag.ts` — CLI tools.
- `data/rag-index.json` — the built index.
- `tests/rag-*.test.mjs` — offline tests: extraction, chunking, retrieval, context, citations,
  and single-source, multi-source, and unsupported questions using a fake model.

## Commands

```bash
npm run rag:index                  # rebuild data/rag-index.json from the eight pages
npm run rag:index -- --allow-partial
npm run rag:ask -- "Can I replace my driver's license for free?"
npm run rag:ask -- "What do I need for this step?" --node=insurance-claim --status=READY --debug
npm run rag:eval                   # live end-to-end check (needs OPENAI_API_KEY)
npm test                           # offline tests, no key needed
```

## Environment variables

Set these in `.env.local` for local work, and as secrets in the hosting environment for deployment.
Never expose them to the browser.

| Variable                    | Required | Default                         | Purpose                                                |
| --------------------------- | -------- | ------------------------------- | ------------------------------------------------------ |
| `OPENAI_API_KEY`            | Yes      | —                               | Answers and embeddings.                                |
| `RAG_ANSWER_MODEL`          | No       | `OPENAI_MODEL` or `gpt-4o-mini` | Chat model for answers.                                |
| `RAG_ANSWER_TEMPERATURE`    | No       | `0`                             | `none` for models that reject `temperature`.           |
| `RAG_EMBEDDING_PROVIDER`    | No       | `auto`                          | `auto` / `openai` / `none`.                            |
| `RAG_EMBEDDING_MODEL`       | No       | `text-embedding-3-small`        | Must match the index; rebuild after changing.          |
| `RAG_EMBEDDING_DIMENSIONS`  | No       | `512`                           | Vector size used when building; recorded in the index. |
| `RAG_TOP_K`                 | No       | `6`                             | Passages sent to the model.                            |
| `RAG_MAX_CHUNKS_PER_SOURCE` | No       | `3`                             | Per-page passage cap.                                  |

## Changing the approved pages

1. Edit `APPROVED_SOURCES` in `lib/rag/sources.ts`. A removed page stops being used immediately.
2. Run `npm run rag:index`.
3. Check the chunks in `data/rag-index.json`. If a page layout picks up junk, add
   `extraction.removeSelectors` or `dropSectionHeadings` for that page and rebuild.
4. Commit the updated index and redeploy.
