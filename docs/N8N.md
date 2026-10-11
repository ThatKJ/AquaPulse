# n8n and Twilio

n8n does the wiring between services. It makes no decisions and holds no secrets: **n8n orchestrates, AquaPulse computes.**

## What is running

Two workflows are published on our n8n Cloud instance, and one is a draft.

1. **Citizen report.** Twilio's WhatsApp number calls the n8n webhook `/webhook/aquapulse/citizen-report`. n8n forwards the request to AquaPulse unchanged and returns AquaPulse's answer to Twilio. A text and a location pin from a real phone have been through it (11 Oct 2026).
2. **National data refresh.** Every 15 minutes n8n reads `/api/national` on the site, which makes the site refresh the NDMA and IMD feeds. This is why the data stays current with no visitor.
3. **Critical alert (draft, not published).** It would send an alert when risk and confidence are both high. It has never sent anything. It needs a credential created by hand and an approved list of recipients first.

## Who is trusted

n8n holds no secret and no credential for the citizen path. It passes on Twilio's form body and the `X-Twilio-Signature` header exactly as received. AquaPulse is the only place the signature is checked.

Twilio signs the URL it called, which is the n8n URL. So AquaPulse accepts a signature for its own URL or for exactly one other URL, set in `TWILIO_FORWARDER_URL` on the site. Any other host, or even a trailing slash, gets a 403. If the n8n webhook path changes, that variable must change with it.

## Twilio trial limits

- Replies written as TwiML are rejected (error 12300, shown on every inbound message, harmless), and so are free-text messages (21654). AquaPulse acknowledges with a Twilio sample template instead (`TWILIO_ACK_CONTENT_SID`).
- Photos: the message arrives and is stored, but the image cannot be downloaded (error 20003, "not available on a Trial account"). So a WhatsApp photo is not analysed. Photos uploaded in the console are.

## Secrets

No credentials are in this repository or in the workflow files. The site's secrets live in Vercel's environment settings. The draft alert workflow would need one header credential, created inside n8n by hand.

## Workflows on the instance

| Workflow | Id | State | What it does |
| --- | --- | --- | --- |
| AquaPulse — Citizen Report Ingestion | `XfaKArmc2N1OgAnd` | Published | Twilio webhook → AquaPulse → reply. Source: `n8n/citizen-report.json` |
| AquaPulse — National Data Refresh | `utycnfXQb1TjV2tH` | Published | Every 15 minutes reads `/api/national`, which makes the site refresh NDMA and IMD after responding. No secrets. First run 06:15Z on 2026-10-11 produced a sync with no visitor. Source: `n8n/national-refresh.sdk.js` |
| AquaPulse — Critical Alert | `hnTKNXFrSpIu5Rbu` | Draft, not published | Gate (risk ≥ 80, confidence ≥ 70) → `POST /api/webhooks/alert` with one idempotency key per incident, 3 tries, failure branch. Needs a Header Auth credential (`x-aquapulse-secret`) created by hand; AquaPulse sends only to `TWILIO_ALLOWED_TO`, and the trial Twilio number cannot send free text anyway. Source: `n8n/critical-alert.sdk.js` |

## Endpoints the workflows call

All require the header `x-aquapulse-secret: <WEBHOOK_SECRET>`. A missing or wrong secret returns 401; an unset secret on the server returns 503.

| Endpoint | Body | Behaviour |
| --- | --- | --- |
| `POST /api/webhooks/report` | `{ messageId, from, text, lat?, lng?, mediaUrl?, mediaContentType?, timestamp? }` | Stores the report once per `messageId` (a retry returns `duplicate: true`). If `mediaUrl` is a Twilio media URL it is fetched and analysed. |
| `POST /api/webhooks/alert` | `{ incidentId, audience, body, to?, idempotencyKey? }` | Records the alert, sends through Twilio only in live mode and only to allowlisted numbers. A retry with the same key sends nothing. |
| `POST /api/webhooks/verification` | `{ incidentId, lat, lng, radiusM?, question }` | Records a verification request. Sends nothing: reporter numbers are stored as keyed hashes, so outreach is n8n's job. |
| `POST /api/webhooks/action-complete` | `{ incidentId, bundleId, completedAt, note? }` | Marks the intervention completed (creates the row if needed). |
| `POST /api/webhooks/twilio` | Twilio's form post | Direct Twilio path without n8n; requires a valid `X-Twilio-Signature`. |

## Workflows (`n8n/*.json`)

| File | Trigger | Steps | Failure handling |
| --- | --- | --- | --- |
| `citizen-report.json` (deployed) | Webhook `aquapulse/citizen-report` (Twilio's inbound WhatsApp webhook points here) | Forward the form body and Twilio signature unchanged to `POST /api/webhooks/twilio` → return AquaPulse's status, body and content type to Twilio | AquaPulse's 4xx (for example 403 on a bad signature) is passed through; 502 if AquaPulse cannot be reached. Idempotent on `MessageSid` in AquaPulse. No n8n variables or credentials needed. |
| `critical-alert.sdk.js` (draft on the instance) | Webhook `aquapulse/incident-critical` with `{ incidentId, risk, evidenceScore, recipients[], area?, message? }` | Gate: risk ≥ 80 and evidence ≥ 70 → de-duplicate recipients → `POST /api/webhooks/alert` with key `alert:<incident>:critical` | Below threshold returns `sent: false`. One alert per incident regardless of retries. |
| `verification.json` | Webhook `aquapulse/verification` with `{ incidentId, lat, lng, radiusM?, question? }` | Record the request → respond → wait 10 minutes → timeout note | No reply is never treated as confirmation; nothing escalates from this workflow. Validator replies arrive through the citizen-report workflow and re-score the incident. |
| `intervention-result.json` | Webhook `aquapulse/action-complete` with `{ incidentId, bundleId, completedAt?, note? }` | `POST /api/webhooks/action-complete` → respond | 502 with the upstream error. Safe to retry. |

The three unimported workflows have a 120-second execution timeout and no loops.

Gaps to know about:
- The operator console does not call the critical-alert or verification workflows by itself yet; something (an operator action or a schedule) has to post to them.
- Finding "nearby trusted validators" and "nearby recipients" needs a recipient list. AquaPulse stores reporter numbers only as keyed hashes, so that list must live in n8n or be passed in.
- The action-complete webhook records completion. The before/expected/observed comparison and the Fix This First update are computed by the engine in the console when the bundle is applied.

## Setup

1. Create an instance: n8n Cloud (quickest; gives a public HTTPS URL Twilio can reach) or `docker run -it --rm -p 5678:5678 n8nio/n8n` (local only; Twilio cannot reach it without a tunnel).
2. For the three unimported workflows only (citizen-report needs none of this): in n8n set two environment variables (Cloud: Settings → Variables, then replace `$env.` with `$vars.` in the HTTP nodes):
   - `AQUAPULSE_URL` = the deployed site, e.g. `https://aquapulse-liard.vercel.app`
   - `AQUAPULSE_WEBHOOK_SECRET` = the value of `WEBHOOK_SECRET` on the site
3. Import each file: Workflows → Import from file. Activate it.
4. Test one: `curl -X POST <n8n>/webhook/aquapulse/action-complete -H 'content-type: application/json' -d '{"incidentId":"F-01","bundleId":"IR-01"}'` should return `recorded: true`.
5. Set `N8N_BASE_URL` in `.env.local` so `npm run doctor` shows the instance.
6. Optional: install n8n's Claude Code skills and connect the instance MCP once the instance exists.

## Twilio live mode

1. Create a Twilio account; enable the WhatsApp sandbox (or an SMS number).
2. On the site set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
3. Inbound: point "When a message comes in" at either `<site>/api/webhooks/twilio` (direct; signature is validated, so the URL configured in Twilio must match the public URL exactly) or the n8n citizen-report webhook.
4. Outbound: set `TWILIO_MODE=live` and `TWILIO_ALLOWED_TO=+91…,+91…`. Live mode sends **only** to numbers on that list; everything else is recorded and skipped. Leave `TWILIO_MODE=demo` (default) to record alerts without sending.
5. Location: WhatsApp only supplies `Latitude`/`Longitude` when the citizen shares a location pin. Reports without one are stored without a position.
6. Media: fetched only from Twilio hosts (and Twilio's own storage bucket as a redirect target), 4 MB cap, type and magic-byte checks.

Verified on 11 Oct 2026 from a real phone: a signed text and a location pin were received, stored and acknowledged.
