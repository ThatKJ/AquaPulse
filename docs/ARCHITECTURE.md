# Architecture

Describes what is implemented. Integration state lives in `docs/STATUS.md`.

```
Browser (Next.js client)
  WorldState ──► engine (pure TS) ──► predictions, auction, scores, priorities
       ▲                                   │
  demo scenarios                     MapLibre + deck.gl, panels
       │
       └── fetch ──► Next.js route handlers (/api/*)
                        ├─ lib/aws   ── Rekognition DetectLabels (Bedrock Converse when BEDROCK_MODEL_ID works)
                        │               or, on the public host, the AI Lambda via AI_ENDPOINT_URL
                        ├─ lib/db    ── Supabase (service role) or in-memory
                        └─ lib/alerts── Twilio REST or demo transport
```

## Engine (`lib/simulation`, `lib/evidence`, `lib/optimization`, `lib/geo`, exported from `lib/engine.ts`)
Pure and deterministic. Contract: `Engine` in `lib/schemas/simulation.ts`.
- **predict**: per-cell flood risk as a weighted sum of seven factors, propagated to H3 neighbours by elevation proxy for +15/+30/+60; scarcity risk and deficit from eight factors; confidence falls with horizon. Coefficients: `lib/simulation/config.ts`.
- **applyBundle / simulateBundle / commitBundle**: interventions change factors (drain, pipe, crew) or act as overlays read from `activeInterventions` (pump, tanker, road closure, alert); outcomes are baseline vs. rerun.
- **runAuction**: single actions plus limited pairs from free resources, simulated and scored; top three with per-term breakdown.
- **fuse / scoreEvidence**: reports join an incident by distance (meters), time and category; the 0–100 Evidence Score is a weighted sum of eight named components.
- **infraPriorities / counterfactual / allocateTankers**: failure memory ranking, earlier-action estimate, equity-weighted tanker plan.

Known simplifications (marked `ponytail:` in code): interventions take effect instantly (response time is scored, not simulated); the counterfactual compares the unmitigated forecast with the winner applied now; duration change is a proportional proxy.

## Demo (`lib/demo`)
`initialWorld()` builds 397 H3 resolution-9 cells in south-east Bengaluru from a seeded generator, with synthetic assets, facilities, resources and multi-year history. Three scenarios (`flood-cascade`, `scarcity`, `false-report`) are lists of pure steps played with `playStep`. Same input, same output: tests assert it.

## UI (`components/`)
One reducer in `Shell.tsx` holds world, mode, horizon, selection, preview bundle and demo state. Predictions are derived with `useMemo`; previewing an auction option re-runs `predict` on `applyBundle(world, bundle)`, which is what animates the map.

## Server
| Route | Purpose |
| --- | --- |
| `GET /api/health` | Real STS call (cached 60 s), active observer, DB adapter, Twilio config |
| `POST /api/evidence` | Image upload → `EvidenceAnalysis` (schema-validated, `source` stamped) |
| `POST /api/ask` | Grounded answer from the supplied context; template when no LLM |
| `POST /api/webhooks/twilio` | Signed inbound WhatsApp/SMS |
| `POST /api/webhooks/{report,verification,alert,action-complete}` | n8n-compatible, shared-secret header |

## AI Lambda (`infra/ai-lambda`)
Same `lib/aws` code behind a Function URL with a least-privilege role, so the public web host needs no AWS credentials. Not deployed yet.

## Deployed topology (2026-10-10)
Browser → Vercel (Next.js, `aquapulse-liard.vercel.app`) → AWS Lambda Function URL (`aquapulse-ai-fn`) → Amazon Rekognition, logs to CloudWatch. Vercel → Supabase (Postgres + PostGIS) with the service-role key, server side only.

`POST /api/state` mirrors the console's incidents, evidence membership, interventions and results into the database (upsert by engine id, debounced, best effort). The engine in the browser stays the source of truth; nothing reads the mirror back yet.

## End-to-end flow (what exists, 2026-10-10)
```
Citizen ──(Twilio WhatsApp: not connected)──► n8n (workflows written, not run)
                                                 │
        any caller with the secret ─────────────►│
                                                 ▼
                              Vercel /api/webhooks/report ──► Supabase/PostGIS (evidence_events)
Operator photo upload ──► Vercel /api/evidence ──► AWS Lambda ──► Amazon Rekognition ──► CloudWatch
                                                 │
                 Console polls /api/reports (5 s)│
                                                 ▼
        HydroTwin (engine in the browser) ──► fusion + Evidence Score ──► prediction ──► intervention auction ──► command center
                                                 │
                          /api/demo/sync (server replays scenario) ──► Supabase mirror
```
Solid arrows are verified on the public deployment. The two links marked "not connected / not run" are the Twilio and n8n hops.
