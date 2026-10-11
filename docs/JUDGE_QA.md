# Judge Q&A

Short answers to say out loud.

**What problem are you solving?**
In a flood or a water shortage, the people in charge have alerts in one place, complaints in another, and no way to test a response before sending crews. AquaPulse puts it on one screen and answers four questions: where is the problem, why, what happens next, and what should we do.

**Why not just use weather or flood maps?**
A map tells you where the water is. It does not tell you which hospital is thirty minutes from trouble, or whether a pump or a drain crew helps more. AquaPulse goes from the map to a ranked response with a number attached.

**What is live?**
The India map: official NDMA alerts and IMD rain forecasts, refreshed every fifteen minutes. WhatsApp text and location reports, tested from a real phone. Amazon Rekognition on uploaded photos. Supabase, n8n, Twilio and AWS Lambda are all real services.

**What is simulated?**
The Bengaluru neighbourhood. Its drains, pipes, pumps, population and failure history are synthetic and labelled as simulated on screen. No city gave us asset data in a day, so we built the model to take real data when one does.

**What does AWS do?**
Amazon Rekognition reads uploaded photos and tells us what is in them. It runs inside an AWS Lambda whose role can do that one thing, with logs in CloudWatch. The website itself never holds AWS keys.

**Do you use an LLM?**
No. Every number comes from a deterministic model: same input, same output, covered by tests. Bedrock is blocked on our account, so the question box answers from templates and says so.

**Why n8n?**
It is the wiring. It receives the WhatsApp webhook from Twilio and runs the fifteen-minute data refresh. It holds no secrets and makes no decisions, so a city IT team can read and change it without touching our code.

**How do citizen reports work?**
Someone sends a WhatsApp message and a location pin. It goes through Twilio and n8n to AquaPulse, which checks Twilio's signature, stores the message once, and shows it in the console within seconds. The phone number is stored only as a hash.

**How do you avoid fake reports?**
One report cannot trigger anything. It needs other reports nearby in place and time, weather that fits, and a link to a known asset. In our false-report scenario a single unsupported message scores 14 out of 100 and stays unverified.

**How is confidence calculated?**
Eight weighted checks that add up to 100, including photo analysis, independent confirmations, weather, location and timing. At 40 we ask for verification, at 70 we escalate. The breakdown is on screen.

**How does Best Response work?**
It lists every action the available crews and pumps can actually deliver, alone and in pairs, and simulates each one. In the demo, the pump alone leaves 2,568 people exposed, clearing the drain leaves 1,067, and both together leave 190 with the hospital protected.

**How does the system learn?**
After each response it records what it expected against what happened, and adds that to the history of the asset that failed. Assets that keep failing rise up the repair list. That is why drain D104 is repair number one.

**Why both flood and scarcity?**
The same city gets both in the same year, through the same pipes, pumps and crews. One model of the water network handles too much water and too little.

**Can this scale across India?**
The national layer already covers every district, because it reads feeds the agencies publish. The street-level model is per city and needs that city's network data. The limit is data, not computing.

**Why is the local HydroTwin only in Bengaluru?**
We had one day, so we chose depth in one place over a thin layer everywhere. It is labelled as a simulation. Adding a city means loading its drains, pipes and population.

**What happens when a data source is offline?**
The header shows DELAYED, STALE or OFFLINE and keeps the last good data on screen. Missing inputs are shown as unknown, never as zero. The local model runs in the browser, so the decision screen still works.

**What does not work yet?**
A photo sent by WhatsApp is not analysed, because Twilio's trial account blocks the download; uploaded photos are. The alert workflow is a draft and sends nothing. The console has no sign-in.

**Who would use it, and how would you charge?**
A city's disaster cell or water board. It reads feeds they already have and uses WhatsApp, which staff already use. We would start with a free pilot in one ward through a monsoon, then a yearly subscription per city.
