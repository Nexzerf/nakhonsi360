import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { getPhoto } from '@/lib/reports/db';

export const dynamic = 'force-dynamic';

/** A report photo. Served as an inert image: no scripts, no sniffing. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await ctx.params;
  if (!/^[0-9a-f]{16}$/.test(photoId)) return new NextResponse(null, { status: 404 });
  const sql = getDb();
  if (!sql) return new NextResponse(null, { status: 503 });
  try {
    const p = await withTimeout(getPhoto(sql, photoId), 8000);
    if (!p) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(p.bytes), {
      headers: {
        'Content-Type': p.mime,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
      },
    });
  } catch (err) {
    console.error('[api/reports/photos]', err);
    return new NextResponse(null, { status: 502 });
  }
}
