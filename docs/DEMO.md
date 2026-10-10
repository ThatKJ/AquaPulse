# Demo

**Public:** landing https://aquapulse-liard.vercel.app · live India map `/live` (click a state, then a district) · local forecast demo https://aquapulse-liard.vercel.app/?demo=1 · direct links `&scenario=flood`, `scarcity`, `false-report`
**Local fallback:** `npm run build && npm run start` → http://localhost:3100/?demo=1 (needs no network, AWS or database)

Controls: Space play/pause · → next event · R reset (click the map first so no control has focus). Use a 1440x900 or 1920x1080 window.

## What is real and what is staged
- **Deterministic by design:** the city state and the three scenarios, so the disaster is reproducible on stage. Header: MODE SIMULATION.
- **Live:** photo analysis (browser → Vercel → AWS Lambda → Amazon Rekognition), the Supabase/PostGIS database, and inbound reports: a report posted to the public report webhook appears on the open dashboard within about five seconds and is fused by the normal rules.
- **Not connected:** Twilio and n8n (no accounts). The inbound report in the demo is posted to the webhook directly, not sent from WhatsApp. Bedrock is blocked on this AWS account, so Ask AquaPulse gives grounded template answers, labelled as such.

## Three-minute script

| Time | Do | Say |
| --- | --- | --- |
| 0:00–0:15 | Open `/?demo=1&scenario=flood`. Calm twin on screen. | "Cities don't need another flood map. They need to know what happens next and what to do about it. This is AquaPulse, for both too much water and too little." |
| 0:15–0:35 | Next ×2 (rain + first report, analysis). Open View evidence → Analyze a photo with a real flood photo. | "This city state is deterministic demo data so the disaster is reproducible. This part is live: the photo goes through our AWS Lambda to Amazon Rekognition, and the result lands in PostGIS." Point at REKOGNITION · LIVE. |
| 0:35–0:55 | Summary, then → four times (two more reports, fusion, escalation). | "AquaPulse doesn't plot reports blindly. Three reports fuse into one incident; the Evidence Score climbs 52, 64, 68, 76, and every component is shown." |
| 0:55–1:20 | Next ×2 (cells turn red, +30 reaches hospital). | "Thirty minutes ahead the water reaches the hospital: an estimated 3,822 people exposed." |
| 1:20–1:50 | → (opens "Best response"). Hover the three rows, then Apply. | "Twenty feasible action bundles simulated, ranked on people protected, facilities, equity, cost and response time. Clear the drain and deploy the pump: 3,822 down to 190. The hospital goes from AT RISK to PROTECTED. "Why this response" shows the arithmetic." |
| 1:50–2:10 | Next ×3 (alert, effectiveness). | "The alert is recorded on a labelled demo transport. Then the system checks itself: before, expected, observed, 95% effective." |
| 2:10–2:30 | Open `&scenario=scarcity`, play at 4x. | "Same engine, opposite crisis. A trunk main fails in a heat spell: 3.7 megalitres a day short. Tankers are allocated by equity-weighted need, hospital first." |
| 2:30–2:45 | Back to flood end state → Priority repairs. | "Emergency response fixes today. AquaPulse learns what Bengaluru should fix permanently: drain D104, repeat failure, priority one." |
| 2:45–3:00 | Header trust strip. | "Vercel, AWS Lambda, Rekognition, CloudWatch, Supabase PostGIS. Every number on screen comes from a deterministic engine, and everything simulated is labelled." |

Optional live moment (needs a second device or terminal): post a report to the webhook while the dashboard is open and let the judges watch "NEW CITIZEN EVIDENCE · LIVE REPORT" appear and fuse. Command in `docs/N8N.md`; the secret is `WEBHOOK_SECRET`.

## Expected figures
+30 before the action: baseline 3,822 · Pump P02 2,568 · Clear Drain D104 1,067 · both 190. Evidence score 52 → 64 → 68 → 76. False report: 14, UNVERIFIED. Scarcity: 3.7 ML/day, 23,345 short at +60.

## If something fails
- Map tiles down: cells and markers still render; the tag reads "Basemap unavailable · showing risk layers only".
- AWS or the public site down: run the local build; the header shows AWS UNAVAILABLE and the scenarios still play.
- A drawing or screenshot as the test photo is correctly reported as "no hazard found". Use a real photograph you have the right to show.
- Clicking Apply yourself counts as the scenario's apply step; keep pressing → afterwards.

## Opening with the live map (optional first 40 seconds)
1. `/live`: "These districts need attention right now." (the headline figure and the highlighted districts are official alerts.)
2. Click the state with the most districts (for example Bihār): the camera tilts, its districts lift, the panel lists them.
3. Click the top district: "Why now" shows the actual CWC or IMD alert and when it was issued.
4. Then open `/?demo=1&scenario=flood` for the local forecast and the response. Visible labels to point at: "Flooding may reach Agara General Hospital within 30 minutes.", "Best response", "est. 3,822 → 190 exposed", "PROTECTED", "Priority repairs".
