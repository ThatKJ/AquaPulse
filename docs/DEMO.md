# Demo

## Start
```bash
npm run build && npm run start     # http://localhost:3100/?demo=1
```
The scenarios need no network, AWS or database. Use a 1440x900 or 1920x1080 window. `Reset` in the demo strip (or reloading the page) restores the seeded state; `npm run demo:reset` clears demo rows from Supabase when it is configured.

Controls: scenario picker, Play, Next event, Reset, 1x / 4x. Arrow keys move the timeline.

## The 60-second flood sequence (scenario "Flood cascade")
| Time | Do | Say |
| --- | --- | --- |
| 0–10 s | Show the calm twin | "This is not another flood map. AquaPulse is a decision engine for both too much water and too little water." |
| 10–20 s | Next ×2 (rain + first report, AI analysis) | A citizen report arrives; the photo analysis is one input, not a decision. |
| 20–30 s | Next ×3 (two more reports, fusion, score escalates) | Three reports become one incident; the Evidence Score rises to 76 and shows why. |
| 30–40 s | Next ×2 (cells turn red, +30 reaches hospital) | In 30 minutes the water reaches the hospital: est. 3,822 people exposed. |
| 40–50 s | Next (action auction) | 20 feasible bundles simulated; top three ranked with cost, response time and equity. |
| 50–60 s | Hover the options, then Apply | Est. exposure 3,822 → 190 with Clear Drain D104 + Pump P02. |

Then: Next ×4 for the alert (demo transport, labelled), the effectiveness record, and D104 rising in Fix This First.

Expected figures at +30 before the action: baseline 3,822 · Pump P02 2,568 · Clear Drain D104 1,067 · both 190. These come from the engine and are asserted as ranges in `tests/scenarios.test.ts`.

## Scarcity (scenario "Scarcity: trunk main P031 fault")
Play at 4x. Pipe fault plus heat opens S-01; the deficit grows from about 2.5 to 3.7 ML/day by +60; Optimize Response sends T01 to the hospital first, then the most vulnerable short cells.

## False report (scenario "False report")
One low-trust report on dry high ground: score 14, HOLD, the twin does not move.

## Live AWS moment (optional, needs `aws login` or the deployed Lambda)
Open an incident → View evidence → Analyze a photo. A real photo goes to Amazon Rekognition and comes back badged `rekognition`. Use a real flood photograph you have the right to show; a drawing is correctly rejected as "no hazard".

## What to say about data
Roads and buildings are real map data. Drains, pipes, facilities, populations and history are simulated and labelled SIM. Numbers are estimates from an explainable cell model, not a hydrodynamic simulation. Bedrock is blocked on this AWS account, so Ask AquaPulse answers are templates built from the simulation and labelled as such.
