# UI overnight status

Branch `ui-ux-final-polish`, fast-forwarded to `main` after each verified pass. Resumed after the earlier stop.

## Done on this branch (local production build, 1440x900, zero console errors)
- Local map labels are text with a halo, not boxed uppercase plates; the incident label states the risk band in words.
- Plain labels: "Priority repairs", "Best response", "Why this response", "Compare responses", "Confidence".
- Local rail leads with one sentence built from the prediction (for example "Flooding may reach Agara General Hospital within 30 minutes."); figures sit behind "Figures".
- Bottom strip collapses to one 40 px line outside a demo when there are no incidents.
- National view: districts that need attention lift slightly once the camera tilts; India is flat, state view tilts 24°, district view 38°; districts outside the focused state are dimmed; tooltip reduced to band, one reason and "Click for details".
- Drawers slide in over 220 ms; motion tokens defined in `app/globals.css`; reduced motion skips camera easing.

## Verified
46 tests, typecheck, lint, build. In the browser: India / Bihār / Muzaffarpur drill-down; flood 14/14; 3,822 → 190 with PROTECTED; new labels present.

## Not verified
- The collapsed bottom strip on `/?view=local` (my check was case-sensitive against uppercase text; look at it before merging).
- The lifted districts and the new labels were not inspected in screenshots (`.playwright-mcp/nat/ui-district-1440.png`, `ui-local-1440.png` exist, unviewed).
- 1920x1080, 1366x768, scarcity, false report, reduced motion, public site.

## Not started
Landing page pass and refreshed screenshots, before/after ghost layer for the response preview, legend simplification, Cmd+K search, `/live?presentation=1`, `docs/DESIGN_SYSTEM.md`, demo script update, final screenshot package.

## Next exact task
`git checkout ui-ux-final-polish && npm run build && npm run start`, view `/live` (select a state, then a district) and `/?demo=1&scenario=flood` at 1440 and 1920, fix anything off, then fast-forward `main`.

## Pass 2 (resumed)
- WHAT CHANGED: explicit map framing for India, state and district (MapLibre `fitBounds` mis-framed with tilt plus side padding at 1366 wide); re-frame on window resize; lower district lift. Landing page rewritten around five ideas with a national-to-local strip and a typographic response moment; fresh screenshot set; `docs/DESIGN_SYSTEM.md`; demo script updated to the visible labels.
- VERIFIED: local production build at 1366x768, 1440x900 and 1920x1080: India, state and district framing correct; collapsed strip present; flood 14/14, scarcity 6/6, false report Unverified · 14/100; zero console errors. Public site after merge: flood 14/14, scarcity 6/6, zero console errors at 1920. Landing: no horizontal scroll at 390 and 430 px; CTA opens `/live`.
- SCREENSHOTS: `docs/screenshots/01-landing-hero` … `12-landing-mobile` (1920x1080 from the public site; landing from the local build).
- NOT DONE: before/after ghost layer for the response preview; four-band legend; Cmd+K search; `/live?presentation=1`; city level and a basemap in the national view; watched run at speed; formal security review.
