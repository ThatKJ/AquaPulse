@AGENTS.md

# AquaPulse

AI decision engine for a water-resilient Bengaluru (flood + scarcity). One-day hackathon build.
Loop: OBSERVE → VERIFY → FUSE → PREDICT → DECIDE → ACT → PROVE → LEARN → PREVENT.

## Stack
Next.js 16 App Router (read `node_modules/next/dist/docs/` before using a Next API), TypeScript, Tailwind 4,
MapLibre GL + deck.gl (scoped `@deck.gl/*` packages), h3-js, motion, zod 4, vitest, AWS SDK v3, supabase-js.
Dev/prod server port: **3100** (5173 and 8787 belong to other projects on this machine).

## Architecture rules
- The demo runs entirely in the browser from the pure engine and a seeded `WorldState`. No network call is needed to render or play a scenario.
- Engine code (`lib/simulation`, `lib/evidence`, `lib/optimization`, `lib/geo`, `lib/demo`) is pure and deterministic: no I/O, no `Date.now()`, no `Math.random()`.
- Every number shown to a user comes from the engine. An LLM may explain numbers, never produce them.
- Contracts live in `lib/schemas/` and are frozen. Import types from there; do not redefine them.
- Synthetic infrastructure, demographics and history are labelled SIMULATED. Never present them as real municipal data.
- Integrations report PASS / FAIL / NOT_CONFIGURED / UNVERIFIED. Fixtures never appear under a live badge.

## Ownership
| Owner | Paths |
| --- | --- |
| Orchestrator only | `package.json`, lockfile, `app/layout.tsx`, `app/globals.css`, config files, `.env.example`, `lib/schemas/**`, `supabase/migrations/**`, `docs/**`, `CLAUDE.md`, `context/**`, all git operations |
| ENGINE | `lib/simulation/**`, `lib/evidence/**`, `lib/optimization/**`, `lib/geo/**`, `lib/demo/**`, `lib/engine.ts`, `tests/**` |
| UI | `app/page.tsx`, `components/**`, `public/**` |
| PLATFORM | `lib/aws/**`, `lib/db/**`, `lib/alerts/**`, `app/api/**`, `scripts/**`, `infra/**`, `supabase/seed.sql` |

Need a new dependency or a schema change? Ask the orchestrator; do not edit shared files. Builders do not run git commands that change state.

## YAGNI
Simplest thing that gives the judge-visible result. No interface with one implementation, no file nobody imports,
no new dependency for what a few lines do. Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling.
Never cut: input validation at trust boundaries, error handling, secrets hygiene, accessibility floor.

## Gates
`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` must pass before anything is called done.
Status lives in `docs/STATUS.md`; nothing is WORKING without the evidence named there.

## Visual development
Design rules: `context/design-principles.md`. After any UI change: open the page with Playwright at 1440x900,
screenshot it, read the console (zero errors), compare against the principles.

## Git
Plain commits, no AI co-author trailer, never `git add -A`, no secrets or AWS account IDs in the tree.
