# n8n and Twilio

**State (2026-10-10):** there is no n8n instance and no Twilio account configured, so nothing in this file has run through n8n or Twilio. What has been verified is the AquaPulse side of every contract: each endpoint below was called on the public deployment with the real secret and behaved as described (see `docs/STATUS.md`). The workflow JSON was generated to n8n's export format and has **not** been imported into an instance: treat it as UNVERIFIED until you import and run it.

Division of labour: **n8n orchestrates, AquaPulse computes.** No scoring, fusion or thresholds live in n8n beyond the alert gate, which mirrors the engine's own bands.

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
| `citizen-report.json` | Webhook `aquapulse/citizen-report` (point Twilio's inbound WhatsApp webhook here) | Normalize Twilio fields → validate `MessageSid` and `From` → `POST /api/webhooks/report` → acknowledge | 400 on invalid input; HTTP node retries 3 times, 2 s apart; 502 with the upstream error otherwise. Idempotent on `MessageSid`. |
| `critical-alert.json` | Webhook `aquapulse/incident-critical` with `{ incidentId, risk, evidenceScore, recipients[], area?, message? }` | Gate: risk ≥ 80 and evidence ≥ 70 → de-duplicate recipients → `POST /api/webhooks/alert` with key `alert:<incident>:critical` | Below threshold returns `sent: false`. One alert per incident regardless of retries. |
| `verification.json` | Webhook `aquapulse/verification` with `{ incidentId, lat, lng, radiusM?, question? }` | Record the request → respond → wait 10 minutes → timeout note | No reply is never treated as confirmation; nothing escalates from this workflow. Validator replies arrive through the citizen-report workflow and re-score the incident. |
| `intervention-result.json` | Webhook `aquapulse/action-complete` with `{ incidentId, bundleId, completedAt?, note? }` | `POST /api/webhooks/action-complete` → respond | 502 with the upstream error. Safe to retry. |

Every workflow has a 120-second execution timeout and no loops.

Gaps to know about:
- The operator console does not call the critical-alert or verification workflows by itself yet; something (an operator action or a schedule) has to post to them.
- Finding "nearby trusted validators" and "nearby recipients" needs a recipient list. AquaPulse stores reporter numbers only as keyed hashes, so that list must live in n8n or be passed in.
- The action-complete webhook records completion. The before/expected/observed comparison and the Fix This First update are computed by the engine in the console when the bundle is applied.

## Setup

1. Create an instance: n8n Cloud (quickest; gives a public HTTPS URL Twilio can reach) or `docker run -it --rm -p 5678:5678 n8nio/n8n` (local only; Twilio cannot reach it without a tunnel).
2. In n8n set two environment variables (Cloud: Settings → Variables, then replace `$env.` with `$vars.` in the HTTP nodes):
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

Until a real signed message has been received and a real message delivered, Twilio stays UNVERIFIED.
