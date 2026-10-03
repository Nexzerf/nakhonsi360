import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db/client';
import { memo } from '@/lib/db/memo';
import { provinceExtent } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

/**
 * Server-side relay for map tiles whose host does not allow browsers to load
 * them directly (no CORS header), or that need a key kept off the browser.
 * Each provider is allow-listed with its upstream and a strict path pattern,
 * and only tiles over the province are relayed, so this is not an open proxy.
 * Responses are cached by the CDN for a week.
 */
interface Provider {
  /** Upstream URL for z, x, y. */
  url: (z: number, x: number, y: number) => string;
  maxzoom: number;
}

const PROVIDERS: Record<string, Provider> = {
  // Land Development Department cached land-use map (sends no CORS header).
  'ldd-landuse': { url: (z, x, y) => `https://eis.ldd.go.th/arcgis/rest/services/LDD_LU_WM_CACHE/MapServer/tile/${z}/${y}/${x}`, maxzoom: 19 },
};

const UA = 'Nakhonsi360/0.1 (environmental map of Nakhon Si Thammarat; https://github.com/nexzerf/nakhonsi360)';

function tileBox(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string; path: string[] }> }) {
  const { provider, path } = await ctx.params;
  if (!Object.hasOwn(PROVIDERS, provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  const p = PROVIDERS[provider]!;
  const m = /^(\d{1,2})\/(\d{1,7})\/(\d{1,7})(?:\.(?:png|jpg))?$/.exec(path.join('/'));
  const [z, x, y] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
  if (!m || z > p.maxzoom || x >= 2 ** z || y >= 2 ** z) return NextResponse.json({ error: 'invalid tile' }, { status: 400 });

  const sql = getDb();
  const extent = sql ? await memo(sql, 'province-extent', 3_600_000, () => provinceExtent(sql)).catch(() => null) : null;
  if (!extent) return NextResponse.json({ error: 'province extent unavailable' }, { status: 503 });
  const [w, s, e, n] = tileBox(z, x, y);
  const [bw, bs, be, bn] = extent.bufferedBbox;
  if (e < bw || w > be || n < bs || s > bn) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });

  try {
    const r = await fetch(p.url(z, x, y), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/^image\//.test(type || 'image/jpeg')) return new NextResponse(null, { status: r.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(await r.arrayBuffer(), {
      headers: {
        'Content-Type': type || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[api/proxy]', provider, z, x, y, err);
    return new NextResponse(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
