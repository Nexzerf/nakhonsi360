import { NextResponse, type NextRequest } from 'next/server';
import { CCTV_BASE, parseCameras, type CctvResponse } from '@/lib/cctv/schema';

export const dynamic = 'force-dynamic';

async function getJson(path: string): Promise<unknown> {
  const r = await fetch(`${CCTV_BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Nakhonsi360 (environmental map of Nakhon Si Thammarat)' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

/**
 * Camera list + online status from the municipality, merged and validated.
 * ?format=geojson for the map. Cached briefly at the CDN: status changes are
 * slow and the municipality's server should not see one request per visitor.
 */
export async function GET(req: NextRequest) {
  const asGeo = req.nextUrl.searchParams.get('format') === 'geojson';
  try {
    const [cams, status] = await Promise.all([getJson('/api/cameras/public'), getJson('/api/camera-status').catch(() => ({}))]);
    const { cameras, rejected } = parseCameras(cams, status);
    const fetchedAt = new Date().toISOString();
    const headers = { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' };
    if (asGeo) {
      return NextResponse.json(
        {
          type: 'FeatureCollection',
          fetchedAt,
          features: cameras.map((c) => ({
            type: 'Feature',
            id: c.id,
            properties: { id: c.id, name: c.name, mode: c.mode, status: c.status ?? 'unknown' },
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
          })),
        },
        { headers },
      );
    }
    return NextResponse.json({ status: 'ok', fetchedAt, cameras, rejected } satisfies CctvResponse, { headers });
  } catch (err) {
    console.error('[api/cctv]', err);
    const body: CctvResponse = { status: 'unavailable', fetchedAt: new Date().toISOString(), cameras: [], rejected: 0 };
    return NextResponse.json(asGeo ? { type: 'FeatureCollection', features: [] } : body, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
