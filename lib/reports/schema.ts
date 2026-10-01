/**
 * Citizen hazard reports: the fields people can send and their validation.
 *
 * Reports are what a member of the public says, not official data. They are
 * shown as "รายงานจากประชาชน ยังไม่ยืนยัน" until a responder updates them, and
 * never mixed with agency data. The contact name and phone are kept private:
 * only responders signed in to /admin/reports can see them.
 */
import type { IconId } from '@/lib/registry/layers';

export const HAZARDS = [
  { id: 'flood', icon: 'flood', th: 'น้ำท่วม', en: 'Flood' },
  { id: 'flash_flood', icon: 'river', th: 'น้ำป่าไหลหลาก', en: 'Flash flood' },
  { id: 'landslide', icon: 'landslide', th: 'ดินถล่ม', en: 'Landslide' },
  { id: 'storm', icon: 'wind', th: 'พายุ / ลมแรง', en: 'Storm / strong wind' },
  { id: 'fire', icon: 'fire', th: 'ไฟไหม้ / ไฟป่า', en: 'Fire / wildfire' },
  { id: 'coastal', icon: 'erosion', th: 'คลื่นซัด / กัดเซาะชายฝั่ง', en: 'Storm surge / coastal erosion' },
  { id: 'drought', icon: 'drought', th: 'ภัยแล้ง / ขาดน้ำ', en: 'Drought / no water' },
  { id: 'earthquake', icon: 'earthquake', th: 'แผ่นดินไหว', en: 'Earthquake' },
  { id: 'smoke', icon: 'air', th: 'หมอกควัน / ฝุ่น', en: 'Smoke / haze' },
  { id: 'blocked_road', icon: 'road', th: 'ถนนขาด / ต้นไม้ล้ม', en: 'Road cut / fallen tree' },
  { id: 'other', icon: 'warning', th: 'อื่น ๆ', en: 'Other' },
] as const satisfies readonly { id: string; icon: IconId; th: string; en: string }[];

export type HazardId = (typeof HAZARDS)[number]['id'];

/** Hazards for which a water depth makes sense. */
export const WATER_HAZARDS: readonly HazardId[] = ['flood', 'flash_flood', 'coastal'];

/** How urgent, as the reporter judges it (not an official severity). */
export const URGENCIES = [
  { id: 'life', th: 'อันตรายถึงชีวิต / ติดอยู่', en: 'Life at risk / trapped', color: '#dc2626' },
  { id: 'help', th: 'ต้องการความช่วยเหลือ', en: 'Need help', color: '#ea580c' },
  { id: 'info', th: 'แจ้งสถานการณ์', en: 'Situation update', color: '#2563eb' },
] as const;
export type UrgencyId = (typeof URGENCIES)[number]['id'];

export const NEEDS = [
  { id: 'rescue', th: 'อพยพ / เรือ', en: 'Evacuation / boat' },
  { id: 'medical', th: 'ยา / รักษาพยาบาล', en: 'Medicine / medical care' },
  { id: 'drinking_water', th: 'น้ำดื่ม', en: 'Drinking water' },
  { id: 'food', th: 'อาหาร', en: 'Food' },
  { id: 'shelter', th: 'ที่พักพิง', en: 'Shelter' },
  { id: 'clothes', th: 'เสื้อผ้า / ผ้าห่ม', en: 'Clothes / blankets' },
  { id: 'baby', th: 'ของใช้เด็กอ่อน', en: 'Baby supplies' },
  { id: 'power', th: 'ไฟฟ้า / ชาร์จโทรศัพท์', en: 'Power / phone charging' },
  { id: 'sandbags', th: 'กระสอบทราย', en: 'Sandbags' },
  { id: 'pump', th: 'เครื่องสูบน้ำ', en: 'Water pump' },
  { id: 'animals', th: 'ช่วยสัตว์เลี้ยง / ปศุสัตว์', en: 'Pets / livestock' },
  { id: 'cleanup', th: 'ทำความสะอาด / ซ่อมแซม', en: 'Clean-up / repairs' },
] as const;
export type NeedId = (typeof NEEDS)[number]['id'];

/** Water depth shortcuts by body height, so people do not have to measure. */
export const WATER_DEPTH_PRESETS = [
  { cm: 10, th: 'ตาตุ่ม', en: 'Ankle' },
  { cm: 50, th: 'เข่า', en: 'Knee' },
  { cm: 100, th: 'เอว', en: 'Waist' },
  { cm: 130, th: 'อก', en: 'Chest' },
  { cm: 200, th: 'มิดหัว', en: 'Over head' },
] as const;

export const WATER_TRENDS = [
  { id: 'rising', th: 'กำลังขึ้น', en: 'Rising' },
  { id: 'steady', th: 'ทรงตัว', en: 'Steady' },
  { id: 'falling', th: 'กำลังลด', en: 'Falling' },
] as const;
export type WaterTrend = (typeof WATER_TRENDS)[number]['id'];

/** Response status, set only by signed-in responders. */
export const STATUSES = [
  { id: 'new', th: 'รายงานใหม่ ยังไม่ยืนยัน', en: 'New, unverified', color: '#64748b', open: true },
  { id: 'acknowledged', th: 'รับเรื่องแล้ว', en: 'Acknowledged', color: '#2563eb', open: true },
  { id: 'in_progress', th: 'กำลังช่วยเหลือ', en: 'Help on the way', color: '#d97706', open: true },
  { id: 'resolved', th: 'ช่วยเหลือแล้ว / คลี่คลาย', en: 'Resolved', color: '#16a34a', open: false },
  { id: 'duplicate', th: 'ซ้ำกับรายงานอื่น', en: 'Duplicate', color: '#9ca3af', open: false },
  { id: 'unverifiable', th: 'ตรวจสอบไม่พบเหตุ', en: 'Could not be verified', color: '#9ca3af', open: false },
] as const;
export type StatusId = (typeof STATUSES)[number]['id'];
export const OPEN_STATUSES = STATUSES.filter((s) => s.open).map((s) => s.id) as StatusId[];

export const LIMITS = {
  placeNote: 200,
  details: 1000,
  contactName: 80,
  responderNote: 500,
  maxPeople: 100_000,
  maxDepthCm: 1000,
  /** Reports per reporter (hashed IP) per hour. */
  perHour: 5,
} as const;

export interface ReportInput {
  hazard: HazardId;
  urgency: UrgencyId;
  lat: number;
  lng: number;
  locationSource: 'gps' | 'map';
  gpsAccuracyM: number | null;
  placeNote: string | null;
  waterDepthCm: number | null;
  waterTrend: WaterTrend | null;
  people: number | null;
  vulnerable: boolean;
  needs: NeedId[];
  details: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

export type ValidationResult = { ok: true; value: ReportInput } | { ok: false; errors: Record<string, string> };

const ids = <T extends { id: string }>(xs: readonly T[]) => new Set(xs.map((x) => x.id));
const HAZARD_IDS = ids(HAZARDS);
const URGENCY_IDS = ids(URGENCIES);
const NEED_IDS = ids(NEEDS);
const TREND_IDS = ids(WATER_TRENDS);

/** Trim, collapse whitespace runs, drop control characters; null when empty. */
export function cleanText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? undefined : s;
}

/**
 * Thai phone numbers: mobile 0[689]x-xxx-xxxx (10 digits) or landline
 * 0x-xxx-xxxx (9 digits). +66 is accepted and stored as 0…
 */
export function normalizePhone(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  let d = v.replace(/[\s\-().]/g, '');
  if (d.startsWith('+66')) d = `0${d.slice(3)}`;
  if (!/^0\d{8,9}$/.test(d)) return undefined;
  return d;
}

function intOrNull(v: unknown, min: number, max: number): number | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

/** Validate an untrusted request body. Error values are i18n keys under report.errors. */
export function validateReport(body: unknown): ValidationResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const hazard = typeof b.hazard === 'string' && HAZARD_IDS.has(b.hazard) ? (b.hazard as HazardId) : null;
  if (!hazard) errors.hazard = 'hazard';
  const urgency = typeof b.urgency === 'string' && URGENCY_IDS.has(b.urgency) ? (b.urgency as UrgencyId) : null;
  if (!urgency) errors.urgency = 'urgency';

  const lat = typeof b.lat === 'number' ? b.lat : NaN;
  const lng = typeof b.lng === 'number' ? b.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.location = 'location';
  const locationSource = b.locationSource === 'gps' ? 'gps' : 'map';
  const acc = typeof b.gpsAccuracyM === 'number' && Number.isFinite(b.gpsAccuracyM) && b.gpsAccuracyM >= 0 ? Math.round(b.gpsAccuracyM) : null;

  const placeNote = cleanText(b.placeNote, LIMITS.placeNote);
  if (placeNote === undefined) errors.placeNote = 'tooLong';
  const details = cleanText(b.details, LIMITS.details);
  if (details === undefined) errors.details = 'tooLong';
  const contactName = cleanText(b.contactName, LIMITS.contactName);
  if (contactName === undefined) errors.contactName = 'tooLong';
  const contactPhone = normalizePhone(b.contactPhone);
  if (contactPhone === undefined) errors.contactPhone = 'phone';

  const water = hazard !== null && WATER_HAZARDS.includes(hazard);
  const waterDepthCm = water ? intOrNull(b.waterDepthCm, 0, LIMITS.maxDepthCm) : null;
  if (waterDepthCm === undefined) errors.waterDepthCm = 'number';
  const waterTrend = water && typeof b.waterTrend === 'string' && TREND_IDS.has(b.waterTrend) ? (b.waterTrend as WaterTrend) : null;
  const people = intOrNull(b.people, 0, LIMITS.maxPeople);
  if (people === undefined) errors.people = 'number';

  const needsRaw = Array.isArray(b.needs) ? b.needs : [];
  if (needsRaw.some((n) => typeof n !== 'string' || !NEED_IDS.has(n))) errors.needs = 'needs';
  const needs = [...new Set(needsRaw.filter((n): n is NeedId => typeof n === 'string' && NEED_IDS.has(n)))];

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      hazard: hazard!,
      urgency: urgency!,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      locationSource,
      gpsAccuracyM: locationSource === 'gps' ? acc : null,
      placeNote: placeNote ?? null,
      waterDepthCm: waterDepthCm ?? null,
      waterTrend,
      people: people ?? null,
      vulnerable: b.vulnerable === true,
      needs,
      details: details ?? null,
      contactName: contactName ?? null,
      contactPhone: contactPhone ?? null,
    },
  };
}

export function validateStatusUpdate(body: unknown): { ok: true; status: StatusId | null; note: string | null; hidden: boolean | null } | { ok: false } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const status = b.status === undefined ? null : STATUSES.some((s) => s.id === b.status) ? (b.status as StatusId) : undefined;
  const note = cleanText(b.note, LIMITS.responderNote);
  const hidden = b.hidden === undefined ? null : typeof b.hidden === 'boolean' ? b.hidden : undefined;
  if (status === undefined || note === undefined || hidden === undefined) return { ok: false };
  if (status === null && note === null && hidden === null) return { ok: false };
  return { ok: true, status, note, hidden };
}

/** Public shape of a report: never includes contact details or the reporter hash. */
export interface PublicReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  hazard: HazardId;
  urgency: UrgencyId;
  lat: number;
  lng: number;
  locationSource: 'gps' | 'map';
  gpsAccuracyM: number | null;
  placeNote: string | null;
  waterDepthCm: number | null;
  waterTrend: WaterTrend | null;
  people: number | null;
  vulnerable: boolean;
  needs: NeedId[];
  details: string | null;
  status: StatusId;
  /** Latest public note from a responder. */
  responderNote: string | null;
  subdistrictTh: string | null;
  districtTh: string | null;
  hasContact: boolean;
}

export interface ReportUpdate {
  at: string;
  status: StatusId | null;
  note: string | null;
}

export interface AdminReport extends PublicReport {
  contactName: string | null;
  contactPhone: string | null;
  hidden: boolean;
}
