# AquaPulse

AI decision engine for a safer, water-resilient Bengaluru: flood and scarcity in one command center.

**Live:** https://aquapulse-liard.vercel.app/?demo=1 · scenarios: `&scenario=flood`, `scarcity`, `false-report` · shortcuts: Space play/pause, → next, R reset.

It answers what is happening, what happens next, why, who gets hurt, what to do, what that changes, whether it worked, and what the city should permanently fix.

## What is real and what is simulated
- **Real:** AWS Lambda calling Amazon Rekognition on uploaded photos (CloudWatch logs, least-privilege role); Supabase Postgres + PostGIS persistence; the deterministic engine and every number it produces; the basemap.
- **Simulated (labelled SIM in the UI):** the city feed, infrastructure, populations, history, demo reports and their recorded analyses.
- **Not available:** Amazon Bedrock is blocked on this AWS account, so Ask AquaPulse uses labelled template answers. Twilio and n8n are prepared but not connected.

Full, evidence-backed status: [`docs/STATUS.md`](docs/STATUS.md).

## Run
```bash
npm install
npm run build && npm run start    # http://localhost:3100/?demo=1
npm run doctor                    # one line per integration, real calls only
npm run check                     # typecheck, lint, tests, build
```
Copy `.env.example` to `.env.local` for integrations; the demo needs none.

## Docs
[Architecture](docs/ARCHITECTURE.md) · [Demo script](docs/DEMO.md) · [AWS setup](docs/AWS_SETUP.md) · [Database](docs/DATABASE.md) · [n8n and Twilio](docs/N8N.md) · [Security](docs/SECURITY.md) · [Decisions](docs/DECISIONS.md) · [Toolchain](docs/TOOLCHAIN.md)
