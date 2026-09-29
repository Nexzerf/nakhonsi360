-- Nakhonsi360 — Phase 2: live observations, stations and hazard features.
-- Filled only by ingest adapters written against real source samples.

alter table ingest_runs add column if not exists fetched_count integer;
alter table ingest_runs add column if not exists rejected integer;
alter table ingest_runs add column if not exists details jsonb;

-- ---------------------------------------------------------------------------
-- Monitoring stations as published by each source (inside province + buffer).
-- ---------------------------------------------------------------------------
create table if not exists stations (
  source_id   text not null,
  station_id  text not null,
  name_th     text,
  name_en     text,
  geom        geometry(Point, 4326) not null,
  admin_text  text,                  -- admin names as written by the source
  river_name  text,                  -- as written by the source (water level)
  basin_code  text,                  -- as published by the source, if any
  properties  jsonb not null default '{}'::jsonb,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (source_id, station_id)
);
create index if not exists stations_geom_idx on stations using gist (geom);

-- ---------------------------------------------------------------------------
-- Observations. observed_at comes from the source; fetched_at is when we
-- pulled it. Never overwrite one with the other.
-- ---------------------------------------------------------------------------
create table if not exists observations (
  id              bigserial primary key,
  source_id       text not null,
  station_id      text not null,
  variable        text not null,
  value           double precision not null,
  unit            text not null,
  observed_at     timestamptz not null,
  fetched_at      timestamptz not null,
  official_status text,              -- only what the source publishes, never derived here
  raw             jsonb,
  unique (source_id, station_id, variable, observed_at),
  foreign key (source_id, station_id) references stations (source_id, station_id) on delete cascade
);
create index if not exists observations_latest_idx on observations (source_id, variable, station_id, observed_at desc);
create index if not exists observations_time_idx on observations (observed_at);

-- ---------------------------------------------------------------------------
-- Hazard features: flood extents, hotspots, warnings, earthquakes.
-- ---------------------------------------------------------------------------
create table if not exists hazard_features (
  id          bigserial primary key,
  source_id   text not null,
  feature_key text not null,         -- stable id from the source (or a hash of its identifying fields)
  kind        text not null check (kind in ('flood', 'flood_recurrent', 'hotspot', 'warning', 'earthquake')),
  observed_at timestamptz not null,
  valid_until timestamptz,           -- warnings: end of validity as published
  fetched_at  timestamptz not null,
  properties  jsonb not null default '{}'::jsonb,
  geom        geometry(Geometry, 4326) not null,
  unique (source_id, feature_key)
);
create index if not exists hazard_features_geom_idx on hazard_features using gist (geom);
create index if not exists hazard_features_kind_time_idx on hazard_features (kind, observed_at desc);

alter table stations        enable row level security;
alter table observations    enable row level security;
alter table hazard_features enable row level security;

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

-- Latest reading per station for one variable, nearest stations first.
create or replace function nearest_observations(
  p_lng double precision, p_lat double precision, p_variable text,
  p_limit integer default 5, p_max_age interval default interval '7 days')
returns table (
  source_id text, station_id text, name_th text, name_en text, river_name text, basin_code text,
  variable text, value double precision, unit text, observed_at timestamptz, fetched_at timestamptz,
  official_status text, distance_m double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  latest as (
    select distinct on (o.source_id, o.station_id)
           o.source_id, o.station_id, o.variable, o.value, o.unit, o.observed_at, o.fetched_at, o.official_status
      from observations o
     where o.variable = p_variable and o.observed_at >= now() - p_max_age
     order by o.source_id, o.station_id, o.observed_at desc
  )
  select l.source_id, l.station_id, s.name_th, s.name_en, s.river_name, s.basin_code,
         l.variable, l.value, l.unit, l.observed_at, l.fetched_at, l.official_status,
         st_distance(s.geom::geography, p.g::geography) as distance_m
    from latest l
    join stations s using (source_id, station_id)
   cross join p
   order by s.geom <-> p.g
   limit p_limit
$$;

-- Flood polygons covering the point, observed within p_days.
create or replace function floods_at(p_lng double precision, p_lat double precision, p_days integer default 7)
returns table (source_id text, kind text, observed_at timestamptz, properties jsonb)
language sql stable
as $$
  select h.source_id, h.kind, h.observed_at, h.properties
    from hazard_features h
   where h.kind in ('flood', 'flood_recurrent')
     and (h.kind = 'flood_recurrent' or h.observed_at >= now() - make_interval(days => p_days))
     and st_covers(h.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by h.observed_at desc
$$;

-- Hotspots near the point, per source.
create or replace function hotspots_near(
  p_lng double precision, p_lat double precision, p_radius_m double precision default 5000, p_days integer default 7)
returns table (source_id text, hotspot_count integer, latest_observed_at timestamptz, nearest_m double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select h.source_id, count(*)::integer, max(h.observed_at), min(st_distance(h.geom::geography, p.g))
    from hazard_features h, p
   where h.kind = 'hotspot'
     and h.observed_at >= now() - make_interval(days => p_days)
     and st_dwithin(h.geom::geography, p.g, p_radius_m)
   group by h.source_id
$$;

-- Warnings in force that cover the point.
create or replace function warnings_at(p_lng double precision, p_lat double precision)
returns table (source_id text, observed_at timestamptz, valid_until timestamptz, properties jsonb)
language sql stable
as $$
  select h.source_id, h.observed_at, h.valid_until, h.properties
    from hazard_features h
   where h.kind = 'warning'
     and coalesce(h.valid_until, h.observed_at + interval '24 hours') >= now()
     and st_covers(h.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by h.observed_at desc
$$;

-- Retention: observations 90 days, hotspots 1 year, expired warnings 30 days after expiry.
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
   where (kind = 'hotspot' and observed_at < now() - interval '1 year')
      or (kind = 'warning' and coalesce(valid_until, observed_at) < now() - interval '30 days');
  get diagnostics h = row_count;
  return query select o, h;
end;
$$;
