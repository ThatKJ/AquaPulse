# Actions that need you

Nothing needs configuring. Twilio already points at n8n.

## 1. Finish the real-phone test (2 minutes)
Open `https://aquapulse-liard.vercel.app/?view=local`, then from the phone that joined the Twilio trial send, in this order:
1. a new text
2. a location pin (attach → Location)
3. a photo of standing water or a drain

Then tell Claude "sent". It will check pairing, the media fetch, Rekognition, the n8n executions, Supabase and the console.

## 2. Optional
- **Critical alert workflow:** in n8n create a Header Auth credential named "AquaPulse webhook secret" (header `x-aquapulse-secret`, value = `WEBHOOK_SECRET` from `.env.local`), select it on the HTTP node of "AquaPulse — Critical Alert", and publish. Add your own number to `TWILIO_ALLOWED_TO` in Vercel if you want it to send. On the trial Twilio number it can only record, not deliver free text.
- **EventBridge scheduler:** `! aws login`, then say "approved" to execute change set `deploy-20261011-023903`. Not needed: n8n already refreshes the feeds every 15 minutes.
- **After the hackathon:** `docs/AWS_IAM_MIGRATION.md`, and the list at the end of `docs/SECURITY_REVIEW.md`.
