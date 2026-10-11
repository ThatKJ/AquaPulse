# AquaPulse

Decision intelligence for water crises: too much water (flooding) and too little (scarcity), in one product.

**Live:** https://aquapulse-liard.vercel.app · India map: [`/live`](https://aquapulse-liard.vercel.app/live) · Bengaluru local forecast: [`/?demo=1&scenario=flood`](https://aquapulse-liard.vercel.app/?demo=1&scenario=flood)

## The problem
Indian cities flood and run dry in the same year, often through the same neglected infrastructure. The people responding have alerts in one place, citizen complaints in another and no way to test a response before committing crews to it. AquaPulse answers four questions on one screen: where is the problem, why is it happening, what happens next, and what should we do.

## How it works
Observe → Verify → Predict → Act → Learn.

- **Observe:** official alerts (NDMA SACHET, carrying IMD, CWC and state warnings) and IMD district rain nowcasts for all of India, refreshed every 15 minutes; citizen reports by WhatsApp.
- **Verify:** each report is scored for confidence; photos are read by Amazon Rekognition; reports are compared with official conditions for the same district.
- **Predict:** a deterministic local model of south-east Bengaluru (397 hexagonal cells) forecasts flood and scarcity risk for now, +15, +30 and +60 minutes.
- **Act:** every feasible response with the crews, pumps and tankers actually available is simulated and ranked. In the flagship flood scenario the best response takes 3,822 people exposed down to 190 and protects the hospital.
- **Learn:** each outcome is recorded against the infrastructure that failed, which sets repair priorities so the same failure is prevented next time.

Flood and scarcity share the model, the evidence pipeline and the response ranking; only the physics differ.

## What is real and what is simulated
| | |
| --- | --- |
| **Live official data** | NDMA SACHET alerts and IMD district nowcasts on the India map, with source, age and freshness shown |
| **Derived by AquaPulse** | The district water-risk score (not a government rating). Missing inputs such as river gauges count as unknown, never zero |
| **Live citizen path** | WhatsApp → Twilio → n8n → AquaPulse → Supabase → console. A text from a real phone has been through it; a real photo has not yet |
| **Live AWS** | Lambda calling Rekognition on photos, CloudWatch logs, least-privilege role |
| **Simulated, and labelled so** | The Bengaluru city data: drains, pipes, facilities, populations, history and the three scenarios |
| **Not active** | Amazon Bedrock is blocked on this AWS account. The question box answers from templates over model output and says so |

Full status with evidence: [`docs/STATUS.md`](docs/STATUS.md).

## Architecture
```
Official feeds (NDMA SACHET, IMD nowcast)          WhatsApp → Twilio → n8n
        │  n8n schedule, every 15 min                        │ signed form, unchanged
        ▼                                                    ▼
   National ingestion ──► Supabase Postgres + PostGIS ◄── AquaPulse API (verifies Twilio's signature)
        │                                                    │ photo
        ▼                                                    ▼
   India → state → district map                    AWS Lambda → Amazon Rekognition
        │
        ▼
   Local forecast (deterministic engine, in the browser)
   evidence → confidence → prediction → best response → outcome → recurring problems → priority repairs
```
Next.js 16, TypeScript, Tailwind, MapLibre GL, deck.gl, H3, Supabase, AWS Lambda/Rekognition/CloudWatch, n8n Cloud, Twilio WhatsApp, Vercel. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Security approach
Every write endpoint needs a server secret or a valid Twilio signature; n8n holds no secrets; media is fetched only from Twilio hosts; phone numbers are stored as keyed hashes; database tables are closed to the public key by row-level security. Review: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md).

## Known limitations
- Street-level forecasting exists for one simulated Bengaluru district only. The national view is situational awareness, not prediction.
- District placement of alerts is by name matching; some alerts name only a state.
- The Twilio number is a trial number, so WhatsApp replies use a Twilio sample template rather than AquaPulse's wording.
- The console has no operator sign-in.

## Run locally
```bash
npm install
npm run build && npm run start    # http://localhost:3100
npm run check                     # typecheck, lint, tests, build
npm run doctor                    # one line per integration, real calls only
```
Copy `.env.example` to `.env.local` for integrations. The scenarios need none.

## Demo
Three-minute script: [`docs/DEMO_SCRIPT_FINAL.md`](docs/DEMO_SCRIPT_FINAL.md). Judge questions: [`docs/JUDGE_QA.md`](docs/JUDGE_QA.md). One-page architecture: [`docs/ARCHITECTURE_FINAL.md`](docs/ARCHITECTURE_FINAL.md). Screenshots: [`docs/screenshots/final-r2/`](docs/screenshots/final-r2). In the scenario view: Space play/pause, → next, R reset.

## More
[Status](docs/STATUS.md) · [n8n and Twilio](docs/N8N.md) · [AWS setup](docs/AWS_SETUP.md) · [Database](docs/DATABASE.md) · [Data provenance](docs/DATA_PROVENANCE.md) · [National sources](docs/NATIONAL_DATA_SOURCES.md) · [Performance](docs/PERFORMANCE.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Decisions](docs/DECISIONS.md)
