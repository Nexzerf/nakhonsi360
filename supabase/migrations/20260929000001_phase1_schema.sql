-- Nakhonsi360 — Phase 1 schema
-- Static geography (admin boundaries, DOPA villages, OSM features), import
-- provenance, ingest run log, and the search gazetteer.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Provenance of every static import. One row per import of one source file.
-- `source_record_count` is counted from the raw file; `imported_count` is what
-- landed in the table. The UI shows both so the numbers can be checked.
-- ---------------------------------------------------------------------------
create table if not exists dataset_imports (
  id                  bigserial primary key,
  source_id           text        not null,          -- registry id, e.g. 'hdx.cod-ab-tha'
  imported_at         timestamptz not null default now(),
  source_url          text,
  source_file         text        not null,
  source_sha256       text,
  source_version      text,                          -- as published by the source (e.g. HDX resource last_modified)
  source_date         date,                          -- reference date stated by the source; null if not stated
  source_record_count integer     not null check (source_record_count >= 0),
  imported_count      integer     not null check (imported_count >= 0),
  rejected_count      integer     not null default 0 check (rejected_count >= 0),
  rejections          jsonb       not null default '[]'::jsonb,
  notes               text
);
create index if not exists dataset_imports_source_idx on dataset_imports (source_id, imported_at desc);

-- ---------------------------------------------------------------------------
-- Scheduled ingest log (used from Phase 2; /api/sources reads it now).
-- ---------------------------------------------------------------------------
create table if not exists ingest_runs (
  id          bigserial primary key,
  source_id   text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null check (status in ('running', 'ok', 'partial', 'error')),
  rows        integer,
  error       text
);
create index if not exists ingest_runs_source_idx on ingest_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Administrative boundaries (OCHA COD-AB Thailand, ADM1–ADM3).
-- Only Nakhon Si Thammarat (TH80) and its children are stored.
-- ---------------------------------------------------------------------------
create table if not exists admin_areas (
  pcode        text primary key,
  level        smallint not null check (level between 1 and 3),  -- 1 province, 2 district, 3 subdistrict
  name_th      text     not null,
  name_en      text,
  parent_pcode text references admin_areas (pcode) deferrable initially deferred,
  area_km2     double precision,
  geom         geometry(MultiPolygon, 4326) not null check (st_isvalid(geom)),
  import_id    bigint references dataset_imports (id)
);
create index if not exists admin_areas_geom_idx on admin_areas using gist (geom);
create index if not exists admin_areas_level_idx on admin_areas (level);

-- Province extent derived from the official polygon at import time.
create table if not exists province_extent (
  pcode         text primary key references admin_areas (pcode) on delete cascade,
  bbox          geometry(Polygon, 4326)      not null,
  buffer_m      integer                      not null,
  buffered      geometry(MultiPolygon, 4326) not null,
  buffered_bbox geometry(Polygon, 4326)      not null,
  computed_at   timestamptz                  not null default now()
);

-- ---------------------------------------------------------------------------
-- Villages (หมู่บ้าน) — points from กรมการปกครอง (DOPA). Never polygons.
-- ---------------------------------------------------------------------------
create table if not exists villages (
  id                  text primary key,              -- village code as given by DOPA
  name_th             text not null,
  name_en             text,
  moo                 smallint,
  subdistrict_pcode   text references admin_areas (pcode),  -- computed by containment
  source_admin_text   text,                           -- admin names as written in the source record
  geom                geometry(Point, 4326) not null,
  properties          jsonb not null,                 -- the original record, unmodified
  import_id           bigint references dataset_imports (id)
);
create index if not exists villages_geom_idx on villages using gist (geom);

-- ---------------------------------------------------------------------------
-- OpenStreetMap features clipped to the province + buffer.
-- ---------------------------------------------------------------------------
create table if not exists osm_features (
  osm_type  text   not null check (osm_type in ('node', 'way', 'relation')),
  osm_id    bigint not null,
  kind      text   not null check (kind in (
              'river', 'stream', 'canal', 'drain', 'water', 'reservoir',
              'road_major', 'road_minor', 'coastline', 'place')),
  subkind   text,                                     -- raw OSM value, e.g. 'trunk', 'village'
  name_th   text,
  name_en   text,
  tags      jsonb  not null default '{}'::jsonb,
  geom      geometry(Geometry, 4326) not null,
  import_id bigint references dataset_imports (id),
  primary key (osm_type, osm_id, kind)
);
create index if not exists osm_features_geom_idx on osm_features using gist (geom);
create index if not exists osm_features_kind_idx on osm_features (kind);

-- ---------------------------------------------------------------------------
-- Search gazetteer.
-- ---------------------------------------------------------------------------

-- Strip common Thai prefixes so "ต.ท่าศาลา", "ตำบลท่าศาลา" and "ท่าศาลา" match.
create or replace function normalize_place_name(t text)
returns text
language sql immutable parallel safe
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(btrim(coalesce(t, ''))),
        '^(จังหวัด|จ\.|อำเภอ|อ\.|กิ่งอำเภอ|ตำบล|ต\.|หมู่บ้าน|บ้าน|บ\.|คลอง|แม่น้ำ|เทศบาลตำบล|เทศบาลเมือง|เทศบาลนคร|district|subdistrict|amphoe|tambon|ban|khlong)\s*',
        ''
      ),
      '\s+', ' ', 'g'
    ),
    ''
  )
$$;

create table if not exists gazetteer (
  id           bigserial primary key,
  type         text not null check (type in ('province', 'district', 'subdistrict', 'village', 'water', 'road', 'place', 'station')),
  ref_table    text not null,
  ref_id       text not null,
  name_th      text,
  name_en      text,
  name_th_norm text generated always as (normalize_place_name(name_th)) stored,
  name_en_norm text generated always as (normalize_place_name(name_en)) stored,
  admin_path   text,                                  -- e.g. 'ต.ท่าศาลา · อ.ท่าศาลา'
  rank         smallint not null,                     -- lower = more important
  geom         geometry(Geometry, 4326) not null,
  bbox         double precision[4]                    -- [minLng, minLat, maxLng, maxLat]
);
create index if not exists gazetteer_th_trgm on gazetteer using gin (name_th_norm gin_trgm_ops);
create index if not exists gazetteer_en_trgm on gazetteer using gin (name_en_norm gin_trgm_ops);
create index if not exists gazetteer_geom_idx on gazetteer using gist (geom);
