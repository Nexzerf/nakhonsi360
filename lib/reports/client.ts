'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PublicReport, ReportUpdate } from '@/lib/reports/schema';

/** How often open views re-check for new reports and status changes. */
export const REPORTS_REFRESH_MS = 15_000;

export function useReports(opts: { hours?: number; enabled?: boolean } = {}) {
  const hours = opts.hours ?? 72;
  return useQuery<{ generatedAt: string; reports: PublicReport[] }>({
    queryKey: ['reports', hours],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/reports?hours=${hours}`, { signal });
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
  return useQuery<{ report: PublicReport; updates: ReportUpdate[] }>({
    queryKey: ['report', id],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/reports/${id}`, { signal });
      if (!r.ok) throw new Error(`report ${r.status}`);
      return r.json();
    },
    refetchInterval: REPORTS_REFRESH_MS,
    enabled: id !== null,
    retry: 1,
  });
}

// ---------------------------------------------------------------- my reports (this browser only)

const MINE_KEY = 'n360.myReports';

function readMine(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function rememberMyReport(id: string) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([id, ...readMine().filter((x) => x !== id)].slice(0, 50)));
    window.dispatchEvent(new Event('n360-my-reports'));
  } catch {
    // Storage unavailable (private mode): the report is still sent; it just is not remembered here.
  }
}

/** Ids of reports sent from this browser. */
export function useMyReports(): Set<string> {
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => {
    const load = () => setMine(new Set(readMine()));
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
