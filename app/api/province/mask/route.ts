import { NextResponse } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { provinceMask } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

/** GeoJSON mask covering everything outside Nakhon Si Thammarat (TH80). */
export async function GET() {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  try {
    const feature = await withTimeout(provinceMask(sql), 5000);
    if (!feature) return NextResponse.json({ error: 'province_not_imported' }, { status: 404 });
    // Boundaries change only on re-import; let the CDN keep it for a day.
    return NextResponse.json(feature, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch (err) {
    console.error('[api/province/mask]', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
