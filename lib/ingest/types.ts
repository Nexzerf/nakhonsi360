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

export interface Rejection {
  reason: string;
  ref?: string;
}

export interface ParsedBatch {
  stations: StationRecord[];
  observations: Observation[];
  hazards: HazardRecord[];
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
  /** Turn a raw response into normalised records. Must not throw on one bad record. */
  parse(raw: unknown, fetchedAt: string): ParsedBatch;
}
