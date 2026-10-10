# Landing page brief (not built)

Build only after the command center and deployment are stable.

- **Purpose:** one scroll that makes a judge want to open the command center. Single CTA: "Launch Command Center" → `/?demo=1`.
- **Visual DNA:** the product's own tokens (near-black surface, hairlines, Geist, the five risk bands). Cinematic but restrained; no new palette.
- **Hero:** the live HydroTwin map itself, slowly orbiting, with the line "Not another flood map. A decision engine for too much water and too little."
- **Section 1, the transformation:** the real before/after: est. 3,822 exposed → 190, hospital AT RISK → PROTECTED. Use `docs/screenshots/04-intervention-options.jpg` and `05-intervention-success.jpg`, or the live component.
- **Section 2, the loop:** Observe → Verify → Fuse → Predict → Decide → Act → Prove → Learn → Prevent, each with one real screenshot.
- **Section 3, both crises:** flood and scarcity side by side (`03-critical-flood.jpg`, `06-scarcity.jpg`).
- **Section 4, prevention:** Fix This First (`07-fix-this-first.jpg`).
- **Section 5, what is real:** AWS architecture (Vercel → Lambda → Rekognition, CloudWatch; Supabase/PostGIS) and an honest list of what is live versus simulated.
- **Rules:** real screenshots only, estimates labelled as estimates, simulated data labelled, no "AI" claims for template answers.

## Screenshot package (1920x1080, from the public site, `docs/screenshots/`)
`01-home` · `02-live-evidence` (a real inbound report fusing into F-01) · `03-critical-flood` · `04-intervention-options` · `05-intervention-success` · `06-scarcity` · `07-fix-this-first`

## Storytelling points to carry over
- "Cities don't need another flood map. They need to know what happens next and what to do about it."
- 3,822 → 190, hospital AT RISK → PROTECTED, and the arithmetic behind "why this won".
- Evidence is reasoned over, not plotted: 52 → 64 → 68 → 76; a false report held at 14.
- Say plainly what is live (Lambda, Rekognition, PostGIS, inbound reports) and what is simulated.
