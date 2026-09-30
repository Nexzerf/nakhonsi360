/**
 * ThaiWater (สถาบันสารสนเทศทรัพยากรน้ำ, สสน.) public API adapters.
 *
 * Written against real responses saved on 2026-09-29 in
 * data/samples/thaiwater.waterlevel/waterlevel_load.json and
 * data/samples/thaiwater.rain24h/rain_24h.json.
 *
 * Timestamps ("2026-09-30 04:00") carry no timezone. They are Thai local time
 * (+07:00): responses fetched at 21:17 UTC contained readings stamped 04:00,
 * which would be 7 hours in the future if read as UTC. Recorded in
 * DATA_SOURCES.md as inferred-from-data; confirm with HII documentation.
 *
 * ThaiWater aggregates stations from several agencies (สสน., ชป., ทน., ปภ., …);
 * each station keeps its agency so the UI credits it.
 */
import type { FetchContext, IngestAdapter, ParsedBatch, Rejection, StationRecord } from '@/lib/ingest/types';
import type { Observation } from '@/lib/types';
import { parseObservedAt, parseReading } from '@/lib/validation/observation';
import { parseCoordValue } from '@/lib/validation/geometry';
import { cleanName } from '@/lib/import/text';
import { fetchWithRetry } from '@/lib/ingest/runner';

export const THAIWATER_BASE = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';
export const THAIWATER_TZ = '+07:00';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);

async function getJson(ctx: FetchContext, path: string): Promise<unknown> {
  const r = await fetchWithRetry(ctx.fetch, `${THAIWATER_BASE}/${path}`, {
    headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`ThaiWater ${path} → HTTP ${r.status}`);
  return r.json();
}

/** Station fields shared by the water-level and rain responses. */
function stationOf(rec: Json): StationRecord | null {
  const st = obj(rec.station);
  const id = str(st.id);
  const lat = parseCoordValue(st.tele_station_lat);
  const lng = parseCoordValue(st.tele_station_long);
  if (!id || lat === null || lng === null) return null;
  const name = obj(st.tele_station_name);
  const geo = obj(rec.geocode);
  const agency = obj(rec.agency);
  const basin = obj(rec.basin);
  const th = (o: unknown) => cleanName(obj(o).th);
  const adminText = [th(geo.tumbon_name) && `ต.${th(geo.tumbon_name)}`, th(geo.amphoe_name) && `อ.${th(geo.amphoe_name)}`, th(geo.province_name) && `จ.${th(geo.province_name)}`]
    .filter(Boolean)
    .join(' ');
  return {
    stationId: id,
    nameTh: cleanName(name.th),
    nameEn: cleanName(name.en),
    lng,
    lat,
    adminText: adminText || null,
    riverName: cleanName(rec.river_name),
    basinCode: str(basin.basin_code),
    properties: {
      agency_th: cleanName(obj(agency.agency_name).th),
      agency_en: cleanName(obj(agency.agency_name).en),
      agency_short_th: cleanName(obj(agency.agency_shortname).th),
      agency_short_en: cleanName(obj(agency.agency_shortname).en),
      station_code: str(st.tele_station_oldcode),
      station_type: str(st.tele_station_type),
      basin_name_th: th(basin.basin_name),
      sub_basin_id: str(st.sub_basin_id),
      province_code: str(geo.province_code),
    },
  };
}

function collect(list: unknown[], sourceId: string, toObs: (rec: Json, station: StationRecord, observedAt: string, rej: Rejection[]) => Observation[]): ParsedBatch {
  const stations = new Map<string, StationRecord>();
  const observations: Observation[] = [];
  const rejections: Rejection[] = [];
  for (const item of list) {
    const rec = obj(item);
    const station = stationOf(rec);
    if (!station) {
      rejections.push({ reason: 'missing_station', ref: str(rec.id) ?? undefined });
      continue;
    }
    stations.set(station.stationId, station);
    const timeField = sourceId === 'thaiwater.rain24h' ? rec.rainfall_datetime : rec.waterlevel_datetime;
    const t = parseObservedAt(timeField, THAIWATER_TZ);
    if (!t.ok) {
      rejections.push({ reason: t.reason, ref: station.stationId });
      continue;
    }
    observations.push(...toObs(rec, station, t.date.toISOString(), rejections));
  }
  return { stations: [...stations.values()], observations, hazards: [], rejections };
}

// ---------------------------------------------------------------- water level

/** Official scale published in the same response: level N ↔ situation text + colour. */
export function waterlevelScale(root: Json): Map<number, { situation: string; color: string }> {
  const list = obj(obj(root.scale).data).scale;
  const out = new Map<number, { situation: string; color: string }>();
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    const o = obj(e);
    const m = /waterlevel_level_(\d+)$/.exec(str(o.trans) ?? '');
    const situation = cleanName(o.situation);
    const color = str(o.color);
    if (m && situation && color) out.set(Number(m[1]), { situation, color });
  }
  return out;
}

/** "ต่ำกว่าตลิ่ง (ม.)" + "1.58" → "ต่ำกว่าตลิ่ง 1.58 ม." (source wording, value inserted). */
export function bankDetail(text: unknown, diff: unknown): string | undefined {
  const t = cleanName(text);
  const d = parseReading(diff);
  if (!t || d === null) return undefined;
  return t.includes('(ม.)') ? t.replace('(ม.)', `${diff} ม.`).replace(/\s+/g, ' ') : `${t} ${diff}`;
}

export const thaiwaterWaterlevel: IngestAdapter = {
  sourceId: 'thaiwater.waterlevel',
  fetchRaw: (ctx) => getJson(ctx, 'waterlevel_load'),
  parse(raw, fetchedAt) {
    const root = obj(raw);
    const list = obj(root.waterlevel_data).data;
    if (!Array.isArray(list)) throw new Error('unexpected ThaiWater response: waterlevel_data.data is not a list');
    const scale = waterlevelScale(root);
    // waterlevel_manual_data (manual gauges) is not ingested: its records carry
    // no water level for this province in the verified sample.
    return collect(list, 'thaiwater.waterlevel', (rec, station, observedAt, rej) => {
      const level = typeof rec.situation_level === 'number' && Number.isInteger(rec.situation_level) ? rec.situation_level : undefined;
      const official = level !== undefined ? scale.get(level) : undefined;
      const common = {
        sourceId: 'thaiwater.waterlevel',
        stationId: station.stationId,
        geometry: { type: 'Point' as const, coordinates: [station.lng, station.lat] },
        observedAt,
        fetchedAt,
        officialStatus: official?.situation,
        officialLevel: level,
        officialColor: official?.color,
        officialDetail: bankDetail(rec.diff_wl_bank_text, rec.diff_wl_bank),
        raw: {
          id: rec.id,
          waterlevel_datetime: rec.waterlevel_datetime,
          waterlevel_msl: rec.waterlevel_msl,
          storage_percent: rec.storage_percent,
          situation_level: rec.situation_level,
          diff_wl_bank: rec.diff_wl_bank,
          diff_wl_bank_text: rec.diff_wl_bank_text,
        },
      };
      const out: Observation[] = [];
      const msl = parseReading(rec.waterlevel_msl);
      if (msl === null) rej.push({ reason: 'missing_value', ref: `${station.stationId}/water_level` });
      else out.push({ ...common, id: `thaiwater.waterlevel:${station.stationId}:water_level:${observedAt}`, variable: 'water_level', value: msl, unit: 'm MSL' });
      const pct = parseReading(rec.storage_percent);
      if (pct !== null) out.push({ ...common, id: `thaiwater.waterlevel:${station.stationId}:bank:${observedAt}`, variable: 'water_level_bank_pct', value: pct, unit: '%' });
      return out;
    });
  },
};

// ---------------------------------------------------------------- rain 24 h

export const thaiwaterRain24h: IngestAdapter = {
  sourceId: 'thaiwater.rain24h',
  fetchRaw: (ctx) => getJson(ctx, 'rain_24h'),
  parse(raw, fetchedAt) {
    const list = obj(raw).data;
    if (!Array.isArray(list)) throw new Error('unexpected ThaiWater response: data is not a list');
    return collect(list, 'thaiwater.rain24h', (rec, station, observedAt, rej) => {
      const v = parseReading(rec.rain_24h);
      if (v === null) {
        rej.push({ reason: 'missing_value', ref: `${station.stationId}/rain_24h` });
        return [];
      }
      return [
        {
          id: `thaiwater.rain24h:${station.stationId}:${observedAt}`,
          sourceId: 'thaiwater.rain24h',
          stationId: station.stationId,
          geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
          variable: 'rain_24h',
          value: v,
          unit: 'mm',
          observedAt,
          fetchedAt,
          raw: { id: rec.id, rain_24h: rec.rain_24h, rainfall_datetime: rec.rainfall_datetime },
        },
      ];
    });
  },
};
