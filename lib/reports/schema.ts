/**
 * Citizen hazard reports: the fields people can send and their validation.
 *
 * Reports and updates are what members of the public say, not official data,
 * and are never mixed with agency data. There is no sign-in: anyone can
 * report and anyone can say they are helping. The reporter's name and phone
 * are shown publicly while the report is open (the form says so) and hidden
 * once it is closed.
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

/** Where a report stands, from the latest update anyone posted. */
export const STATUSES = [
  { id: 'new', th: 'ยังไม่มีคนรับเรื่อง', en: 'No one on it yet', color: '#64748b', open: true },
  { id: 'on_the_way', th: 'มีคนกำลังไปช่วย', en: 'Someone is on the way', color: '#d97706', open: true },
  { id: 'resolved', th: 'ช่วยเหลือแล้ว / คลี่คลาย', en: 'Helped / resolved', color: '#16a34a', open: false },
  { id: 'unverifiable', th: 'ไปแล้วไม่พบเหตุ', en: 'Went there, nothing found', color: '#9ca3af', open: false },
] as const;
export type StatusId = (typeof STATUSES)[number]['id'];
export const OPEN_STATUSES = STATUSES.filter((s) => s.open).map((s) => s.id) as StatusId[];

/** What a helper (or the reporter) can say about a report. */
export const UPDATE_ACTIONS = [
  { id: 'confirm', th: 'ยืนยัน ฉันอยู่ที่นี่ เห็นจริง', en: "Confirm: I'm here and see it", status: null },
  { id: 'level', th: 'รายงานระดับน้ำล่าสุด', en: 'Report the current water level', status: null },
  { id: 'on_the_way', th: 'ฉันกำลังไปช่วย', en: "I'm on my way", status: 'on_the_way' },
  { id: 'resolved', th: 'ช่วยเหลือแล้ว', en: 'Helped / resolved', status: 'resolved' },
  { id: 'still_need', th: 'ยังต้องการความช่วยเหลือ', en: 'Still needs help', status: 'new' },
  { id: 'unverifiable', th: 'ไปแล้วไม่พบเหตุ', en: 'Went there, nothing found', status: 'unverifiable' },
  { id: 'note', th: 'เพิ่มข้อมูล', en: 'Add information', status: null },
] as const satisfies readonly { id: string; th: string; en: string; status: StatusId | null }[];
export type UpdateActionId = (typeof UPDATE_ACTIONS)[number]['id'];

export const LIMITS = {
  placeNote: 200,
  details: 1000,
  contactName: 80,
  updateNote: 500,
  authorName: 60,
  maxPeople: 100_000,
  maxDepthCm: 1000,
  /** Reports per connection (hashed IP) per hour. */
  perHour: 5,
  /** Updates per connection per hour. */
  updatesPerHour: 20,
  /** Flags from different connections that hide a report. */
  flagsToHide: 3,
  /** Photos per report or per update. */
  photosPerItem: 4,
  /** Photos per connection per hour. */
  photosPerHour: 30,
  /** Bytes per stored photo (the browser resizes to ~1600 px JPEG first). */
  photoMaxBytes: 2_500_000,
  /** How far back "when did you see it" may go. */
  observedMaxAgeHours: 72,
} as const;

/** "When did you see it" shortcuts, in minutes before now. */
export const OBSERVED_PRESETS = [
  { minutes: 0, th: 'ตอนนี้', en: 'Now' },
  { minutes: 30, th: '30 นาทีที่แล้ว', en: '30 min ago' },
  { minutes: 60, th: '1 ชม.ที่แล้ว', en: '1 h ago' },
  { minutes: 180, th: '3 ชม.ที่แล้ว', en: '3 h ago' },
] as const;

/**
 * When the event was seen, as the reporter says. Must not be in the future
 * (5 min clock slack) or older than LIMITS.observedMaxAgeHours.
 */
export function parseObserved(v: unknown, now = new Date()): Date | null | undefined {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return undefined;
  if (t.getTime() > now.getTime() + 5 * 60_000) return undefined;
  if (t.getTime() < now.getTime() - LIMITS.observedMaxAgeHours * 3_600_000) return undefined;
  return t;
}

export interface ReportInput {
  hazard: HazardId;
  urgency: UrgencyId;
  lat: number;
  lng: number;
  locationSource: 'gps' | 'map';
  gpsAccuracyM: number | null;
  /** When it was seen; null = now. */
  observedAt: string | null;
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

  const observed = parseObserved(b.observedAt);
  if (observed === undefined) errors.observedAt = 'observedAt';
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
      observedAt: observed ? observed.toISOString() : null,
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

export type UpdateInput = {
  action: UpdateActionId;
  note: string | null;
  authorName: string | null;
  editToken: string | null;
  waterDepthCm: number | null;
  waterTrend: WaterTrend | null;
  observedAt: string | null;
};

export function validateUpdate(body: unknown): { ok: true; value: UpdateInput } | { ok: false } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const action = UPDATE_ACTIONS.find((a) => a.id === b.action)?.id;
  const note = cleanText(b.note, LIMITS.updateNote);
  const authorName = cleanText(b.authorName, LIMITS.authorName);
  const editToken = typeof b.editToken === 'string' && /^[0-9a-f]{32}$/.test(b.editToken) ? b.editToken : null;
  const depth = intOrNull(b.waterDepthCm, 0, LIMITS.maxDepthCm);
  const waterTrend = typeof b.waterTrend === 'string' && TREND_IDS.has(b.waterTrend) ? (b.waterTrend as WaterTrend) : null;
  const observed = parseObserved(b.observedAt);
  if (!action || note === undefined || authorName === undefined || depth === undefined || observed === undefined) return { ok: false };
  if (action === 'note' && !note) return { ok: false };
  // A water-level update needs the level.
  if (action === 'level' && depth === null) return { ok: false };
  return {
    ok: true,
    value: { action, note, authorName, editToken, waterDepthCm: depth, waterTrend, observedAt: observed ? observed.toISOString() : null },
  };
}

/**
 * Public shape of a report. The reporter's name and phone are included only
 * while the report is open (the form tells them so); the connection hash and
 * edit token never leave the server.
 */
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
  /** When it was seen (reporter's statement); createdAt is when it reached us. */
  observedAt: string;
  contactName: string | null;
  contactPhone: string | null;
  /** Latest update anyone posted, for the list. */
  lastUpdate: ReportUpdate | null;
  updateCount: number;
  /** People (distinct connections, not the reporter) who said they are there and see it. */
  confirmCount: number;
  photoCount: number;
  /** Newest water level from the report or any level update. */
  latestDepthCm: number | null;
  latestDepthAt: string | null;
  subdistrictTh: string | null;
  districtTh: string | null;
}

export interface ReportUpdate {
  id: string;
  at: string;
  action: UpdateActionId;
  note: string | null;
  authorName: string | null;
  byReporter: boolean;
  waterDepthCm: number | null;
  waterTrend: WaterTrend | null;
  observedAt: string | null;
}

/**
 * A photo, with what its file said (read in the sender's browser before the
 * metadata was stripped): when it was taken and how far from the pin.
 * Coordinates themselves are never stored.
 */
export interface ReportPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  /** null = attached to the report itself. */
  updateId: string | null;
  exifTakenAt: string | null;
  exifDistanceM: number | null;
}
