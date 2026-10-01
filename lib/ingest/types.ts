import type * as GeoJSON from 'geojson';
import type { Observation } from '@/lib/types';

export interface StationRecord {
  stationId: string;
  nameTh: string | null;
  nameEn: string | null;
  lng: number;
  lat: number;
  adminText?: string | null;
  riverName?: string | null;
  basinCode?: string | null;
  properties?: Record<string, unknown>;
}

export type HazardKind = 'flood' | 'flood_recurrent' | 'hotspot' | 'warning' | 'earthquake';

export interface HazardRecord {
  featureKey: string;
  kind: HazardKind;
  observedAt: string;
  validUntil?: string | null;
  geometry: GeoJSON.Geometry;
  properties?: Record<string, unknown>;
}

/**
 * A model forecast for one place and one valid time, exactly as published.
 * Kept apart from observations: a forecast is never shown as a measurement.
 */
export interface ForecastRecord {
  /** The source's own place code (TMD geocode, e.g. '800401'). */
  placeCode: string;
  placeName: string | null;
  /** Reference point the source computed the forecast for. */
  lng: number;
  lat: number;
  resolution: 'hourly' | 'daily';
  /** Start of the hour / day the values are for (ISO with offset). */
  validAt: string;
  /** Published fields and values, unmodified. */
  values: Record<string, number>;
}

export interface Rejection {
  reason: string;
  ref?: string;
}

export interface ParsedBatch {
  stations: StationRecord[];
  observations: Observation[];
  hazards: HazardRecord[];
  forecasts?: ForecastRecord[];
  rejections: Rejection[];
}

export interface FetchContext {
  /** Province bbox + 5 km buffer, from province_extent (never hard-coded). */
  bbox: [number, number, number, number];
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  userAgent: string;
}

/**
 * One adapter per source, written only after a real response has been saved
 * to data/samples/<sourceId>/ and the parser tested against it.
 */
export interface IngestAdapter {
  sourceId: string;
  /** Environment variables the adapter needs (server-side keys). */
  requiredEnv?: string[];
  /** Fetch the raw response exactly as the source returns it. */
  fetchRaw(ctx: FetchContext): Promise<unknown>;
  /**
   * Minimum minutes between successful runs (the scheduled job runs every 15 min).
   * Used for sources with tight quotas or slow updates, e.g. model forecasts.
   */
  minIntervalMinutes?: number;
  /** Turn a raw response into normalised records. Must not throw on one bad record. */
  parse(raw: unknown, fetchedAt: string): ParsedBatch;
}
