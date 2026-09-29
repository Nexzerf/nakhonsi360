import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { isTileLayer, renderTile } from '@/lib/db/queries';

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
    const tile = await withTimeout(renderTile(sql, layerId, z, x, y), 8000);
    if (tile.length === 0) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
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
