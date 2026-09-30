import { NextResponse, type NextRequest } from 'next/server';
import type * as GeoJSON from 'geojson';
import { getDb, withTimeout } from '@/lib/db/client';
import { connectedSources, latestStationReadings } from '@/lib/db/queries';
import { getLayer } from '@/lib/registry/layers';

export const dynamic = 'force-dynamic';

/**
 * GeoJSON for live station layers: the latest reading per station (within
 * 2 days) with its official status exactly as published. Static layers are
 * vector tiles (/api/tiles or PMTiles).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ layerId: string }> }) {
  const { layerId } = await ctx.params;
  const layer = getLayer(layerId);
  if (!layer) return NextResponse.json({ error: 'unknown layer' }, { status: 404 });
  if (!layer.variable) {
    return NextResponse.json({ layerId, status: layer.sourceLayer ? 'vector_tiles' : 'not_connected', phase: layer.phase }, { status: layer.sourceLayer ? 404 : 501 });
  }

  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const connected = await withTimeout(connectedSources(sql), 4000);
    if (!layer.sourceIds.some((id) => connected.has(id))) {
      return NextResponse.json({ layerId, status: 'not_connected', phase: layer.phase, sourceIds: layer.sourceIds }, { status: 501 });
    }
    const rows = (await withTimeout(latestStationReadings(sql, layer.variable), 6000)).filter((r) => layer.sourceIds.includes(r.source_id));
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        properties: {
          source_id: r.source_id,
          station_id: r.station_id,
          name_th: r.name_th,
          name_en: r.name_en,
          agency_th: r.agency_th,
          value: r.value,
          unit: r.unit,
          observed_at: new Date(r.observed_at).toISOString(),
          official_status: r.official_status,
          official_level: r.official_level,
          official_color: r.official_color,
          official_detail: r.official_detail,
        },
      })),
    };
    return NextResponse.json(fc, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
  } catch (err) {
    console.error('[api/layers]', layerId, err);
    return NextResponse.json({ error: 'layer failed' }, { status: 502 });
  }
}
