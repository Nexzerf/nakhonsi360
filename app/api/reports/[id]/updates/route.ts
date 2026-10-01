import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { addUpdate } from '@/lib/reports/db';
import { validateUpdate } from '@/lib/reports/schema';
import { reporterHash, sameOrigin } from '@/lib/reports/hash';

export const dynamic = 'force-dynamic';

/** Anyone can say "on my way", "helped", "still needs help", "nothing found", or add a note. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{10}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  const v = validateUpdate(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: 'invalid' }, { status: 422 });
  try {
    const r = await withTimeout(addUpdate(sql, id, v.value, reporterHash(req)), 6000);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'rate_limited' ? 429 : r.reason === 'cannot_confirm' ? 409 : 404 });
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    console.error('[api/reports/:id/updates]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
