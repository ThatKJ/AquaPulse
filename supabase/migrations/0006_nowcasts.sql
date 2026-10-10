-- Second national source: IMD district nowcasts (3-hour outlooks). One row per district per issue.
-- district_id is derived by name matching and is null when the name is not unique across India.
create table nowcasts (
  id text primary key,                      -- hash of district + sent time
  source_id text not null,                  -- 'imd-nowcast'
  district_name text not null,
  district_id text,
  rain_band text not null check (rain_band in ('none', 'light', 'moderate', 'heavy', 'very_heavy')),
  thunderstorm boolean not null default false,
  description text not null default '',
  sent_at timestamptz not null,
  onset_at timestamptz,
  expires_at timestamptz,
  provenance text not null default 'LIVE_OFFICIAL',
  fetched_at timestamptz not null default now()
);
create index nowcasts_expires_idx on nowcasts (expires_at desc);
create index nowcasts_district_idx on nowcasts (district_id, expires_at desc);
alter table nowcasts enable row level security;
