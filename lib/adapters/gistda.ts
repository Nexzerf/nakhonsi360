/**
 * GISTDA flood extent from satellite (API gateway, GeoJSON features).
 *
 * Written against a real response saved in data/samples/gistda.flood/.
 * Each feature is one H3 cell of water GISTDA detected in the last
 * GISTDA_FLOOD_WINDOW, with district/subdistrict names and GISTDA's own
 * estimates of affected population, buildings and crops. The request is
 * filtered to the province (pv_idn=80) and paged until complete. The key
 * goes in the API-Key header only.
 */
import type { FetchContext, HazardRecord, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const GISTDA_FEATURES = 'https://api-gateway.gistda.or.th/api/2.0/resources/features';
/** GISTDA's rolling window used for the map ("flood in the last 7 days"). */
export const GISTDA_FLOOD_WINDOW = '7days';
export const GISTDA_FLOOD_WINDOW_DAYS = 7;
/** Nakhon Si Thammarat in GISTDA's province codes (same as the DOPA code 80). */
export const GISTDA_PROVINCE = 80;
const PAGE = 1000;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export interface GistdaFloodRaw {
  since: string;
  pages: unknown[];
}

/** Scene names like "S1D_20260929_1812" → sensor and date, newest first (times kept as written: zone not stated). */
export function scenesOf(fileName: string | null): { sensor: string; date: string; time: string }[] {
  if (!fileName) return [];
  const out: { sensor: string; date: string; time: string }[] = [];
  for (const part of fileName.split(',')) {
    const m = /^\s*([A-Za-z0-9]+)_(\d{4})(\d{2})(\d{2})_(\d{4})\s*$/.exec(part);
    if (m) out.push({ sensor: m[1]!, date: `${m[2]}-${m[3]}-${m[4]}`, time: m[5]! });
  }
  return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function parseGistdaFlood(raw: GistdaFloodRaw): ParsedBatch {
  const hazards: HazardRecord[] = [];
  const rejections: Rejection[] = [];
  for (const page of raw.pages) {
    const root = obj(page);
    if (root.type !== 'FeatureCollection' || !Array.isArray(root.features)) throw new Error('GISTDA response is not a GeoJSON FeatureCollection');
    for (const f of root.features) {
      const feat = obj(f);
      const p = obj(feat.properties);
      const id = str(feat.id) ?? str(p._id);
      if (!id) {
        rejections.push({ reason: 'missing_id' });
        continue;
      }
      const g = obj(feat.geometry);
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
        rejections.push({ reason: 'not_polygon', ref: id });
        continue;
      }
      const created = str(p._createdAt);
      if (!created || Number.isNaN(new Date(created).getTime())) {
        rejections.push({ reason: 'bad_timestamp', ref: id });
        continue;
      }
      const scenes = scenesOf(str(p.file_name));
      hazards.push({
        featureKey: id,
        kind: 'flood',
        // When GISTDA published the detection; the satellite scenes it used are listed in properties.
        observedAt: new Date(created).toISOString(),
        geometry: g as never,
        properties: {
          window: GISTDA_FLOOD_WINDOW,
          district_th: str(p.ap_tn),
          subdistrict_th: str(p.tb_tn),
          tb_idn: num(p.tb_idn),
          flood_area_m2: num(p.f_area),
          population: num(p.population),
          building: num(p.building),
          school: num(p.school),
          hospital: num(p.hospital),
          road_m: num(p.length_road),
          rice_area: num(p.rice_area),
          latest_scene: scenes[0] ?? null,
          scene_count: scenes.length,
          h3: str(p.h3_address),
        },
      });
    }
  }
  return { stations: [], observations: [], hazards, rejections, hazardWindows: [{ kind: 'flood', since: raw.since }] };
}

export const gistdaFlood: IngestAdapter = {
  sourceId: 'gistda.flood',
  requiredEnv: ['GISTDA_API_KEY'],
  async fetchRaw(ctx: FetchContext): Promise<GistdaFloodRaw> {
    const headers = { 'API-Key': ctx.env.GISTDA_API_KEY!, Accept: 'application/geo+json, application/json', 'User-Agent': ctx.userAgent };
    const pages: unknown[] = [];
    for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
      const r = await fetchWithRetry(ctx.fetch, `${GISTDA_FEATURES}/flood/${GISTDA_FLOOD_WINDOW}?pv_idn=${GISTDA_PROVINCE}&limit=${PAGE}&offset=${offset}`, { headers });
      if (!r.ok) throw new Error(`GISTDA flood → HTTP ${r.status}`);
      const page = (await r.json()) as { features?: unknown[]; links?: unknown };
      delete page.links; // may carry the key
      pages.push(page);
      if (!Array.isArray(page.features) || page.features.length < PAGE) break;
    }
    const since = new Date(Date.now() - GISTDA_FLOOD_WINDOW_DAYS * 86_400_000).toISOString();
    return { since, pages };
  },
  parse: (raw) => parseGistdaFlood(raw as GistdaFloodRaw),
};
