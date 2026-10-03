/**
 * GISTDA recurrent-flood map (southern Thailand, 2011–2020) at a point,
 * queried live from GISTDA's map service — the same data the map layer draws.
 * Verified 2026-10-03: the layer answers point queries with Freq and one
 * Y_<year> flag per year.
 */
export const FLOOD_FREQ_LAYER = 'https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood/flood_freq11_20/MapServer/0';
const YEARS = [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020];
const FIELD: Record<number, string> = Object.fromEntries(YEARS.map((y) => [y, y === 2017 ? 'Y2017' : `Y_${y}`]));

export function floodFrequencyUrl(lng: number, lat: number): string {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: ['Freq', ...Object.values(FIELD)].join(','),
    returnGeometry: 'false',
    f: 'json',
  });
  return `${FLOOD_FREQ_LAYER}/query?${q}`;
}

/** Years flooded at the point (0 when no polygon covers it), from GISTDA's own attributes. */
export function parseFloodFrequency(body: unknown): { years: number; flooded: number[] } | null {
  const b = body as { features?: { attributes?: Record<string, unknown> }[]; error?: unknown };
  if (!b || b.error || !Array.isArray(b.features)) return null;
  if (b.features.length === 0) return { years: 0, flooded: [] };
  // Overlapping polygons: keep the one with the most flood years.
  let best: { years: number; flooded: number[] } = { years: 0, flooded: [] };
  for (const f of b.features) {
    const a = f.attributes ?? {};
    const flooded = YEARS.filter((y) => Number(a[FIELD[y]!]) === 1);
    const years = Number.isFinite(Number(a.Freq)) ? Number(a.Freq) : flooded.length;
    if (years > best.years) best = { years, flooded };
  }
  return best;
}

export async function floodFrequencyAt(fetchImpl: typeof fetch, lng: number, lat: number): Promise<{ years: number; flooded: number[] } | null> {
  try {
    const r = await fetchImpl(floodFrequencyUrl(lng, lat), { signal: AbortSignal.timeout(3500) });
    return r.ok ? parseFloodFrequency(await r.json()) : null;
  } catch {
    return null;
  }
}
