# AquaPulse status

Updated 2026-10-10 (evening). A row is PASS only if it was verified by a real call; where a public path exists, through the public deployment.

Public site: https://aquapulse-liard.vercel.app/?demo=1 (Vercel). Note: this was meant to be a preview deploy; Vercel assigned the project's first deployment to its production alias. App code deployed = commit `44ea345`.

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

## Demo / simulated (by design, labelled in the UI)

- The city feed: cells, drains, pipes, facilities, populations, history and the three scenarios are a seeded simulation (header: MODE SIMULATION).
- Recorded analyses on demo reports (`fixture`, tagged SIM).
- "Observed" intervention results are simulated observations.
- Ask AquaPulse answers are templates built from simulation data, labelled "Template answer", not an LLM.
- Alerts use the demo transport (recorded, not sent).

## Blocked

| Area | Reason |
| --- | --- |
| Bedrock | Account-level restriction: `ValidationException: Operation not allowed` on 2026-10-10 07:36Z; Claude and Nova both NOT_AUTHORIZED; Anthropic use-case form unfilled. Only AWS Support can lift it. One check per session; no further calls made. The Lambda role has no Bedrock permission until a model is configured |
| Citizen report end to end (Twilio → n8n → AquaPulse → AWS → Supabase → dashboard) | No Twilio account and no n8n instance |

## Unverified

- n8n workflows (`n8n/*.json`): generated to the export format, never imported into an instance.
- Twilio: signature validation, media fetch (including the storage-bucket redirect rule) and live sending are unit-checked only.
- Reports arriving by webhook are stored but do not appear on the dashboard: the console's world is the in-browser engine, and nothing reads stored reports back into it.
- Reduced motion; the 1024-wide layout; Ask AquaPulse at 1920 on the public site (answered at 1440; the 1920 check read the page too early).
- Offline basemap tag after the last polish round (verified before it).

## Known limits

- Engine ids repeat across scenarios (F-01 exists in both flood and false-report), so the database mirror keeps the latest incident per id, not a history.
- `/api/state` has no operator auth: anyone who finds it can write bounded incident rows. Rate-limited and schema-capped; needs auth before real use.
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
