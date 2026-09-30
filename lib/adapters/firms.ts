/**
 * NASA FIRMS active-fire (hotspot) adapter: Area API, CSV, one request per sensor.
 *
 * Written against real responses saved in data/samples/firms.hotspots/
 * (province bbox + 5 km; July–October 2026). Columns:
 *   VIIRS: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
 *   MODIS: latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
 * acq_date/acq_time are UTC; acq_time is HHMM without zero padding ("856" = 08:56).
 * VIIRS confidence is a class (l/n/h); MODIS confidence is 0–100. Both are
 * stored exactly as published and shown as such, never merged into one scale.
 *
 * A hotspot is a satellite detection of heat, not a confirmed fire; the UI says so.
 * The MAP_KEY is sent in the URL path, so it is removed from every error message.
 */
import type { FetchContext, HazardRecord, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';
import { parseCsvRows } from '@/lib/import/csv';
import { fetchWithRetry } from '@/lib/ingest/runner';
import { parseCoordValue } from '@/lib/validation/geometry';

export const FIRMS_AREA_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
/** Near-real-time products covering Thailand. */
export const FIRMS_SENSORS = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'] as const;
export type FirmsSensor = (typeof FIRMS_SENSORS)[number];
/** Days per request (the API accepts 1–5). Runs every 15 min, so 2 days covers late NRT deliveries. */
export const FIRMS_DAY_RANGE = 2;

/** Raw response: the CSV text per sensor, exactly as returned. */
export type FirmsRaw = Partial<Record<FirmsSensor, string>>;

const HEADER = /^latitude,longitude,/;

export const firmsHotspots: IngestAdapter = {
  sourceId: 'firms.hotspots',
  requiredEnv: ['FIRMS_MAP_KEY'],
  async fetchRaw(ctx: FetchContext): Promise<FirmsRaw> {
    const key = ctx.env.FIRMS_MAP_KEY!;
    const redact = (s: string) => s.split(key).join('<MAP_KEY>');
    const bbox = ctx.bbox.join(',');
    const out: FirmsRaw = {};
    for (const sensor of FIRMS_SENSORS) {
      let text: string;
      try {
        const r = await fetchWithRetry(ctx.fetch, `${FIRMS_AREA_BASE}/${key}/${sensor}/${bbox}/${FIRMS_DAY_RANGE}`, {
          headers: { 'User-Agent': ctx.userAgent, Accept: 'text/csv' },
        });
        text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch (err) {
        throw new Error(redact(`FIRMS ${sensor}: ${err instanceof Error ? err.message : String(err)}`));
      }
      // Errors come back as plain text with HTTP 200 (e.g. "Invalid MAP_KEY.", "Invalid day range. Expects [1..5].").
      if (!HEADER.test(text)) throw new Error(redact(`FIRMS ${sensor}: unexpected response: ${text.slice(0, 120)}`));
      out[sensor] = text;
    }
    return out;
  },
  parse(raw: unknown): ParsedBatch {
    const hazards: HazardRecord[] = [];
    const rejections: Rejection[] = [];
    const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    for (const sensor of FIRMS_SENSORS) {
      const text = src[sensor];
      if (typeof text !== 'string') continue;
      for (const row of parseCsvRows(text)) {
        const h = parseFirmsRow(sensor, row);
        if ('reason' in h) rejections.push(h);
        else hazards.push(h);
      }
    }
    return { stations: [], observations: [], hazards, rejections };
  },
};

/** "2026-08-10" + "856" → 2026-08-10T08:56:00Z; null when either part is malformed. */
export function firmsObservedAt(acqDate: string | undefined, acqTime: string | undefined): string | null {
  if (!acqDate || !/^\d{4}-\d{2}-\d{2}$/.test(acqDate) || !acqTime || !/^\d{1,4}$/.test(acqTime)) return null;
  const hhmm = acqTime.padStart(4, '0');
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(2));
  if (hh > 23 || mm > 59) return null;
  const d = new Date(`${acqDate}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseFirmsRow(sensor: FirmsSensor, row: Record<string, string>): HazardRecord | Rejection {
  const lat = parseCoordValue(row.latitude);
  const lng = parseCoordValue(row.longitude);
  const ref = `${sensor}/${row.acq_date ?? '?'}/${row.acq_time ?? '?'}/${row.latitude ?? '?'},${row.longitude ?? '?'}`;
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { reason: 'bad_coordinates', ref };
  const observedAt = firmsObservedAt(row.acq_date, row.acq_time);
  if (!observedAt) return { reason: 'bad_timestamp', ref };
  const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    // One detection = one pixel from one overpass: sensor + time + published centre.
    featureKey: `${sensor}:${observedAt}:${row.latitude},${row.longitude}`,
    kind: 'hotspot',
    observedAt,
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      sensor,
      satellite: row.satellite || null,
      instrument: row.instrument || null,
      confidence: row.confidence || null,
      frp_mw: num(row.frp),
      daynight: row.daynight || null,
      scan_km: num(row.scan),
      track_km: num(row.track),
      brightness_k: num(row.bright_ti4 ?? row.brightness),
      version: row.version || null,
    },
  };
}
