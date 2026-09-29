const THAI_CHAR = /[฀-๿]/;
const LATIN_CHAR = /[A-Za-z]/;

export const hasThai = (s: string) => THAI_CHAR.test(s);
export const hasLatin = (s: string) => LATIN_CHAR.test(s);

/** Share of non-empty values that satisfy `test`. */
export function shareMatching(values: Iterable<unknown>, test: (s: string) => boolean): number {
  let n = 0;
  let ok = 0;
  for (const v of values) {
    if (typeof v !== 'string' || v.trim() === '') continue;
    n++;
    if (test(v)) ok++;
  }
  return n === 0 ? 0 : ok / n;
}

/** Convert Thai digits (๐–๙) to ASCII. */
export function thaiDigitsToAscii(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/** Trim and collapse internal whitespace; keep the official spelling otherwise untouched. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s === '' || s === '-' ? null : s;
}

/** Case- and punctuation-insensitive key for matching field names. */
export function fieldKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.:]/g, '');
}
