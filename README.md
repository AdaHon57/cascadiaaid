# Cascadia Aid

A Next.js and TypeScript foundation for a hackathon project. It includes a recovery-node model, static demonstration nodes, a status engine, an explainable priority engine, and a recovery question-answering module (RAG) grounded in approved government pages, alongside an application shell and placeholder routes.

## Requirements

- Node.js 22.13 or newer
- npm

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm run format:check
npm run lint
npm test
npm run build
```

Run `npm run format` to apply formatting.

## Project structure

- `app/` — App Router pages plus global loading and error boundaries
- `components/layout/` — shared application chrome
- `components/ui/` — reusable, accessible interface primitives
- `types/` — shared domain shapes, including recovery nodes and priority inputs/results
- `lib/` — recovery status calculation plus priority calculation and ranking
- `lib/rag/` — recovery question answering from approved sources, with optional workflow/node context
- `data/` — separate workflow definitions, illustrative edges, sample case facts, and calculated statuses
- `tests/` — status engine, priority engine, and RAG checks
- `scripts/` — RAG index build, question, and live evaluation commands
- `app/api/rag/ask/` — `POST /api/rag/ask` endpoint
- `docs/priority-engine.md` — [scoring explanation and usage](docs/priority-engine.md)
- `docs/recovery-graph.md` — [recovery definitions, edges, and runtime state](docs/recovery-graph.md)
- `docs/recovery-status-engine.md` — [status rules, inputs, and usage](docs/recovery-status-engine.md)
- `docs/rag.md` — [question answering: API, context, sources, and index rebuilds](docs/rag.md)
- `api/` — empty extension point

## Environment variables

`OPENAI_API_KEY` is required for recovery question answering (`lib/rag`). Optional RAG settings are listed in `.env.example` and [docs/rag.md](docs/rag.md). Keep secret values out of committed files.

## Deployment

1. Run `npm run lint` and `npm run build`.
2. Configure a Node-compatible Next.js environment, or use the included Sites configuration and build output.
3. Add production environment variables in the hosting environment, not in committed files.
4. Point the domain's DNS records at the values provided by the hosting environment.
5. Verify HTTPS and each route after DNS propagation completes.

## Scope boundary

Recovery workflow definitions, dependency edges, and case facts are separate data collections. The status engine calculates all five statuses from explicit applicability/progress facts and direct prerequisites. Relationships and sample facts remain illustrative; they are not defaults for real households. Eligibility, completion verification, and case persistence are not implemented. The priority engine scores explicit inputs using fixed weights and ranks supplied candidates. It does not determine readiness or eligibility, change node statuses, traverse dependencies, or infer priority factors. The RAG module answers questions only from the approved pages in `lib/rag/sources.ts` and cites them; optional workflow context helps it understand the question but is never treated as a source, and it does not calculate statuses or eligibility. Intake logic, document processing, and priority UI are not implemented.
