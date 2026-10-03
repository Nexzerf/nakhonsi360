import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { memo } from '@/lib/db/memo';
import { searchGazetteer } from '@/lib/db/queries';
import type { SearchResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 20, 1), 50);
  if (q.length < 2) return NextResponse.json({ query: q, status: 'ok', hits: [] } satisfies SearchResponse);

  const sql = getDb();
  if (!sql) return NextResponse.json({ query: q, status: 'unavailable', hits: [] } satisfies SearchResponse);

  try {
    const hits = await withTimeout(memo(sql, `search:${limit}:${q.toLowerCase()}`, 300_000, () => searchGazetteer(sql, q, limit)), 4000);
    return NextResponse.json({ query: q, status: 'ok', hits } satisfies SearchResponse, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('[api/search]', err);
    return NextResponse.json({ query: q, status: 'error', hits: [] } satisfies SearchResponse, { status: 502 });
  }
}
