/**
 * Esri World Imagery at the deepest level that really exists.
 *
 * Over Nakhon Si Thammarat Esri has z18 (~0.6 m) everywhere and z19
 * (~0.3 m) only in some towns (city, Pak Phanang; checked 2026-10-02 with
 * the service's tilemap). Where z19 is missing Esri still answers 200 with
 * a grey "Map data not yet available" picture, so a plain z19 source would
 * paint grey squares over most of the province. This protocol asks the
 * service's tilemap (one request per 32×32 block of tiles) whether a z19
 * tile exists, and otherwise enlarges the matching quarter of the z18 tile.
 */

export const ESRI_IMAGERY_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
export const ESRI_PROTOCOL = 'esri-imagery';
/** Deepest level requested from Esri. */
export const ESRI_MAX_ZOOM = 19;
/** Levels up to here exist across the province, so they are fetched without a check. */
export const ESRI_ALWAYS_AVAILABLE_ZOOM = 18;
const BLOCK = 32;
const TILE_PX = 256;

export function esriTileUrl(z: number, x: number, y: number): string {
  return `${ESRI_IMAGERY_BASE}/tile/${z}/${y}/${x}`;
}

/** Top-left tile (column, row) of the tilemap block that holds x, y. */
export function blockOrigin(x: number, y: number): [number, number] {
  return [x - (x % BLOCK), y - (y % BLOCK)];
}

export function tilemapUrl(z: number, col0: number, row0: number): string {
  return `${ESRI_IMAGERY_BASE}/tilemap/${z}/${row0}/${col0}/${BLOCK}/${BLOCK}`;
}

export interface Tilemap {
  location: { left: number; top: number; width: number; height: number };
  data: number[];
}

/** Whether the tilemap marks tile x, y as present (1). */
export function tileInTilemap(tm: Tilemap, x: number, y: number): boolean {
  const { left, top, width, height } = tm.location;
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  return tm.data[(y - top) * width + (x - left)] === 1;
}

/** Where tile z/x/y lies inside its ancestor at level pz: ancestor tile and source square in pixels. */
export function ancestorCrop(z: number, x: number, y: number, pz: number): { x: number; y: number; sx: number; sy: number; size: number } {
  const scale = 2 ** (z - pz);
  const px = Math.floor(x / scale);
  const py = Math.floor(y / scale);
  const size = TILE_PX / scale;
  return { x: px, y: py, sx: (x - px * scale) * size, sy: (y - py * scale) * size, size };
}

export function parseProtocolUrl(url: string): { z: number; x: number; y: number } | null {
  const m = /^esri-imagery:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  return m ? { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) } : null;
}

// ---------------------------------------------------------------- browser loader

const tilemaps = new Map<string, Promise<Tilemap | null>>();

async function exists(z: number, x: number, y: number): Promise<boolean> {
  if (z <= ESRI_ALWAYS_AVAILABLE_ZOOM) return true;
  const [col0, row0] = blockOrigin(x, y);
  const key = `${z}/${col0}/${row0}`;
  if (!tilemaps.has(key)) {
    tilemaps.set(
      key,
      fetch(tilemapUrl(z, col0, row0))
        .then((r) => (r.ok ? (r.json() as Promise<Tilemap>) : null))
        .catch(() => null),
    );
  }
  const tm = await tilemaps.get(key)!;
  return tm ? tileInTilemap(tm, x, y) : false;
}

async function enlargeFromAncestor(z: number, x: number, y: number, signal: AbortSignal): Promise<ArrayBuffer> {
  const c = ancestorCrop(z, x, y, ESRI_ALWAYS_AVAILABLE_ZOOM);
  const r = await fetch(esriTileUrl(ESRI_ALWAYS_AVAILABLE_ZOOM, c.x, c.y), { signal });
  if (!r.ok) throw new Error(`imagery ${r.status}`);
  const bitmap = await createImageBitmap(await r.blob());
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(TILE_PX, TILE_PX);
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, c.sx, c.sy, c.size, c.size, 0, 0, TILE_PX, TILE_PX);
  bitmap.close();
  const blob =
    canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.92))
      : await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return blob.arrayBuffer();
}

/** MapLibre protocol handler for `esri-imagery://{z}/{x}/{y}` tiles. */
export async function loadEsriTile(params: { url: string }, abort: AbortController): Promise<{ data: ArrayBuffer }> {
  const t = parseProtocolUrl(params.url);
  if (!t) throw new Error(`bad imagery url ${params.url}`);
  if (await exists(t.z, t.x, t.y)) {
    const r = await fetch(esriTileUrl(t.z, t.x, t.y), { signal: abort.signal });
    if (r.ok) return { data: await r.arrayBuffer() };
  }
  return { data: await enlargeFromAncestor(t.z, t.x, t.y, abort.signal) };
}
