import { unstable_cache } from 'next/cache';
import { getDb, withTimeout } from '@/lib/db/client';
import { provinceExtent } from '@/lib/db/queries';
import type { BBox } from '@/lib/types';
import { MapApp } from '@/components/MapApp';

export const dynamic = 'force-dynamic';

/**
 * The extent changes only when boundaries are re-imported, so it is cached
 * for an hour instead of costing a database round trip before every page.
 * Failures throw, and thrown results are not cached.
 */
const cachedProvinceBounds = unstable_cache(
  async (): Promise<BBox> => {
    const sql = getDb();
    if (!sql) throw new Error('DATABASE_URL not set');
    const extent = await withTimeout(provinceExtent(sql), 2000);
    if (!extent) throw new Error('province extent not imported');
    return extent.bbox;
  },
  ['province-extent-v1'],
  { revalidate: 3600 },
);

/**
 * The first screen is the map. The initial view is the province extent
 * derived from the imported TH80 polygon; without it the map shows Thailand
 * and says why, rather than guessing a bounding box.
 */
export default async function MapPage() {
  let bounds: BBox | null = null;
  if (getDb()) {
    try {
      bounds = await cachedProvinceBounds();
    } catch (err) {
      console.error('[page] province extent unavailable', err);
    }
  }
  return <MapApp initialBounds={bounds} />;
}
