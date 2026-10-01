import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { getPublicReport, updateReport } from '@/lib/reports/db';
import { validateStatusUpdate } from '@/lib/reports/schema';
import { isAdmin, sameOrigin } from '@/lib/reports/auth';

export const dynamic = 'force-dynamic';

const ID = /^[0-9a-f]{10}$/;

/** One report with its public timeline. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
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

/** Responders only: status, public note, hide as spam. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req) || !sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  const u = validateStatusUpdate(await req.json().catch(() => null));
  if (!u.ok) return NextResponse.json({ error: 'invalid' }, { status: 422 });
  try {
    const ok = await withTimeout(updateReport(sql, id, u), 6000);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    console.error('[api/reports/:id] patch', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
