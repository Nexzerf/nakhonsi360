import { NextResponse, type NextRequest } from 'next/server';
import { getLayer, isLayerAvailable } from '@/lib/registry/layers';

export const dynamic = 'force-dynamic';

/**
 * GeoJSON for live layers (stations, hotspots, flood) read from the ingest
 * cache. Phase 1 has no live layers: static layers are vector tiles
 * (/api/tiles or PMTiles), and later-phase layers report not_connected.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ layerId: string }> }) {
  const { layerId } = await ctx.params;
  const layer = getLayer(layerId);
  if (!layer) return NextResponse.json({ error: 'unknown layer' }, { status: 404 });
  if (!isLayerAvailable(layer)) {
    return NextResponse.json({ layerId, status: 'not_connected', phase: layer.phase, sourceIds: layer.sourceIds }, { status: 501 });
  }
  return NextResponse.json({ layerId, status: 'vector_tiles', tiles: `/api/tiles/${layerId}/{z}/{x}/{y}` }, { status: 404 });
}
