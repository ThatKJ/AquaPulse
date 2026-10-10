-- Reports that arrived from outside (webhooks), newest first, with plain lng/lat for the console.
-- Rows mirrored from the engine (message_id 'engine:…') are excluded. Service role only.
create function recent_live_reports(max_rows int default 20)
returns table (id uuid, channel text, body text, received_at timestamptz, lng double precision, lat double precision, analysis jsonb)
language sql stable
set search_path = public, extensions
as $$
  select e.id, e.channel, e.body, e.received_at,
         st_x(e.location::geometry), st_y(e.location::geometry), e.analysis
  from evidence_events e
  where e.message_id not like 'engine:%'
  order by e.received_at desc
  limit least(greatest(max_rows, 1), 50);
$$;
revoke execute on function recent_live_reports(int) from anon, authenticated, public;
grant execute on function recent_live_reports(int) to service_role;
