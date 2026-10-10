-- AquaPulse schema. Positions are geography(Point,4326) so ST_DWithin / ST_Distance work in METERS.
-- RLS is enabled on every table with no policies: only the server (service role) reads or writes.
create extension if not exists postgis;

create type provenance as enum ('LIVE', 'STATIC_REAL', 'SIMULATED', 'DERIVED');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  role text not null default 'operator' check (role in ('operator', 'validator', 'admin')),
  created_at timestamptz not null default now()
);

create table reporters (
  id text primary key,
  phone_hash text unique,
  trust numeric not null default 0.5 check (trust between 0 and 1),
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hydro_cells (
  id text primary key,                      -- H3 index, resolution 9
  center geography(Point, 4326) not null,
  elevation numeric not null check (elevation between 0 and 1),
  population int not null check (population >= 0),
  vulnerability numeric not null check (vulnerability between 0 and 1),
  flood jsonb not null,                     -- FloodFactors
  scarcity jsonb not null,                  -- ScarcityFactors
  provenance provenance not null default 'SIMULATED',
  updated_at timestamptz not null default now()
);
create index hydro_cells_center_gix on hydro_cells using gist (center);

create table infrastructure_nodes (
  id text primary key,                      -- synthetic ids such as D104, P031
  name text not null,
  kind text not null check (kind in ('drain', 'pipe', 'pump_station', 'valve')),
  location geography(Point, 4326) not null,
  cell_ids text[] not null default '{}',
  condition numeric not null check (condition between 0 and 1),
  upgrade_cost_proxy_lakh numeric not null default 0,
  provenance provenance not null default 'SIMULATED',
  created_at timestamptz not null default now()
);
create index infrastructure_nodes_location_gix on infrastructure_nodes using gist (location);

create table infrastructure_edges (
  from_id text not null,
  to_id text not null,
  relation text not null check (relation in ('UPSTREAM_OF', 'DOWNSTREAM_OF', 'AFFECTS', 'CONNECTED_TO')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, relation)
);
create index infrastructure_edges_to_idx on infrastructure_edges (to_id);

create table critical_facilities (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('hospital', 'school', 'shelter', 'pump_station', 'substation')),
  location geography(Point, 4326) not null,
  cell_id text references hydro_cells (id),
  daily_demand_liters int not null default 0,
  provenance provenance not null default 'SIMULATED',
  created_at timestamptz not null default now()
);
create index critical_facilities_location_gix on critical_facilities using gist (location);

create table resources (
  id text primary key,                      -- P02, C01, T01
  name text not null,
  kind text not null check (kind in ('pump', 'crew', 'tanker')),
  location geography(Point, 4326) not null,
  available boolean not null default true,
  capacity numeric not null,
  cost_proxy_lakh numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table incidents (
  id text primary key,                      -- F-01, S-01
  kind text not null check (kind in ('flood', 'scarcity')),
  type text not null,
  status text not null default 'unverified'
    check (status in ('unverified', 'verifying', 'verified', 'dismissed', 'resolved')),
  cell_id text,
  location geography(Point, 4326) not null,
  severity int not null check (severity between 1 and 10),
  evidence_score jsonb,                     -- EvidenceScore with component breakdown
  suspected_asset_id text references infrastructure_nodes (id),
  provenance provenance not null default 'LIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index incidents_location_gix on incidents using gist (location);
create index incidents_status_idx on incidents (status, created_at desc);

create table evidence_events (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,          -- idempotency key (Twilio MessageSid or caller id)
  channel text not null check (channel in ('whatsapp', 'sms', 'web', 'demo')),
  reporter_id text references reporters (id),
  body text not null default '',
  location geography(Point, 4326),
  location_accuracy_m numeric,
  analysis jsonb,                           -- EvidenceAnalysis (schema-validated before insert)
  analysis_source text check (analysis_source in ('bedrock', 'rekognition', 'fixture')),
  provenance provenance not null default 'LIVE',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index evidence_events_location_gix on evidence_events using gist (location);
create index evidence_events_received_idx on evidence_events (received_at desc);

create table evidence_media (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references evidence_events (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 4194304),
  sha256 text not null,                     -- duplicate detection
  source_host text,
  created_at timestamptz not null default now()
);
create index evidence_media_evidence_idx on evidence_media (evidence_id);
create index evidence_media_sha_idx on evidence_media (sha256);

create table incident_evidence (
  incident_id text not null references incidents (id) on delete cascade,
  evidence_id uuid not null references evidence_events (id) on delete cascade,
  relation text not null default 'EVIDENCE_OF' check (relation in ('EVIDENCE_OF', 'CONFIRMS', 'CONTRADICTS')),
  created_at timestamptz not null default now(),
  primary key (incident_id, evidence_id)
);

create table weather_observations (
  id uuid primary key default gen_random_uuid(),
  cell_id text references hydro_cells (id),
  observed_at timestamptz not null,
  rainfall_mm_hr numeric check (rainfall_mm_hr >= 0),
  temperature_c numeric,
  provenance provenance not null default 'SIMULATED',
  created_at timestamptz not null default now()
);
create index weather_observations_cell_idx on weather_observations (cell_id, observed_at desc);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  incident_id text references incidents (id) on delete cascade,
  horizon_min int not null check (horizon_min in (0, 15, 30, 60)),
  totals jsonb not null,                    -- PredictionTotals
  with_intervention boolean not null default false,
  created_at timestamptz not null default now()
);
create index predictions_incident_idx on predictions (incident_id, created_at desc);

create table interventions (
  id text primary key,
  incident_id text references incidents (id) on delete cascade,
  bundle jsonb not null,                    -- ActionBundle
  status text not null default 'applied' check (status in ('proposed', 'applied', 'completed', 'cancelled')),
  applied_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index interventions_incident_idx on interventions (incident_id);

create table intervention_results (
  id uuid primary key default gen_random_uuid(),
  intervention_id text not null references interventions (id) on delete cascade,
  before_state jsonb not null,
  expected_state jsonb not null,
  observed_state jsonb not null,
  effectiveness numeric not null check (effectiveness between 0 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  provenance provenance not null default 'SIMULATED',
  created_at timestamptz not null default now()
);
create index intervention_results_intervention_idx on intervention_results (intervention_id);

create table resource_assignments (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null references resources (id),
  intervention_id text references interventions (id) on delete cascade,
  target_id text not null,
  detail jsonb,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);
create index resource_assignments_resource_idx on resource_assignments (resource_id);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  incident_id text references incidents (id) on delete cascade,
  audience text not null,
  body text not null,
  transport text not null check (transport in ('twilio', 'demo')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_id text,
  created_at timestamptz not null default now()
);
create index alerts_incident_idx on alerts (incident_id, created_at desc);

create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references incidents (id) on delete cascade,
  location geography(Point, 4326) not null,
  radius_m numeric not null check (radius_m > 0 and radius_m <= 5000),
  question text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'expired')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index verification_requests_incident_idx on verification_requests (incident_id);

create table infrastructure_history (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references infrastructure_nodes (id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  severity numeric not null check (severity between 1 and 10),
  exposed_population int not null default 0,
  note text not null default '',
  intervention_kind text,
  effectiveness numeric check (effectiveness between 0 and 1),
  provenance provenance not null default 'SIMULATED',
  created_at timestamptz not null default now()
);
create index infrastructure_history_asset_idx on infrastructure_history (asset_id, year, month);

-- Incidents within radius_m METERS of a point (geography, so no degree math).
create function incidents_near(lng double precision, lat double precision, radius_m double precision)
returns setof incidents
language sql stable
set search_path = public, extensions
as $$
  select i.* from incidents i
  where st_dwithin(i.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  order by st_distance(i.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography);
$$;

-- Used by scripts/verify-db.ts and /api/health.
create function aquapulse_health()
returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'postgis', postgis_version(),
    'tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
    'hydro_cells', (select count(*) from hydro_cells),
    'incidents', (select count(*) from incidents)
  );
$$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'spatial_ref_sys' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke execute on function incidents_near(double precision, double precision, double precision) from anon, authenticated, public;
revoke execute on function aquapulse_health() from anon, authenticated, public;
grant execute on function incidents_near(double precision, double precision, double precision) to service_role;
grant execute on function aquapulse_health() to service_role;
