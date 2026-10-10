-- National layer: official alerts ingested from the NDMA SACHET CAP feed, and a log of sync runs.
-- Alerts are keyed by their CAP identifier, so re-ingesting is a no-op. Service role only (RLS, no policies).
create table official_alerts (
  id text primary key,                      -- CAP identifier
  source_id text not null,                  -- e.g. 'ndma-sachet'
  sender text not null,
  event text not null,
  severity text not null,
  urgency text not null,
  certainty text not null,
  headline text not null default '',
  description text not null default '',
  area_desc text not null default '',
  language text,
  sent_at timestamptz not null,
  onset_at timestamptz,
  expires_at timestamptz,
  state text,                               -- derived by name matching; null = not located
  district_ids text[] not null default '{}',-- derived by name matching against the district index
  raw_hash text not null,
  provenance text not null default 'LIVE_OFFICIAL',
  fetched_at timestamptz not null default now()
);
create index official_alerts_expires_idx on official_alerts (expires_at desc);
create index official_alerts_sent_idx on official_alerts (sent_at desc);
create index official_alerts_districts_gin on official_alerts using gin (district_ids);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  records_seen int not null default 0,
  records_inserted int not null default 0,
  failure_reason text
);
create index sync_runs_source_idx on sync_runs (source_id, started_at desc);

alter table official_alerts enable row level security;
alter table sync_runs enable row level security;
