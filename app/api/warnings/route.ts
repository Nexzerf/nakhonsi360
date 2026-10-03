import { NextResponse } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { memo } from '@/lib/db/memo';
import { activeWarnings, lastSuccessfulRuns } from '@/lib/db/queries';
import type { WarningsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** TMD weather announcements currently in effect (national notices, as published). */
export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ status: 'unavailable', checkedAt: null, warnings: [] } satisfies WarningsResponse, { status: 503 });
  try {
    const [rows, runs] = await withTimeout(Promise.all([memo(sql, 'warnings', 30_000, () => activeWarnings(sql)), memo(sql, 'inspect:runs', 30_000, () => lastSuccessfulRuns(sql))]), 5000);
    if (!runs.has('tmd.warnings')) return NextResponse.json({ status: 'not_connected', checkedAt: null, warnings: [] } satisfies WarningsResponse);
    const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const body: WarningsResponse = {
      status: 'ok',
      checkedAt: runs.get('tmd.warnings') ?? null,
      warnings: rows.map((r) => ({
        id: r.feature_key,
        announcedAt: new Date(r.observed_at).toISOString(),
        effectStart: s(r.properties.effect_start),
        effectEnd: r.valid_until ? new Date(r.valid_until).toISOString() : null,
        titleTh: s(r.properties.title_th) ?? '',
        titleEn: s(r.properties.title_en),
        headlineTh: s(r.properties.headline_th),
        headlineEn: s(r.properties.headline_en),
        urlTh: s(r.properties.url_th),
        urlEn: s(r.properties.url_en),
      })),
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600' } });
  } catch (err) {
    console.error('[api/warnings]', err);
    return NextResponse.json({ status: 'unavailable', checkedAt: null, warnings: [] } satisfies WarningsResponse, { status: 502 });
  }
}
