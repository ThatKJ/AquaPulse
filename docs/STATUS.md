# AquaPulse status

Updated 2026-10-11 19:20 IST. A row is PASS only if it was verified by a real call; where a public path exists, through the public deployment (`https://aquapulse-liard.vercel.app`). Every push to `main` deploys to production.

## Re-verification, 2026-10-11 18:40–19:20 IST (commit after `bd3289e`)

Every row below was checked again against production unless noted.

- Gates: typecheck, lint (0 errors), 57 tests, build.
- Engine numbers are now pinned exactly by a test: 3,822 baseline, P02 alone 2,568, D104 alone 1,067, both 190; winner "Clear Drain D104 + Deploy Pump P02".
- Best-response panel now also lists each action of the winning pair alone (engine-simulated), so 2,568 and 1,067 are on screen.
- Production browser run: landing, `/live` India → Haryana → Ambala, flood 14/14, scarcity 6/6 (2.5 → 3.7 ML/day), false report 14/100, D104 before P031, zero console errors, zero failed requests, no horizontal overflow at 1366, 1920 and 390.
- Demo isolation: the false-report score stayed 14/100 with three synthetic reports in the feed from the previous minutes.
- National data: NDMA and IMD CURRENT; n8n refresh ran every 15 minutes from 11:00Z to 13:00Z, all successful; 11 sync runs in two hours.
- Citizen path through production n8n with signed synthetic requests: bad signature 403, signature for another URL 403, text 200, repeated message idempotent, pin paired into one row, photo fields forwarded, a link-local media URL fetched nothing.
- Rekognition: `/api/evidence` returned `source: rekognition` in 1.3 s.
- Supabase: no table without row-level security, no policies.
- Unauthenticated POSTs to every write endpoint: 401, 403 or 400. No CORS header on API routes.
- Keyboard pass on the local and national views: every button, link and input has a name and a visible focus ring, Escape closes the question panel. Open: the map's overlay canvas is a second, unnamed tab stop; no screen-reader pass.
- Not re-run: the direct Lambda wrong-secret probe (the AWS CLI session had expired; it passed earlier today).
- Real phone, 13:31–13:32Z: text and location pin PASS; the photo was received and stored, but Twilio's trial blocks media download (error 20003), so Rekognition did not run on it.
- The sandbox opt-in message ("join <code>") is no longer stored as a report (58 tests).
- Critical Alert workflow: draft, unpublished, READY_AFTER_HACKATHON.
- New: `DEMO_SCRIPT_FINAL.md`, `JUDGE_QA.md`, `ARCHITECTURE_FINAL.md`, `screenshots/final-r2/`.

## Summary (authoritative)

| Feature | Status | Real / simulated | Evidence | Limitation |
| --- | --- | --- | --- | --- |
| Landing page | PASS | Real figures from the live feed | Production 06:20Z: headline renders, 0 broken images, CTA opens `/live` | |
| India map, live official data | PASS | LIVE_OFFICIAL (NDMA SACHET, IMD nowcast) | Production 06:16Z: CURRENT, 37 active alerts, 61 nowcasts, 56 districts need attention | District placement by name matching; some alerts name only a state |
| Headless refresh of national data | PASS | Real | n8n schedule (every 15 min) ran at 06:15:03Z and 06:30:03Z; the site synced both feeds at 06:15:04–09Z with no visitor | Depends on the n8n Cloud trial staying active. An EventBridge alternative is prepared, unexecuted (REQUIRES_USER_APPROVAL) |
| Water risk score | PASS | DERIVED | Two inputs with per-input points; river and heat shown as unknown | Two of four planned inputs |
| India → state → district drill-down | PASS | Real | Production: India / Punjab / Patiala with the alert text and nowcast under "Why now" | No city level; district → Bengaluru opens a second map |
| WhatsApp text, real phone | PASS | USER_REPORT, real | 06:02Z: Twilio → n8n (execution 18) → signature verified → one Supabase row → acknowledgement delivered | Reply is a Twilio trial template, not AquaPulse wording |
| WhatsApp location pin, real phone | PASS | USER_REPORT, real | 13:31–13:32Z: text (n8n execution 66) then pin (execution 68) from a real phone → one report row carrying the pin's coordinates; acknowledgement delivered (201) | Reply is a Twilio trial template |
| WhatsApp photo, real phone | PARTIAL | USER_REPORT, real | 13:32Z: photo message (execution 67) verified, stored once, acknowledged | The image itself cannot be downloaded: Twilio answers 401, error 20003 "not available on a Trial account" |
| Rekognition on a real WhatsApp photo | BLOCKED_EXTERNAL | | Twilio trial refuses media download (20003), confirmed with a direct read-only API call | Works only after a Twilio upgrade (not approved). Uploads through the console reach Rekognition (PASS) |
| Rekognition on uploads | PASS | Real AWS | Production 06:14Z: `/api/evidence` returned `source: rekognition` in 1.96 s | |
| AWS Lambda, CloudWatch, IAM | PASS | Real AWS | 401 without or with a wrong secret; role is `rekognition:DetectLabels` plus its own logs; log stream current | Deployed with a root session (runtime uses the role) |
| Bedrock | BLOCKED_EXTERNAL | | Account restriction | Question box uses labelled templates |
| Supabase / PostGIS | PASS | Real | Health PASS; RLS on all 22 application tables, no policies | |
| n8n citizen-report workflow | PASS | Real | Published; repo file matches the deployed workflow | |
| n8n critical-alert workflow | PARTIAL | | Draft on the instance, validated, not published | Needs a credential created by hand; nothing has been sent to anyone |
| Flood scenario | PASS | SIMULATED city, deterministic model | Production 06:22Z: 14/14, 3,822 → 190, hospital PROTECTED | |
| Best response | PASS | DERIVED | Winner Clear Drain D104 + Deploy Pump P02; ranking by engine score, 20 options simulated | |
| Priority repairs | PASS | DERIVED from simulated history | D104 first, P031 second | |
| Scarcity scenario | PASS | SIMULATED | Production: 6/6, deficit 3.7 ML/day, hospital prioritised | |
| False-report scenario | PASS | SIMULATED | Production: 3/3, Unverified · 14/100, with a recent live report present in the feed | |
| Scenarios unaffected by live reports | PASS | | Fixed 06:20Z: a report sent just before a scenario run was being merged into it (false report read 31/100). Scenario runs now start clean | A report arriving during a run is still shown and merged, by design |
| Question box | PASS | Template over engine output | Answer labelled "Grounded system response … Not an LLM" | No LLM |
| Responsive | PASS | | No horizontal overflow at 1366, 1440, 1920 and 390 (landing) | Console is desktop only |
| Accessibility | PARTIAL | | Labels, focus rings, reduced motion, non-colour risk cues in place | No keyboard or screen-reader pass this round |
| Security | PASS with PARTIAL items | | `docs/SECURITY_REVIEW.md` | No CSP, in-memory rate limit, open console |
| Performance | PASS | | `docs/PERFORMANCE.md` | |
| Tests | PASS | | 58 tests (engine, scenarios, national, webhook); typecheck, lint, build clean | Browser checks are scripted Playwright runs, not a committed E2E suite |
| EventBridge scheduler | DEFERRED | | Change set `deploy-20261011-023903` exists, unexecuted | Optional now |
| Before/after ghost layer, presentation mode, city level, national basemap | DEFERRED | | Not built | |

The sections below are the dated evidence log behind this table; where they disagree with it, the table is newer.

## Live (verified on the public path)

| Area | State | Evidence |
| --- | --- | --- |
| AWS Lambda `aquapulse-ai-fn` (stack `aquapulse-ai`, ap-south-1) | PASS | CREATE_COMPLETE 2026-10-10. `/health` with secret 200, without 401. First attempt rolled back on reserved concurrency (new-account limit); redeployed without it after a re-preview showing the same six resources |
| Rekognition through the Lambda | PASS | Direct `/evidence` call 17:10Z returned `source: rekognition`; upload from the public site returned a Rekognition result in 728 ms, badged REKOGNITION · LIVE |
| CloudWatch | PASS | One structured `ai-lambda /evidence` line and one `rekognition DetectLabels` line per request, with request ids; no secrets or image bytes |
| Lambda IAM | PASS | Inline policy only: `rekognition:DetectLabels` and its own log stream/events. No Bedrock, S3 or managed policies. Runtime identity is the assumed role, not root |
| Public endpoint | PASS | One Function URL, shared-secret gated. No API Gateway, no other new endpoint |
| Public site | PASS | 1440x900 and 1920x1080 in a fresh browser: zero console errors, no localhost calls, header AWS CONNECTED · AI REKOGNITION · DB SUPABASE |
| Supabase + PostGIS from the public site | PASS | `/api/health` db PASS (PostGIS 3.3). After the public rehearsal the database held incidents, 6 evidence rows with analysis, 6 incident-evidence links, 1 intervention and its result (effectiveness 0.95). 150 m radius query excludes a facility 225 m away |
| Webhook contracts on the public site | PASS | report (and duplicate on retry), alert (and no resend on retry), verification, action-complete all 200 with the secret against Supabase; 401 with a wrong secret |
| Flood scenario (public) | PASS | 14/14 at both sizes; est. 3,822 → 190 |
| Scarcity scenario (public) | PASS | 6/6 at both sizes |
| False-report scenario (public) | PASS | 3/3, UNVERIFIED · 14/100 |
| Reset (public) | PASS | Returns to 1 event, step 0 |
| Engine | PASS | 25 tests; deterministic |
| Real-speed flood run (local production build) | PASS | 56 s, average 119 fps, 3 frames over 50 ms (worst 59 ms) |

## National layer (2026-10-11, branch `national` → main)

| Area | State | Evidence |
| --- | --- | --- |
| NDMA SACHET ingestion | PASS | Two real syncs: 99 alerts stored (60 + 39), keyed by CAP identifier; 98 with a state, 53 with a district; `sync_runs` records each run |
| District placement | PARTIAL | Name matching only (the feed's polygon service returns 403). 20 of 25 active alerts placed on 2026-10-10 |
| Composite water risk | PARTIAL | One of four planned inputs (official alerts). Rainfall, river and heat are UNKNOWN and shown as such |
| India map as default route | PASS (local build) | 735 districts (498 KB GeoJSON, 122 KB gzipped), real alert districts coloured, hover, select, search, breadcrumb, entry to the Bengaluru HydroTwin; zero console errors at both sizes |
| Demo routes after the change | PASS (local build) | `/?demo=1`: flood 14/14 with 3,822 → 190 and PROTECTED, scarcity 6/6, false report UNVERIFIED · 14/100 |
| Scheduler | PARTIAL | No cron: the server refreshes after a read when the last sync is older than 10 minutes. With no visitors nothing syncs. A forced sync route exists behind the server secret |
| IMD JSON APIs, MOSDAC, CWC station feed | BLOCKED / deferred | See `docs/NATIONAL_DATA_SOURCES.md` |
| Public national view | PASS | 2026-10-11 01:52 IST: public site opened on India at both sizes with zero console errors; the public server refreshed the feed by itself (last sync moved from 01:41 to 01:51 IST); `/?demo=1` flood still 14/14 with 3,822 → 190 and PROTECTED |
| Landing page | PASS (local build) | `/` renders in about 1 s with live figures; CTA opens `/live`; demo links still open the command center; no horizontal scroll at 390 px |

## Live operations round (2026-10-11, branch `ops`)

| Area | State | Evidence |
| --- | --- | --- |
| IMD district nowcast (source 2) | PASS | Real fetch: 100 items stored. All had expired (issued 19:00 IST, valid to 22:00), so 0 were active at 02:15 IST and no district carried a nowcast contribution. Parser tested on the recorded real response |
| National risk v2 | PASS | Two inputs: official alert and nowcast rain, each with its points contribution. With the nowcast feed current, coverage reads 2 of 4 and confidence 65%; river and heat stay UNKNOWN. Risk never falls when the second input arrives (tested) |
| Per-source freshness | PASS | Header status is the least fresh source; each source shows its own age |
| Citizen ↔ official corroboration | PASS (API and local UI) | Deterministic. A flood report at Muzaffarpur returned CORROBORATED (+10, CWC flood alert active); the same at Bengaluru returned NO_OFFICIAL_SIGNAL (0). The delta is advisory: the local Evidence Score is not changed by it. Not yet exercised with a real WhatsApp report |
| Scheduled ingestion | BLOCKED on approval | `/api/ingest/national` (secret required: 401 without) refreshes both sources and respects the single-flight lock. EventBridge Scheduler resources are written in the Lambda template but not created; the AWS CLI session has also expired |
| Boundary depiction | PARTIAL | A Survey-of-India-depiction national outline (DataMeet, CC BY 4.0) now draws the country's extent, verified visually. District polygons are still geoBoundaries 2021, which stop short of that outline in the north, so that area has no district detail |
| WhatsApp inbound, real phone (Twilio → n8n → AquaPulse) | PARTIAL | 2026-10-11 06:02Z: a text from a real phone ran through n8n Cloud (workflow `XfaKArmc2N1OgAnd`, execution 18, success, 2.1 s), AquaPulse verified Twilio's signature against the n8n URL (`TWILIO_FORWARDER_URL`), stored the row and the acknowledgement was delivered. Signed test requests through n8n: bad signature 403, repeated `MessageSid` stored once. Location pin and photo through n8n from a real phone: not yet sent |
| WhatsApp acknowledgement | PARTIAL | The Twilio number is a trial "Try out WhatsApp" number: it rejects TwiML replies (12300) and free text (21654). Replies go out as a Twilio-provided template (`TWILIO_ACK_CONTENT_SID`), delivered at 05:48Z and 06:02Z, so the wording is Twilio's sample text, not AquaPulse's. The AquaPulse wording needs the classic sandbox or a paid account |

## Demo / simulated (by design, labelled in the UI)

- The city feed: cells, drains, pipes, facilities, populations, history and the three scenarios are a seeded simulation (header: MODE SIMULATION).
- Recorded analyses on demo reports (`fixture`, tagged SIM).
- "Observed" intervention results are simulated observations.
- Ask AquaPulse answers are templates built from simulation data, labelled "Template answer", not an LLM.
- Alerts use the demo transport (recorded, not sent).

| State API security (public) | PASS | `/api/state` 401 without or with a wrong secret, 200 with it. The console mirrors through `/api/demo/sync`, which accepts only a scenario id and step count and replays the scenario server-side |
| Inbound report → dashboard (public) | PASS | A report posted to `/api/webhooks/report` at 17:39:04Z was accepted in 1.4 s and appeared on the open dashboard at 17:39:10Z, fused into F-01 (3 → 4 reports, score 76 → 77), tagged WHATSAPP · LIVE REPORT. Sent by curl with explicit coordinates, not from WhatsApp; no image |
| Public security checks | PASS | Unsigned Twilio webhook 403; wrong webhook secret 401; 4.6 MB image 413; GIF and HTML-as-PNG 415; oversized JSON 413; duplicate `messageId` returns the first row |
| Reduced motion (public) | PASS | With `prefers-reduced-motion`, step 9 still shows 3,822 → 190, WINNER and PROTECTED |
| Offline basemap (public) | PASS | Tiles blocked: tag shown, cells, AT RISK marker and figures present |
| Ask AquaPulse (public, both sizes) | PASS | Answers labelled "Grounded system response … Not an LLM", source tags shown, no overflow |

## Blocked

| Area | Reason |
| --- | --- |
| Bedrock | Account-level restriction: `ValidationException: Operation not allowed` on 2026-10-10 07:36Z; Claude and Nova both NOT_AUTHORIZED; Anthropic use-case form unfilled. Only AWS Support can lift it. One check per session; no further calls made. The Lambda role has no Bedrock permission until a model is configured |
| AquaPulse-worded WhatsApp reply | Twilio trial restriction (see WhatsApp acknowledgement above) |
| Live alert | Not attempted: the trial number sends only Twilio templates. Alerts are recorded on the demo transport |

## Unverified

- n8n workflows other than `citizen-report.json` (`critical-alert`, `verification`, `intervention-result`): generated to the export format, never imported into an instance.
- Twilio media fetch from a real WhatsApp photo (including the storage-bucket redirect rule), and Rekognition on such a photo: no real photo has been received yet.
- The 1024-wide layout. Motion was measured (119 fps average at real speed) but not watched by a person.

## Known limits

- Engine ids repeat across scenarios (F-01 exists in both flood and false-report), so the database mirror keeps the latest incident per id, not a history.
- The database mirror only records scripted scenario states; an operator who applies a different bundle or adds a photo as a report is not mirrored. `/api/demo/sync` is public but can only write those fixed states. `/api/reports` is a public read of inbound report text and location (no reporter identity).
- Deploys run as the account root user (the only identity available). The public runtime path does not.
- Contract-test rows from 2026-10-10 remain in `evidence_events`, `alerts` and `verification_requests`.

## Review log
(findings and triage decisions go here: source · finding · Blocker/High/Medium/Nit · act/skip · why)
- Supabase advisor · PostGIS installed in `public` (spatial_ref_sys without RLS, st_estimatedextent callable by anon) · Medium · skip · PostGIS-owned objects, reference data only; app tables are RLS-locked with no policies and our two functions are service-role only. Moving the extension means recreating every geography column.
- Design review 1 · header said LIVE over a simulated feed · High · act · relabelled "Simulated feed"
- Design review 1 · tagline hidden at 1440 · High · act · shown from 1280 px
- Design review 1 · risk trajectory sparkline nearly flat (axis from 0) · Medium · open
- Design review 1 · calm-state cells very faint · Medium · open
- Code review (M3) · rate limit keyed on client-supplied `x-forwarded-for` · High · act · prefers platform-set `x-real-ip`; still per instance
- Code review · `/api/health` uncached DB and Lambda calls · Medium · act · whole response cached 30 s
- Code review · Lambda error codes collapsed to 502 on the web host · Medium · act · code passed through; Lambda uses the same status map
- Code review · bad image returned 502 with raw AWS text · Medium · act · 415 with a fixed message (verified with a truncated PNG)
- Code review · Twilio route dropped `analysisError` · Medium · act · logged
- Code review · Twilio media redirect to an S3 host fails the allowlist · Medium · skip · unverified claim and Twilio itself is UNVERIFIED; widening the allowlist to S3 weakens the SSRF guard. Revisit with real Twilio credentials
- Code review · `sendAlert` has no idempotency key; retry can resend · Medium · skip · Twilio not configured; demo transport only. Must fix before real sends
- Code review · AI health uses per-instance memory, may read UNVERIFIED on serverless · Medium · skip · errs toward under-claiming
- Code review · memory vs Supabase adapters differ on verification/action-complete · Medium · open · same gap as the API row above
- Code review · duplicated helpers between Lambda handler and routes · Nit · skip
- Demo gate · network-blocked rehearsal of the flood scenario on the production build · passed 2026-10-10 (basemap offline tag shown, cells render)
- Security review (M6, done by reading the server code; the built-in `/security-review` only covers unpushed diffs) · no Critical or High finding. Upload validation, webhook auth, secret handling, SSRF guard and RLS read as intended
- Security · alert retry could send twice · Medium · act · the alert row is claimed by idempotency key before sending; a retry returns the first result (checked with the memory adapter; Supabase path not exercised)
- Security · Twilio media redirect to S3 rejected · Medium · act · a redirect hop (never the first URL) may go to Twilio's own `media.twiliocdn.com` bucket only; other buckets and hosts rejected (unit-checked; UNVERIFIED against live Twilio)
- Security · webhooks 404 with Supabase because incidents are not persisted · Medium · act · migration `0002` drops those foreign keys; verification and action-complete now record (Supabase path not exercised: no service key in `.env.local`)
- Security · reporter phone hash was unsalted SHA-256 · Medium · act · HMAC keyed with the server secret
- Security · AI health state is per instance on serverless · Low · skip · can only under-report
- Polish round (2026-10-10) · shared risk grammar (Safe/Watch/Elevated/High/Critical with glyphs), visible calm-state cells, map legend, AT RISK → PROTECTED facility state, timeline axis, trust strip (MODE SIMULATION · AWS · AI · DB), intervention ladder with "Why this won", proof loop, evidence score history, scarcity affected-zone panel, prevention view, `?scenario=` links
- Polish round · bug · manual Apply during the demo let the scenario apply a second bundle · High · act · a manual Apply now counts as the scenario's apply step (verified: flood reaches 14/14 with one intervention)
- Polish round · bug · scarcity mode showed flood figures in the hero and timeline · High · act · figures follow the active domain
- Final rehearsal on the production build, 1440x900 and 1920x1080 · flood 14/14, scarcity 6/6, false report 3/3, Reset returns to 1 event and step 0 · zero console errors
- Open · priority tiers and the predicted outline are not pattern-filled on the map (needs an extra deck.gl package); tiers differ by outline, height and label
- Open · fused report markers sit under the incident label because demo reports are within metres of it; the "3 reports fused" badge carries it
- Open · reduced motion and the 1024-wide layout were only spot-checked
- Final phase (2026-10-10 night) · `/api/state` publicly writable · High · act · secret required; browser uses a state-free replay route
- Final phase · one rate-limit bucket per IP shared by all routes, so dashboard polling exhausted Ask and photo upload on the public site · High · act · buckets are per route (verified: Ask and upload work after 12 s of polling)
- Final phase · Git-triggered Vercel deploys had no env vars · High · act · env stored in the Vercel project; health sampled 6/6 PASS afterwards
- Final phase · formal `/security-review` command · not run: it reviews unpushed diffs and this work was pushed incrementally. The same scope was reviewed by reading and by the public tests above
- Design correction (2026-10-11) · removed the "terminal" look: monospace is now only on ids, timestamps and the asset code (numerals are tabular sans); tags lost their borders; header status is plain text (MODE / AWS / VISION / DB), no icon chips and no "AI" label; left rail is 248 px and floats at its own height; bottom strip is 156 px and spans the width; mode switch is a plain list with a left indicator; legend is unboxed; calm and Watch cells are muted. Verified locally at 1440x900 and 1920x1080: flood 14/14, scarcity 6/6, zero console errors, no horizontal scroll
- Design correction · the brief's national views (India map, district selected, critical district) were not captured because no national layer exists; see `docs/NATIONAL_DATA_SOURCES.md`
