-- Hazard and coastal survey layers published by agencies as map services
-- (first: Department of Mineral Resources — landslide susceptibility,
-- villages at risk, temporary safe points, flash-flood/debris-flow areas,
-- shoreline change). One row per source feature, clipped to the province
-- + 5 km at import; `props` keeps the agency's own fields (renamed only).
create table if not exists hazard_zones (
  dataset    text   not null,                     -- e.g. 'landslide-susceptibility'
  feature_id text   not null,                     -- the agency's own id for the feature
  source_id  text   not null,                     -- registry id, e.g. 'dmr.landslide'
  props      jsonb  not null default '{}'::jsonb,
  geom       geometry(Geometry, 4326) not null check (st_isvalid(geom)),
  import_id  bigint references dataset_imports (id),
  -- Precomputed for map tiles (see 20261003000001_tile_geometries.sql).
  tile_lo    geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 150)) stored,
  tile_mid   geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 20)) stored,
  tile_hi    geometry generated always as (st_transform(geom, 3857)) stored,
  primary key (dataset, feature_id)
);
create index if not exists hazard_zones_geom_idx on hazard_zones using gist (geom);

alter table hazard_zones enable row level security;
