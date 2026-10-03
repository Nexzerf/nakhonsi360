'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PublicReport, ReportPhoto, ReportUpdate } from '@/lib/reports/schema';

/** How often open views re-check for new reports and status changes. */
export const REPORTS_REFRESH_MS = 15_000;

/**
 * Report reads are shared through the CDN for a few seconds. After this
 * browser changes something, read past that cache for a short while so the
 * change shows at once (see lib/reports/cache.ts).
 */
let freshUntil = 0;
export function expectOwnChange() {
  freshUntil = Date.now() + 20_000;
}
/** `?fresh=…` / `&fresh=…` while this browser's own change may still be cached, else ''. */
export const freshParam = (sep: '?' | '&') => (Date.now() < freshUntil ? `${sep}fresh=${Date.now()}` : '');

export function useReports(opts: { hours?: number; enabled?: boolean } = {}) {
  const hours = opts.hours ?? 72;
  return useQuery<{ generatedAt: string; reports: PublicReport[] }>({
    queryKey: ['reports', hours],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/reports?hours=${hours}${freshParam('&')}`, { signal });
      if (!r.ok) throw new Error(`reports ${r.status}`);
      return r.json();
    },
    refetchInterval: REPORTS_REFRESH_MS,
    refetchIntervalInBackground: false,
    enabled: opts.enabled ?? true,
    retry: 1,
  });
}

export function useReport(id: string | null) {
  return useQuery<{ report: PublicReport; updates: ReportUpdate[]; photos: ReportPhoto[] }>({
    queryKey: ['report', id],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/reports/${id}${freshParam('?')}`, { signal });
      if (!r.ok) throw new Error(`report ${r.status}`);
      return r.json();
    },
    refetchInterval: REPORTS_REFRESH_MS,
    enabled: id !== null,
    retry: 1,
  });
}

// ---------------------------------------------------------------- my reports (this browser only)

const MINE_KEY = 'n360.myReports.v2';

/** id → edit token for reports sent from this browser. */
function readMine(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function rememberMyReport(id: string, editToken: string) {
  try {
    const all = Object.entries({ [id]: editToken, ...readMine() }).slice(0, 50);
    localStorage.setItem(MINE_KEY, JSON.stringify(Object.fromEntries(all)));
    window.dispatchEvent(new Event('n360-my-reports'));
  } catch {
    // Storage unavailable (private mode): the report is still sent; it just is not remembered here.
  }
}

export function editTokenFor(id: string): string | null {
  return readMine()[id] ?? null;
}

/** Ids of reports sent from this browser. */
export function useMyReports(): Set<string> {
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () => setMine(new Set(Object.keys(readMine())));
    load();
    window.addEventListener('n360-my-reports', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('n360-my-reports', load);
      window.removeEventListener('storage', load);
    };
  }, []);
  return mine;
}

// ---------------------------------------------------------------- helper name (remembered for the next update)

const NAME_KEY = 'n360.helperName';

export function savedHelperName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveHelperName(name: string) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}
