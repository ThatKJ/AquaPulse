# Morning actions

Only things that need you. About 15 minutes in total. Never paste a secret into chat.

## 1. Point the Twilio WhatsApp sandbox at AquaPulse (2 minutes) — gives a real WhatsApp → dashboard flow immediately
Twilio console → Messaging → Try it out → Send a WhatsApp message → **Sandbox settings** → "When a message comes in":

`https://aquapulse-liard.vercel.app/api/webhooks/twilio` · method **POST** · Save.

Then, from the phone that joined the sandbox:
1. Send a text ("water on the road near the drain"). Expect a reply asking for your location.
2. Send a location (attach → Location). Expect "AquaPulse added your location to your report."
3. Send a photo. Expect "AquaPulse received your report. Evidence is being checked. Reference: AQ-…"

Open `https://aquapulse-liard.vercel.app/?demo=1&scenario=flood` first: each message appears as "NEW CITIZEN EVIDENCE" within about seven seconds. (A location inside the Bengaluru demo district fuses into the incident; anywhere else it is announced and stored.)

This path is already verified with correctly signed requests on the public site. What has not happened yet is a message from a real phone, and a photo fetched from Twilio's media host.

## 2. Authorise the n8n connector (2 minutes) — adds the n8n hop
In Claude Code run `/mcp`, choose **claude.ai n8n**, and complete the sign-in for `https://thatkj.app.n8n.cloud`. It currently shows "Needs authentication", so no n8n tools are available to the session.
Then tell Claude "n8n is authorised". Claude will create the citizen-report workflow from `n8n/citizen-report.json`, activate it and give you its production webhook URL to paste into the same Twilio field as in step 1. Details: `docs/N8N_MORNING_SETUP.md`.

## 3. Approve or decline the scheduler (1 minute)
Change set `deploy-20261011-023903` on stack `aquapulse-ai` is created and not executed: one EventBridge schedule (every 15 minutes), one scheduler role that can only invoke the existing Lambda, two Lambda environment variables. Cost is effectively zero. Full preview: `docs/SCHEDULER_PLAN.md`.
To approve: run `! aws login` (the session expires quickly), then say "approved". Until it exists, the national feeds refresh only when someone opens `/live`.

## 4. Optional: let live alerts send to your own phone
Add your number to `TWILIO_ALLOWED_TO` in `.env.local` and in Vercel. Nothing is sent to anyone not on that list, and no alert has been sent to anyone so far.

## 5. After the hackathon: stop using the AWS root user
Steps and the exact policy are in `docs/AWS_IAM_MIGRATION.md`. Nothing was created.

Optional tidy-up: test reports from tonight's verification are in the database (`evidence_events` rows whose text starts "TEST REPORT"). They do not appear on a freshly opened dashboard. `npm run demo:reset` clears demo rows if you want them gone.
