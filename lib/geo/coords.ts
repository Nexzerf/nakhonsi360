/**
 * Parse coordinates typed into the search box.
 * Accepts "lat, lng", "lng, lat" (detected by range), and DMS such as
 * 8°26'10"N 99°57'48"E. Returns null when the text is not a coordinate.
 */
export interface ParsedCoord {
  lat: number;
  lng: number;
  /** How the input was interpreted, for display. */
  order: 'lat,lng' | 'lng,lat' | 'dms';
}

const DECIMAL_PAIR = /^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*(?:[,;]\s*|\s+)([+-]?\d{1,3}(?:\.\d+)?)\s*$/;

// One DMS coordinate: optional leading/trailing hemisphere, degrees with a °
// (or space), optional minutes ' and seconds ".
const DMS_ONE = /^\s*([NSEW])?\s*(\d{1,3}(?:\.\d+)?)\s*[°º]?\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')\s*)?([NSEW])?\s*$/i;

const inLat = (v: number) => v >= -90 && v <= 90;
const inLng = (v: number) => v >= -180 && v <= 180;

/** Thailand is at roughly 5–21°N, 97–106°E; this resolves ambiguous decimal pairs. */
const looksLikeThaiLat = (v: number) => v >= 0 && v <= 30;
const looksLikeThaiLng = (v: number) => v >= 90 && v <= 110;

export function parseCoordinates(input: string): ParsedCoord | null {
  const dec = DECIMAL_PAIR.exec(input);
  if (dec) {
    const a = Number(dec[1]);
    const b = Number(dec[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (looksLikeThaiLat(a) && looksLikeThaiLng(b)) return { lat: a, lng: b, order: 'lat,lng' };
    if (looksLikeThaiLng(a) && looksLikeThaiLat(b)) return { lat: b, lng: a, order: 'lng,lat' };
    if (inLat(a) && inLng(b)) return { lat: a, lng: b, order: 'lat,lng' };
    if (inLng(a) && inLat(b)) return { lat: b, lng: a, order: 'lng,lat' };
    return null;
  }
  return parseDms(input);
}

function parseDms(input: string): ParsedCoord | null {
  if (!/[°º'′"″]|[NSEW]/i.test(input)) return null;
  const halves = splitDms(input);
  if (!halves) return null;
  const first = dmsToDecimal(halves[0]);
  const second = dmsToDecimal(halves[1]);
  if (!first || !second) return null;

  let lat: number;
  let lng: number;
  if (first.axis === 'lng' || second.axis === 'lat') {
    lng = first.value;
    lat = second.value;
  } else {
    lat = first.value;
    lng = second.value;
  }
  if (first.axis && second.axis && first.axis === second.axis) return null;
  if (!inLat(lat) || !inLng(lng)) return null;
  return { lat, lng, order: 'dms' };
}

/** Split "8°26'10"N 99°57'48"E" or "8°26'10"N, 99°57'48"E" into its two coordinates. */
function splitDms(input: string): [string, string] | null {
  const byComma = input.split(/[,;]/);
  if (byComma.length === 2) return [byComma[0]!, byComma[1]!];
  const s = input.trim();
  // Hemisphere letters lead ("N 8°25.8' E 99°57.8'"): split before the second letter…
  const beforeHemi = /^(.+?)\s+([NSEW]\s*\d.*)$/i.exec(s);
  if (/^[NSEW]/i.test(s) && beforeHemi) return [beforeHemi[1]!, beforeHemi[2]!];
  // …otherwise they trail ("8°25'49"N 99°57'47"E"): split after the first one.
  const afterHemi = /^(.*?\d[^NSEW]*[NSEW])\s+(.+)$/i.exec(s);
  if (afterHemi) return [afterHemi[1]!, afterHemi[2]!];
  if (beforeHemi) return [beforeHemi[1]!, beforeHemi[2]!];
  return null;
}

function dmsToDecimal(text: string): { value: number; axis: 'lat' | 'lng' | null } | null {
  const m = DMS_ONE.exec(text);
  if (!m) return null;
  const [, pre, d, mi, s, post] = m;
  if (pre && post) return null;
  const deg = Number(d);
  const min = mi ? Number(mi) : 0;
  const sec = s ? Number(s) : 0;
  if (min >= 60 || sec >= 60) return null;
  const hemi = (pre ?? post ?? '').toUpperCase();
  let value = deg + min / 60 + sec / 3600;
  if (hemi === 'S' || hemi === 'W') value = -value;
  const axis = hemi === 'N' || hemi === 'S' ? 'lat' : hemi === 'E' || hemi === 'W' ? 'lng' : null;
  return { value, axis };
}
