import type * as GeoJSON from 'geojson';

export type Freshness = 'LIVE' | 'RECENT' | 'HISTORICAL' | 'ARCHIVED';
export type Quality = 'CURRENT' | 'OFFICIAL_HISTORICAL' | 'DELAYED' | 'NO_OBSERVATION';
export type DataKind = 'station_observation' | 'satellite_derived' | 'survey' | 'reference' | 'forecast' | 'warning';

/** [minLng, minLat, maxLng, maxLat] in EPSG:4326. */
export type BBox = [number, number, number, number];

export interface DataSource {
  id: string;
  organization: string;
  organizationEn: string;
  datasetName: string;
  datasetNameEn: string;
  kind: DataKind;
  /** Exact licence text or link; 'unknown — verify' if not yet confirmed from the source. */
  license: string;
  /** Text that must appear in the UI wherever this source's data is shown. */
  attribution: string;
  /** Documented endpoint or landing page. Never contains a key. */
  endpoint: string;
  requiresKey: boolean;
  /** null = static dataset. */
  expectedUpdateMinutes: number | null;
  coverage: string;
  /** true only after a real sample was fetched and saved to /data/samples. */
  verified: boolean;
  /** ISO date of the last successful verification, null if never verified. */
  verifiedAt: string | null;
  /** Free tier that may change → must be replaceable. */
  optional: boolean;
  /** Build phase in which the source is integrated. */
  phase: 1 | 2 | 3 | 4;
  /** Short note about verification status, shown in the ⓘ panel and DATA_SOURCES.md. */
  verificationNote: string;
}

export interface Observation {
  id: string;
  sourceId: string;
  stationId?: string;
  geometry: GeoJSON.Point;
  variable: 'rain_24h' | 'water_level' | 'temperature' | 'humidity' | 'wind_speed' | 'wind_dir' | 'pm25' | 'aqi' | (string & {});
  value: number;
  unit: string;
  observedAt: string;
  fetchedAt: string;
  /** Official classification text exactly as the source publishes it (e.g. ThaiWater "น้ำมาก"). */
  officialStatus?: string;
  /** Official level number, when the source publishes one. */
  officialLevel?: number;
  /** Colour published by the source for that level (never chosen by us). */
  officialColor?: string;
  /** Extra official wording, e.g. ThaiWater "ต่ำกว่าตลิ่ง 1.58 ม.". */
  officialDetail?: string;
  raw?: unknown;
}

export type ProviderHealth = 'ok' | 'degraded' | 'down';

export interface EnvironmentalDataProvider {
  source: DataSource;
  fetchLatest(bbox: BBox): Promise<Observation[] | GeoJSON.FeatureCollection>;
  getLastUpdated(): Promise<Date | null>;
  health(): Promise<ProviderHealth>;
}

/** Health reported by /api/sources, which also covers static imports. */
export type SourceStatus =
  | 'ok' // static: imported; live: last ingest succeeded within the expected interval
  | 'degraded' // live: last ingest partial or overdue
  | 'down' // live: last ingest failed
  | 'not_imported' // static dataset not yet loaded into the database
  | 'not_connected' // adapter not built yet (later phase)
  | 'external' // served directly from the provider to the browser (basemaps)
  | 'unknown'; // database unavailable, cannot tell

export interface ImportRecord {
  importedAt: string;
  sourceFile: string;
  sourceUrl: string | null;
  sourceSha256: string | null;
  sourceVersion: string | null;
  sourceDate: string | null;
  sourceRecordCount: number;
  importedCount: number;
  rejectedCount: number;
  /** Of importedCount: records whose published location was corrected (and verified) on import. */
  correctedLocationCount: number;
  /** Of importedCount: records kept without a usable location (not drawn on the map). */
  unlocatedCount: number;
}

export interface SourceHealth {
  id: string;
  status: SourceStatus;
  lastImport: ImportRecord | null;
  lastRun: { startedAt: string; finishedAt: string | null; status: string; rows: number | null; error: string | null } | null;
}

export interface SourcesResponse {
  generatedAt: string;
  database: 'ok' | 'not_configured' | 'error';
  sources: Array<DataSource & { health: SourceHealth }>;
}

/** Reference to a source used by one inspector card. */
export interface SourceRef {
  sourceId: string;
  /** When the source says the data describes (survey/reference date, observation time). null if the source does not state it. */
  observedAt: string | null;
  /** When we fetched/imported it. */
  fetchedAt: string | null;
  /** The source was checked at fetchedAt and reported nothing here (e.g. no hotspots): there is no observation time to show. */
  checkedNothingFound?: boolean;
}

export type CardResult<T> =
  | { status: 'ok'; data: T; sources: SourceRef[] }
  | { status: 'empty'; reason: 'outside_study_area' | 'no_features_in_radius' | 'no_public_data'; radiusM?: number; sources: SourceRef[] }
  | { status: 'not_imported'; sourceIds: string[] }
  | { status: 'not_connected'; sourceIds: string[]; phase: number }
  | { status: 'unavailable'; reason: 'database_not_configured' }
  | { status: 'timeout' }
  | { status: 'error' };

export interface AdminLevel {
  level: 1 | 2 | 3;
  pcode: string;
  nameTh: string;
  nameEn: string | null;
  bbox: BBox;
}

export interface VillageHit {
  id: string;
  nameTh: string;
  nameEn: string | null;
  moo: number | null;
  subdistrictPcode: string | null;
  subdistrictTh: string | null;
  districtTh: string | null;
  lng: number;
  lat: number;
  distanceM: number;
  /** Number of source records at this exact coordinate (1 = unique). */
  sharedLocationCount: number;
  /** 'source' = as published; otherwise how the published value was corrected on import. */
  locationMethod: VillageLocationMethod;
  /** Approximate extra uncertainty from the correction, in metres (null when as published). */
  locationUncertaintyM: number | null;
}

export type VillageLocationMethod = 'source' | 'utm47n_wgs84' | 'axes_swapped';

/** A DOPA village whose published coordinate is not usable; located only by its DOPA subdistrict. */
export interface UnlocatedVillage {
  id: string;
  nameTh: string;
  nameEn: string | null;
  moo: number | null;
  subdistrictTh: string | null;
  districtTh: string | null;
  /** Why the published coordinate is not used, e.g. 'outside_province', 'projected_coordinates'. */
  reason: string;
}

export type FeatureKind =
  | 'river' | 'stream' | 'canal' | 'drain' | 'water' | 'reservoir'
  | 'road_major' | 'road_minor' | 'coastline';

export interface NearbyFeature {
  kind: FeatureKind;
  osmType: string;
  osmId: number;
  subkind: string | null;
  nameTh: string | null;
  nameEn: string | null;
  distanceM: number;
  nearestLng: number;
  nearestLat: number;
}

export interface AdminCard {
  inStudyArea: boolean;
  levels: AdminLevel[];
}

export interface VillageCard {
  nearest: VillageHit[];
  /** Villages of the subdistrict at this point that DOPA lists without a usable location. */
  unlocated: UnlocatedVillage[];
}

export interface HazardsCard {
  hotspotRadiusM: number;
  hotspotDays: number;
  /** One row per source with detections in the radius (sources are never merged). */
  hotspots: Array<{ sourceId: string; count: number; latestObservedAt: string; nearestM: number }>;
  floods: Array<{ sourceId: string; kind: string; observedAt: string; properties: Record<string, unknown> }>;
  warnings: Array<{ sourceId: string; observedAt: string; validUntil: string | null; properties: Record<string, unknown> }>;
  /** Connected hazard sources and when each last delivered successfully (an empty result is still a result). */
  checked: Array<{ sourceId: string; lastSuccessAt: string }>;
  /** Hazard sources that are planned but not connected yet. */
  notConnected: string[];
}

/** Model forecast for the subdistrict at a point (never shown as a measurement). */
export interface ForecastCard {
  sourceId: string;
  placeCode: string;
  placeName: string | null;
  /** The source's reference point for the place, and its distance from the selected point. */
  refLng: number;
  refLat: number;
  refDistanceM: number;
  fetchedAt: string;
  hourly: Array<{ validAt: string; values: Record<string, number> }>;
  daily: Array<{ validAt: string; values: Record<string, number> }>;
}

/** Land cover of the subdistrict at a point (satellite classification), plus mapped mangroves near the point. */
export interface LandcoverCard {
  sourceId: string;
  pcode: string;
  subdistrictTh: string;
  /** Largest class first; share is of the subdistrict's classified area. */
  classes: Array<{ code: number; areaKm2: number; share: number }>;
  mangroveRadiusM: number;
  /** Distance to the nearest mapped mangrove polygon (0 = inside), null if none within the radius. */
  mangroveDistanceM: number | null;
}

export interface ContextCard {
  radiusM: number;
  features: NearbyFeature[];
}

/** One station reading as shown in the inspector. */
export interface ConditionReading {
  sourceId: string;
  stationId: string;
  stationNameTh: string | null;
  stationNameEn: string | null;
  /** Agency that operates the station, as published (ThaiWater aggregates several). */
  agencyTh: string | null;
  riverName: string | null;
  value: number;
  unit: string;
  observedAt: string;
  fetchedAt: string;
  distanceM: number;
  officialStatus: string | null;
  officialLevel: number | null;
  officialColor: string | null;
  officialDetail: string | null;
  /** ThaiWater water level as % of channel capacity, when published. */
  bankPercent: number | null;
}

export interface VariableConditions {
  variable: string;
  rule: { kind: 'radius' | 'same_river'; radiusM: number };
  /** Sources for this variable that have delivered data at least once. */
  connectedSourceIds: string[];
  /** Sources not connected yet, with their build phase. */
  pendingSourceIds: string[];
  /** Local readings, at most one per source (sources are never merged). */
  readings: ConditionReading[];
  /** Nearest reading beyond the rule, clearly labelled as elsewhere. */
  elsewhere: ConditionReading | null;
  /** Local readings from different sources differ beyond tolerance. */
  disagree: boolean;
}

export interface ConditionsCard {
  variables: VariableConditions[];
}

export type InspectSection = 'admin' | 'village' | 'context' | 'conditions' | 'forecast' | 'hazards' | 'landcover' | 'satellite';

export interface InspectResponse {
  lat: number;
  lng: number;
  generatedAt: string;
  sections: Partial<{
    admin: CardResult<AdminCard>;
    village: CardResult<VillageCard>;
    context: CardResult<ContextCard>;
    conditions: CardResult<ConditionsCard>;
    forecast: CardResult<ForecastCard>;
    hazards: CardResult<HazardsCard>;
    landcover: CardResult<LandcoverCard>;
    satellite: CardResult<never>;
  }>;
}

export type GazetteerType = 'province' | 'district' | 'subdistrict' | 'village' | 'water' | 'road' | 'place' | 'station';

export interface SearchHit {
  id: number;
  type: GazetteerType;
  refTable: string;
  refId: string;
  nameTh: string | null;
  nameEn: string | null;
  adminPath: string | null;
  lng: number;
  lat: number;
  bbox: BBox | null;
}

export interface SearchResponse {
  query: string;
  status: 'ok' | 'unavailable' | 'error';
  hits: SearchHit[];
}
