/**
 * Thai Meteorological Department (กรมอุตุนิยมวิทยา) open data API.
 *
 * Written against real responses saved on 2026-10-03 in
 * data/samples/tmd.weather/weather3hours_v2.json and
 * data/samples/tmd.warnings/warning_news_v2.json.
 *
 * Credentials: TMD_UID / TMD_UKEY (free registration at data.tmd.go.th).
 * Without them the adapters use the demonstration account TMD publishes in
 * its API documentation (uid=api, ukey=api12345), which returns the same
 * current data; register your own for a dependable quota.
 *
 * Times carry no zone and are Thai local time (+07:00): a response built at
 * "2026-10-03 22:27:34" (LastBuildDate) was fetched at 15:32 UTC, and its
 * latest observations are stamped 22:00. Weather3Hours writes dates as
 * MM/DD/YYYY ("10/03/2026 22:00:00" on 3 October); a reading more than two
 * days away from the fetch time is rejected rather than guessed at.
 *
 * Units are those TMD states in the XML form of the same service:
 * AirTemperature celsius, RelativeHumidity %, WindSpeed km/h, WindDirection
 * degree, Rainfall24Hr mm. Values are stored as published.
 */
import { createHash } from 'node:crypto';
import type { FetchContext, HazardRecord, IngestAdapter, ParsedBatch, Rejection, StationRecord } from '@/lib/ingest/types';
import type { Observation } from '@/lib/types';
import { parseReading } from '@/lib/validation/observation';
import { cleanName } from '@/lib/import/text';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const TMD_BASE = 'https://data.tmd.go.th/api';
export const TMD_TZ = '+07:00';
const DEMO = { uid: 'api', ukey: 'api12345' };
const MAX_SKEW_MS = 2 * 86_400_000;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
/** TMD sometimes sends a field as [thai, english]; take the English one when asked for English. */
const text = (v: unknown, lang: 'th' | 'en' = 'th'): string | null => (Array.isArray(v) ? str(v[lang === 'en' ? v.length - 1 : 0]) : str(v));

export function tmdUrl(service: string, env: Record<string, string | undefined>): string {
  const uid = env.TMD_UID || DEMO.uid;
  const ukey = env.TMD_UKEY || DEMO.ukey;
  return `${TMD_BASE}/${service}/?uid=${encodeURIComponent(uid)}&ukey=${encodeURIComponent(ukey)}&format=json`;
}

async function getJson(ctx: FetchContext, service: string): Promise<unknown> {
  const r = await fetchWithRetry(ctx.fetch, tmdUrl(service, ctx.env), { headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json' } });
  // Never echo the URL: it carries the account key.
  if (!r.ok) throw new Error(`TMD ${service} → HTTP ${r.status}`);
  return r.json();
}

/** "10/03/2026 22:00:00" (MM/DD/YYYY, Thai time) or "2026-10-03 16:00:13" → ISO, or null. */
export function tmdTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let iso: string | null = null;
  let m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) iso = `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${TMD_TZ}`;
  m = m ? null : /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(s);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${TMD_TZ}`;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------- observations

const VARIABLES: { field: string; variable: string; unit: string }[] = [
  { field: 'AirTemperature', variable: 'temperature', unit: '°C' },
  { field: 'RelativeHumidity', variable: 'humidity', unit: '%' },
  { field: 'WindSpeed', variable: 'wind_speed', unit: 'km/h' },
  { field: 'WindDirection', variable: 'wind_dir', unit: '°' },
  { field: 'Rainfall24Hr', variable: 'rain_24h', unit: 'mm' },
  { field: 'LandVisibility', variable: 'visibility', unit: 'km' },
  { field: 'MeanSeaLevelPressure', variable: 'pressure_msl', unit: 'hPa' },
];

export function parseTmdWeather(raw: unknown, fetchedAt: string): ParsedBatch {
  const stations: StationRecord[] = [];
  const observations: Observation[] = [];
  const rejections: Rejection[] = [];
  const items = list(obj(obj(raw).Stations).Station);
  if (!items.length) throw new Error('unexpected TMD Weather3Hours response: no Stations.Station');
  for (const item of items) {
    const st = obj(item);
    const id = str(st.WmoStationNumber);
    const lat = parseReading(st.Latitude);
    const lng = parseReading(st.Longitude);
    if (!id || lat === null || lng === null) {
      rejections.push({ reason: 'missing_station', ref: id ?? undefined });
      continue;
    }
    const station: StationRecord = {
      stationId: id,
      nameTh: cleanName(st.StationNameThai),
      nameEn: cleanName(st.StationNameEnglish),
      lng,
      lat,
      adminText: cleanName(st.Province) ? `จ.${cleanName(st.Province)}` : null,
      properties: { agency_th: 'กรมอุตุนิยมวิทยา', agency_en: 'Thai Meteorological Department', wmo_station: id },
    };
    const o = obj(st.Observation);
    const observedAt = tmdTime(o.DateTime);
    if (!observedAt) {
      rejections.push({ reason: 'bad_timestamp', ref: id });
      continue;
    }
    if (Math.abs(new Date(observedAt).getTime() - new Date(fetchedAt).getTime()) > MAX_SKEW_MS) {
      rejections.push({ reason: 'stale_or_misdated', ref: id });
      continue;
    }
    stations.push(station);
    for (const v of VARIABLES) {
      const value = parseReading(o[v.field]);
      if (value === null) continue;
      // WMO code 990 = direction variable (light winds), not an angle.
      if (v.variable === 'wind_dir' && value === 990) continue;
      observations.push({
        id: `tmd.weather:${id}:${v.variable}:${observedAt}`,
        sourceId: 'tmd.weather',
        stationId: id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        variable: v.variable,
        value,
        unit: v.unit,
        observedAt,
        fetchedAt,
        raw: { DateTime: o.DateTime, [v.field]: o[v.field] },
      });
    }
  }
  return { stations, observations, hazards: [], rejections };
}

export const tmdWeather: IngestAdapter = {
  sourceId: 'tmd.weather',
  fetchRaw: (ctx) => getJson(ctx, 'Weather3Hours/V2'),
  parse: parseTmdWeather,
};

// ---------------------------------------------------------------- warnings

/** Thailand's extent: TMD announcements are national; the text names the regions affected. */
export const THAILAND_EXTENT: GeoJSONPolygon = {
  type: 'Polygon',
  coordinates: [[[97.3, 5.6], [105.7, 5.6], [105.7, 20.5], [97.3, 20.5], [97.3, 5.6]]],
};
interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export function parseTmdWarnings(raw: unknown): ParsedBatch {
  const root = obj(raw);
  const hazards: HazardRecord[] = [];
  const rejections: Rejection[] = [];
  for (const item of [...list(root.Warning), ...list(obj(root.Warnings).Warning)]) {
    const w = obj(item);
    const titleTh = text(w.TitleThai);
    const announced = tmdTime(w.AnnounceDate);
    if (!titleTh || !announced) {
      rejections.push({ reason: 'missing_title_or_time', ref: str(w.IssueNo) ?? undefined });
      continue;
    }
    const key = createHash('sha256').update(`${str(w.AnnounceDate)}|${str(w.IssueNo)}|${titleTh}`).digest('hex').slice(0, 24);
    if (hazards.some((h) => h.featureKey === key)) continue;
    hazards.push({
      featureKey: key,
      kind: 'warning',
      observedAt: announced,
      validUntil: tmdTime(w.EffectEndDate),
      geometry: THAILAND_EXTENT,
      properties: {
        issue_no: str(w.IssueNo),
        title_th: titleTh,
        title_en: text(w.TitleEnglish, 'en'),
        headline_th: text(w.HeadlineThai),
        headline_en: text(w.HeadlineEnglish, 'en'),
        effect_start: tmdTime(w.EffectStartDate),
        effect_end: tmdTime(w.EffectEndDate),
        url_th: text(w.WebUrlThai),
        url_en: text(w.WebUrlEnglish, 'en'),
        contact_th: text(w.ContactThai),
        scope: 'national',
      },
    });
  }
  return { stations: [], observations: [], hazards, rejections };
}

export const tmdWarnings: IngestAdapter = {
  sourceId: 'tmd.warnings',
  // National announcements: kept whatever their area (the text says which regions).
  hazardArea: 'query',
  fetchRaw: (ctx) => getJson(ctx, 'WeatherWarningNews/v2'),
  parse: (raw) => parseTmdWarnings(raw),
};
