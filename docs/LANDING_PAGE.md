# Landing page

`/` when the URL carries no `demo`, `scenario` or `view` parameter. The live map is at `/live`; demo links such as `/?demo=1&scenario=flood` are unchanged.

- **Hero:** "See where water risk is rising. Understand what happens next. Act before impact." One primary action, "Open live map". The live figure ("N districts need attention right now") is read at request time from the national snapshot; if any source is stale it reads "at the last update" and the note says "Data delayed". If the database is unreachable the figure is omitted.
- **Story, five ideas:** Observe, Verify, Predict, Act, Learn, plus a national-to-local strip (India, state and district, local forecast) and a typographic response moment (3,822 → 190; Hospital at risk → Protected).
- **"What is real"** lists live, simulated-and-labelled and not-connected items. Edit it whenever that changes.
- **Images:** ten real captures of the public site at 1920x1080 (`public/landing/`, 1600 px JPEG, 3.3 MB in total, lazy-loaded below the hero). No mock-ups.
- **Motion:** sections fade in once on scroll (`components/Reveal.tsx`); off with reduced motion; content is visible without JavaScript.
- **Checked (local production build):** zero console errors; no horizontal scroll at 390 and 430 px; the call to action opens `/live`.

Not done: a live map in the hero (a capture is used), measured LCP on the public host.
