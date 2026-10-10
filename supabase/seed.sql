-- AquaPulse reference seed. EVERYTHING HERE IS SIMULATED: synthetic ids, names, positions and history
-- for a demo district in south-east Bengaluru. None of it is municipal data.
-- The full world (cells, all assets, scenarios) lives in the engine (lib/demo); this is a small mirror
-- so the database has consistent ids to reference. Idempotent: safe to run more than once.

insert into infrastructure_nodes (id, name, kind, location, condition, upgrade_cost_proxy_lakh, provenance) values
  ('D104', 'Drain D104 (simulated)',        'drain',        'SRID=4326;POINT(77.6412 12.9255)', 0.35, 42, 'SIMULATED'),
  ('D087', 'Drain D087 (simulated)',        'drain',        'SRID=4326;POINT(77.6338 12.9301)', 0.60, 30, 'SIMULATED'),
  ('P031', 'Pipeline P031 (simulated)',     'pipe',         'SRID=4326;POINT(77.6475 12.9188)', 0.40, 55, 'SIMULATED'),
  ('PS02', 'Pump station PS02 (simulated)', 'pump_station', 'SRID=4326;POINT(77.6391 12.9214)', 0.70, 80, 'SIMULATED'),
  ('V011', 'Valve V011 (simulated)',        'valve',        'SRID=4326;POINT(77.6450 12.9230)', 0.80, 8,  'SIMULATED')
on conflict do nothing;

insert into infrastructure_edges (from_id, to_id, relation) values
  ('D087', 'D104', 'UPSTREAM_OF'),
  ('V011', 'P031', 'CONNECTED_TO')
on conflict do nothing;

insert into critical_facilities (id, name, kind, location, daily_demand_liters, provenance) values
  ('H01',  'District Hospital (simulated)', 'hospital', 'SRID=4326;POINT(77.6428 12.9242)', 120000, 'SIMULATED'),
  ('S01',  'Ward School (simulated)',       'school',   'SRID=4326;POINT(77.6365 12.9279)', 15000,  'SIMULATED'),
  ('SH01', 'Relief Shelter (simulated)',    'shelter',  'SRID=4326;POINT(77.6489 12.9201)', 30000,  'SIMULATED')
on conflict do nothing;

-- capacity: pump = litres/min removed, tanker = litres carried, crew = 1
insert into resources (id, name, kind, location, available, capacity, cost_proxy_lakh) values
  ('P01', 'Pump P01',   'pump',   'SRID=4326;POINT(77.6391 12.9214)', true, 1800,  1.2),
  ('P02', 'Pump P02',   'pump',   'SRID=4326;POINT(77.6440 12.9270)', true, 2400,  1.6),
  ('C01', 'Crew C01',   'crew',   'SRID=4326;POINT(77.6350 12.9290)', true, 1,     0.4),
  ('C02', 'Crew C02',   'crew',   'SRID=4326;POINT(77.6420 12.9200)', true, 1,     0.4),
  ('C03', 'Crew C03',   'crew',   'SRID=4326;POINT(77.6480 12.9250)', true, 1,     0.4),
  ('T01', 'Tanker T01', 'tanker', 'SRID=4326;POINT(77.6370 12.9180)', true, 12000, 0.8),
  ('T02', 'Tanker T02', 'tanker', 'SRID=4326;POINT(77.6455 12.9175)', true, 12000, 0.8),
  ('T03', 'Tanker T03', 'tanker', 'SRID=4326;POINT(77.6500 12.9225)', true, 6000,  0.5)
on conflict do nothing;

-- Fixed ids make the history rows idempotent (the table's own key is a random uuid).
insert into infrastructure_history (id, asset_id, year, month, severity, exposed_population, note, intervention_kind, effectiveness, provenance) values
  ('00000000-0000-4000-8000-000000000001', 'D104', 2022, 9,  6, 2100, 'Simulated: blockage after heavy rain',      'CLEAR_DRAIN', 0.55, 'SIMULATED'),
  ('00000000-0000-4000-8000-000000000002', 'D104', 2023, 8,  7, 2600, 'Simulated: blockage recurred',              'CLEAR_DRAIN', 0.50, 'SIMULATED'),
  ('00000000-0000-4000-8000-000000000003', 'D104', 2024, 10, 8, 3400, 'Simulated: overflow reached the main road', 'DEPLOY_PUMP', 0.45, 'SIMULATED'),
  ('00000000-0000-4000-8000-000000000004', 'D104', 2025, 9,  7, 3000, 'Simulated: blockage recurred',              'CLEAR_DRAIN', 0.40, 'SIMULATED')
on conflict do nothing;
