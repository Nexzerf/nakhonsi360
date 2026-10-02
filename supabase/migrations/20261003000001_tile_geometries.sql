-- Map tiles: geometry precomputed in Web Mercator at three levels of detail.
--
-- Rendering a tile used to reproject and simplify every intersecting
-- boundary from scratch (~500k points for districts + subdistricts). On a
-- small database that took seconds per tile and starved every other query
-- (search timed out behind it). Stored generated columns are computed once,
-- when a row is imported, and kept in step with `geom` automatically.
--
-- Tolerances are in metres, about half a screen pixel at the deepest zoom
-- each level serves: tile_lo z <= 8 (150 m), tile_mid z 9-11 (20 m),
-- tile_hi z >= 12 (2 m).

alter table admin_areas
  add column if not exists tile_lo  geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 150)) stored,
  add column if not exists tile_mid geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 20)) stored,
  add column if not exists tile_hi  geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 2)) stored;

alter table osm_features
  add column if not exists tile_lo  geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 150)) stored,
  add column if not exists tile_mid geometry generated always as (st_simplifypreservetopology(st_transform(geom, 3857), 20)) stored,
  add column if not exists tile_hi  geometry generated always as (st_transform(geom, 3857)) stored;

alter table villages
  add column if not exists tile_hi geometry generated always as (st_transform(geom, 3857)) stored;
