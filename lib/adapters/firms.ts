/**
 * NASA FIRMS active fire / thermal hotspots (area API, CSV).
 *
 * Written against real responses saved in data/samples/firms.hotspots/.
 * One request per satellite product for the province extent and the last
 * FIRMS_DAYS days. acq_date + acq_time are UTC (time is HHMM without leading
 * zeros), so no timezone is inferred. Confidence, FRP and day/night are
 * NASA's own values; nothing is derived. The MAP_KEY goes in the URL path,
 * so it never appears in error messages.
 */
import type { FetchContext, HazardRecord, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const FIRMS_AREA_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
export const FIRMS_PRODUCTS = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'] as const;
/** Days requested each run (the API's day range counts back from today, UTC). */
export const FIRMS_DAYS = 2;

export interface FirmsRaw {
  /** Start of the requested window (UTC midnight, FIRMS_DAYS - 1 days before the fetch day). */
  since: string;
  /** CSV text per product, exactly as returned. */
  csv: Record<string, string>;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const head = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** acq_date (YYYY-MM-DD) + acq_time (HHMM, possibly without leading zeros), UTC. */
export function firmsTime(date: string | undefined, time: string | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^\d{1,4}$/.test(time)) return null;
  const t = time.padStart(4, '0');
  const iso = `${date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`;
  return Number.isNaN(new Date(iso).getTime()) ? null : new Date(iso).toISOString();
}

export function parseFirms(raw: FirmsRaw): ParsedBatch {
  const hazards: HazardRecord[] = [];
  const rejections: Rejection[] = [];
  for (const [product, text] of Object.entries(raw.csv)) {
    for (const r of parseCsv(text)) {
      const lat = num(r.latitude);
      const lng = num(r.longitude);
      const when = firmsTime(r.acq_date, r.acq_time);
      const ref = `${product}:${r.acq_date}:${r.acq_time}:${r.latitude},${r.longitude}`;
      if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        rejections.push({ reason: 'bad_coordinates', ref });
        continue;
      }
      if (!when) {
        rejections.push({ reason: 'bad_timestamp', ref });
        continue;
      }
      hazards.push({
        featureKey: ref,
        kind: 'hotspot',
        observedAt: when,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          product,
          satellite: r.satellite || null,
          instrument: r.instrument || null,
          // VIIRS: l / n / h (low / nominal / high); MODIS: 0–100.
          confidence: r.confidence || null,
          frp_mw: num(r.frp),
          daynight: r.daynight || null,
          bright_k: num(r.bright_ti4 ?? r.brightness),
          version: r.version || null,
        },
      });
    }
  }
  return { stations: [], observations: [], hazards, rejections, hazardWindows: [{ kind: 'hotspot', since: raw.since }] };
}

export const firmsHotspots: IngestAdapter = {
  sourceId: 'firms.hotspots',
  requiredEnv: ['FIRMS_MAP_KEY'],
  async fetchRaw(ctx: FetchContext): Promise<FirmsRaw> {
    const key = ctx.env.FIRMS_MAP_KEY!;
    const area = ctx.bbox.map((v) => v.toFixed(3)).join(',');
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (FIRMS_DAYS - 1))).toISOString();
    const csv: Record<string, string> = {};
    for (const product of FIRMS_PRODUCTS) {
      const r = await fetchWithRetry(ctx.fetch, `${FIRMS_AREA_API}/${key}/${product}/${area}/${FIRMS_DAYS}`, { headers: { 'User-Agent': ctx.userAgent } });
      const text = await r.text();
      // FIRMS answers errors as plain text with status 200 (e.g. "Invalid MAP_KEY.").
      if (!r.ok || !text.startsWith('latitude,')) throw new Error(`FIRMS ${product} → HTTP ${r.status}: ${text.slice(0, 60).replaceAll(key, '[key]')}`);
      csv[product] = text;
    }
    return { since, csv };
  },
  parse: (raw) => parseFirms(raw as FirmsRaw),
};
