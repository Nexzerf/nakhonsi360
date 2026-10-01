/**
 * NASA FIRMS adapter, tested against the real Area API responses saved in
 * data/samples/firms.hotspots (MAP_KEY removed from the stored URLs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firmsHotspots, firmsObservedAt, type FirmsRaw } from '@/lib/adapters/firms';
import { parseCsvRows } from '@/lib/import/csv';
import { validateBatch } from '@/lib/ingest/runner';

const dir = path.resolve(__dirname, '../../../data/samples/firms.hotspots');
const csv = (f: string) => readFileSync(path.join(dir, f), 'utf8');
const viirs = csv('VIIRS_NOAA21_NRT_2026-08-10.csv');
const modis = csv('MODIS_NRT_2026-07-31.csv');
const empty = csv('VIIRS_SNPP_NRT_latest-empty.csv');
const raw: FirmsRaw = { VIIRS_NOAA21_NRT: viirs, MODIS_NRT: modis, VIIRS_SNPP_NRT: empty };
const FETCHED = '2026-09-30T10:00:00.000Z';

describe('NASA FIRMS hotspots (real samples)', () => {
  const batch = firmsHotspots.parse(raw, FETCHED);

  it('reads every detection and nothing else', () => {
    const n = parseCsvRows(viirs).length + parseCsvRows(modis).length;
    expect(n).toBe(30);
    expect(batch.hazards).toHaveLength(n);
    expect(batch.rejections).toEqual([]);
    expect(batch.stations).toEqual([]);
    expect(batch.observations).toEqual([]);
  });

  it('an empty response (header only) is not an error and yields no hotspots', () => {
    expect(firmsHotspots.parse({ VIIRS_SNPP_NRT: empty }, FETCHED).hazards).toEqual([]);
  });

  it('keeps the published values: position, UTC time, VIIRS confidence class, FRP', () => {
    const first = parseCsvRows(viirs)[0]!;
    const h = batch.hazards.find((x) => x.properties?.sensor === 'VIIRS_NOAA21_NRT')!;
    expect(h.kind).toBe('hotspot');
    expect(h.geometry).toEqual({ type: 'Point', coordinates: [Number(first.longitude), Number(first.latitude)] });
    expect(h.observedAt).toBe('2026-08-12T06:46:00.000Z'); // acq_time "646" = 06:46 UTC (13:46 in Thailand)
    expect(h.properties?.confidence).toBe(first.confidence);
    expect(['l', 'n', 'h']).toContain(h.properties?.confidence);
    expect(h.properties?.frp_mw).toBe(Number(first.frp));
    expect(h.properties?.daynight).toBe(first.daynight);
  });

  it('keeps MODIS confidence as the published 0–100 number, not a class', () => {
    const row = parseCsvRows(modis)[0]!;
    const h = batch.hazards.find((x) => x.properties?.sensor === 'MODIS_NRT')!;
    expect(h.properties?.confidence).toBe(row.confidence);
    expect(Number(h.properties?.confidence)).toBeGreaterThanOrEqual(0);
    expect(h.properties?.brightness_k).toBe(Number(row.brightness));
  });

  it('gives each detection a distinct key, so re-ingesting overlapping days does not duplicate', () => {
    const keys = new Set(batch.hazards.map((h) => h.featureKey));
    expect(keys.size).toBe(batch.hazards.length);
    const again = firmsHotspots.parse(raw, '2026-09-30T10:15:00.000Z');
    expect(again.hazards.map((h) => h.featureKey)).toEqual(batch.hazards.map((h) => h.featureKey));
  });

  it('passes batch validation (no future timestamps)', () => {
    expect(validateBatch(batch, new Date(FETCHED)).rejections).toEqual([]);
  });
});

describe('firmsObservedAt', () => {
  it('pads HHMM and reads it as UTC', () => {
    expect(firmsObservedAt('2026-08-02', '856')).toBe('2026-08-02T08:56:00.000Z');
    expect(firmsObservedAt('2026-08-02', '5')).toBe('2026-08-02T00:05:00.000Z');
    expect(firmsObservedAt('2026-08-02', '1403')).toBe('2026-08-02T14:03:00.000Z');
  });
  it('rejects malformed values instead of guessing', () => {
    expect(firmsObservedAt('2026-08-02', '2460')).toBeNull();
    expect(firmsObservedAt('02/08/2026', '856')).toBeNull();
    expect(firmsObservedAt(undefined, '856')).toBeNull();
  });
});

describe('fetchRaw', () => {
  const ctx = (text: string) => ({
    bbox: [99.1, 7.7, 100.4, 9.4] as [number, number, number, number],
    env: { FIRMS_MAP_KEY: 'SECRETKEY123' },
    userAgent: 'test',
    fetch: (async () => new Response(text, { status: 200 })) as unknown as typeof fetch,
  });

  it('treats a plain-text error with HTTP 200 as a failure and never leaks the key', async () => {
    await expect(firmsHotspots.fetchRaw(ctx('Invalid MAP_KEY.'))).rejects.toThrow(/unexpected response: Invalid MAP_KEY/);
    const err = await firmsHotspots.fetchRaw(ctx('SECRETKEY123 is invalid')).catch((e: Error) => e.message);
    expect(err).not.toContain('SECRETKEY123');
  });
});
