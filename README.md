# Cascadia Aid

A Next.js and TypeScript hackathon project with a recovery-node model, illustrative workflow data, status calculation, priority scoring, and image capture for document transcription and visible property-damage observations.

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
- `lib/` — recovery engines, image preparation, OpenAI analysis, and result validation
- `data/` — separate workflow definitions, illustrative edges, sample case facts, and calculated statuses
- `tests/` — recovery engine and image-analysis checks
- `docs/image-capture.md` — [image capture, OpenAI setup, fields, and files](docs/image-capture.md)
- `docs/priority-engine.md` — [scoring explanation and usage](docs/priority-engine.md)
- `docs/recovery-graph.md` — [recovery definitions, edges, and runtime state](docs/recovery-graph.md)
- `docs/recovery-household-model.md` — [household fields, all ten rules, evidence, and file guide](docs/recovery-household-model.md)
- `docs/recovery-status-engine.md` — [status rules, inputs, and usage](docs/recovery-status-engine.md)
- `api/` — empty extension point

## Environment variables

Recovery engines need no credentials. Both image tools require `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, and a random `IMAGE_ANALYSIS_ACCESS_CODE` in ignored `.env.local` (or hosted runtime settings). See [.env.example](.env.example) and the [setup guide](docs/image-capture.md). The API key stays on the server; the separate access code protects the paid endpoint for authorized testers. Restart the development server after configuring it.

## Deployment

1. Run `npm run lint` and `npm run build`.
2. Configure a Node-compatible Next.js environment, or use the included Sites configuration and build output.
3. Add production environment variables in the hosting environment, not in committed files.
4. Point the domain's DNS records at the values provided by the hosting environment.
5. Verify HTTPS and each route after DNS propagation completes.

## Scope boundary

Recovery workflow definitions, dependency edges, rules, source references, and household facts are separate data collections. `calculateHouseholdRecovery(caseRecord)` derives applicability and completion from household answers, recorded milestones, and reviewed evidence, then calculates all five statuses with explanations. Required prerequisites block; recommendations do not. All ten rules and the nine preserved relationships remain illustrative; sample facts are not defaults for real households. No jurisdiction-specific policy has been verified. The priority engine scores explicit inputs using fixed weights and ranks supplied candidates without inferring factors or eligibility.

The Documents page captures one image at a time and sends it to OpenAI after explicit submission consent. It returns editable document text or a draft of visible house-damage observations, with downloads. Results are temporary and do not update recovery facts or statuses. Identity verification, official damage assessment, intake automation, persistent document storage, retrieval, and priority UI are not implemented.
