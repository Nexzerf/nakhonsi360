/**
 * Classify OpenStreetMap features (as produced by GDAL's OSM driver with
 * scripts/osmconf.ini) into the kinds stored in `osm_features`.
 */
export type OsmLayer = 'points' | 'lines' | 'multipolygons';

export type OsmKind =
  | 'river' | 'stream' | 'canal' | 'drain' | 'water' | 'reservoir'
  | 'road_major' | 'road_minor' | 'coastline' | 'place';

const MAJOR_ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);
const MINOR_ROADS = new Set(['tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street']);
const PLACES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'isolated_dwelling']);

const LAUNDERED: Record<string, string> = { name_th: 'name:th', name_en: 'name:en' };

/** Merge explicit attributes with the JSON `other_tags` field. */
export function osmTags(props: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {};
  const other = props.other_tags;
  if (typeof other === 'string' && other.trim().startsWith('{')) {
    try {
      Object.assign(tags, JSON.parse(other) as Record<string, string>);
    } catch {
      // Malformed other_tags: fall back to explicit attributes only.
    }
  } else if (other && typeof other === 'object') {
    Object.assign(tags, other as Record<string, string>);
  }
  for (const [k, v] of Object.entries(props)) {
    if (k === 'other_tags' || k === 'osm_id' || k === 'osm_way_id' || k === 'z_order') continue;
    // GDAL launders "name:th" → "name_th" for explicit attributes; restore the OSM key.
    if (typeof v === 'string' && v !== '') tags[LAUNDERED[k] ?? k] = v;
  }
  return tags;
}

export function classifyOsm(layer: OsmLayer, tags: Record<string, string>): { kind: OsmKind; subkind: string } | null {
  if (layer === 'points') {
    return tags.place && PLACES.has(tags.place) ? { kind: 'place', subkind: tags.place } : null;
  }
  if (layer === 'lines') {
    const w = tags.waterway;
    if (w === 'river') return { kind: 'river', subkind: w };
    if (w === 'stream') return { kind: 'stream', subkind: w };
    if (w === 'canal') return { kind: 'canal', subkind: w };
    if (w === 'drain' || w === 'ditch') return { kind: 'drain', subkind: w };
    if (tags.natural === 'coastline') return { kind: 'coastline', subkind: 'coastline' };
    const h = tags.highway;
    if (h && MAJOR_ROADS.has(h)) return { kind: 'road_major', subkind: h };
    if (h && MINOR_ROADS.has(h)) return { kind: 'road_minor', subkind: h };
    return null;
  }
  // multipolygons
  if (tags.landuse === 'reservoir' || tags.water === 'reservoir' || tags.landuse === 'basin') {
    return { kind: 'reservoir', subkind: tags.water ?? tags.landuse ?? 'reservoir' };
  }
  if (tags.natural === 'water' || tags.waterway === 'riverbank') {
    return { kind: 'water', subkind: tags.water ?? tags.waterway ?? 'water' };
  }
  return null;
}

/** OSM type and id from GDAL's osm_id / osm_way_id fields. */
export function osmIdentity(layer: OsmLayer, props: Record<string, unknown>): { osmType: 'node' | 'way' | 'relation'; osmId: number } | null {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  if (layer === 'points') {
    const id = num(props.osm_id);
    return id !== null && Number.isFinite(id) ? { osmType: 'node', osmId: id } : null;
  }
  if (layer === 'lines') {
    const id = num(props.osm_id);
    return id !== null && Number.isFinite(id) ? { osmType: 'way', osmId: id } : null;
  }
  const rel = num(props.osm_id);
  if (rel !== null && Number.isFinite(rel)) return { osmType: 'relation', osmId: rel };
  const way = num(props.osm_way_id);
  return way !== null && Number.isFinite(way) ? { osmType: 'way', osmId: way } : null;
}
