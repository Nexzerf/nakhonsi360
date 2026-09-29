import type { Observation } from '@/lib/types';
import { validateThaiPoint } from '@/lib/validation/geometry';

/** Physically plausible ranges in canonical units. Out-of-range → reject and log, never display. */
export const PLAUSIBLE_RANGES: Record<string, { unit: string; min: number; max: number }> = {
  rain_24h: { unit: 'mm', min: 0, max: 1000 },
  temperature: { unit: '°C', min: 5, max: 45 },
  humidity: { unit: '%', min: 0, max: 100 },
  pm25: { unit: 'µg/m³', min: 0, max: 1000 },
  wind_speed: { unit: 'm/s', min: 0, max: 90 },
  wind_dir: { unit: '°', min: 0, max: 360 },
};

/** Values that sources use to mean "missing". */
export const SENTINEL_VALUES: ReadonlySet<number> = new Set([-999, -9999, 9999, -99, 999999]);

export type ObservationRejection =
  | 'missing_value'
  | 'sentinel_value'
  | 'unknown_unit'
  | 'out_of_range'
  | 'bad_timestamp'
  | 'no_timezone'
  | 'future_timestamp'
  | 'bad_geometry';

/** Parse a numeric reading. Empty strings and sentinels become null, never 0. */
export function parseReading(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || SENTINEL_VALUES.has(n)) return null;
  return n;
}

const HAS_TZ = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parse a source timestamp. A timezone is required unless the source documents
 * its local zone, in which case pass `assumeZone` (e.g. '+07:00' for Asia/Bangkok).
 */
export function parseObservedAt(v: unknown, assumeZone?: string): { ok: true; date: Date } | { ok: false; reason: ObservationRejection } {
  if (typeof v !== 'string' || v.trim() === '') return { ok: false, reason: 'bad_timestamp' };
  let s = v.trim().replace(' ', 'T');
  if (!HAS_TZ.test(s)) {
    if (!assumeZone) return { ok: false, reason: 'no_timezone' };
    s += assumeZone;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: 'bad_timestamp' };
  return { ok: true, date: d };
}

export function validateObservation(o: Observation, now = new Date()): { ok: true } | { ok: false; reason: ObservationRejection } {
  if (!Number.isFinite(o.value)) return { ok: false, reason: 'missing_value' };
  if (SENTINEL_VALUES.has(o.value)) return { ok: false, reason: 'sentinel_value' };
  const [lng, lat] = o.geometry.coordinates as [number, number];
  if (!validateThaiPoint(lng ?? null, lat ?? null).ok) return { ok: false, reason: 'bad_geometry' };
  const range = PLAUSIBLE_RANGES[o.variable];
  if (range) {
    if (range.unit !== o.unit) return { ok: false, reason: 'unknown_unit' };
    if (o.value < range.min || o.value > range.max) return { ok: false, reason: 'out_of_range' };
  } else if (!o.unit) {
    return { ok: false, reason: 'unknown_unit' };
  }
  const t = parseObservedAt(o.observedAt);
  if (!t.ok) return t;
  if (t.date.getTime() - now.getTime() > 60 * 60 * 1000) return { ok: false, reason: 'future_timestamp' };
  return { ok: true };
}
