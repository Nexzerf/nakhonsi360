import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { flagReport } from '@/lib/reports/db';
import { reporterHash, sameOrigin } from '@/lib/reports/hash';

export const dynamic = 'force-dynamic';

/** Flag a false or abusive report; hidden after flags from several connections. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{10}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  const hash = reporterHash(req);
  if (!hash) return NextResponse.json({ error: 'unknown_client' }, { status: 400 });
  try {
    const r = await withTimeout(flagReport(sql, id, hash), 6000);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[api/reports/:id/flag]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
