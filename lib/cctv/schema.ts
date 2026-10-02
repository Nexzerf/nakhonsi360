/**
 * Nakhon Si Thammarat City Municipality CCTV (NST Smart City CCTV).
 *
 * The municipality publishes camera locations and status as open JSON
 * (CORS *) on https://nstcctv.nakhoncity.org and plays each camera through
 * its own browser player at /cam/<id>_sub/ (standard) or /cam/<id>/ (HD).
 * We only list the cameras and embed that player; no video passes through
 * this app. Verified 2026-10-02 (data/samples/nst.cctv/).
 */
import { THAILAND_ENVELOPE, bboxContains } from '@/lib/geo/bbox';

export const CCTV_BASE = 'https://nstcctv.nakhoncity.org';

export type CctvMode = 'traffic' | 'school' | 'water' | 'safety' | 'other';

/** Modes as the municipality groups them; id prefixes as used in their camera ids. */
export const CCTV_MODES: readonly { id: Exclude<CctvMode, 'other'>; prefix: string; groupMatch: RegExp; color: string }[] = [
  { id: 'water', prefix: 'WL', groupMatch: /ระดับน้ำ/, color: '#1d6fb8' },
  { id: 'traffic', prefix: 'TF', groupMatch: /จราจร/, color: '#b45309' },
  { id: 'school', prefix: 'SC', groupMatch: /โรงเรียน/, color: '#7c3aed' },
  { id: 'safety', prefix: 'SZ', groupMatch: /safety/i, color: '#15803d' },
];

export const CCTV_OTHER_COLOR = '#57534e';

export interface Camera {
  id: string;
  name: string;
  /** The municipality's own group name, e.g. "4.กล้องดูระดับน้ำ". */
  group: string | null;
  mode: CctvMode;
  lat: number;
  lng: number;
  /** As published by /api/camera-status; null when the camera is not listed there. */
  status: 'online' | 'offline' | null;
}

export interface CctvResponse {
  status: 'ok' | 'unavailable';
  fetchedAt: string;
  cameras: Camera[];
  /** Records left out, with the reason (e.g. missing coordinates). */
  rejected: number;
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function isCameraId(id: string): boolean {
  return ID_RE.test(id);
}

export function modeOf(id: string, group: string | null): CctvMode {
  const byPrefix = CCTV_MODES.find((m) => id.toUpperCase().startsWith(m.prefix));
  if (byPrefix) return byPrefix.id;
  const byGroup = group ? CCTV_MODES.find((m) => m.groupMatch.test(group)) : undefined;
  return byGroup?.id ?? 'other';
}

export function modeColor(mode: CctvMode): string {
  return CCTV_MODES.find((m) => m.id === mode)?.color ?? CCTV_OTHER_COLOR;
}

/** The municipality's player for one camera (standard quality unless hd). */
export function streamUrl(id: string, hd = false): string {
  if (!isCameraId(id)) throw new Error('invalid camera id');
  return `${CCTV_BASE}/cam/${encodeURIComponent(id)}${hd ? '' : '_sub'}/`;
}

/** Merge /api/cameras/public and /api/camera-status into validated cameras. */
export function parseCameras(rawCameras: unknown, rawStatus: unknown): { cameras: Camera[]; rejected: number } {
  const list = Array.isArray(rawCameras) ? rawCameras : [];
  const status = rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus) ? (rawStatus as Record<string, unknown>) : {};
  const cameras: Camera[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (!isCameraId(id) || !name || seen.has(id) || !Number.isFinite(lat) || !Number.isFinite(lng) || !bboxContains(THAILAND_ENVELOPE, lng, lat)) {
      rejected++;
      continue;
    }
    seen.add(id);
    const group = typeof o.group === 'string' && o.group.trim() ? o.group.trim() : null;
    const s = status[id];
    cameras.push({ id, name, group, mode: modeOf(id, group), lat, lng, status: s === 'online' || s === 'offline' ? s : null });
  }
  // Water-level cameras first (most useful in a flood), then the municipality's own id order.
  const rank = (m: CctvMode) => {
    const i = CCTV_MODES.findIndex((x) => x.id === m);
    return i < 0 ? CCTV_MODES.length : i;
  };
  cameras.sort((a, b) => rank(a.mode) - rank(b.mode) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { cameras, rejected };
}
