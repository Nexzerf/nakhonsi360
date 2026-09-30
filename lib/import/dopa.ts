/**
 * Parse the DOPA village dataset ("ข้อมูลที่ตั้งและสภาพทั่วไปของหมู่บ้าน").
 *
 * Verified schema (2023 release, นครศรีธรรมราช): a JSON array with `mcode`
 * (8-digit village code), `mname`, `tname`/`tcode`, `aname`/`acode`,
 * `oct_side15_lat`/`oct_side15_lon` and ~65 survey fields. There is no
 * village-number (หมู่ที่) field. Other candidates are kept for other releases.
 * Records without an id or name are rejected. A record whose coordinate is
 * unusable is kept as an UnusableLocation with the reason; its position is
 * never guessed here (the importer may verify a correction, see import-villages).
 */
import { parseCoordValue, validateThaiPoint, type CoordRejection } from '@/lib/validation/geometry';
import { cleanName, fieldKey, thaiDigitsToAscii } from '@/lib/import/text';

export type VillageField = 'id' | 'nameTh' | 'nameEn' | 'moo' | 'lat' | 'lng' | 'subdistrict' | 'subdistrictCode' | 'district';

export const VILLAGE_FIELD_CANDIDATES: Record<VillageField, string[]> = {
  id: ['mcode', 'village_code', 'vill_code', 'villagecode', 'vil_code', 'vcode', 'mb_code', 'รหัสหมู่บ้าน', 'รหัส', 'code', 'id'],
  nameTh: ['mname', 'village_name_th', 'village_name', 'vill_name', 'villagename', 'vil_name', 'mb_name', 'ชื่อหมู่บ้าน', 'หมู่บ้าน', 'name_th', 'name'],
  nameEn: ['village_name_en', 'vill_name_e', 'name_en', 'eng_name', 'name_eng'],
  moo: ['moo', 'village_no', 'vill_no', 'moo_no', 'mu', 'หมู่ที่', 'หมู่'],
  lat: ['oct_side15_lat', 'latitude', 'lat', 'ละติจูด', 'lat_dd', 'gps_lat', 'y_coord', 'y'],
  lng: ['oct_side15_lon', 'longitude', 'lon', 'long', 'lng', 'ลองจิจูด', 'lon_dd', 'gps_long', 'gps_lon', 'x_coord', 'x'],
  subdistrictCode: ['tcode', 'tambon_code', 'tam_code', 'subdistrict_code', 'รหัสตำบล'],
  subdistrict: ['tname', 'tambon_name', 'tambon', 'subdistrict', 'tam_name', 'ตำบล', 'ชื่อตำบล'],
  district: ['aname', 'amphoe_name', 'amphoe', 'district', 'amp_name', 'อำเภอ', 'ชื่ออำเภอ'],
};

export type VillageFieldMap = Partial<Record<VillageField, string>>;

export function detectVillageFields(keys: string[], overrides: VillageFieldMap = {}): VillageFieldMap {
  const byKey = new Map(keys.map((k) => [fieldKey(k), k]));
  const out: VillageFieldMap = {};
  for (const field of Object.keys(VILLAGE_FIELD_CANDIDATES) as VillageField[]) {
    if (overrides[field]) {
      out[field] = overrides[field];
      continue;
    }
    for (const c of VILLAGE_FIELD_CANDIDATES[field]) {
      const hit = byKey.get(fieldKey(c));
      if (hit) {
        out[field] = hit;
        break;
      }
    }
  }
  return out;
}

export interface RawVillage {
  /** Position in the source file, for rejection reports. */
  index: number;
  properties: Record<string, unknown>;
  /** From a GeoJSON Point geometry, when present. */
  point: [number, number] | null;
}

/** Accept a JSON array, { data | records | result | features: [...] }, or a GeoJSON FeatureCollection. */
export function extractRecords(json: unknown): RawVillage[] {
  let list: unknown[] | null = null;
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const k of ['features', 'data', 'records', 'result', 'items']) {
      const v = o[k];
      if (Array.isArray(v)) {
        list = v;
        break;
      }
      // CKAN datastore style: { result: { records: [...] } }
      if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).records)) {
        list = (v as Record<string, unknown>).records as unknown[];
        break;
      }
    }
  }
  if (!list) throw new Error('Could not find a list of records in the JSON file (expected an array, a GeoJSON FeatureCollection, or {data|records|result|features: [...]})');

  return list.map((item, index) => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (o.type === 'Feature') {
      const g = o.geometry as { type?: string; coordinates?: unknown } | null;
      const c = g?.type === 'Point' && Array.isArray(g.coordinates) ? g.coordinates : null;
      const point = c && typeof c[0] === 'number' && typeof c[1] === 'number' ? ([c[0], c[1]] as [number, number]) : null;
      return { index, properties: (o.properties as Record<string, unknown>) ?? {}, point };
    }
    return { index, properties: o, point: null };
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas/newlines, BOM). */
export function parseCsv(text: string): RawVillage[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  return body.map((r, index) => ({
    index,
    properties: Object.fromEntries(header.map((h, j) => [h.trim(), r[j] ?? ''])),
    point: null,
  }));
}

/** Records that cannot be kept at all. Coordinate problems do not reject a village (see UnusableLocation). */
export type VillageRejection = 'missing_id' | 'missing_name' | 'duplicate_id';

export interface ParsedVillage {
  id: string;
  nameTh: string;
  nameEn: string | null;
  moo: number | null;
  lng: number;
  lat: number;
  adminText: string | null;
  /** Subdistrict / district names as stated by the source for this village. */
  subdistrictText: string | null;
  /** The source's own subdistrict code (DOPA `tcode`, e.g. 80040900), as published. */
  subdistrictCode: string | null;
  districtText: string | null;
  properties: Record<string, unknown>;
}

/**
 * A village whose published coordinate is not a usable point in Thailand.
 * The village itself is real and is kept; `latValue`/`lonValue` are the
 * numbers found in the source's lat/lon fields, unmodified (null if not a number).
 */
export interface UnusableLocation extends Omit<ParsedVillage, 'lng' | 'lat'> {
  reason: CoordRejection;
  latValue: number | null;
  lonValue: number | null;
}

export function parseMoo(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1000) return v;
  if (typeof v !== 'string') return null;
  const m = /(\d{1,3})/.exec(thaiDigitsToAscii(v));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export function parseVillages(
  records: RawVillage[],
  map: VillageFieldMap,
): { villages: ParsedVillage[]; unusable: UnusableLocation[]; rejections: Array<{ index: number; reason: VillageRejection; id?: string }> } {
  const villages: ParsedVillage[] = [];
  const unusable: UnusableLocation[] = [];
  const rejections: Array<{ index: number; reason: VillageRejection; id?: string }> = [];
  const seen = new Set<string>();

  for (const r of records) {
    const p = r.properties;
    const idRaw = map.id ? p[map.id] : undefined;
    const id = idRaw === undefined || idRaw === null ? null : thaiDigitsToAscii(String(idRaw)).trim() || null;
    if (!id) {
      rejections.push({ index: r.index, reason: 'missing_id' });
      continue;
    }
    const nameTh = map.nameTh ? cleanName(p[map.nameTh]) : null;
    if (!nameTh) {
      rejections.push({ index: r.index, reason: 'missing_name', id });
      continue;
    }
    if (seen.has(id)) {
      rejections.push({ index: r.index, reason: 'duplicate_id', id });
      continue;
    }
    seen.add(id);
    const subdistrictText = map.subdistrict ? cleanName(p[map.subdistrict]) : null;
    const districtText = map.district ? cleanName(p[map.district]) : null;
    const codeRaw = map.subdistrictCode ? p[map.subdistrictCode] : undefined;
    const subdistrictCode = codeRaw === undefined || codeRaw === null ? null : thaiDigitsToAscii(String(codeRaw)).trim() || null;
    const adminText = [subdistrictText, districtText].filter(Boolean).join(' / ');
    const base = {
      id,
      nameTh,
      nameEn: map.nameEn ? cleanName(p[map.nameEn]) : null,
      moo: map.moo ? parseMoo(p[map.moo]) : null,
      adminText: adminText || null,
      subdistrictText,
      subdistrictCode,
      districtText,
      properties: p,
    };
    const lng = r.point ? r.point[0] : parseCoordValue(map.lng ? p[map.lng] : undefined);
    const lat = r.point ? r.point[1] : parseCoordValue(map.lat ? p[map.lat] : undefined);
    const check = validateThaiPoint(lng, lat);
    if (!check.ok) {
      unusable.push({ ...base, reason: check.reason, latValue: lat, lonValue: lng });
      continue;
    }
    villages.push({ ...base, lng: lng!, lat: lat! });
  }
  return { villages, unusable, rejections };
}
