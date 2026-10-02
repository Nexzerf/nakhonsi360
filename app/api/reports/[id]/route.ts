import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { getPublicReport } from '@/lib/reports/db';

export const dynamic = 'force-dynamic';

const REPORT_ID = /^[0-9a-f]{10}$/;

/** One report with its public timeline. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!REPORT_ID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const r = await withTimeout(getPublicReport(sql, id), 6000);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/reports/:id]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
