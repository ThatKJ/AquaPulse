# AquaPulse status

States: WORKING (verified, evidence named) · PARTIAL · BLOCKED · NOT STARTED.

| Area | State | Evidence / blocker |
| --- | --- | --- |
| Scaffold + production build | WORKING | `next build` exit 0, 2026-10-10 |
| Shared contracts (`lib/schemas`) | WORKING | typecheck |
| AWS identity | WORKING | STS GetCallerIdentity ok 2026-10-10 07:36Z, ap-south-1, root user (short-lived `aws login` session) |
| Bedrock inference | BLOCKED | One Converse call on `apac.amazon.nova-lite-v1:0`, 2026-10-10 07:36Z: `ValidationException` "Operation not allowed" (request 89e87e51-d71d-4284-a1c3-a25df8d1677e). `get-foundation-model-availability` = NOT_AUTHORIZED for Claude and Nova; Anthropic use-case form not filled. Account-level restriction; only AWS Support can lift it. No further Bedrock calls this session |
| Rekognition (live observer) | WORKING | DetectLabels ok 2026-10-10 07:36Z (request a62e860c-7295-4a02-9405-39d15da7116f) via `npm run verify:bedrock`. App route not yet exercised end to end |
| Supabase + PostGIS | PARTIAL | Project `aquapulse` (ap-south-1) created; migration `init` applied; `aquapulse_health()` returns PostGIS 3.3, 20 tables; RLS on all 19 app tables; `ST_Distance` on geography returns meters (0.01° lng = 1085 m). Verified through the Supabase connector 2026-10-10. App-side check (`npm run verify:db`) BLOCKED until `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` |
| Engine (flood, scarcity, interventions, auction, evidence) | NOT STARTED | |
| Command center UI + map | NOT STARTED | |
| Demo scenarios + reset | NOT STARTED | |
| API routes + webhooks | NOT STARTED | |
| Twilio | NOT STARTED | will be UNVERIFIED without credentials |
| Public URL | NOT STARTED | |

## Review log
(findings and triage decisions go here: source · finding · Blocker/High/Medium/Nit · act/skip · why)
- Supabase advisor · PostGIS installed in `public` (spatial_ref_sys without RLS, st_estimatedextent callable by anon) · Medium · skip · PostGIS-owned objects, reference data only; app tables are RLS-locked with no policies and our two functions are service-role only. Moving the extension means recreating every geography column.
