-- Official classifications exactly as published by the source (e.g. ThaiWater
-- situation_level with the colour from the same response's scale). Never derived here.
alter table observations add column if not exists official_level smallint;
alter table observations add column if not exists official_color text;
alter table observations add column if not exists official_detail text;

drop function if exists nearest_observations(double precision, double precision, text, integer, interval);

create or replace function nearest_observations(
  p_lng double precision, p_lat double precision, p_variable text,
  p_limit integer default 5, p_max_age interval default interval '7 days')
returns table (
  source_id text, station_id text, name_th text, name_en text, river_name text, basin_code text,
  station_properties jsonb,
  variable text, value double precision, unit text, observed_at timestamptz, fetched_at timestamptz,
  official_status text, official_level smallint, official_color text, official_detail text,
  distance_m double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  latest as (
    select distinct on (o.source_id, o.station_id)
           o.source_id, o.station_id, o.variable, o.value, o.unit, o.observed_at, o.fetched_at,
           o.official_status, o.official_level, o.official_color, o.official_detail
      from observations o
     where o.variable = p_variable and o.observed_at >= now() - p_max_age
     order by o.source_id, o.station_id, o.observed_at desc
  )
  select l.source_id, l.station_id, s.name_th, s.name_en, s.river_name, s.basin_code, s.properties,
         l.variable, l.value, l.unit, l.observed_at, l.fetched_at,
         l.official_status, l.official_level, l.official_color, l.official_detail,
         st_distance(s.geom::geography, p.g::geography) as distance_m
    from latest l
    join stations s using (source_id, station_id)
   cross join p
   order by s.geom <-> p.g
   limit p_limit
$$;

-- Latest reading per station for a map layer (GeoJSON), newest within p_max_age.
create or replace function latest_station_readings(p_variable text, p_max_age interval default interval '2 days')
returns table (
  source_id text, station_id text, name_th text, name_en text, lng double precision, lat double precision,
  agency_th text, value double precision, unit text, observed_at timestamptz,
  official_status text, official_level smallint, official_color text, official_detail text)
language sql stable
as $$
  select distinct on (o.source_id, o.station_id)
         o.source_id, o.station_id, s.name_th, s.name_en, st_x(s.geom), st_y(s.geom),
         s.properties ->> 'agency_th', o.value, o.unit, o.observed_at,
         o.official_status, o.official_level, o.official_color, o.official_detail
    from observations o
    join stations s using (source_id, station_id)
   where o.variable = p_variable and o.observed_at >= now() - p_max_age
   order by o.source_id, o.station_id, o.observed_at desc
$$;
