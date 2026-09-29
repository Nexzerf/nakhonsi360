export type Locale = 'th' | 'en';

const TZ = 'Asia/Bangkok';

/** Relative time: "4 นาทีที่แล้ว" / "4 minutes ago". */
export function formatRelative(date: Date, locale: Locale, now = new Date()): string {
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}

/** Absolute date-time in Bangkok time. Thai UI uses the Buddhist Era (e.g. 2569). */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Distance with unit: "850 ม." / "3.2 กม.". */
export function formatDistance(meters: number, locale: Locale): string {
  if (meters < 1000) {
    const m = Math.round(meters / 10) * 10;
    return locale === 'th' ? `${m.toLocaleString('th-TH')} ม.` : `${m.toLocaleString('en-GB')} m`;
  }
  const km = meters / 1000;
  const s = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return locale === 'th' ? `${s} กม.` : `${s} km`;
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
