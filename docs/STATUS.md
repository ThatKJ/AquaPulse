# AquaPulse status

States: WORKING (verified, evidence named) · PARTIAL · BLOCKED · NOT STARTED.

| Area | State | Evidence / blocker |
| --- | --- | --- |
| Scaffold + production build | WORKING | `next build` exit 0, 2026-10-10 |
| Shared contracts (`lib/schemas`) | WORKING | typecheck |
| AWS identity | BLOCKED | CLI session expired; needs `aws login` |
| Bedrock inference | NOT STARTED | UNVERIFIED on this account (refused in September) |
| Rekognition fallback | NOT STARTED | |
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
