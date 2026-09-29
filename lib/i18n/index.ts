import th from './th.json';
import en from './en.json';
import type { Locale } from '@/lib/freshness/format';

export type { Locale };

const DICTS: Record<Locale, unknown> = { th, en };

/** Dot-path lookup with {placeholder} substitution. Falls back to Thai, then to the key. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(DICTS.th, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in cur) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** All leaf keys of a dictionary, for the parity test. */
export function leafKeys(dict: unknown, prefix = ''): string[] {
  if (!dict || typeof dict !== 'object') return [prefix];
  return Object.entries(dict as Record<string, unknown>).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

export const dictionaries = { th, en };

/**
 * Pick the display name for a place. Official Thai names are never translated:
 * English is used only when the source provides its own English field.
 */
export function placeName(locale: Locale, nameTh: string | null, nameEn: string | null): string | null {
  if (locale === 'en' && nameEn) return nameEn;
  return nameTh ?? nameEn;
}
