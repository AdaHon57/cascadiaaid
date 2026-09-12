# Cascadia Aid

A Next.js and TypeScript foundation for a hackathon project. It includes a recovery-node model, static demonstration nodes, a status engine, and an explainable priority engine alongside an application shell and placeholder routes.

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
- `data/` — separate workflow definitions, illustrative edges, sample case facts, and calculated statuses
- `tests/` — status and priority engine checks
- `docs/priority-engine.md` — [scoring explanation and usage](docs/priority-engine.md)
- `docs/recovery-graph.md` — [recovery definitions, edges, and runtime state](docs/recovery-graph.md)
- `docs/recovery-status-engine.md` — [status rules, inputs, and usage](docs/recovery-status-engine.md)
- `api/` — empty extension point

## Environment variables

No environment variables are required. When a variable is introduced, document its name and purpose in `.env.example` without committing its secret value.

## Deployment

1. Run `npm run lint` and `npm run build`.
2. Configure a Node-compatible Next.js environment, or use the included Sites configuration and build output.
3. Add production environment variables in the hosting environment, not in committed files.
4. Point the domain's DNS records at the values provided by the hosting environment.
5. Verify HTTPS and each route after DNS propagation completes.

## Scope boundary

Recovery workflow definitions, dependency edges, and case facts are separate data collections. The status engine calculates all five statuses from explicit applicability/progress facts and direct prerequisites. Relationships and sample facts remain illustrative; they are not defaults for real households. Eligibility, completion verification, and case persistence are not implemented. The priority engine scores explicit inputs using fixed weights and ranks supplied candidates. It does not determine readiness or eligibility, change node statuses, traverse dependencies, or infer priority factors. Intake logic, document processing, AI, retrieval, and priority UI are not implemented.
