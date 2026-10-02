/**
 * USGS earthquake catalog (ComCat) through the FDSN event web service.
 *
 * Written against a real response saved in
 * data/samples/usgs.earthquakes/query.geojson.
 *
 * Earthquakes are a regional hazard: events that matter here are almost all
 * outside the province (Andaman–Sumatra, Myanmar, the Gulf). The request is
 * a circle around the centre of the province extent, so these features are
 * stored as the source returns them instead of being clipped to the
 * province + 5 km. Times are epoch milliseconds (UTC), so no timezone is
 * inferred. Magnitude, place and status are USGS's own; nothing is derived.
 *
 * Each response is complete for its time window (minus events USGS deleted
 * or merged under another id), so earlier rows in that window that are no
 * longer returned are removed (see ParsedBatch.hazardWindows).
 */
import type { FetchContext, HazardRecord, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const USGS_FDSN_QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
/** Search radius around the centre of the province extent. */
export const USGS_RADIUS_KM = 2000;
/** USGS lists smaller events in this region only sometimes; below M4 TMD is the source. */
export const USGS_MIN_MAGNITUDE = 4;
export const USGS_WINDOW_DAYS = 30;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** The FDSN query for the province extent's centre (rounded to 0.01°) and the last USGS_WINDOW_DAYS days. */
export function usgsQueryUrl(bbox: [number, number, number, number], now = new Date()): string {
  const round = (v: number) => Math.round(v * 100) / 100;
  const start = new Date(now.getTime() - USGS_WINDOW_DAYS * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const q = new URLSearchParams({
    format: 'geojson',
    eventtype: 'earthquake',
    starttime: start.toISOString().slice(0, 19),
    latitude: String(round((bbox[1] + bbox[3]) / 2)),
    longitude: String(round((bbox[0] + bbox[2]) / 2)),
    maxradiuskm: String(USGS_RADIUS_KM),
    minmagnitude: String(USGS_MIN_MAGNITUDE),
    orderby: 'time',
  });
  return `${USGS_FDSN_QUERY}?${q}`;
}

/** Query parameters as echoed by USGS in metadata.url (what was actually asked for). */
export function queryOf(raw: unknown): URLSearchParams | null {
  const url = str(obj(obj(raw).metadata).url);
  if (!url) return null;
  try {
    return new URL(url).searchParams;
  } catch {
    return null;
  }
}

/** FDSN times without a zone are UTC. */
function utc(v: string | null): string | null {
  if (!v) return null;
  const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function parseUsgs(raw: unknown): ParsedBatch {
  const rejections: Rejection[] = [];
  const hazards: HazardRecord[] = [];
  const root = obj(raw);
  if (root.type !== 'FeatureCollection' || !Array.isArray(root.features)) {
    throw new Error('USGS response is not a GeoJSON FeatureCollection');
  }

  for (const f of root.features) {
    const feat = obj(f);
    const p = obj(feat.properties);
    const id = str(feat.id);
    if (!id) {
      rejections.push({ reason: 'missing_id' });
      continue;
    }
    if (p.type !== 'earthquake') {
      rejections.push({ reason: 'not_earthquake', ref: id });
      continue;
    }
    const g = obj(feat.geometry);
    const c = Array.isArray(g.coordinates) ? g.coordinates : [];
    const lng = num(c[0]);
    const lat = num(c[1]);
    if (g.type !== 'Point' || lng === null || lat === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      rejections.push({ reason: 'bad_coordinates', ref: id });
      continue;
    }
    const mag = num(p.mag);
    if (mag === null) {
      rejections.push({ reason: 'no_magnitude', ref: id });
      continue;
    }
    const time = num(p.time);
    if (time === null) {
      rejections.push({ reason: 'bad_timestamp', ref: id });
      continue;
    }
    const updated = num(p.updated);
    hazards.push({
      featureKey: id,
      kind: 'earthquake',
      observedAt: new Date(time).toISOString(),
      // Depth goes in properties: the geometry column is 2-D.
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        mag,
        mag_type: str(p.magType),
        place: str(p.place),
        title: str(p.title),
        depth_km: num(c[2]),
        status: str(p.status),
        net: str(p.net),
        url: str(p.url),
        updated: updated === null ? null : new Date(updated).toISOString(),
        felt: num(p.felt),
        mmi: num(p.mmi),
        alert: str(p.alert),
      },
    });
  }

  // The response lists every earthquake since the requested start time.
  const since = utc(queryOf(raw)?.get('starttime') ?? null);
  return {
    stations: [],
    observations: [],
    hazards,
    rejections,
    hazardWindows: since ? [{ kind: 'earthquake', since }] : [],
  };
}

export const usgsEarthquakes: IngestAdapter = {
  sourceId: 'usgs.earthquakes',
  hazardArea: 'query',
  async fetchRaw(ctx: FetchContext) {
    const url = usgsQueryUrl(ctx.bbox);
    const r = await fetchWithRetry(ctx.fetch, url, { headers: { 'User-Agent': ctx.userAgent, Accept: 'application/geo+json, application/json' } });
    if (!r.ok) throw new Error(`USGS FDSN query → HTTP ${r.status}`);
    return r.json();
  },
  parse: (raw) => parseUsgs(raw),
};
