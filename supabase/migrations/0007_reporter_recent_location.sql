-- WhatsApp sends a photo and a location pin as two separate messages. This returns a reporter's most recent
-- located report so a photo that arrives without coordinates can borrow the pin sent just before it.
create function reporter_recent_location(reporter text, since timestamptz)
returns table (lng double precision, lat double precision)
language sql stable
set search_path = public, extensions
as $$
  select st_x(e.location::geometry), st_y(e.location::geometry)
  from evidence_events e
  where e.reporter_id = reporter and e.location is not null and e.received_at > since
  order by e.received_at desc
  limit 1;
$$;
revoke execute on function reporter_recent_location(text, timestamptz) from anon, authenticated, public;
grant execute on function reporter_recent_location(text, timestamptz) to service_role;
