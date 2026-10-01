import { NextResponse, type NextRequest } from 'next/server';
import type * as GeoJSON from 'geojson';
import { getDb, withTimeout } from '@/lib/db/client';
import { connectedSources, latestStationReadings, recentEarthquakes } from '@/lib/db/queries';
import { getLayer } from '@/lib/registry/layers';

export const dynamic = 'force-dynamic';

/**
 * GeoJSON for live layers: station layers give the latest reading per
 * station (within 2 days) with its official status exactly as published;
 * hazard-event layers give recent events with the source's own properties.
 * Static layers are vector tiles (/api/tiles or PMTiles).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ layerId: string }> }) {
  const { layerId } = await ctx.params;
  const layer = getLayer(layerId);
  if (!layer) return NextResponse.json({ error: 'unknown layer' }, { status: 404 });
  if (!layer.variable && !layer.hazardKind) {
    return NextResponse.json({ layerId, status: layer.sourceLayer ? 'vector_tiles' : 'not_connected', phase: layer.phase }, { status: layer.sourceLayer ? 404 : 501 });
  }

  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const connected = await withTimeout(connectedSources(sql), 4000);
    if (!layer.sourceIds.some((id) => connected.has(id))) {
      return NextResponse.json({ layerId, status: 'not_connected', phase: layer.phase, sourceIds: layer.sourceIds }, { status: 501 });
    }
    if (layer.hazardKind === 'earthquake') {
      const quakes = (await withTimeout(recentEarthquakes(sql), 6000)).filter((r) => layer.sourceIds.includes(r.source_id));
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: quakes.map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: {
            source_id: r.source_id,
            feature_key: r.feature_key,
            observed_at: new Date(r.observed_at).toISOString(),
            fetched_at: new Date(r.fetched_at).toISOString(),
            mag: r.properties.mag ?? null,
            mag_type: r.properties.mag_type ?? null,
            place: r.properties.place ?? null,
            depth_km: r.properties.depth_km ?? null,
            status: r.properties.status ?? null,
            url: r.properties.url ?? null,
          },
        })),
      };
      return NextResponse.json(fc, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } });
    }
    const rows = (await withTimeout(latestStationReadings(sql, layer.variable!), 6000)).filter((r) => layer.sourceIds.includes(r.source_id));
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
