/**
 * SQL used by the route handlers. Kept free of Next.js-only imports so the
 * same functions run in the SQL test suite against a real PostGIS database.
 */
import type postgres from 'postgres';
import type {
  AdminCard,
  AdminLevel,
  BBox,
  FeatureKind,
  ImportRecord,
  NearbyFeature,
  SearchHit,
  GazetteerType,
  VillageHit,
} from '@/lib/types';

type Sql = postgres.Sql;

const toIso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

function toBBox(v: unknown): BBox | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const n = v.map(Number);
  return n.every(Number.isFinite) ? (n as BBox) : null;
}

// ---------------------------------------------------------------- imports

export async function latestImports(sql: Sql): Promise<Map<string, ImportRecord>> {
  const rows = await sql<
    {
      source_id: string;
      imported_at: Date;
      source_file: string;
      source_url: string | null;
      source_sha256: string | null;
      source_version: string | null;
      source_date: Date | null;
      source_record_count: number;
      imported_count: number;
      rejected_count: number;
    }[]
  >`
    select distinct on (source_id)
           source_id, imported_at, source_file, source_url, source_sha256, source_version,
           source_date, source_record_count, imported_count, rejected_count
      from dataset_imports
     order by source_id, imported_at desc`;
  return new Map(
    rows.map((r) => [
      r.source_id,
      {
        importedAt: toIso(r.imported_at)!,
        sourceFile: r.source_file,
        sourceUrl: r.source_url,
        sourceSha256: r.source_sha256,
        sourceVersion: r.source_version,
        sourceDate: r.source_date ? toIso(r.source_date)!.slice(0, 10) : null,
        sourceRecordCount: r.source_record_count,
        importedCount: r.imported_count,
        rejectedCount: r.rejected_count,
      },
    ]),
  );
}

export async function latestRuns(sql: Sql) {
  const rows = await sql<
    { source_id: string; started_at: Date; finished_at: Date | null; status: string; rows: number | null; error: string | null }[]
  >`
    select distinct on (source_id) source_id, started_at, finished_at, status, rows, error
      from ingest_runs
     order by source_id, started_at desc`;
  return new Map(
    rows.map((r) => [
      r.source_id,
      { startedAt: toIso(r.started_at)!, finishedAt: toIso(r.finished_at), status: r.status, rows: r.rows, error: r.error },
    ]),
  );
}

// ---------------------------------------------------------------- inspector

export async function inspectAdmin(sql: Sql, lng: number, lat: number): Promise<AdminCard> {
  const [inArea] = await sql<{ inside: boolean }[]>`select point_in_study_area(${lng}, ${lat}) as inside`;
  const rows = await sql<{ level: number; pcode: string; name_th: string; name_en: string | null; bbox: number[] }[]>`
    select level, pcode, name_th, name_en, bbox from inspect_admin(${lng}, ${lat})`;
  const levels: AdminLevel[] = rows.map((r) => ({
    level: r.level as 1 | 2 | 3,
    pcode: r.pcode,
    nameTh: r.name_th,
    nameEn: r.name_en,
    bbox: toBBox(r.bbox) ?? [lng, lat, lng, lat],
  }));
  return { inStudyArea: Boolean(inArea?.inside), levels };
}

export async function nearestVillages(sql: Sql, lng: number, lat: number, limit = 3): Promise<VillageHit[]> {
  const rows = await sql<
    {
      id: string;
      name_th: string;
      name_en: string | null;
      moo: number | null;
      subdistrict_pcode: string | null;
      subdistrict_th: string | null;
      district_th: string | null;
      lng: number;
      lat: number;
      distance_m: number;
      shared_location_count: number;
    }[]
  >`select * from nearest_villages(${lng}, ${lat}, ${limit})`;
  return rows.map((r) => ({
    id: r.id,
    nameTh: r.name_th,
    nameEn: r.name_en,
    moo: r.moo,
    subdistrictPcode: r.subdistrict_pcode,
    subdistrictTh: r.subdistrict_th,
    districtTh: r.district_th,
    lng: r.lng,
    lat: r.lat,
    distanceM: r.distance_m,
    sharedLocationCount: r.shared_location_count ?? 1,
  }));
}

export async function nearestFeatures(sql: Sql, lng: number, lat: number, radiusM: number): Promise<NearbyFeature[]> {
  const rows = await sql<
    {
      kind: FeatureKind;
      osm_type: string;
      osm_id: string;
      subkind: string | null;
      name_th: string | null;
      name_en: string | null;
      distance_m: number;
      nearest_lng: number;
      nearest_lat: number;
    }[]
  >`select * from nearest_features(${lng}, ${lat}, ${radiusM})`;
  return rows.map((r) => ({
    kind: r.kind,
    osmType: r.osm_type,
    osmId: Number(r.osm_id),
    subkind: r.subkind,
    nameTh: r.name_th,
    nameEn: r.name_en,
    distanceM: r.distance_m,
    nearestLng: r.nearest_lng,
    nearestLat: r.nearest_lat,
  }));
}

// ---------------------------------------------------------------- search

export async function searchGazetteer(sql: Sql, q: string, limit = 20): Promise<SearchHit[]> {
  const rows = await sql<
    {
      id: string;
      type: GazetteerType;
      ref_table: string;
      ref_id: string;
      name_th: string | null;
      name_en: string | null;
      admin_path: string | null;
      lng: number;
      lat: number;
      bbox: number[] | null;
    }[]
  >`select id, type, ref_table, ref_id, name_th, name_en, admin_path, lng, lat, bbox from search_gazetteer(${q}, ${limit})`;
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    refTable: r.ref_table,
    refId: r.ref_id,
    nameTh: r.name_th,
    nameEn: r.name_en,
    adminPath: r.admin_path,
    lng: r.lng,
    lat: r.lat,
    bbox: toBBox(r.bbox),
  }));
}

// ---------------------------------------------------------------- vector tiles

interface TileLayerSql {
  sourceLayer: string;
  from: string;
  where: string;
  props: string;
  polygon: boolean;
}

/** Whitelisted tile queries. $1..$3 = z, x, y. */
const TILE_LAYERS: Record<string, TileLayerSql> = {
  'admin-province': { sourceLayer: 'admin_province', from: 'admin_areas', where: 'level = 1', props: 'pcode, name_th, name_en', polygon: true },
  'admin-district': { sourceLayer: 'admin_district', from: 'admin_areas', where: 'level = 2', props: 'pcode, name_th, name_en', polygon: true },
  'admin-subdistrict': { sourceLayer: 'admin_subdistrict', from: 'admin_areas', where: 'level = 3', props: 'pcode, name_th, name_en', polygon: true },
  villages: { sourceLayer: 'villages', from: 'villages', where: 'true', props: 'id, name_th, name_en, moo', polygon: false },
  'water-rivers': { sourceLayer: 'rivers', from: 'osm_features', where: "kind = 'river'", props: 'osm_id, kind, subkind, name_th, name_en', polygon: false },
  'water-streams': { sourceLayer: 'streams', from: 'osm_features', where: "kind = 'stream'", props: 'osm_id, kind, subkind, name_th, name_en', polygon: false },
  'water-canals': { sourceLayer: 'canals', from: 'osm_features', where: "kind in ('canal', 'drain')", props: 'osm_id, kind, subkind, name_th, name_en', polygon: false },
  'water-reservoirs': { sourceLayer: 'reservoirs', from: 'osm_features', where: "kind = 'reservoir'", props: 'osm_id, kind, subkind, name_th, name_en', polygon: true },
  'water-bodies': { sourceLayer: 'water_bodies', from: 'osm_features', where: "kind = 'water'", props: 'osm_id, kind, subkind, name_th, name_en', polygon: true },
  roads: { sourceLayer: 'roads', from: 'osm_features', where: "(kind = 'road_major' or ($1 >= 14 and kind = 'road_minor'))", props: 'osm_id, kind, subkind, name_th, name_en', polygon: false },
  coastline: { sourceLayer: 'coastline', from: 'osm_features', where: "kind = 'coastline'", props: 'osm_id', polygon: false },
};

export function isTileLayer(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TILE_LAYERS, id);
}

export async function renderTile(sql: Sql, layerId: string, z: number, x: number, y: number): Promise<Buffer> {
  const def = TILE_LAYERS[layerId];
  if (!def) throw new Error(`unknown tile layer ${layerId}`);
  // Simplify polygons to ~half a tile pixel before clipping; lines/points untouched.
  const geomExpr = def.polygon ? 'st_simplifypreservetopology(t.geom, $4)' : 't.geom';
  const tolerance = 360 / 2 ** z / 4096 / 2;
  const query = `
    with bounds as (
      select st_tileenvelope($1, $2, $3) as env,
             st_transform(st_tileenvelope($1, $2, $3, margin => 0.015625), 4326) as env4326
    ),
    mvtgeom as (
      select st_asmvtgeom(st_transform(${geomExpr}, 3857), bounds.env, 4096, 64, true) as geom, ${def.props}
        from ${def.from} t, bounds
       where t.geom && bounds.env4326 and ${def.where}
    )
    select st_asmvt(mvtgeom.*, '${def.sourceLayer}', 4096, 'geom') as tile
      from mvtgeom where geom is not null`;
  const params = def.polygon ? [z, x, y, tolerance] : [z, x, y];
  const [row] = await sql.unsafe<{ tile: Buffer | null }[]>(query, params);
  return row?.tile ?? Buffer.alloc(0);
}

// ---------------------------------------------------------------- extent

export async function provinceExtent(sql: Sql): Promise<{ bbox: BBox; bufferedBbox: BBox } | null> {
  const [row] = await sql<{ bbox: number[]; bbbox: number[] }[]>`
    select array[st_xmin(bbox), st_ymin(bbox), st_xmax(bbox), st_ymax(bbox)] as bbox,
           array[st_xmin(buffered_bbox), st_ymin(buffered_bbox), st_xmax(buffered_bbox), st_ymax(buffered_bbox)] as bbbox
      from province_extent where pcode = 'TH80'`;
  if (!row) return null;
  const bbox = toBBox(row.bbox);
  const bufferedBbox = toBBox(row.bbbox);
  return bbox && bufferedBbox ? { bbox, bufferedBbox } : null;
}

// ---------------------------------------------------------------- live data

/** Sources that have delivered data at least once (a successful or partial ingest run). */
export async function connectedSources(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ source_id: string }[]>`select distinct source_id from ingest_runs where status in ('ok', 'partial')`;
  return new Set(rows.map((r) => r.source_id));
}

export interface NearestObservationRow {
  source_id: string;
  station_id: string;
  name_th: string | null;
  name_en: string | null;
  river_name: string | null;
  station_properties: Record<string, unknown> | null;
  value: number;
  unit: string;
  observed_at: Date;
  fetched_at: Date;
  official_status: string | null;
  official_level: number | null;
  official_color: string | null;
  official_detail: string | null;
  distance_m: number;
}

export async function nearestObservations(sql: Sql, lng: number, lat: number, variable: string, limit = 10): Promise<NearestObservationRow[]> {
  return sql<NearestObservationRow[]>`
    select source_id, station_id, name_th, name_en, river_name, station_properties, value, unit, observed_at, fetched_at,
           official_status, official_level, official_color, official_detail, distance_m
      from nearest_observations(${lng}, ${lat}, ${variable}, ${limit})`;
}

/** Latest value of a variable at given stations (e.g. ThaiWater bank % for water-level stations). */
export async function latestAtStations(sql: Sql, sourceId: string, stationIds: string[], variable: string): Promise<Map<string, number>> {
  if (!stationIds.length) return new Map();
  const rows = await sql<{ station_id: string; value: number }[]>`
    select distinct on (station_id) station_id, value
      from observations
     where source_id = ${sourceId} and variable = ${variable} and station_id in ${sql(stationIds)}
     order by station_id, observed_at desc`;
  return new Map(rows.map((r) => [r.station_id, r.value]));
}

/** Names of named waterways (river/canal/stream/drain) within radius of the point. */
export async function waterwayNamesNear(sql: Sql, lng: number, lat: number, radiusM: number): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select distinct coalesce(name_th, name_en) as name
      from osm_features
     where kind in ('river', 'canal', 'stream', 'drain')
       and coalesce(name_th, name_en) is not null
       and st_dwithin(geom::geography, st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography, ${radiusM})`;
  return rows.map((r) => r.name);
}

export interface StationFeatureRow {
  source_id: string;
  station_id: string;
  name_th: string | null;
  name_en: string | null;
  lng: number;
  lat: number;
  agency_th: string | null;
  value: number;
  unit: string;
  observed_at: Date;
  official_status: string | null;
  official_level: number | null;
  official_color: string | null;
  official_detail: string | null;
}

export async function latestStationReadings(sql: Sql, variable: string): Promise<StationFeatureRow[]> {
  return sql<StationFeatureRow[]>`select * from latest_station_readings(${variable})`;
}
