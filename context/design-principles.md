# AquaPulse design principles

One sentence: **a living city water intelligence surface** — calm, authoritative, precise.

## Layout
- The map is the page. It fills the viewport edge to edge; everything else floats over it or docks to an edge.
- Docked regions only: header strip (48px), left rail (City Pulse, ~280px), right drawer (~380px, only when something is selected), bottom strip (timeline + intelligence stream).
- Panels are flat surfaces with a 1px hairline border. No card-inside-card, no drop-shadow stacks, no backdrop blur on more than the header.
- Target viewports: 1440x900 and 1920x1080. Nothing scrolls horizontally; the right drawer scrolls internally.

## Color
- Surfaces: near-black `#0a0d10`, panel `#10151a`, hairline `#1f2830`. Text `#e6edf3` / muted `#8b98a5`.
- Flood ramp: cyan `#22d3ee` → amber `#f59e0b` → red `#ef4444`.
- Scarcity ramp: cool cyan `#67e8f9` → amber `#f59e0b`.
- Predicted (future horizon) state: violet `#a78bfa`, used as outline/hatch on top of the ramp.
- Verified: green `#34d399`. One accent at a time: at most two saturated hues visible in any panel.
- Color is never the only signal. Pair with an icon, a label, a number, or a pattern (dashed outline = predicted).

## Type
- UI: Geist Sans. Numbers and IDs: Geist Mono with tabular figures.
- Scale: 11 (labels, uppercase, +0.06em tracking), 13 (body), 15 (panel titles), 28–40 (the one hero number per panel).
- Minimum 11px. Labels are sentence-case except short status tags.

## Information design
- Every panel answers one question. Lead with the number, then the delta, then the reason.
- Show provenance quietly: a small tag (LIVE / REAL / SIM / DERIVED) next to the value it describes.
- Estimates are written as estimates ("est. 4,120 exposed").
- Before/after is the core visual: baseline and option are always shown side by side with the delta.

## Motion
- Animation explains a state change: cell color transition, camera fly-to, timeline scrub, report entering the stream, arc drawing for a route, exposure number counting down.
- 150–300ms for UI, 600–1200ms for map camera and cell transitions, ease-out. Respect `prefers-reduced-motion`.
- Nothing loops. Nothing pulses unless its state just changed. No glow, particles, glitch, parallax.

## Reject on sight
Cyberpunk HUD corners, neon outlines, glassmorphism, gradient text, card grids covering the map, emoji as icons, more than one primary button per panel, decorative charts.

## States
- Loading: skeleton lines in panels; the map shows the dark surface, never a spinner over the whole screen.
- Error: inline, specific, with the integration name and state (e.g. "Bedrock: BLOCKED — using Rekognition").
- Empty: one sentence saying what will appear and how to make it appear.

## Accessibility floor
Visible focus ring on every control, keyboard reachable controls, text contrast 4.5:1, `aria-label` on icon buttons, `aria-live="polite"` on the intelligence stream.
