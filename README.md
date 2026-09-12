# Cascadia Aid

A production-minded Next.js and TypeScript foundation for a hackathon project. It uses the App Router, Tailwind CSS, a responsive application shell, reusable UI primitives, and placeholder routes. Product-specific behavior is intentionally out of scope.

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
npm run build
```

Run `npm run format` to apply formatting.

## Project structure

- `app/` — App Router pages plus global loading and error boundaries
- `components/layout/` — shared application chrome
- `components/ui/` — reusable, accessible interface primitives
- `types/` — minimal shared domain shapes
- `lib/`, `data/`, and `api/` — intentionally empty extension points

## Environment variables

No environment variables are required. When a variable is introduced, document its name and purpose in `.env.example` without committing its secret value.

## Deployment

1. Run `npm run lint` and `npm run build`.
2. Configure a Node-compatible Next.js environment, or use the included Sites configuration and build output.
3. Add production environment variables in the hosting environment, not in committed files.
4. Point the domain's DNS records at the values provided by the hosting environment.
5. Verify HTTPS and each route after DNS propagation completes.

## Scope boundary

This repository contains no eligibility logic, dependency-graph logic, workflows, AI extraction, retrieval systems, document processing, location-specific behavior, fake recovery data, or other core application functionality.
