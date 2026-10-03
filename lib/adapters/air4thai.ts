/**
 * Air4Thai (กรมควบคุมมลพิษ, Pollution Control Department) station air quality.
 *
 * Written against the real response saved in
 * data/samples/air4thai.aqi/near_stations.json. The server's certificate
 * chain is incomplete; lib/net/aia.ts completes it from the certificate's own
 * AIA links and verifies normally.
 *
 * Times ("2026-10-03" + "21:00") are Thai local time. "-1" means not measured.
 * `color_id` is PCD's own AQI level; the wording and colours below are PCD's
 * Thai AQI scale as shown on Air4Thai — the level comes from the source,
 * never from our own thresholds.
 */
import type { FetchContext, IngestAdapter, ParsedBatch, Rejection, StationRecord } from '@/lib/ingest/types';
import type { Observation } from '@/lib/types';
import { parseReading } from '@/lib/validation/observation';
import { cleanName } from '@/lib/import/text';
import { getTextWithAia } from '@/lib/net/aia';

export const AIR4THAI_URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';

/** PCD Thai AQI levels as Air4Thai labels and colours them (level = the response's color_id). */
export const PCD_AQI_LEVELS: Record<number, { th: string; en: string; color: string }> = {
  1: { th: 'คุณภาพอากาศดีมาก', en: 'Very good', color: '#3BCCFF' },
  2: { th: 'คุณภาพอากาศดี', en: 'Good', color: '#92D050' },
  3: { th: 'ปานกลาง', en: 'Moderate', color: '#FFFF00' },
  4: { th: 'เริ่มมีผลกระทบต่อสุขภาพ', en: 'Starting to affect health', color: '#FFA200' },
  5: { th: 'มีผลกระทบต่อสุขภาพ', en: 'Affecting health', color: '#F04646' },
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function air4thaiTime(date: unknown, time: unknown): string | null {
  const d = str(date);
  const t = str(time);
  if (!d || !t || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const iso = new Date(`${d}T${t.padStart(5, '0')}:00+07:00`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

/** A measured value: "-1" and other negatives mean "not measured". */
const measured = (v: unknown): number | null => {
  const n = parseReading(v);
  return n === null || n < 0 ? null : n;
};

export function parseAir4thai(raw: unknown, fetchedAt: string): ParsedBatch {
  const list = Array.isArray(raw) ? raw : obj(raw).stations;
  if (!Array.isArray(list)) throw new Error('unexpected Air4Thai response: no stations list');
  const stations: StationRecord[] = [];
  const observations: Observation[] = [];
  const rejections: Rejection[] = [];
  for (const item of list) {
    const st = obj(item);
    const id = str(st.stationID);
    const lat = parseReading(st.lat);
    const lng = parseReading(st.long);
    if (!id || lat === null || lng === null) {
      rejections.push({ reason: 'missing_station', ref: id ?? undefined });
      continue;
    }
    const last = obj(st.AQILast);
    const observedAt = air4thaiTime(last.date, last.time);
    if (!observedAt) {
      rejections.push({ reason: 'bad_timestamp', ref: id });
      continue;
    }
    stations.push({
      stationId: id,
      nameTh: cleanName(st.nameTH),
      nameEn: cleanName(st.nameEN),
      lng,
      lat,
      adminText: cleanName(st.areaTH),
      properties: { agency_th: 'กรมควบคุมมลพิษ', agency_en: 'Pollution Control Department', station_type: str(st.stationType), area_en: cleanName(st.areaEN) },
    });
    const level = (o: Json) => {
      const n = Number(o.color_id);
      return Number.isInteger(n) && PCD_AQI_LEVELS[n] ? n : undefined;
    };
    const push = (variable: string, value: number | null, unit: string, lvl: number | undefined, raw: unknown) => {
      if (value === null) return;
      observations.push({
        id: `air4thai.aqi:${id}:${variable}:${observedAt}`,
        sourceId: 'air4thai.aqi',
        stationId: id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        variable,
        value,
        unit,
        observedAt,
        fetchedAt,
        ...(lvl ? { officialLevel: lvl, officialStatus: PCD_AQI_LEVELS[lvl]!.th, officialColor: PCD_AQI_LEVELS[lvl]!.color } : {}),
        raw,
      });
    };
    const pm25 = obj(last.PM25);
    const pm10 = obj(last.PM10);
    const aqi = obj(last.AQI);
    push('pm25', measured(pm25.value), 'µg/m³', level(pm25), { PM25: last.PM25, date: last.date, time: last.time });
    push('pm10', measured(pm10.value), 'µg/m³', level(pm10), { PM10: last.PM10, date: last.date, time: last.time });
    push('aqi', measured(aqi.aqi), 'AQI', level(aqi), { AQI: last.AQI, date: last.date, time: last.time });
  }
  return { stations, observations, hazards: [], rejections };
}

export const air4thaiAqi: IngestAdapter = {
  sourceId: 'air4thai.aqi',
  async fetchRaw(ctx: FetchContext) {
    const r = await getTextWithAia(AIR4THAI_URL, { 'User-Agent': ctx.userAgent, Accept: 'application/json' });
    if (r.status !== 200) throw new Error(`Air4Thai → HTTP ${r.status}`);
    return JSON.parse(r.text) as unknown;
  },
  parse: parseAir4thai,
};
