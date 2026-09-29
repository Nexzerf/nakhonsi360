-- Nakhonsi360 — Phase 1 functions: extent, gazetteer build, inspector lookups, search.
-- All distances are geodesic metres (geography), never planar degrees.

-- ---------------------------------------------------------------------------
-- Province extent: derived from the imported TH80 polygon, never hard-coded.
-- ---------------------------------------------------------------------------
create or replace function refresh_province_extent(p_pcode text default 'TH80', p_buffer_m integer default 5000)
returns void
language plpgsql
as $$
declare
  g geometry;
begin
  select geom into g from admin_areas where pcode = p_pcode and level = 1;
  if g is null then
    raise exception 'province % not found in admin_areas', p_pcode;
  end if;
  insert into province_extent (pcode, bbox, buffer_m, buffered, buffered_bbox, computed_at)
  select p_pcode,
         st_envelope(g),
         p_buffer_m,
         st_multi(b),
         st_envelope(b),
         now()
  from (select st_buffer(g::geography, p_buffer_m)::geometry as b) s
  on conflict (pcode) do update
    set bbox = excluded.bbox, buffer_m = excluded.buffer_m, buffered = excluded.buffered,
        buffered_bbox = excluded.buffered_bbox, computed_at = excluded.computed_at;
end;
$$;

-- Assign each DOPA village to the subdistrict polygon that contains it.
create or replace function assign_village_subdistricts()
returns integer
language sql
as $$
  with upd as (
    update villages v
       set subdistrict_pcode = (
         select a.pcode from admin_areas a
          where a.level = 3 and st_covers(a.geom, v.geom)
          order by a.pcode limit 1)
    returning 1
  )
  select count(*)::integer from upd
$$;

-- Short Thai admin label, e.g. 'ต.ท่าศาลา · อ.ท่าศาลา'.
create or replace function admin_path_for(p_geom geometry, p_from_level smallint default 3)
returns text
language sql stable
as $$
  select string_agg(
           case a.level when 3 then 'ต.' when 2 then 'อ.' else 'จ.' end || a.name_th,
           ' · ' order by a.level desc)
    from (
      select distinct on (level) level, name_th
        from admin_areas
       where level <= p_from_level and st_covers(geom, st_pointonsurface(p_geom))
       order by level, pcode
    ) a
   where a.level >= 2
$$;

-- ---------------------------------------------------------------------------
-- Gazetteer build. Rebuilt after every static import.
-- ---------------------------------------------------------------------------
create or replace function refresh_gazetteer()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  truncate gazetteer restart identity;

  -- Administrative areas
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

  -- DOPA villages
  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select 'village', 'villages', v.id, v.name_th, v.name_en,
         concat_ws(' · ',
           case when v.moo is not null then 'ม.' || v.moo end,
           case when s.pcode is not null then 'ต.' || s.name_th end,
           case when d.pcode is not null then 'อ.' || d.name_th end),
         4, v.geom,
         array[st_x(v.geom), st_y(v.geom), st_x(v.geom), st_y(v.geom)]
    from villages v
    left join admin_areas s on s.pcode = v.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode;

  -- Named OSM features, merged by (kind, name): a river is many ways in OSM.
  insert into gazetteer (type, ref_table, ref_id, name_th, name_en, admin_path, rank, geom, bbox)
  select case when f.kind in ('road_major', 'road_minor') then 'road'
              when f.kind = 'place' then 'place'
              else 'water' end,
         'osm_features',
         min(f.osm_type || '/' || f.osm_id),
         f.name_th, f.name_en,
         null, -- filled below
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

-- ---------------------------------------------------------------------------
-- Inspector lookups
-- ---------------------------------------------------------------------------

create or replace function point_in_study_area(p_lng double precision, p_lat double precision)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from province_extent pe
     where st_covers(pe.buffered, st_setsrid(st_makepoint(p_lng, p_lat), 4326)))
$$;

-- Province / district / subdistrict containing the point (one row per level).
create or replace function inspect_admin(p_lng double precision, p_lat double precision)
returns table (level smallint, pcode text, name_th text, name_en text, bbox double precision[])
language sql stable
as $$
  select distinct on (a.level)
         a.level, a.pcode, a.name_th, a.name_en,
         array[st_xmin(a.geom), st_ymin(a.geom), st_xmax(a.geom), st_ymax(a.geom)]
    from admin_areas a
   where st_covers(a.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by a.level, a.pcode
$$;

-- Nearest DOPA village points with geodesic distance.
create or replace function nearest_villages(p_lng double precision, p_lat double precision, p_limit integer default 3)
returns table (
  id text, name_th text, name_en text, moo smallint,
  subdistrict_pcode text, subdistrict_th text, district_th text,
  lng double precision, lat double precision, distance_m double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  cand as (
    select v.* from villages v, p order by v.geom <-> p.g limit greatest(p_limit, 1) * 4
  )
  select c.id, c.name_th, c.name_en, c.moo, c.subdistrict_pcode, s.name_th, d.name_th,
         st_x(c.geom), st_y(c.geom),
         st_distance(c.geom::geography, p.g::geography)
    from cand c
   cross join p
    left join admin_areas s on s.pcode = c.subdistrict_pcode
    left join admin_areas d on d.pcode = s.parent_pcode
   order by 10
   limit p_limit
$$;

-- Nearest OSM feature of each kind within p_radius_m, with geodesic distance.
-- A distance of 0 means the point lies on/inside the feature.
create or replace function nearest_features(p_lng double precision, p_lat double precision, p_radius_m double precision default 30000)
returns table (
  kind text, osm_type text, osm_id bigint, subkind text,
  name_th text, name_en text, distance_m double precision,
  nearest_lng double precision, nearest_lat double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g)
  select k.kind, f.osm_type, f.osm_id, f.subkind, f.name_th, f.name_en, f.d,
         st_x(f.np), st_y(f.np)
    from unnest(array['river', 'stream', 'canal', 'drain', 'water', 'reservoir',
                      'road_major', 'road_minor', 'coastline']) as k(kind)
   cross join p
   cross join lateral (
     select c.osm_type, c.osm_id, c.subkind, c.name_th, c.name_en,
            st_distance(c.geom::geography, p.g::geography) as d,
            st_closestpoint(c.geom, p.g) as np
       from (select o.* from osm_features o
              where o.kind = k.kind
              order by o.geom <-> p.g
              limit 8) c
      order by 6
      limit 1
   ) f
   where f.d <= p_radius_m
$$;

-- ---------------------------------------------------------------------------
-- Search. Substring match on prefix-stripped names (works for partial Thai,
-- e.g. 'ท่าศ' → ท่าศาลา) plus trigram similarity for typos in English.
-- Restricted to the province + buffer.
-- ---------------------------------------------------------------------------
create or replace function search_gazetteer(q text, p_limit integer default 20)
returns table (
  id bigint, type text, ref_table text, ref_id text, name_th text, name_en text,
  admin_path text, rank smallint, lng double precision, lat double precision,
  bbox double precision[], score real)
language sql stable
as $$
  with qq as (select normalize_place_name(q) as n, lower(btrim(q)) as raw)
  select g.id, g.type, g.ref_table, g.ref_id, g.name_th, g.name_en, g.admin_path, g.rank,
         st_x(pt.p), st_y(pt.p), g.bbox,
         greatest(word_similarity(qq.n, coalesce(g.name_th_norm, '')),
                  word_similarity(qq.n, coalesce(g.name_en_norm, ''))) as score
    from gazetteer g
   cross join qq
   cross join lateral (select st_pointonsurface(g.geom) as p) pt
   where qq.n is not null
     and (strpos(g.name_th_norm, qq.n) > 0
          or strpos(g.name_en_norm, qq.n) > 0
          or (char_length(qq.n) >= 4 and word_similarity(qq.n, coalesce(g.name_en_norm, '')) >= 0.5))
     and exists (select 1 from province_extent pe where st_intersects(pe.buffered, g.geom))
   order by -- exact name as typed (so 'คลองท่าดี' puts the canal before ต.ท่าดี)
            (coalesce(lower(g.name_th) = qq.raw, false) or coalesce(lower(g.name_en) = qq.raw, false)) desc,
            (starts_with(lower(coalesce(g.name_th, '')), qq.raw) or starts_with(lower(coalesce(g.name_en, '')), qq.raw)) desc,
            -- then on prefix-stripped names
            (coalesce(g.name_th_norm = qq.n, false) or coalesce(g.name_en_norm = qq.n, false)) desc,
            (starts_with(coalesce(g.name_th_norm, ''), qq.n) or starts_with(coalesce(g.name_en_norm, ''), qq.n)) desc,
            -- substring hits before fuzzy-only hits
            (strpos(coalesce(g.name_th_norm, ''), qq.n) > 0 or strpos(coalesce(g.name_en_norm, ''), qq.n) > 0) desc,
            g.rank,
            score desc,
            g.name_th
   limit least(greatest(p_limit, 1), 50)
$$;
