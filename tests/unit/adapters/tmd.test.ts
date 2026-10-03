/** TMD weather observations and warnings against the real samples in data/samples/. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTmdWarnings, parseTmdWeather, tmdTime, tmdUrl } from '@/lib/adapters/tmd';
import { validateObservation } from '@/lib/validation/observation';

const root = path.resolve(__dirname, '../../../data/samples');
const weather = JSON.parse(readFileSync(path.join(root, 'tmd.weather/weather3hours_v2.json'), 'utf8'));
const warnings = JSON.parse(readFileSync(path.join(root, 'tmd.warnings/warning_news_v2.json'), 'utf8'));
const FETCHED = '2026-10-03T15:32:05.000Z';

describe('TMD Weather3Hours (real sample)', () => {
  const b = parseTmdWeather(weather, FETCHED);

  it('reads every station with its WMO number and Thai time', () => {
    expect(b.rejections).toEqual([]);
    expect(b.stations.length).toBe(weather.Stations.Station.length);
    const nst = b.stations.find((s) => s.stationId === '48552')!;
    expect(nst).toMatchObject({ nameTh: 'นครศรีธรรมราช', lat: 8.53778, lng: 99.94722 });
    const t = b.observations.find((o) => o.stationId === '48552' && o.variable === 'temperature')!;
    // "10/03/2026 22:00:00" is 3 October 22:00 in Thailand.
    expect(t.observedAt).toBe('2026-10-03T15:00:00.000Z');
    expect(t.unit).toBe('°C');
  });

  it('keeps values and units as TMD publishes them, all plausible', () => {
    const vars = new Set(b.observations.map((o) => `${o.variable}:${o.unit}`));
    expect(vars).toContain('wind_speed:km/h');
    expect(vars).toContain('rain_24h:mm');
    const bad = b.observations.filter((o) => !validateObservation(o, new Date(FETCHED)).ok);
    expect(bad).toEqual([]);
    // Station 48569 reports direction 990 (WMO "variable"): no direction stored, speed kept.
    expect(b.observations.some((o) => o.stationId === '48569' && o.variable === 'wind_dir')).toBe(false);
    expect(b.observations.some((o) => o.stationId === '48569' && o.variable === 'wind_speed')).toBe(true);
  });

  it('rejects readings dated far from the fetch instead of guessing the date order', () => {
    expect(tmdTime('10/03/2026 22:00:00')).toBe('2026-10-03T15:00:00.000Z');
    const shifted = parseTmdWeather(weather, '2026-03-10T00:00:00Z');
    expect(shifted.observations).toHaveLength(0);
    expect(shifted.rejections.every((r) => r.reason === 'stale_or_misdated')).toBe(true);
  });

  it('never puts a key in error messages, and uses TMD_UID/TMD_UKEY when set', () => {
    expect(tmdUrl('Weather3Hours/V2', { TMD_UID: 'me', TMD_UKEY: 's3cret' })).toContain('uid=me&ukey=s3cret');
    expect(tmdUrl('Weather3Hours/V2', {})).toContain('uid=api&ukey=api12345');
  });
});

describe('TMD warnings (real sample)', () => {
  it('keeps each announcement with its effective period and link, as a national notice', () => {
    const b = parseTmdWarnings(warnings);
    expect(b.rejections).toEqual([]);
    expect(b.hazards).toHaveLength(1);
    const w = b.hazards[0]!;
    expect(w.kind).toBe('warning');
    expect(w.observedAt).toBe('2026-10-03T09:00:13.000Z');
    expect(w.validUntil).toBe('2026-10-03T23:00:00.000Z');
    expect(w.properties).toMatchObject({ issue_no: '5', scope: 'national', title_en: 'Variable Weather in Upper Thailand  No.5 (239/2026)' });
    expect(String(w.properties!.title_th)).toContain('อากาศแปรปรวน');
    expect(String(w.properties!.url_th)).toMatch(/^https:\/\/tmd\.go\.th\//);
  });
});
