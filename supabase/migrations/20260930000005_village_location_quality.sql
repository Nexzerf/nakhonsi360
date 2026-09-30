-- Villages whose published coordinates cannot be used as-is.
--
-- * Mapped with a corrected location: the source gives metres (UTM) or
--   swapped axes. The correction is kept only when the resulting point lies
--   inside the subdistrict that DOPA itself names for the village, and the
--   method and its uncertainty are stored and shown. The original values stay
--   in `properties`.
-- * Without a usable location (e.g. a placeholder point in Bangkok, a digit
--   typo that puts the point in another province): the village is a real DOPA
--   record, so it is kept, searchable and listed under its DOPA subdistrict,
--   but it is never drawn on the map and no position is invented for it.

alter table villages add column if not exists location_method text not null default 'source'
  check (location_method in ('source', 'utm47n_wgs84', 'axes_swapped'));
-- Approximate horizontal uncertainty added by the correction, in metres (null = as published).
alter table villages add column if not exists location_uncertainty_m integer;

create table if not exists villages_unlocated (
  id                 text primary key,               -- village code as given by DOPA
  name_th            text not null,
  name_en            text,
  moo                smallint,
  source_subdistrict text,
  source_district    text,
  subdistrict_pcode  text references admin_areas (pcode),  -- from DOPA's own subdistrict code/name, not from a point
  reason             text not null,                  -- why the published coordinate is not usable
  source_lat         text,                           -- published values, unmodified
  source_lon         text,
  properties         jsonb not null,
  import_id          bigint references dataset_imports (id)
);
create index if not exists villages_unlocated_sub_idx on villages_unlocated (subdistrict_pcode);
alter table villages_unlocated enable row level security;

alter table dataset_imports add column if not exists corrected_location_count integer not null default 0;
alter table dataset_imports add column if not exists unlocated_count integer not null default 0;

-- The subdistrict a source record names for itself: the HDX pcode built from
-- DOPA's code ('TH' + first 6 digits of tcode) when that polygon has the same
-- name; otherwise the only subdistrict with that name in the named district.
-- Null when neither matches exactly one polygon.
create or replace function resolve_source_subdistrict(p_tcode text, p_tname text, p_aname text)
returns text
language sql stable
as $$
  with norm as (
    select replace(coalesce(p_tname, ''), ' ', '') as t, replace(coalesce(p_aname, ''), ' ', '') as a
  ),
  by_code as (
    select s.pcode from admin_areas s, norm
     where p_tcode ~ '^[0-9]{6}' and s.level = 3 and s.pcode = 'TH' || left(p_tcode, 6)
       and replace(s.name_th, ' ', '') = norm.t
  ),
  by_name as (
    select s.pcode from admin_areas s
      join admin_areas d on d.pcode = s.parent_pcode, norm
     where s.level = 3 and replace(s.name_th, ' ', '') = norm.t
       and replace(d.name_th, ' ', '') = norm.a
  )
  select coalesce(
    (select pcode from by_code),
    (select min(pcode) from by_name having count(*) = 1)
  )
$$;

drop function if exists nearest_villages(double precision, double precision, integer);

create or replace function nearest_villages(p_lng double precision, p_lat double precision, p_limit integer default 3)
returns table (
  id text, name_th text, name_en text, moo smallint,
  subdistrict_pcode text, subdistrict_th text, district_th text,
  lng double precision, lat double precision, distance_m double precision, shared_location_count smallint,
  location_method text, location_uncertainty_m integer)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  cand as (
    select v.* from villages v, p order by v.geom <-> p.g limit greatest(p_limit, 1) * 4
  )
  select c.id, c.name_th, c.name_en, c.moo, c.subdistrict_pcode,
         coalesce(c.source_subdistrict, s.name_th), coalesce(c.source_district, d.name_th),
         st_x(c.geom), st_y(c.geom),
         st_distance(c.geom::geography, p.g::geography),
         c.shared_location_count, c.location_method, c.location_uncertainty_m
    from cand c
   cross join p
    left join admin_areas s on s.pcode = c.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode
   order by 10
   limit p_limit
$$;

-- Villages of the subdistrict containing a point whose published location is not usable.
create or replace function unlocated_villages_at(p_lng double precision, p_lat double precision)
returns table (id text, name_th text, name_en text, moo smallint, subdistrict_th text, district_th text, reason text)
language sql stable
as $$
  select u.id, u.name_th, u.name_en, u.moo,
         coalesce(u.source_subdistrict, s.name_th), coalesce(u.source_district, d.name_th), u.reason
    from admin_areas s
    join villages_unlocated u on u.subdistrict_pcode = s.pcode
    left join admin_areas d on d.pcode = s.parent_pcode
   where s.level = 3 and st_contains(s.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by u.id
$$;

-- Gazetteer: as before, plus villages without a usable location, located by their DOPA subdistrict polygon.
create or replace function refresh_gazetteer()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  truncate gazetteer restart identity;

  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select case a.level when 1 then 'province' when 2 then 'district' else 'subdistrict' end,
         'admin_areas', a.pcode, a.name_th, a.name_en,
         case a.level
           when 1 then null
           when 2 then 'จ.' || p.name_th
           else admin_path_for(a.geom, 2::smallint)
         end,
         a.level, a.geom,
         array[st_xmin(a.geom), st_ymin(a.geom), st_xmax(a.geom), st_ymax(a.geom)]
    from admin_areas a
    left join admin_areas p on p.pcode = a.parent_pcode;

  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select 'village', 'villages', v.id, v.name_th, v.name_en,
         concat_ws(' · ',
           case when v.moo is not null then 'ม.' || v.moo end,
           case when coalesce(v.source_subdistrict, s.name_th) is not null then 'ต.' || coalesce(v.source_subdistrict, s.name_th) end,
           case when coalesce(v.source_district, d.name_th) is not null then 'อ.' || coalesce(v.source_district, d.name_th) end),
         4, v.geom,
         array[st_x(v.geom), st_y(v.geom), st_x(v.geom), st_y(v.geom)]
    from villages v
    left join admin_areas s on s.pcode = v.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode;

  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select 'village', 'villages_unlocated', u.id, u.name_th, u.name_en,
         concat_ws(' · ',
           case when u.moo is not null then 'ม.' || u.moo end,
           case when coalesce(u.source_subdistrict, s.name_th) is not null then 'ต.' || coalesce(u.source_subdistrict, s.name_th) end,
           case when coalesce(u.source_district, d.name_th) is not null then 'อ.' || coalesce(u.source_district, d.name_th) end,
           'ไม่มีพิกัดที่ใช้ได้'),
         4, s.geom,
         array[st_xmin(s.geom), st_ymin(s.geom), st_xmax(s.geom), st_ymax(s.geom)]
    from villages_unlocated u
    join admin_areas s on s.pcode = u.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode;

  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select case when f.kind in ('road_major', 'road_minor') then 'road'
              when f.kind = 'place' then 'place'
              else 'water' end,
         'osm_features',
         min(f.osm_type || '/' || f.osm_id),
         f.name_th, f.name_en,
         null,
         case when f.kind in ('river', 'reservoir') then 5
              when f.kind = 'place' then 6
              when f.kind in ('canal', 'stream', 'water') then 6
              else 7 end,
         st_collect(f.geom),
         null
    from osm_features f
   where f.kind in ('river', 'stream', 'canal', 'water', 'reservoir', 'road_major', 'place')
     and (f.name_th is not null or f.name_en is not null)
   group by f.kind, f.name_th, f.name_en;

  update gazetteer
     set admin_path = admin_path_for(geom),
         bbox = array[st_xmin(geom), st_ymin(geom), st_xmax(geom), st_ymax(geom)]
   where ref_table = 'osm_features';

  select count(*) into n from gazetteer;
  return n;
end;
$$;
