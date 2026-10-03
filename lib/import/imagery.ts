/**
 * Raster layers built from changing sources, verified 2026-10-03 from a
 * GitHub runner (scripts/probe-sources.mjs, removed after use):
 *
 * - Sentinel-2 L2A (Copernicus) through Microsoft Planetary Computer: the
 *   STAC search finds scenes over the province; for each Sentinel-2 grid tile
 *   the least cloudy scene of the last WINDOW_DAYS is kept, and the mosaic of
 *   those scenes is registered with Planetary Computer's tiler. True colour
 *   uses the scenes' own "visual" product; NDVI is (B08 − B04) / (B08 + B04)
 *   computed by the tiler from the same scenes.
 * - NASA SMAP L4 surface soil moisture (9 km, daily) from GIBS: the newest
 *   day is read from GetCapabilities and written into the tile URL, so the
 *   map always says which day it shows.
 */

export const PC_STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
export const PC_DATA = 'https://planetarycomputer.microsoft.com/api/data/v1';
export const GIBS_CAPS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities';
export const SMAP_LAYER = 'SMAP_L4_Analyzed_Surface_Soil_Moisture';
const WINDOW_DAYS = 120;
const MAX_CLOUD = 60;

export interface Scene {
  id: string;
  grid: string;
  datetime: string;
  cloud: number;
}

interface StacFeature {
  id: string;
  properties: Record<string, unknown>;
}

/** Least cloudy scene per Sentinel-2 grid tile (ties: the newer one). */
export function bestScenes(features: StacFeature[]): Scene[] {
  const best = new Map<string, Scene>();
  for (const f of features) {
    const grid = String(f.properties['s2:mgrs_tile'] ?? '');
    const cloud = Number(f.properties['eo:cloud_cover']);
    const datetime = String(f.properties.datetime ?? '');
    if (!grid || !Number.isFinite(cloud) || !datetime) continue;
    const cur = best.get(grid);
    if (!cur || cloud < cur.cloud || (cloud === cur.cloud && datetime > cur.datetime)) best.set(grid, { id: f.id, grid, datetime, cloud });
  }
  return [...best.values()].sort((a, b) => a.grid.localeCompare(b.grid));
}

export function sentinelTileUrls(searchId: string): { visual: string; ndvi: string } {
  const base = `${PC_DATA}/mosaic/${searchId}/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?collection=sentinel-2-l2a`;
  return {
    visual: `${base}&assets=visual&nodata=0&format=webp`,
    // Red (B04) and near-infrared (B08); −0.2…0.9 spans bare ground and water to dense vegetation.
    ndvi: `${base}&expression=${encodeURIComponent('(B08-B04)/(B08+B04)')}&asset_as_band=true&rescale=-0.2,0.9&colormap_name=rdylgn&nodata=0&format=webp`,
  };
}

export async function buildSentinelMosaic(fetchImpl: typeof fetch, bbox: [number, number, number, number], now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const r = await fetchImpl(PC_STAC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox,
      datetime: `${since}/..`,
      query: { 'eo:cloud_cover': { lt: MAX_CLOUD } },
      sortby: [{ field: 'datetime', direction: 'desc' }],
      limit: 250,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Planetary Computer STAC → HTTP ${r.status}`);
  const scenes = bestScenes(((await r.json()) as { features: StacFeature[] }).features ?? []);
  if (!scenes.length) throw new Error('no Sentinel-2 scene under the cloud limit in the window');
  const reg = await fetchImpl(`${PC_DATA}/mosaic/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      'filter-lang': 'cql2-json',
      filter: { op: 'in', args: [{ property: 'id' }, scenes.map((s) => s.id)] },
      sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!reg.ok) throw new Error(`Planetary Computer mosaic register → HTTP ${reg.status}`);
  const searchId = String(((await reg.json()) as { searchid?: string }).searchid ?? '');
  if (!/^[0-9a-f]{16,64}$/.test(searchId)) throw new Error('Planetary Computer returned no search id');
  return { searchId, scenes, urls: sentinelTileUrls(searchId) };
}

/** Newest day GIBS offers for a layer, from the capabilities document. */
export function gibsDefaultDate(capabilities: string, layer: string): string | null {
  const i = capabilities.indexOf(`<ows:Identifier>${layer}</ows:Identifier>`);
  if (i < 0) return null;
  const block = capabilities.slice(i, i + 6000);
  const m = /<Default>(\d{4}-\d{2}-\d{2})<\/Default>/.exec(block);
  return m ? m[1]! : null;
}

export function smapTileUrl(date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${SMAP_LAYER}/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
}

export async function latestSmapDate(fetchImpl: typeof fetch): Promise<string> {
  const r = await fetchImpl(GIBS_CAPS, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`GIBS capabilities → HTTP ${r.status}`);
  const date = gibsDefaultDate(await r.text(), SMAP_LAYER);
  if (!date) throw new Error(`GIBS capabilities: no default date for ${SMAP_LAYER}`);
  return date;
}
