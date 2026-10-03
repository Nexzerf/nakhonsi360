import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { getPublicReport } from '@/lib/reports/db';
import { memo } from '@/lib/db/memo';
import { REPORT_READ_CACHE, REPORT_READ_TTL_MS } from '@/lib/reports/cache';

export const dynamic = 'force-dynamic';

const REPORT_ID = /^[0-9a-f]{10}$/;

/** One report with its public timeline. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!REPORT_ID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const fresh = req.nextUrl.searchParams.has('fresh');
    const load = () => getPublicReport(sql, id);
    const r = await withTimeout(fresh ? load() : memo(sql, `report:${id}`, REPORT_READ_TTL_MS, load), 6000);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(r, { headers: { 'Cache-Control': fresh ? 'no-store' : REPORT_READ_CACHE } });
  } catch (err) {
    console.error('[api/reports/:id]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
