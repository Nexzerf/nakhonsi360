import { describe, expect, it } from 'vitest';
import { parseObservedAt, parseReading, validateObservation } from '@/lib/validation/observation';
import { parseCoordValue, validateThaiPoint } from '@/lib/validation/geometry';
import type { Observation } from '@/lib/types';

const now = new Date('2026-09-29T12:00:00Z');
const obs = (o: Partial<Observation>): Observation => ({
  id: 'x',
  sourceId: 'test',
  geometry: { type: 'Point', coordinates: [99.96, 8.43] },
  variable: 'rain_24h',
  value: 12,
  unit: 'mm',
  observedAt: '2026-09-29T18:00:00+07:00',
  fetchedAt: now.toISOString(),
  ...o,
});

describe('coordinate validation', () => {
  it('treats empty strings and sentinels as missing, never 0', () => {
    expect(parseCoordValue('')).toBeNull();
    expect(parseCoordValue(' - ')).toBeNull();
    expect(validateThaiPoint(-999, -999)).toEqual({ ok: false, reason: 'sentinel_value' });
    expect(validateThaiPoint(0, 0)).toEqual({ ok: false, reason: 'sentinel_value' });
  });
  it('detects swapped lat/lng without fixing it', () => {
    expect(validateThaiPoint(8.43, 99.96)).toEqual({ ok: false, reason: 'swapped_lat_lng' });
  });
  it('accepts points in Thailand', () => {
    expect(validateThaiPoint(99.96, 8.43)).toEqual({ ok: true });
  });
});

describe('observation validation', () => {
  it('accepts a plausible reading', () => {
    expect(validateObservation(obs({}), now)).toEqual({ ok: true });
  });
  it('rejects out-of-range values', () => {
    expect(validateObservation(obs({ value: 1200 }), now)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(validateObservation(obs({ variable: 'temperature', unit: '°C', value: 51 }), now)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(validateObservation(obs({ variable: 'humidity', unit: '%', value: 101 }), now)).toEqual({ ok: false, reason: 'out_of_range' });
  });
  it('rejects sentinel values', () => {
    expect(validateObservation(obs({ value: -999 }), now)).toEqual({ ok: false, reason: 'sentinel_value' });
  });
  it('rejects wrong units', () => {
    expect(validateObservation(obs({ unit: 'cm' }), now)).toEqual({ ok: false, reason: 'unknown_unit' });
  });
  it('rejects timestamps more than an hour in the future', () => {
    expect(validateObservation(obs({ observedAt: '2026-09-29T21:30:00+07:00' }), now)).toEqual({ ok: false, reason: 'future_timestamp' });
  });
  it('requires a timezone unless the source documents one', () => {
    expect(parseObservedAt('2026-09-29 18:00:00')).toEqual({ ok: false, reason: 'no_timezone' });
    const t = parseObservedAt('2026-09-29 18:00:00', '+07:00');
    expect(t.ok && t.date.toISOString()).toBe('2026-09-29T11:00:00.000Z');
  });
  it('parses readings without inventing zeros', () => {
    expect(parseReading('')).toBeNull();
    expect(parseReading('9999')).toBeNull();
    expect(parseReading('0')).toBe(0);
    expect(parseReading('12.5')).toBe(12.5);
  });
});
