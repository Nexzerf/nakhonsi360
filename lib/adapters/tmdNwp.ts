/**
 * TMD Weather Forecast API (NWP, WRF model) adapter: hourly (next 24 h) and
 * daily (next 7 days) forecasts for every subdistrict of the province, at the
 * reference point TMD uses for each place.
 *
 * Written against real responses saved in data/samples/tmd.nwp/. The API
 * takes Thai place names; `subarea=1` returns the place and the level below
 * (province → districts, district → subdistricts), so one run is
 * 1 + 2 × (number of districts) requests. TMD geocodes equal the HDX pcodes
 * without 'TH' (subdistrict 800401 = TH800401).
 *
 * Limits (TMD docs): 60 requests/min and 100,000 datapoints/hour per user
 * (datapoints = places × duration × fields). A run uses about
 * 193 × 24 × 6 + 193 × 7 × 7 ≈ 37,000 datapoints, so the adapter runs at
 * most every 3 hours and paces its requests.
 *
 * These are model forecasts, not measurements; the UI labels them so and never
 * mixes them with station observations. `cond` codes (TMD docs):
 * 1 ท้องฟ้าแจ่มใส, 2 มีเมฆบางส่วน, 3 เมฆเป็นส่วนมาก, 4 มีเมฆมาก, 5 ฝนตกเล็กน้อย,
 * 6 ฝนปานกลาง, 7 ฝนตกหนัก, 8 ฝนฟ้าคะนอง, 9 อากาศหนาวจัด, 10 อากาศหนาว,
 * 11 อากาศเย็น, 12 อากาศร้อนจัด.
 */
import type { FetchContext, ForecastRecord, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const TMD_NWP_BASE = 'https://data.tmd.go.th/nwpapi/v1/forecast/location';
/** The API's own province name for TH80. */
export const TMD_PROVINCE = 'นครศรีธรรมราช';
export const HOURLY_FIELDS = ['tc', 'rh', 'rain', 'ws10m', 'wd10m', 'cond'] as const;
export const DAILY_FIELDS = ['tc_max', 'tc_min', 'rh', 'rain', 'ws10m', 'wd10m', 'cond'] as const;
export const HOURLY_HOURS = 24;
export const DAILY_DAYS = 7;
/** Keeps a run under 60 requests/minute. */
const REQUEST_GAP_MS = 1100;

type Json = Record<string, unknown>;

/** Raw response: every API response of one run, exactly as returned. */
export interface TmdNwpRaw {
  districts: unknown;
  hourly: Record<string, unknown>;
  daily: Record<string, unknown>;
}

async function getPlace(ctx: FetchContext, resolution: 'hourly' | 'daily', params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ province: TMD_PROVINCE, subarea: '1', ...params });
  const r = await fetchWithRetry(ctx.fetch, `${TMD_NWP_BASE}/${resolution}/place?${qs}`, {
    headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json', Authorization: `Bearer ${ctx.env.TMD_NWP_TOKEN}` },
  });
  if (!r.ok) throw new Error(`TMD NWP ${resolution}/place ${params.amphoe ?? TMD_PROVINCE} → HTTP ${r.status}`);
  return r.json();
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function forecastsOf(body: unknown): Json[] {
  const list = (body && typeof body === 'object' ? (body as Json).WeatherForecasts : null) as unknown;
  return Array.isArray(list) ? (list as Json[]) : [];
}

/** District names as TMD spells them, from the province response. */
export function districtNames(body: unknown): string[] {
  return forecastsOf(body)
    .map((f) => (f.location ?? {}) as Json)
    .filter((l) => l.areatype === 'amphoe' && typeof l.name === 'string')
    .map((l) => l.name as string);
}

export const tmdNwp: IngestAdapter = {
  sourceId: 'tmd.nwp',
  requiredEnv: ['TMD_NWP_TOKEN'],
  minIntervalMinutes: 180,
  async fetchRaw(ctx: FetchContext): Promise<TmdNwpRaw> {
    const districts = await getPlace(ctx, 'hourly', { fields: 'tc', duration: '1' });
    const names = districtNames(districts);
    if (names.length === 0) throw new Error(`TMD NWP: no districts returned for ${TMD_PROVINCE}`);
    const raw: TmdNwpRaw = { districts, hourly: {}, daily: {} };
    for (const amphoe of names) {
      await sleep(REQUEST_GAP_MS);
      raw.hourly[amphoe] = await getPlace(ctx, 'hourly', { amphoe, fields: HOURLY_FIELDS.join(','), duration: String(HOURLY_HOURS) });
      await sleep(REQUEST_GAP_MS);
      raw.daily[amphoe] = await getPlace(ctx, 'daily', { amphoe, fields: DAILY_FIELDS.join(','), duration: String(DAILY_DAYS) });
    }
    return raw;
  },
  parse(raw: unknown): ParsedBatch {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TmdNwpRaw>;
    const forecasts: ForecastRecord[] = [];
    const rejections: Rejection[] = [];
    for (const [resolution, byDistrict] of [['hourly', r.hourly], ['daily', r.daily]] as const) {
      for (const body of Object.values(byDistrict ?? {})) {
        const out = parseForecastBody(body, resolution);
        forecasts.push(...out.forecasts);
        rejections.push(...out.rejections);
      }
    }
    return { stations: [], observations: [], hazards: [], forecasts, rejections };
  },
};

/** Subdistrict forecasts from one district response (the district's own row is skipped: the UI works per subdistrict). */
export function parseForecastBody(body: unknown, resolution: 'hourly' | 'daily'): { forecasts: ForecastRecord[]; rejections: Rejection[] } {
  const forecasts: ForecastRecord[] = [];
  const rejections: Rejection[] = [];
  for (const place of forecastsOf(body)) {
    const loc = (place.location ?? {}) as Json;
    if (loc.areatype !== 'tambon') continue;
    const code = typeof loc.geocode === 'string' ? loc.geocode : null;
    const lat = typeof loc.lat === 'number' ? loc.lat : null;
    const lng = typeof loc.lon === 'number' ? loc.lon : null;
    if (!code || lat === null || lng === null) {
      rejections.push({ reason: 'bad_location', ref: String(loc.name ?? '?') });
      continue;
    }
    for (const f of Array.isArray(place.forecasts) ? (place.forecasts as Json[]) : []) {
      const time = typeof f.time === 'string' ? f.time : null;
      const data = (f.data ?? {}) as Json;
      const values: Record<string, number> = {};
      for (const [k, v] of Object.entries(data)) if (typeof v === 'number' && Number.isFinite(v)) values[k] = v;
      if (!time || Number.isNaN(Date.parse(time))) {
        rejections.push({ reason: 'bad_timestamp', ref: `${code}/${time}` });
        continue;
      }
      if (Object.keys(values).length === 0) {
        rejections.push({ reason: 'no_values', ref: `${code}/${time}` });
        continue;
      }
      forecasts.push({ placeCode: code, placeName: typeof loc.name === 'string' ? loc.name : null, lng, lat, resolution, validAt: time, values });
    }
  }
  return { forecasts, rejections };
}
