-- Earthquakes (USGS ComCat). Regional events, stored as the source returns
-- them for its query region; magnitude, place and status are USGS's own.

-- Recent earthquakes for the map layer, newest first.
create or replace function recent_earthquakes(p_days integer default 30)
returns table (
  source_id text, feature_key text, lng double precision, lat double precision,
  observed_at timestamptz, fetched_at timestamptz, properties jsonb)
language sql stable
as $$
  select h.source_id, h.feature_key, st_x(h.geom), st_y(h.geom), h.observed_at, h.fetched_at, h.properties
    from hazard_features h
   where h.kind = 'earthquake'
     and h.observed_at >= now() - make_interval(days => p_days)
   order by h.observed_at desc
$$;

-- Recent earthquakes with their distance from a point, newest first.
create or replace function earthquakes_near(
  p_lng double precision, p_lat double precision, p_days integer default 30, p_limit integer default 100)
returns table (
  source_id text, feature_key text, lng double precision, lat double precision,
  observed_at timestamptz, fetched_at timestamptz, properties jsonb, distance_m double precision)
language sql stable
as $$
  select h.source_id, h.feature_key, st_x(h.geom), st_y(h.geom), h.observed_at, h.fetched_at, h.properties,
         st_distance(h.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
    from hazard_features h
   where h.kind = 'earthquake'
     and h.observed_at >= now() - make_interval(days => p_days)
   order by h.observed_at desc
   limit p_limit
$$;

-- Retention: earthquakes kept 1 year, like hotspots.
create or replace function purge_expired()
returns table (observations_deleted integer, hazards_deleted integer)
language plpgsql
as $$
declare
  o integer;
  h integer;
begin
  delete from observations where observed_at < now() - interval '90 days';
  get diagnostics o = row_count;
  delete from hazard_features
   where (kind in ('hotspot', 'earthquake') and observed_at < now() - interval '1 year')
      or (kind = 'warning' and coalesce(valid_until, observed_at) < now() - interval '30 days');
  get diagnostics h = row_count;
  return query select o, h;
end;
$$;
