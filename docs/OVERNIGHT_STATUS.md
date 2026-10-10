# Overnight status ledger

Branch `overnight-finalization` (fast-forwarded to `main` at each verified point). Stable tags: `live-ops-two-sources`, `national-and-landing`, `pre-national-live-expansion`, `hackathon-demo-ready`.

## Phase: WhatsApp path (AquaPulse side)
- STATUS: done and verified on the public site with correctly signed requests; not yet exercised from a real phone.
- COMMIT: `07ad536` (+ self-check fix in the next commit).
- WHAT CHANGED: TwiML acknowledgements with a reference; photo and location pairing per reporter (15-minute window, migration `0007`); signature check accepts an orchestrator-forwarded URL only with the server secret; dashboard re-processes a report that gains a location; Twilio settings stored in Vercel; `n8n/citizen-report.json` rewritten to forward the signed request.
- WHAT PASSED (public site): bad signature 403; text → ack; pin → paired; retry → "already has this report"; report visible on the open dashboard about 7 s after sending, fused into F-01, with "NO OFFICIAL SIGNAL" context. 46 tests, typecheck, lint, build, self-check.
- WHAT IS BLOCKED: n8n connector needs authentication; Twilio sandbox webhook must be set by the user; scheduler change set awaits approval. See `docs/MORNING_ACTIONS.md`.

## Not started (in priority order)
1. India map: click a state to zoom and reveal its districts (today: district click, search and free pan/zoom work; there is no state-level selection or city level).
2. First-time-user simplification of `/live` (one headline, details behind "View details") and plain-language labels in the local view.
3. Local view cleanup: boxed uppercase map labels, bottom strip collapse when idle, Ask input width at 1440.
4. Landing page final pass and a refreshed screenshot set (current set predates the nowcast source and SoI outline).
5. Formal security review of the national, corroboration and Twilio changes (they were checked for auth, input validation and escaping only).
6. A watched run of the flood scenario at speed; reduced-motion and mobile re-checks.

## Resume
`git checkout overnight-finalization && npm run check && npm run doctor`, then start with item 1 in `components/national/NationalView.tsx`.
