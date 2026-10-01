/**
 * TMD NWP (WRF) forecast adapter, tested against the real responses saved in
 * data/samples/tmd.nwp (district ฉวาง with its subdistricts, 2026-09-30).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAILY_DAYS, HOURLY_HOURS, districtNames, parseForecastBody, tmdNwp } from '@/lib/adapters/tmdNwp';
import { validateBatch } from '@/lib/ingest/runner';

const sample = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, '../../../data/samples/tmd.nwp', f), 'utf8'));
const districts = sample('province_amphoes_hourly.json');
const hourly = sample('chawang_tambons_hourly.json');
const daily = sample('chawang_tambons_daily.json');
type Place = { location: { areatype: string; geocode: string; name: string; lat: number; lon: number }; forecasts: Array<{ time: string; data: Record<string, number> }> };
const tambons = (body: { WeatherForecasts: Place[] }) => body.WeatherForecasts.filter((p) => p.location.areatype === 'tambon');

describe('TMD NWP (real samples)', () => {
  it('lists the 23 districts of the province from the province response', () => {
    const names = districtNames(districts);
    expect(names).toHaveLength(23);
    expect(names).toContain('ฉวาง');
    expect(names).toContain('เมืองนครศรีธรรมราช');
  });

  it('reads every subdistrict and hour, skipping the district row', () => {
    const { forecasts, rejections } = parseForecastBody(hourly, 'hourly');
    expect(rejections).toEqual([]);
    expect(tambons(hourly)).toHaveLength(10);
    expect(forecasts).toHaveLength(10 * HOURLY_HOURS);
    expect(new Set(forecasts.map((f) => f.placeCode)).size).toBe(10);
    expect(forecasts.every((f) => f.placeCode.length === 6 && f.placeCode.startsWith('8004'))).toBe(true);
  });

  it('keeps the published values, time and reference point exactly', () => {
    const src = tambons(hourly).find((p) => p.location.name === 'ห้วยปริก')!;
    const { forecasts } = parseForecastBody(hourly, 'hourly');
    const f = forecasts.find((x) => x.placeCode === src.location.geocode && x.validAt === src.forecasts[0]!.time)!;
    expect(f.placeCode).toBe('800409');
    expect(f.values).toEqual(src.forecasts[0]!.data);
    expect(f.validAt).toMatch(/\+07:00$/);
    expect([f.lng, f.lat]).toEqual([src.location.lon, src.location.lat]);
  });

  it('reads daily forecasts with min/max temperature and 24-h rain', () => {
    const { forecasts, rejections } = parseForecastBody(daily, 'daily');
    expect(rejections).toEqual([]);
    expect(forecasts).toHaveLength(10 * DAILY_DAYS);
    const f = forecasts[0]!;
    expect(f.resolution).toBe('daily');
    expect(Object.keys(f.values).sort()).toEqual(['cond', 'rain', 'rh', 'tc_max', 'tc_min', 'wd10m', 'ws10m']);
    expect(f.values.tc_max!).toBeGreaterThanOrEqual(f.values.tc_min!);
  });

  it('parses a whole run and passes batch validation (future valid times are expected for forecasts)', () => {
    const batch = tmdNwp.parse({ districts, hourly: { ฉวาง: hourly }, daily: { ฉวาง: daily } }, '2026-09-30T10:38:00Z');
    expect(batch.forecasts).toHaveLength(10 * (HOURLY_HOURS + DAILY_DAYS));
    expect(batch.observations).toEqual([]);
    const v = validateBatch(batch, new Date('2026-09-30T10:38:00Z'));
    expect(v.rejections).toEqual([]);
    expect(v.forecasts).toHaveLength(batch.forecasts!.length);
  });

  it('runs at most every 3 hours to stay within the datapoint quota', () => {
    expect(tmdNwp.minIntervalMinutes).toBe(180);
    // ≈ places × duration × fields per run, well under 100,000 per hour.
    const places = 23 + 170;
    expect(places * HOURLY_HOURS * 6 + places * DAILY_DAYS * 7).toBeLessThan(50_000);
  });
});
