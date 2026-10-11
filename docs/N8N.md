# n8n and Twilio

**State (2026-10-11):** the citizen-report workflow is live on n8n Cloud (`https://thatkj.app.n8n.cloud`, workflow `XfaKArmc2N1OgAnd`, production webhook `/webhook/aquapulse/citizen-report`) and Twilio's trial WhatsApp number points at it. A real text ran through it at 06:02Z (execution 18). `n8n/citizen-report.json` is that deployed workflow. The other three workflow files have **not** been imported: treat them as UNVERIFIED.

**Trust model for the citizen-report path:** n8n holds no secret and no credential. It forwards Twilio's form body and `X-Twilio-Signature` unchanged; AquaPulse is the only place the signature is verified. Because Twilio signed the n8n URL, AquaPulse accepts signatures for exactly one extra URL, set in `TWILIO_FORWARDER_URL` on the site. Change the n8n webhook path and that variable must change with it.

**Twilio trial limits:** the "Try out WhatsApp" number rejects TwiML replies (error 12300, shown on every inbound message and harmless) and free-text REST messages (21654). Acknowledgements are sent by AquaPulse as a Twilio-provided template (`TWILIO_ACK_CONTENT_SID`).

Division of labour: **n8n orchestrates, AquaPulse computes.** No scoring, fusion or thresholds live in n8n beyond the alert gate, which mirrors the engine's own bands.

**Update, night of 2026-10-10:** a local n8n through `npx` did not finish installing in 20 minutes and was abandoned; the Docker daemon is not running. The fastest path is n8n Cloud (setup below). To show a live inbound report without n8n or Twilio:

```bash
curl -X POST https://aquapulse-liard.vercel.app/api/webhooks/report \\
  -H "x-aquapulse-secret: $WEBHOOK_SECRET" -H "content-type: application/json" \\
  -d '{"messageId":"SM-demo-'$(date +%s)'","from":"whatsapp:+910000000000","text":"TEST REPORT: drain overflowing onto the road","lat":12.92672,"lng":77.63805}'
```
With the dashboard open on the flood scenario (step 5 or later) it appears within about five seconds and fuses into F-01.

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
| `critical-alert.json` | Webhook `aquapulse/incident-critical` with `{ incidentId, risk, evidenceScore, recipients[], area?, message? }` | Gate: risk ≥ 80 and evidence ≥ 70 → de-duplicate recipients → `POST /api/webhooks/alert` with key `alert:<incident>:critical` | Below threshold returns `sent: false`. One alert per incident regardless of retries. |
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

Until a real signed message has been received and a real message delivered, Twilio stays UNVERIFIED.
