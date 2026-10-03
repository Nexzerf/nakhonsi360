import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { memo } from '@/lib/db/memo';
import { getLayer } from '@/lib/registry/layers';
import { findSource } from '@/lib/registry/sources';

export const dynamic = 'force-dynamic';

interface RasterRow {
  tile_url: string;
  minzoom: number;
  maxzoom: number;
  tile_size: number;
  data_from: Date | null;
  data_to: Date | null;
  details: Record<string, unknown>;
  refreshed_at: Date;
}

/**
 * TileJSON for a raster layer whose source changes (imagery mosaics, the
 * newest SMAP day), with the dates it shows so the map can say so.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ layerId: string }> }) {
  const { layerId } = await ctx.params;
  const layer = getLayer(layerId);
  if (!layer?.raster?.tilejson) return NextResponse.json({ error: 'unknown layer' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const [row] = await withTimeout(
      memo(sql, `raster:${layerId}`, 60_000, () => sql<RasterRow[]>`select tile_url, minzoom, maxzoom, tile_size, data_from, data_to, details, refreshed_at from raster_layers where layer_id = ${layerId}`),
      4000,
    );
    if (!row) return NextResponse.json({ error: 'not_built', layerId }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
    const scenes = Array.isArray(row.details.scenes) ? (row.details.scenes as { grid: string; datetime: string; cloud: number }[]).map((s) => ({ grid: s.grid, datetime: s.datetime, cloud: s.cloud })) : undefined;
    return NextResponse.json(
      {
        tilejson: '3.0.0',
        name: layerId,
        scheme: 'xyz',
        tiles: [row.tile_url],
        minzoom: row.minzoom,
        maxzoom: row.maxzoom,
        attribution: layer.sourceIds.map((id) => findSource(id)?.attribution).filter(Boolean).join(' · '),
        // Not part of TileJSON: what the tiles show, for the layer panel.
        dataFrom: iso(row.data_from),
        dataTo: iso(row.data_to),
        refreshedAt: iso(row.refreshed_at),
        ...(scenes ? { scenes } : {}),
      },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } },
    );
  } catch (err) {
    console.error('[api/imagery]', layerId, err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
