-- Phase 3: land cover from ESA WorldCover (10 m, Sentinel-1/2 classification).
--
-- * landcover_stats: area of each class per subdistrict, computed on import
--   from every 10 m pixel (pixel area from its latitude on the WGS 84 ellipsoid).
-- * landcover_features: polygons of classes drawn on the map (mangroves),
--   traced from the same pixels.
-- Class codes are the source's own (10 tree cover … 95 mangroves).

create table if not exists landcover_stats (
  source_id   text not null,
  pcode       text not null references admin_areas (pcode) on delete cascade,
  class_code  smallint not null,
  area_km2    double precision not null check (area_km2 >= 0),
  share       double precision not null check (share >= 0 and share <= 1),  -- of the subdistrict's classified area
  import_id   bigint references dataset_imports (id),
  primary key (source_id, pcode, class_code)
);

create table if not exists landcover_features (
  id          bigserial primary key,
  source_id   text not null,
  class_code  smallint not null,
  area_m2     double precision not null,
  geom        geometry(Polygon, 4326) not null,
  import_id   bigint references dataset_imports (id)
);
create index if not exists landcover_features_geom_idx on landcover_features using gist (geom);
create index if not exists landcover_features_class_idx on landcover_features (source_id, class_code);

alter table landcover_stats    enable row level security;
alter table landcover_features enable row level security;

-- Land cover of the subdistrict containing a point (largest class first).
create or replace function landcover_at(p_lng double precision, p_lat double precision)
returns table (source_id text, pcode text, subdistrict_th text, class_code smallint, area_km2 double precision, share double precision)
language sql stable
as $$
  select s.source_id, s.pcode, a.name_th, s.class_code, s.area_km2, s.share
    from admin_areas a
    join landcover_stats s on s.pcode = a.pcode
   where a.level = 3 and st_contains(a.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by s.area_km2 desc
$$;

-- Nearest mapped polygon of one class within p_radius_m (0 m = the point is inside it).
create or replace function landcover_feature_near(p_lng double precision, p_lat double precision, p_class smallint, p_radius_m double precision)
returns table (source_id text, distance_m double precision, area_m2 double precision)
language sql stable
as $$
  with p as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g)
  select f.source_id, st_distance(f.geom::geography, p.g::geography), f.area_m2
    from landcover_features f, p
   where f.class_code = p_class and st_dwithin(f.geom::geography, p.g::geography, p_radius_m)
   order by f.geom <-> p.g
   limit 1
$$;
