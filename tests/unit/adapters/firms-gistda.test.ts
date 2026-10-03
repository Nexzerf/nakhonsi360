/** NASA FIRMS and GISTDA flood parsers against the real samples in data/samples/. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firmsTime, parseFirms } from '@/lib/adapters/firms';
import { parseGistdaFlood, scenesOf } from '@/lib/adapters/gistda';

const root = path.resolve(__dirname, '../../../data/samples');
const firmsCsv = readFileSync(path.join(root, 'firms.hotspots/area_viirs_noaa21_5d.csv'), 'utf8');
const flood = JSON.parse(readFileSync(path.join(root, 'gistda.flood/flood_30days_national.json'), 'utf8'));

describe('NASA FIRMS (real sample)', () => {
  it('reads every row with UTC time from acq_date + acq_time (no leading zeros)', () => {
    const b = parseFirms({ since: '2026-09-29T00:00:00.000Z', csv: { VIIRS_NOAA21_NRT: firmsCsv } });
    expect(b.rejections).toEqual([]);
    expect(b.hazards).toHaveLength(3);
    const h = b.hazards[0]!;
    expect(h.kind).toBe('hotspot');
    expect(h.observedAt).toBe('2026-09-29T06:48:00.000Z');
    expect(h.geometry).toEqual({ type: 'Point', coordinates: [98.94051, 9.27873] });
    expect(h.properties).toMatchObject({ product: 'VIIRS_NOAA21_NRT', satellite: 'N21', confidence: 'n', frp_mw: 2.91, daynight: 'D', bright_k: 331.86 });
    expect(b.hazardWindows).toEqual([{ kind: 'hotspot', since: '2026-09-29T00:00:00.000Z' }]);
  });

  it('keeps MODIS brightness and an empty product as no rows', () => {
    const modis = 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n8.5,99.9,320.5,1,1,2026-10-01,1830,T,MODIS,72,6.1NRT,295,12.3,N';
    const b = parseFirms({ since: '2026-10-01T00:00:00Z', csv: { MODIS_NRT: modis, VIIRS_SNPP_NRT: 'latitude,longitude,bright_ti4\n' } });
    expect(b.hazards).toHaveLength(1);
    expect(b.hazards[0]!.properties).toMatchObject({ confidence: '72', bright_k: 320.5, frp_mw: 12.3 });
    expect(b.hazards[0]!.observedAt).toBe('2026-10-01T18:30:00.000Z');
  });

  it('rejects rows without a usable time or position', () => {
    const bad = 'latitude,longitude,acq_date,acq_time\n,99,2026-10-01,100\n8.4,99.9,yesterday,100\n8.4,99.9,2026-10-01,99999';
    const b = parseFirms({ since: '2026-10-01T00:00:00Z', csv: { X: bad } });
    expect(b.hazards).toHaveLength(0);
    expect(b.rejections.map((r) => r.reason)).toEqual(['bad_coordinates', 'bad_timestamp', 'bad_timestamp']);
    expect(firmsTime('2026-10-01', '5')).toBe('2026-10-01T00:05:00.000Z');
  });
});

describe('GISTDA flood (real sample)', () => {
  it('keeps the cell, its admin names and GISTDA estimates as published', () => {
    const b = parseGistdaFlood({ since: '2026-09-26T00:00:00Z', pages: [flood] });
    expect(b.rejections).toEqual([]);
    expect(b.hazards).toHaveLength(1);
    const h = b.hazards[0]!;
    expect(h.featureKey).toBe('6abff31c6b93253c8e1e14d9');
    expect(h.kind).toBe('flood');
    expect(h.observedAt).toBe('2026-10-02T18:08:28.310Z');
    expect(h.geometry.type).toBe('MultiPolygon');
    expect(h.properties).toMatchObject({ district_th: 'อ.บึงกาฬ', subdistrict_th: 'ต.หอคำ', flood_area_m2: 9338.18076088947, population: 0, scene_count: 27 });
    expect((h.properties as { latest_scene: unknown }).latest_scene).toEqual({ sensor: 'S1D', date: '2026-09-29', time: '1812' });
    expect(b.hazardWindows).toEqual([{ kind: 'flood', since: '2026-09-26T00:00:00Z' }]);
  });

  it('reads scene names newest first and ignores anything else', () => {
    expect(scenesOf('rd2_20260907_1811, S1C_20260928_0550, junk, S1D_20260910_0551').map((s) => s.date)).toEqual(['2026-09-28', '2026-09-10', '2026-09-07']);
    expect(scenesOf(null)).toEqual([]);
  });

  it('refuses a response that is not a FeatureCollection', () => {
    expect(() => parseGistdaFlood({ since: 'x', pages: [{ status: 404, detail: 'Service not found' }] })).toThrow();
  });
});
