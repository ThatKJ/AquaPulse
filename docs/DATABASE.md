# Database

Supabase project `aquapulse` (region ap-south-1), Postgres with PostGIS 3.3. Schema: `supabase/migrations/0001_init.sql` (applied as migration `init`).

## Rules
- Every position is `geography(Point, 4326)`. `ST_DWithin` and `ST_Distance` therefore take and return **meters**. Checked on the live database: 0.01° of longitude at Bengaluru's latitude measures 1085 m.
- Row level security is enabled on all 19 tables with no policies. Only the service role (server side) can read or write.
- Synthetic rows carry `provenance = 'SIMULATED'`.

## Tables
| Table | Purpose |
| --- | --- |
| `profiles` | Operators and validators (no auth UI in this build) |
| `reporters` | Citizen reporters: hashed phone, trust score |
| `evidence_events` | One inbound report; `message_id` is the idempotency key; `analysis` holds the validated EvidenceAnalysis |
| `evidence_media` | Media metadata: type, size, sha256 for duplicate detection |
| `incidents` | Fused incidents with location and evidence score breakdown |
| `incident_evidence` | Evidence-to-incident links: EVIDENCE_OF / CONFIRMS / CONTRADICTS |
| `hydro_cells` | H3 cells with flood and scarcity factors |
| `infrastructure_nodes` | Drains, pipes, pump stations (synthetic ids such as D104) |
| `infrastructure_edges` | UPSTREAM_OF / DOWNSTREAM_OF / AFFECTS / CONNECTED_TO |
| `critical_facilities` | Hospitals, schools, shelters |
| `weather_observations` | Rainfall and temperature per cell |
| `predictions` | Stored prediction totals per horizon |
| `interventions` | Applied action bundles |
| `intervention_results` | Before / expected / observed and effectiveness |
| `resources` | Pumps, crews, tankers |
| `resource_assignments` | Which resource went where |
| `alerts` | Alerts and the transport used (`twilio` or `demo`) |
| `verification_requests` | Requests for nearby confirmation |
| `infrastructure_history` | Multi-year failure memory per asset |

## Migration 0002
`verification_requests`, `interventions` and `alerts` reference incidents by plain id (no foreign key), because incidents are created by the in-browser engine and not yet persisted. `alerts.idempotency_key` is unique so a webhook retry cannot send twice. `interventions.note` stores the action-complete note.

## Functions (service role only)
- `incidents_near(lng, lat, radius_m)`: incidents within a radius in meters, nearest first.
- `aquapulse_health()`: PostGIS version and row counts, used by `npm run verify:db` and `/api/health`.

## What the app uses today
The in-browser demo does not read the database. Server routes write evidence events, alerts, verification requests and action completions. The remaining tables exist for the full model and are not yet written by the app.
