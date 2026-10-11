# Judge Q&A

Short spoken answers, 20–40 seconds each.

**Why AquaPulse?**
Water emergencies fail at the decision, not the data. Officials have alerts, citizens have phones, engineers have asset records, and nobody joins them fast enough. AquaPulse answers four questions on one screen: where is the problem, why, what happens next, and what should we do.

**Why not existing flood maps?**
A flood map shows where water is. It does not tell you which hospital is thirty minutes from trouble, or whether a pump or a drain crew helps more. AquaPulse goes from the map to a ranked response with the expected result, and then records whether it worked.

**What AI is used?**
Amazon Rekognition reads citizen photos and labels what is in them. That is the only machine-learning model in the live path. Bedrock is blocked on our AWS account, so the question box answers from templates and is labelled "not an LLM".

**What is deterministic?**
Every number: risk, people exposed, the confidence score, the ranking of responses, the repair priorities. Same input, same output, covered by tests. A language model may explain a number but never produces one.

**What is real data?**
The national view: NDMA SACHET alerts and IMD nowcasts, refreshed every fifteen minutes with a freshness state. WhatsApp reports are real messages through Twilio. Rekognition, Lambda, Supabase and n8n are real services.

**What is simulated?**
The Bengaluru neighbourhood: drains, pipes, pumps, population and failure history are synthetic and labelled SIMULATED on screen. No city gave us asset data in a day, so we built the model to take it when one does.

**Why both flood and scarcity?**
The same city gets both in the same year, and the same pipes, pumps and crews serve both. One model of the water network lets one team handle too much water and too little.

**Why n8n?**
It is the wiring between services: it receives the Twilio webhook and runs the fifteen-minute refresh. It holds no secrets and makes no decisions. A city IT team can read and change it without touching our code.

**Why AWS?**
Rekognition for photos, Lambda to run it with a role that can do exactly one thing, CloudWatch for logs, all in the Mumbai region. The website never holds AWS keys.

**Why WhatsApp?**
It is already on nearly every phone in India. No app to install, and a location pin and a photo come free.

**How does it avoid fake citizen reports?**
A single report cannot trigger anything. It needs independent confirmations nearby in time and place, consistency with weather, and a link to a known asset. In our false-report scenario one unsupported message scores 14 out of 100 and stays Unverified.

**How is confidence calculated?**
Eight weighted checks that add up to 100: photo analysis, independent confirmations, weather consistency, GPS, timing, duplicates, a human validator, and correlation with infrastructure. 40 asks for verification, 70 escalates. The breakdown is on screen.

**How does it predict?**
A cell-based model of the neighbourhood. Each hexagon has elevation, drainage and rainfall; water moves downhill and blocked drains hold it. We run it for now, 15, 30 and 60 minutes and count people and facilities over the risk threshold.

**How does Best Response work?**
It lists every feasible action and pair with the crews and pumps actually available, simulates each one, and scores it on exposure reduced, facilities protected, equity, confidence, cost and time. In the demo: the pump alone leaves 2,568 exposed, the drain alone 1,067, both together 190.

**How does the learning loop work?**
After an action we record expected against observed. That outcome joins the asset's history. Assets that keep failing rise in the repair list, so drain D104, with nine failures, becomes repair number one.

**Can this scale nationally?**
The national layer already covers every district from official feeds. The detailed model is per city and needs that city's network data. The code path is the same; the limit is data, not compute.

**Why is the detailed model only in Bengaluru?**
One day, one city. We chose depth in one place over a thin layer everywhere, and labelled it as simulated.

**What if the internet or a feed fails?**
The header shows DELAYED, STALE or OFFLINE and keeps the last good data. The local model runs entirely in the browser, so the decision screen works with no network.

**What about government adoption?**
It reads the feeds agencies already publish and uses WhatsApp, which staff already use. It does not replace their systems. A pilot needs one ward's asset list and a control-room screen.

**What makes this unique?**
It closes the loop. Evidence, forecast, a ranked response with a number attached, proof that it worked, and a repair list so it does not happen again.

**How would you deploy or charge for it?**
A yearly subscription per city, priced by population, sold to the municipal corporation or the disaster authority. The first step is a free one-ward pilot through a monsoon.
