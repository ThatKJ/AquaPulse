# AquaPulse architecture — one page

Production: `https://aquapulse-liard.vercel.app` (Next.js on Vercel). Detail: `ARCHITECTURE.md`, `N8N.md`, `SECURITY_REVIEW.md`.

## 1. Official data (LIVE)

```
NDMA SACHET alerts ─┐
                    ├─► national ingestion ─► Supabase / PostGIS ─► /api/national ─► India › state › district map
IMD rain nowcast  ──┘        ▲
                             └── n8n schedule, every 15 min (no visitor needed)
```

- Each source carries a freshness state: CURRENT, DELAYED, STALE or OFFLINE, from the time of the last successful sync.
- The district water-risk score is DERIVED by AquaPulse from these sources. It is not a government rating.
- Inputs we do not have (river gauges, heat stress) are shown as unknown, never as zero.

## 2. Citizen reports (LIVE)

```
WhatsApp ─► Twilio ─► n8n webhook ─► AquaPulse /api/webhooks/twilio ─► Supabase
                                          │
                                          ├─ verifies Twilio's signature (direct URL or the one configured n8n URL)
                                          ├─ stores each message once; sender stored as a hash
                                          ├─ pairs a location pin with the sender's last report
                                          └─ photo ─► fetch from Twilio only ─► AWS Lambda ─► Amazon Rekognition ─► labels
```

- n8n forwards the request unchanged and holds no secret. A bad signature returns 403.
- Photos are fetched only from Twilio hosts over HTTPS, with a size limit, a timeout and no open redirects.
- The Lambda requires a shared secret; its role allows `rekognition:DetectLabels` and its own logs.
- Database: row-level security on every table, no public policies; only the server writes.

## 3. Decision engine (DETERMINISTIC)

```
Evidence ─► Fusion ─► Prediction ─► Best Response ─► Outcome ─► Priority Repairs
 score 0–100  one incident  now, +15, +30, +60  every feasible action  expected vs   assets that keep
 8 checks     per place     people, facilities  simulated and ranked   observed      failing rise
```

- Pure TypeScript, no network, no randomness; runs in the browser and is covered by tests.
- Flood example: 3,822 exposed at +30 min → pump alone 2,568 → drain alone 1,067 → both 190, hospital protected.
- Scarcity example: a pipe fault raises the deficit from 2.5 to 3.7 ML/day; tankers go to the hospital first.

## What is what

| Label | Meaning | Where |
| --- | --- | --- |
| LIVE | Fetched from an official feed or sent by a real phone | National map, WhatsApp reports |
| DERIVED | Computed by AquaPulse from other data | Risk scores, forecasts, rankings |
| SIMULATED | Synthetic, for the demonstration | Bengaluru drains, pipes, pumps, population, failure history |

Not in production: Amazon Bedrock (blocked on this account; the question box uses labelled templates) and the n8n Critical Alert workflow (draft, sends nothing).
