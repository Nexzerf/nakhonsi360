import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { isTileLayer, provinceExtent, renderTile } from '@/lib/db/queries';
import { memo } from '@/lib/db/memo';

const EMPTY_CACHE = 'public, max-age=3600, s-maxage=86400';

/** Longitude/latitude box of tile z/x/y. */
function tileBox(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

export const dynamic = 'force-dynamic';

/**
 * Mapbox Vector Tiles rendered by PostGIS (ST_AsMVT). Used when
 * NEXT_PUBLIC_PMTILES_BASE_URL is not set; PMTiles on object storage is the
 * production path for large layers.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ layerId: string; z: string; x: string; y: string }> }) {
  const { layerId, z: zs, x: xs, y: ys } = await ctx.params;
  const z = Number(zs);
  const x = Number(xs);
  const y = Number(ys.replace(/\.(pbf|mvt)$/, ''));
  if (!isTileLayer(layerId)) return NextResponse.json({ error: 'unknown layer' }, { status: 404 });
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 16 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return NextResponse.json({ error: 'invalid tile coordinates' }, { status: 400 });
  }

  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });

  try {
    // Every layer is clipped to the province + 5 km: tiles elsewhere are empty without asking the database.
    const extent = await memo(sql, 'province-extent', 3_600_000, () => provinceExtent(sql)).catch(() => null);
    if (extent) {
      const [w, s, e, n] = tileBox(z, x, y);
      const [bw, bs, be, bn] = extent.bufferedBbox;
      if (e < bw || w > be || n < bs || s > bn) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': EMPTY_CACHE } });
    }
    const tile = await withTimeout(renderTile(sql, layerId, z, x, y), 8000);
    if (tile.length === 0) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': EMPTY_CACHE } });
    return new NextResponse(new Uint8Array(tile), {
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[api/tiles]', layerId, z, x, y, err);
    return NextResponse.json({ error: 'tile failed' }, { status: 502 });
  }
}
