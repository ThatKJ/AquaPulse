# Overnight status ledger

Branch `overnight-finalization` (fast-forwarded to `main` at each verified point). Stable tags: `live-ops-two-sources`, `national-and-landing`, `pre-national-live-expansion`, `hackathon-demo-ready`.

## Phase: WhatsApp path (AquaPulse side)
- STATUS: done and verified on the public site with correctly signed requests; not yet exercised from a real phone.
- COMMIT: `07ad536` (+ self-check fix in the next commit).
- WHAT CHANGED: TwiML acknowledgements with a reference; photo and location pairing per reporter (15-minute window, migration `0007`); signature check accepts an orchestrator-forwarded URL only with the server secret; dashboard re-processes a report that gains a location; Twilio settings stored in Vercel; `n8n/citizen-report.json` rewritten to forward the signed request.
- WHAT PASSED (public site): bad signature 403; text → ack; pin → paired; retry → "already has this report"; report visible on the open dashboard about 7 s after sending, fused into F-01, with "NO OFFICIAL SIGNAL" context. 46 tests, typecheck, lint, build, self-check.
- WHAT IS BLOCKED: n8n connector needs authentication; Twilio sandbox webhook must be set by the user; scheduler change set awaits approval. See `docs/MORNING_ACTIONS.md`.

## Phase: India drill-down and simpler first view
- STATUS: done; verified on the local production build at 1440x900 (zero console errors); public check follows the merge.
- WHAT CHANGED: India → state → district. Zoomed out, a click selects the state, frames it and lists its districts that need attention; zoomed in, a click selects the district. Breadcrumb `India / State / District` with clickable parents. Left summary leads with one figure ("N districts need attention"); counts sit behind "Details". District panel leads with the risk band and "why now"; confidence, coverage and per-input points sit behind "Technical details".
- WHAT PASSED: India → Bihar (8 districts need attention) → Muzaffarpur → back to Bihar → back to India.
- NOT DONE: no city level between district and the Bengaluru HydroTwin; no basemap roads or rivers in the national view (boundaries only); no layer toggles.

## Not started (in priority order)
1. City level and a basemap (roads, rivers, towns) in the national view at district zoom.
2. First-time-user simplification of `/live` (one headline, details behind "View details") and plain-language labels in the local view.
3. Local view cleanup: boxed uppercase map labels, bottom strip collapse when idle, Ask input width at 1440.
4. Landing page final pass and a refreshed screenshot set (current set predates the nowcast source and SoI outline).
5. Formal security review of the national, corroboration and Twilio changes (they were checked for auth, input validation and escaping only).
6. A watched run of the flood scenario at speed; reduced-motion and mobile re-checks.

## Resume
`git checkout overnight-finalization && npm run check && npm run doctor`, then start with item 2 (local-view labels and bottom strip in `components/map/MapView.tsx` and `components/BottomStrip.tsx`).
