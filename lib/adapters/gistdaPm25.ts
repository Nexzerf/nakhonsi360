/**
 * GISTDA PM2.5 per district (ระบบติดตาม PM2.5 จากเทคโนโลยีดาวเทียม, pm25.gistda.or.th).
 *
 * Written against the real response saved in
 * data/samples/gistda.pm25/pm25_by_amphoe_80.json. Values are GISTDA's hourly
 * estimate for the whole district from satellite data and models — not a
 * ground monitor — and are shown that way. Each district is drawn at a point
 * inside it (from the imported district boundaries, by DOPA code).
 *
 * `dt` ends in "Z" but is Thai local time (see the sample README): the zone
 * suffix is dropped and +07:00 applied.
 */
import type { FetchContext, IngestAdapter, ParsedBatch, Rejection, StationRecord } from '@/lib/ingest/types';
import type { Observation } from '@/lib/types';
import { parseReading } from '@/lib/validation/observation';
import { cleanName } from '@/lib/import/text';
import { fetchWithRetry } from '@/lib/ingest/runner';
import { GISTDA_PROVINCE } from '@/lib/adapters/gistda';

export const GISTDA_PM25_URL = `https://pm25.gistda.or.th/rest/getPm25byAmphoe?pv_idn=${GISTDA_PROVINCE}`;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

export interface GistdaPm25Raw {
  response: unknown;
  /** pcode → point inside the district, from our admin boundaries. */
  points: Record<string, [number, number]>;
}

/** "2026-10-04T01:00:00.000Z" (really Thai time) → ISO UTC. */
export function pm25Time(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v) : null;
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseGistdaPm25(raw: GistdaPm25Raw, fetchedAt: string): ParsedBatch {
  const root = obj(raw.response);
  if (!Array.isArray(root.data)) throw new Error('unexpected GISTDA PM2.5 response: data is not a list');
  const stations: StationRecord[] = [];
  const observations: Observation[] = [];
  const rejections: Rejection[] = [];
  for (const item of root.data) {
    const r = obj(item);
    const code = typeof r.ap_idn === 'number' ? String(r.ap_idn) : null;
    const point = code ? raw.points[`TH${code}`] : undefined;
    if (!code || !point) {
      rejections.push({ reason: point ? 'missing_id' : 'unknown_district', ref: code ?? undefined });
      continue;
    }
    const observedAt = pm25Time(r.dt);
    if (!observedAt) {
      rejections.push({ reason: 'bad_timestamp', ref: code });
      continue;
    }
    const stationId = `amphoe-${code}`;
    const nameTh = cleanName(r.ap_tn);
    stations.push({
      stationId,
      nameTh: nameTh ? `อ.${nameTh}` : null,
      nameEn: cleanName(r.ap_en),
      lng: point[0],
      lat: point[1],
      adminText: nameTh ? `อ.${nameTh}` : null,
      properties: { agency_th: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (GISTDA)', agency_en: 'GISTDA', kind: 'district_estimate', district_code: code },
    });
    for (const [field, variable] of [['pm25', 'pm25'], ['pm25Avg24hr', 'pm25_24h']] as const) {
      const value = parseReading(r[field]);
      if (value === null) continue;
      observations.push({
        id: `gistda.pm25:${stationId}:${variable}:${observedAt}`,
        sourceId: 'gistda.pm25',
        stationId,
        geometry: { type: 'Point', coordinates: point },
        variable,
        value: Math.round(value * 10) / 10,
        unit: 'µg/m³',
        observedAt,
        fetchedAt,
        raw: { ap_idn: r.ap_idn, dt: r.dt, [field]: r[field] },
      });
    }
  }
  return { stations, observations, hazards: [], rejections };
}

export const gistdaPm25: IngestAdapter = {
  sourceId: 'gistda.pm25',
  async fetchRaw(ctx: FetchContext): Promise<GistdaPm25Raw> {
    const r = await fetchWithRetry(ctx.fetch, GISTDA_PM25_URL, { headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`GISTDA PM2.5 → HTTP ${r.status}`);
    return { response: await r.json(), points: Object.fromEntries(ctx.districtPoints) };
  },
  parse: (raw, fetchedAt) => parseGistdaPm25(raw as GistdaPm25Raw, fetchedAt),
};
