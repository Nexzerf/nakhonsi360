-- Model forecasts (TMD NWP / WRF), one row per place, resolution and valid time.
-- Kept apart from observations: a forecast is never shown as a measurement.
-- Each run replaces the values for the times it covers (the latest model run wins).
create table if not exists forecasts (
  source_id    text not null,
  place_code   text not null,              -- the source's own code, e.g. TMD geocode '800401'
  place_name   text,
  admin_pcode  text,                       -- matching HDX pcode when it exists ('TH' || place_code)
  resolution   text not null check (resolution in ('hourly', 'daily')),
  valid_at     timestamptz not null,       -- start of the hour / day the values are for
  fetched_at   timestamptz not null,
  vals         jsonb not null,             -- published fields and values, unmodified
  geom         geometry(Point, 4326) not null,  -- the source's reference point for the place
  primary key (source_id, resolution, place_code, valid_at)
);
create index if not exists forecasts_admin_idx on forecasts (admin_pcode, resolution, valid_at);
alter table forecasts enable row level security;

-- Forecast for the subdistrict containing a point, from now on (hourly: from the current hour; daily: from today in Thailand).
create or replace function forecast_at(p_lng double precision, p_lat double precision, p_resolution text, p_limit integer)
returns table (source_id text, place_code text, place_name text, admin_pcode text, valid_at timestamptz, fetched_at timestamptz,
               vals jsonb, ref_lng double precision, ref_lat double precision, distance_m double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  sub as (
    select a.pcode from admin_areas a, p where a.level = 3 and st_contains(a.geom, p.g) limit 1
  )
  select f.source_id, f.place_code, f.place_name, f.admin_pcode, f.valid_at, f.fetched_at, f.vals,
         st_x(f.geom), st_y(f.geom), st_distance(f.geom::geography, p.g::geography)
    from forecasts f
    join sub on sub.pcode = f.admin_pcode
   cross join p
   where f.resolution = p_resolution
     and f.valid_at >= case when p_resolution = 'hourly' then date_trunc('hour', now())
                            else date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok' end
   order by f.valid_at
   limit p_limit
$$;

-- Retention: as before, plus forecasts whose valid time is more than a day past.
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
  delete from forecasts where valid_at < now() - interval '1 day';
  return query select o, h;
end;
$$;
