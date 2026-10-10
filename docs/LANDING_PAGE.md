# Landing page

`/` (when the URL carries no `demo`, `scenario` or `view` parameter). The command center is at `/live`; demo links such as `/?demo=1&scenario=flood` are unchanged.

- **Server-rendered** (`components/Landing.tsx`): no map runtime is loaded. Local production build: page load about 1 s; no console errors; no horizontal scroll at 390 px wide.
- **Hero figures are live:** districts under a water-related alert, flood and river alerts, and states with active alerts, read at request time from the same snapshot as the command center, with the last sync time. If the database is unreachable the figures are omitted.
- **Screenshots are real captures** of the public site at 1920x1080 (`public/landing/`, 1600 px JPEG, 2.3 MB in total, lazy-loaded below the hero).
- **Story:** national awareness → ground truth → prediction → decision (3,822 → 190) → both sides of water → learning → what is real → call to action.
- **"What is real"** lists live, simulated-and-labelled, and not-connected items in three columns. It must be edited whenever that changes.
- No gradients, no stock imagery, no generated mock-ups.

Not done: a live map in the hero (a screenshot is used), animation, and a measured LCP on the public host.
