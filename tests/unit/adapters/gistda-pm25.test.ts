/** GISTDA PM2.5 per district against the real sample in data/samples/. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGistdaPm25, pm25Time } from '@/lib/adapters/gistdaPm25';
import { validateObservation } from '@/lib/validation/observation';

const root = path.resolve(__dirname, '../../../data/samples');
const response = JSON.parse(readFileSync(path.join(root, 'gistda.pm25/pm25_by_amphoe_80.json'), 'utf8'));
const FETCHED = '2026-10-03T18:36:32.731Z';
// Points stand in for the imported district boundaries (only the codes matter here).
const points = Object.fromEntries(response.data.map((d: { ap_idn: number }) => [`TH${d.ap_idn}`, [99.9, 8.4]]));

describe('GISTDA PM2.5 by district (real sample)', () => {
  it('reads all 23 districts with hourly and 24-hour values', () => {
    const b = parseGistdaPm25({ response, points }, FETCHED);
    expect(b.rejections).toEqual([]);
    expect(b.stations).toHaveLength(23);
    const tasala = b.observations.filter((o) => o.stationId === 'amphoe-8008');
    expect(tasala.map((o) => [o.variable, o.value, o.unit])).toEqual([
      ['pm25', 7.4, 'µg/m³'],
      ['pm25_24h', 12.1, 'µg/m³'],
    ]);
    expect(b.observations.every((o) => validateObservation(o, new Date(FETCHED)).ok)).toBe(true);
  });

  it('reads "…Z" as Thai time, so the hour is not in the future', () => {
    // 01:00 on 4 October in Thailand = 18:00 UTC on 3 October (fetched 18:36 UTC).
    expect(pm25Time('2026-10-04T01:00:00.000Z')).toBe('2026-10-03T18:00:00.000Z');
  });

  it('skips a district the boundaries do not know instead of placing it anywhere', () => {
    const b = parseGistdaPm25({ response, points: {} }, FETCHED);
    expect(b.observations).toHaveLength(0);
    expect(b.rejections.every((r) => r.reason === 'unknown_district')).toBe(true);
  });
});
