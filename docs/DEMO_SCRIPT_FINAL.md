# Final demo script — 3 minutes

**Final video:** https://youtu.be/GUdpmlMQuSw

This is the script for presenting live. The video follows the same order.

Browser full screen, 1366 wide or more. Open three tabs before you start and leave them loaded:

1. `https://aquapulse-liard.vercel.app/live`
2. `https://aquapulse-liard.vercel.app/?view=local`
3. `https://aquapulse-liard.vercel.app/?demo=1&scenario=flood`

Tab 1 is live, so its numbers change. Tab 3 is deterministic: the numbers below are always the same.
Keys in tab 3: `→` next step, `Space` play/pause, `R` reset.

| Time | Do | Say |
| --- | --- | --- |
| 0:00–0:20 | Tab 1. Point at CURRENT and the two sources in the header | "This is India right now. Official alerts from NDMA and rain nowcasts from IMD, refreshed every fifteen minutes. AquaPulse turns them into one answer: these districts need attention." |
| 0:20–0:40 | Click the first district under "Where to look first" | "One click: country, state, district." |
| 0:40–1:00 | District panel, "Why now" | "It tells me why risk is rising: the real alert text and the rain forecast. The score is ours, built from those sources. What we do not have, we show as unknown, never as zero." |
| 1:00–1:20 | Tab 2. Send a WhatsApp text, or show the notice from one sent a minute ago | "People on the ground are sensors too. A WhatsApp message arrives here in seconds. We verify it came from Twilio and store it once. Photos uploaded in the console are read by Amazon Rekognition." |
| 1:20–1:40 | Tab 3. Press `→` six times | "Now one neighbourhood in Bengaluru. This city model is a labelled simulation. Three reports agree on a blocked drain, so confidence rises from 52 to 76." |
| 1:40–2:00 | Press `→` twice. Read the sentence in the left panel | "Flooding may reach Agara General Hospital within 30 minutes. 3,822 people are exposed." |
| 2:00–2:35 | Press `→` once. Point at "Each action alone", then the winner. Click "Apply Clear Drain D104 + Deploy Pump P02" | "What should we do? A pump alone leaves 2,568 exposed. Clearing the drain alone leaves 1,067. Together: 190, and the hospital is protected. Twenty options were simulated with the crews we actually have. This is arithmetic, not a chatbot." |
| 2:35–2:50 | Press `→` four times, then "Priority repairs" on the left | "And it learns. This drain has failed nine times. It is now repair number one, a pipe is number two." |
| 2:50–3:00 | Stay on the repairs list | "Where is the problem, why, what happens next, what to do. For too much water and too little. That is AquaPulse." |

## If something fails

- **Live feed late:** the header says DELAYED, STALE or OFFLINE and keeps the last good data. Say so and move on.
- **No phone signal:** skip the message and point at a stored report.
- **No network:** tab 3 runs entirely in the browser once loaded.
- **Asked about scarcity:** `?demo=1&scenario=scarcity`, press `→` six times. A pipe fault raises the deficit from 2.5 to 3.7 ML/day; tankers go to the hospital first.
- **Asked about fake reports:** `?demo=1&scenario=false-report`, press `→` three times. One unsupported report stays Unverified at 14/100 and triggers nothing.
- **"Is this AI?":** Rekognition reads photos. Every number comes from a deterministic model. The question box answers from templates and says so; Bedrock is blocked on this AWS account.
