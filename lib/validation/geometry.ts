import { THAILAND_ENVELOPE, bboxContains } from '@/lib/geo/bbox';

export type CoordRejection = 'not_a_number' | 'sentinel_value' | 'outside_thailand' | 'swapped_lat_lng' | 'projected_coordinates';

const SENTINELS = new Set([-999, -9999, 9999, 999, 0]);

/**
 * Parse a coordinate value from a source record. Returns null for empty
 * strings, sentinels and non-numbers — never 0 as a placeholder.
 */
export function parseCoordValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '-' || t.toLowerCase() === 'null' || t.toLowerCase() === 'nan') return null;
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/**
 * Validate a point in Thailand. Detects swapped lat/lng (a common error in
 * published tables) but does not silently fix it: the caller decides.
 */
export function validateThaiPoint(lng: number | null, lat: number | null): { ok: true } | { ok: false; reason: CoordRejection } {
  if (lng === null || lat === null) return { ok: false, reason: 'not_a_number' };
  if (SENTINELS.has(lng) || SENTINELS.has(lat)) return { ok: false, reason: 'sentinel_value' };
  if (bboxContains(THAILAND_ENVELOPE, lng, lat)) return { ok: true };
  if (bboxContains(THAILAND_ENVELOPE, lat, lng)) return { ok: false, reason: 'swapped_lat_lng' };
  // Metres (e.g. UTM) in degree fields. Not converted here: the datum is not stated. The village
  // importer may accept a conversion only when it lands in the subdistrict the source names.
  if (Math.abs(lng) > 1000 && Math.abs(lat) > 1000) return { ok: false, reason: 'projected_coordinates' };
  return { ok: false, reason: 'outside_thailand' };
}
