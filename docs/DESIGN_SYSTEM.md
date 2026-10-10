# Design system

AquaPulse should read as geospatial operations software: map first, data second, chrome last. Every screen answers, in this order: where is the problem, why, what happens next, what should we do.

## Type
- Geist Sans for everything; numerals are tabular (`.tabular`).
- Geist Mono (`.mono`) only for incident and asset ids, timestamps and system state.
- Five sizes: 11 (labels, uppercase, tracked), 13 (body), 15 (panel titles), 20–24 (location names), 32–44 (the one outcome number per view). The landing page adds editorial sizes up to 84.

## Colour
- Surfaces: `surface #0a0d10`, `panel #10151a`, `hairline #1f2830`; text `ink`, `muted`, `faint`.
- Risk is semantic and never colour alone: five bands in `components/risk.ts` (Safe, Watch, Elevated, High, Critical), each with a glyph and a label. Flood runs muted cyan → amber → red; scarcity blue → amber → red.
- Violet marks predicted (future) state only. Green marks verified or protected only.

## Surfaces
Flat panels, hairline dividers, no radius, no blur, no gradients, no glow. Spacing does the grouping. One contextual panel at a time beside the map; the bottom strip is one line unless there is a timeline to scrub.

## Map
- **India level:** flat, boundaries only (no basemap tiles), state names; districts that need attention are filled.
- **State level:** camera tilts 24°, districts outside the state dim, districts that need attention lift slightly, district names appear.
- **District level:** tilt 38°, the district is outlined.
- **Local forecast (Bengaluru):** full basemap with buildings, tilted, risk cells extruded modestly by band.
- Labels are text with a halo (`.map-label`), not boxed plates. Framing is computed explicitly (`frame()` in `NationalView.tsx`) because MapLibre's `fitBounds` mis-frames with tilt and side padding.

## Motion
Tokens in `app/globals.css`: micro 150 ms, panel 220 ms (`.panel-in`), map context 800–900 ms, landing reveals 600 ms once. Motion explains a change of state; nothing loops. With reduced motion, camera moves are instant and reveals are off.

## Words
Default labels are plain: Water risk, Confidence, Why now, Best response, Priority repairs, Where to look first. Product terms (Evidence Score, HydroTwin) appear only as secondary text. Estimates are written as estimates; simulated data is tagged SIM; a missing input is "unknown", never zero.

## Reject on sight
Boxed uppercase plates on the map, bordered chips, icon pills in the header, card grids, neon outlines, monospace as the body face, anything pulsing without a state change.
