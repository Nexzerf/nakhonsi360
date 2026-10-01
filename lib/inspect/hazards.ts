/**
 * Hazards card: recent earthquakes (USGS) with their distance from the
 * selected point. Events are listed as published; no felt intensity or risk
 * is derived here.
 */
import { USGS_MIN_MAGNITUDE, USGS_RADIUS_KM, USGS_WINDOW_DAYS } from '@/lib/adapters/usgs';
import type { EarthquakeRow } from '@/lib/db/queries';
import type { EarthquakeEvent, EarthquakeSummary } from '@/lib/types';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function toEarthquake(r: EarthquakeRow & { distance_m: number }): EarthquakeEvent | null {
  const p = r.properties ?? {};
  const mag = num(p.mag);
  if (mag === null) return null;
  return {
    sourceId: r.source_id,
    id: r.feature_key,
    mag,
    magType: str(p.mag_type),
    place: str(p.place),
    depthKm: num(p.depth_km),
    status: str(p.status),
    url: str(p.url),
    lng: r.lng,
    lat: r.lat,
    observedAt: new Date(r.observed_at).toISOString(),
    fetchedAt: new Date(r.fetched_at).toISOString(),
    distanceM: r.distance_m,
  };
}

/** @param rows events in the window, newest first */
export function summarizeEarthquakes(rows: (EarthquakeRow & { distance_m: number })[], recentLimit = 5): EarthquakeSummary {
  const events = rows.map(toEarthquake).filter((e): e is EarthquakeEvent => e !== null);
  const nearest = events.reduce<EarthquakeEvent | null>((a, b) => (a === null || b.distanceM < a.distanceM ? b : a), null);
  return {
    radiusKm: USGS_RADIUS_KM,
    minMagnitude: USGS_MIN_MAGNITUDE,
    windowDays: USGS_WINDOW_DAYS,
    total: events.length,
    recent: events.slice(0, recentLimit),
    nearest,
  };
}
