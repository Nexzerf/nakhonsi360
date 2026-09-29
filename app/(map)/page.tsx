import { getDb, withTimeout } from '@/lib/db/client';
import { provinceExtent } from '@/lib/db/queries';
import type { BBox } from '@/lib/types';
import { MapApp } from '@/components/MapApp';

export const dynamic = 'force-dynamic';

/**
 * The first screen is the map. The initial view is the province extent
 * derived from the imported TH80 polygon; without it the map shows Thailand
 * and says why, rather than guessing a bounding box.
 */
export default async function MapPage() {
  let bounds: BBox | null = null;
  const sql = getDb();
  if (sql) {
    try {
      bounds = (await withTimeout(provinceExtent(sql), 2000))?.bbox ?? null;
    } catch (err) {
      console.error('[page] province extent unavailable', err);
    }
  }
  return <MapApp initialBounds={bounds} />;
}
