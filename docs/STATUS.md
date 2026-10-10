# AquaPulse status

States: WORKING (verified, evidence named) · PARTIAL · BLOCKED · NOT STARTED.

| Area | State | Evidence / blocker |
| --- | --- | --- |
| Scaffold + production build | WORKING | `next build` exit 0, 2026-10-10 |
| Shared contracts (`lib/schemas`) | WORKING | typecheck |
| AWS identity | WORKING | STS GetCallerIdentity ok 2026-10-10 07:36Z, ap-south-1, root user (short-lived `aws login` session) |
| Bedrock inference | BLOCKED | One Converse call on `apac.amazon.nova-lite-v1:0`, 2026-10-10 07:36Z: `ValidationException` "Operation not allowed" (request 89e87e51-d71d-4284-a1c3-a25df8d1677e). `get-foundation-model-availability` = NOT_AUTHORIZED for Claude and Nova; Anthropic use-case form not filled. Account-level restriction; only AWS Support can lift it. No further Bedrock calls this session |
| Rekognition (live observer) | WORKING | `npm run verify:bedrock` DetectLabels ok 07:36Z; one synthetic PNG through `POST /api/evidence` on the production build 07:45Z returned `source: rekognition` in 378 ms (correctly judged "no hazard"); `/api/health` then showed AI PASS |
| Supabase + PostGIS | PARTIAL | Project `aquapulse` (ap-south-1) created; migration `init` applied; `aquapulse_health()` returns PostGIS 3.3, 20 tables; RLS on all 19 app tables; `ST_Distance` on geography returns meters (0.01° lng = 1085 m). Verified through the Supabase connector 2026-10-10. App-side check (`npm run verify:db`) BLOCKED until `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` |
| Engine (flood, scarcity, interventions, auction, evidence, memory) | WORKING | 25 vitest tests green; flagship at +30: 3,822 → 190 with D104 + P02 |
| Command center UI + map | WORKING | Builder verified in a browser at 1440x900 and 1920x1080, zero console errors; orchestrator reviewed screenshots. Photo-upload success path, basemap-offline fallback and reduced motion not yet exercised in the browser |
| Demo scenarios + reset | WORKING | Three scenarios play to the end in the browser; determinism asserted in tests. Network-blocked rehearsal not done yet |
| API routes + webhooks | PARTIAL | Health, evidence, ask verified over HTTP; webhook auth and Twilio signature verified by the offline self-check only (`npm run selfcheck`). With Supabase on, `/webhooks/verification` and `/webhooks/action-complete` return 404 because the app does not persist incidents or interventions |
| Twilio | UNVERIFIED | No credentials; alerts use the labelled demo transport |
| Ask AquaPulse | PARTIAL | Template answers from simulation data (labelled); no LLM while Bedrock is blocked |
| AI Lambda | NOT STARTED | Packaged and bundles locally; not deployed (needs approval to create the stack and role) |
| Public URL | NOT STARTED | |

## Review log
(findings and triage decisions go here: source · finding · Blocker/High/Medium/Nit · act/skip · why)
- Supabase advisor · PostGIS installed in `public` (spatial_ref_sys without RLS, st_estimatedextent callable by anon) · Medium · skip · PostGIS-owned objects, reference data only; app tables are RLS-locked with no policies and our two functions are service-role only. Moving the extension means recreating every geography column.
- Design review 1 · header said LIVE over a simulated feed · High · act · relabelled "Simulated feed"
- Design review 1 · tagline hidden at 1440 · High · act · shown from 1280 px
- Design review 1 · risk trajectory sparkline nearly flat (axis from 0) · Medium · open
- Design review 1 · calm-state cells very faint · Medium · open
