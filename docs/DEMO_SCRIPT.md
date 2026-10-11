# Demo script — 3 minutes

Laptop at 1366 wide or more, browser full screen. Open three tabs beforehand:
1. `https://aquapulse-liard.vercel.app/live`
2. `https://aquapulse-liard.vercel.app/?view=local`
3. `https://aquapulse-liard.vercel.app/?demo=1&scenario=flood`

Numbers in tab 1 are live and will differ from the ones quoted here. Numbers in tab 3 are deterministic and always the same.

| Time | Screen and click | Say |
| --- | --- | --- |
| 0:00–0:20 | Tab 1. India map, header shows CURRENT and the two sources | "This is India right now. These are official alerts from NDMA, IMD and the Central Water Commission, refreshed every fifteen minutes. AquaPulse turns them into one answer: this many districts need attention." |
| 0:20–0:45 | Click the first district under "Where to look first". The camera moves to the state, then the district | "One click takes me from the country to the state to the district." |
| 0:45–1:05 | District panel: the risk band and "Why now" | "It tells me why now: the actual alert text and the rain nowcast. The score is ours, derived from those sources, and it says so. Anything we do not have, like river gauges, counts as unknown, not zero." |
| 1:05–1:25 | Tab 2. Send a WhatsApp text to the Twilio number (or show the notice from one sent a minute earlier) | "Citizens are sensors too. A WhatsApp message goes through Twilio and n8n into AquaPulse, which checks Twilio's signature, stores it once, and shows it here in seconds. A photo would be checked by Amazon Rekognition." |
| 1:25–1:45 | Tab 3. Press → five times, to the verified blocked drain | "Now the local forecast for Bengaluru. This city data is a labelled simulation. Three reports and a photo analysis confirm a blocked drain: confidence climbs from 52 to 76." |
| 1:45–2:10 | Press → three more times. Left panel: "Flooding may reach Agara General Hospital within 30 minutes." | "The model runs the next hour. In thirty minutes, 3,822 people are exposed and the hospital is at risk." |
| 2:10–2:40 | Press → once, then click "Apply Clear Drain D104 + Deploy Pump P02" | "It simulated twenty options with the crews and pumps we actually have. The best response clears the drain and deploys one pump: 3,822 down to 190, and the hospital is protected. This ranking is arithmetic, not a language model." |
| 2:40–3:00 | Press → four times to the end, then "Priority repairs" in the left panel | "And it learns. That drain has failed nine times. It is now repair number one, so next monsoon this does not happen at all." |

## If something fails
- **Live feed unavailable:** the header says DELAYED, STALE or OFFLINE and the last good data stays on screen. Say so and move on; do not present stale data as current.
- **No phone or no signal:** skip the message; point at the stored reports instead ("this one arrived at 11:32 this morning").
- **No network at all:** tab 3 runs entirely in the browser once loaded. Keep it loaded before you start.
- **Scarcity question from a judge:** `?demo=1&scenario=scarcity`, press → six times: a pipe fault raises the deficit to 3.7 ML/day and tankers go to the hospital first.
- **"Is this AI?":** Rekognition reads photos. Everything numeric is a deterministic model. Bedrock is blocked on this AWS account, so the question box answers from templates and is labelled that way.

Keys in tab 3: Space play/pause, → next step, R reset.
