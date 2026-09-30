-- DOPA states each village's subdistrict and district. Those names are shown
-- for the village (they are the official assignment); the containing HDX
-- polygon can differ near boundaries or where spellings differ.
alter table villages add column if not exists source_subdistrict text;
alter table villages add column if not exists source_district text;

drop function if exists nearest_villages(double precision, double precision, integer);

create or replace function nearest_villages(p_lng double precision, p_lat double precision, p_limit integer default 3)
returns table (
  id text, name_th text, name_en text, moo smallint,
  subdistrict_pcode text, subdistrict_th text, district_th text,
  lng double precision, lat double precision, distance_m double precision, shared_location_count smallint)
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
         c.shared_location_count
    from cand c
   cross join p
    left join admin_areas s on s.pcode = c.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode
   order by 10
   limit p_limit
$$;

-- Gazetteer: villages use the admin names stated by DOPA.
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
