import type * as GeoJSON from 'geojson';

export type Freshness = 'LIVE' | 'RECENT' | 'HISTORICAL' | 'ARCHIVED';
export type Quality = 'CURRENT' | 'OFFICIAL_HISTORICAL' | 'DELAYED' | 'NO_OBSERVATION';
export type DataKind = 'station_observation' | 'satellite_derived' | 'survey' | 'reference' | 'forecast' | 'warning' | 'community';

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

/** One earthquake as published by the source (USGS); nothing derived except distance. */
export interface EarthquakeEvent {
  sourceId: string;
  id: string;
  mag: number;
  magType: string | null;
  place: string | null;
  depthKm: number | null;
  /** Source review status, e.g. USGS 'automatic' or 'reviewed'. */
  status: string | null;
  url: string | null;
  lng: number;
  lat: number;
  observedAt: string;
  fetchedAt: string;
  /** From the selected point. */
  distanceM: number;
}

export interface EarthquakeSummary {
  /** Query region as the adapter requests it (around the province centre). */
  radiusKm: number;
  minMagnitude: number;
  windowDays: number;
  total: number;
  /** Newest first. */
  recent: EarthquakeEvent[];
  /** Nearest to the selected point within the window. */
  nearest: EarthquakeEvent | null;
}

export interface HazardsCard {
  earthquakes: EarthquakeSummary | null;
  /** Hazard sources not connected yet. */
  pendingSourceIds: string[];
}

export type InspectSection = 'admin' | 'village' | 'context' | 'conditions' | 'hazards' | 'satellite';

export interface InspectResponse {
  lat: number;
  lng: number;
  generatedAt: string;
  sections: Partial<{
    admin: CardResult<AdminCard>;
    village: CardResult<VillageCard>;
    context: CardResult<ContextCard>;
    conditions: CardResult<ConditionsCard>;
    hazards: CardResult<HazardsCard>;
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
