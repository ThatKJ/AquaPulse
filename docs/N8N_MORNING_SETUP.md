# n8n: what is ready and what remains

**State:** the n8n Cloud instance exists (`https://thatkj.app.n8n.cloud`). The Claude Code connector for it shows "Needs authentication", so nothing has been created in the instance and no workflow has run. Everything below is prepared and unverified in n8n.

## Design
n8n orchestrates; AquaPulse decides. The citizen-report workflow does three things only:
1. receive Twilio's form post,
2. forward the unchanged form fields to `POST /api/webhooks/twilio` with Twilio's signature header, the URL Twilio signed (`x-twilio-original-url`) and the server secret,
3. return AquaPulse's TwiML reply to Twilio.

Signature validation, `MessageSid` idempotency, phone hashing, media fetching (Twilio hosts only), Rekognition analysis, storage, photo-and-location pairing and the acknowledgement text all live in AquaPulse. The forwarded-URL header is honoured only with the server secret, and Twilio's signature must still verify, so the workflow cannot invent messages.

## After the connector is authorised
1. In n8n: Settings → Variables: `AQUAPULSE_URL` = `https://aquapulse-liard.vercel.app`, `AQUAPULSE_WEBHOOK_SECRET` = the site's `WEBHOOK_SECRET` (copy it from `.env.local` yourself).
2. Create the workflow from `n8n/citizen-report.json` (8 nodes) and activate it.
3. Copy its production webhook URL (`https://thatkj.app.n8n.cloud/webhook/aquapulse/citizen-report`, to be confirmed in the instance) into the Twilio sandbox field "When a message comes in", method POST.
4. Send one WhatsApp message and check the execution in n8n.

Known uncertainty: n8n's `$vars` needs a plan that includes Variables; if unavailable, put the two values directly in the HTTP node. The HTTP node's raw form body and the webhook's `webhookUrl` field are used as documented but have not been run.

## Other workflows (not imported)
`n8n/critical-alert.json`, `n8n/verification.json`, `n8n/intervention-result.json` call `/api/webhooks/alert`, `/verification` and `/action-complete`. Those endpoints are verified on the public site; the workflows themselves are not.
