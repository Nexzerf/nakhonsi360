/**
 * MapLibre style pieces: basemaps and overlay layers built from the layer
 * registry. Overlay ids are prefixed so they can be carried across basemap
 * switches.
 */
import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import type { BasemapId, LayerDef } from '@/lib/registry/layers';
import { COLORS } from '@/lib/registry/layers';
import type { Locale } from '@/lib/freshness/format';

export const OVERLAY_PREFIX = 'n360-';
export const SELECTION_SOURCE = `${OVERLAY_PREFIX}selection`;
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const LABEL_FONT = ['Noto Sans Regular'];

export const BASEMAP_STYLE_URL: Partial<Record<BasemapId, string>> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

function rasterStyle(id: string, tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { [id]: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#dfe3e8' } },
      { id, type: 'raster', source: id },
    ],
  };
}

const ESRI_IMAGERY_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
const ESRI_IMAGERY_ATTRIBUTION =
  'ภาพดาวเทียม © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noopener">Esri World Imagery</a> (Esri, Maxar, Earthstar Geographics, GIS User Community)';

/** Basemap label layers that are text only (no icons), drawn over the imagery. */
const SATELLITE_LABEL_LAYER = /^(label_|highway-name|water_name|waterway_line_label)/;

/**
 * Satellite view: Esri World Imagery (sub-metre in towns, up to z18), with
 * place, road and water names from the vector basemap on top when it is
 * available (white text, dark halo, so names stay readable on imagery).
 */
export function satelliteStyle(labels?: StyleSpecification): StyleSpecification {
  const style = rasterStyle('esri-imagery', ESRI_IMAGERY_TILES, ESRI_IMAGERY_ATTRIBUTION, 18);
  if (!labels) return style;
  const textLayers = labels.layers.filter(
    (l): l is Extract<LayerSpecification, { type: 'symbol' }> => l.type === 'symbol' && SATELLITE_LABEL_LAYER.test(l.id) && !(l.layout && 'icon-image' in l.layout),
  );
  for (const l of textLayers) if (labels.sources[l.source] && !style.sources[l.source]) style.sources[l.source] = labels.sources[l.source]!;
  return {
    ...style,
    glyphs: labels.glyphs ?? style.glyphs,
    layers: [
      ...style.layers,
      ...textLayers.map((l) => ({
        ...l,
        paint: { ...l.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(15,23,42,0.85)', 'text-halo-width': 1.6, 'text-halo-blur': 0.4 },
      })),
    ],
  };
}

export function basemapStyle(id: BasemapId): StyleSpecification | string {
  if (id === 'satellite') return satelliteStyle();
  if (id === 'terrain') {
    return rasterStyle(
      'opentopomap',
      ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      'ข้อมูล © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM · รูปแบบ © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
      17,
    );
  }
  return BASEMAP_STYLE_URL[id]!;
}

/** Used when the basemap cannot be loaded: overlays still work on a plain background. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {},
  // Transparent: the container's CSS background (light/dark aware) shows through.
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }],
};

/** Zoom at which labels reach their largest size. */
const LABEL_GROW_TO_ZOOM = 17;

/**
 * Basemap label size that keeps growing as you zoom in. Stock styles show
 * big city names at overview zooms and only 9-12 px village, road and canal
 * names further in, so text seemed to shrink when zooming in. Sizes are
 * scaled up a little and continue to grow until LABEL_GROW_TO_ZOOM.
 */
export function readableTextSize(size: unknown): unknown {
  const up = (v: unknown) => (typeof v === 'number' ? Math.round(Math.max(v * 1.15, 11) * 10) / 10 : v);
  const grow = (stops: [number, unknown][]) => {
    const last = stops[stops.length - 1]!;
    const lastSize = typeof last[1] === 'number' ? last[1] : null;
    if (lastSize !== null && last[0] < LABEL_GROW_TO_ZOOM) stops.push([LABEL_GROW_TO_ZOOM, Math.max(lastSize * 1.25, 15)]);
    return stops;
  };
  if (typeof size === 'number') return ['interpolate', ['linear'], ['zoom'], 10, up(size), LABEL_GROW_TO_ZOOM, Math.max((up(size) as number) * 1.3, 15)];
  if (Array.isArray(size) && size[0] === 'interpolate' && Array.isArray(size[2]) && size[2][0] === 'zoom') {
    const stops: [number, unknown][] = [];
    for (let i = 3; i + 1 < size.length; i += 2) stops.push([size[i] as number, up(size[i + 1])]);
    return [size[0], size[1], size[2], ...grow(stops).flat()];
  }
  if (size && typeof size === 'object' && !Array.isArray(size) && Array.isArray((size as { stops?: unknown }).stops)) {
    const stops = ((size as { stops: [number, unknown][] }).stops).map(([z, v]) => [z, up(v)] as [number, unknown]);
    return ['interpolate', ['linear'], ['zoom'], ...grow(stops).flat()];
  }
  return size;
}

/** Show Thai (or English) names on the OpenMapTiles basemap labels, sized to stay readable. */
export function localizeBasemap(style: StyleSpecification, locale: Locale): StyleSpecification {
  const field = locale === 'th' ? ['coalesce', ['get', 'name:th'], ['get', 'name']] : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
  return {
    ...style,
    layers: style.layers.map((l) => {
      if (l.id.startsWith(OVERLAY_PREFIX) || l.type !== 'symbol' || !l.layout || !('text-field' in l.layout)) return l;
      const size = readableTextSize(l.layout['text-size'] ?? 16);
      return { ...l, layout: { ...l.layout, 'text-field': field as never, 'text-size': size as never } };
    }),
  };
}

/** Our own overlay labels: readable on phones and growing with zoom. */
const OVERLAY_LABEL_SIZE = ['interpolate', ['linear'], ['zoom'], 10, 12.5, 14, 14, 17, 16] as never;

export function overlaySourceId(layerId: string) {
  return `${OVERLAY_PREFIX}src-${layerId}`;
}

export function vectorSource(layer: LayerDef, origin: string, pmtilesBase: string | undefined): SourceSpecification {
  if (pmtilesBase) return { type: 'vector', url: `pmtiles://${pmtilesBase.replace(/\/$/, '')}/${layer.id}.pmtiles` };
  return { type: 'vector', tiles: [`${origin}/api/tiles/${layer.id}/{z}/{x}/{y}`], minzoom: 0, maxzoom: 14 };
}

/** MapLibre layers for one registry layer. The first id is the "main" layer used for hit-testing. */
export function overlayLayers(layer: LayerDef, locale: Locale): LayerSpecification[] {
  const source = overlaySourceId(layer.id);
  const sl = layer.sourceLayer!;
  const id = (s: string) => `${OVERLAY_PREFIX}${layer.id}${s}`;
  const nameField = (locale === 'en' ? ['coalesce', ['get', 'name_en'], ['get', 'name_th']] : ['coalesce', ['get', 'name_th'], ['get', 'name_en']]) as never;
  const base = { source, 'source-layer': sl, minzoom: layer.minzoom };

  switch (layer.id) {
    case 'admin-province':
      return [
        { ...base, id: id(''), type: 'line', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 } },
        { ...base, id: id('-line'), type: 'line', paint: { 'line-color': COLORS.province, 'line-width': 2.5 } },
      ];
    case 'admin-district':
      return [{ ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.district, 'line-width': 1.5, 'line-dasharray': [4, 2] } }];
    case 'admin-subdistrict':
      return [{ ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.subdistrict, 'line-width': 1, 'line-dasharray': [2, 2] } }];
    case 'villages':
      return [
        { ...base, id: id(''), type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 16, 6], 'circle-color': COLORS.village, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
        {
          ...base,
          id: id('-label'),
          type: 'symbol',
          layout: { 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': OVERLAY_LABEL_SIZE, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
          paint: { 'text-color': '#3b1d0e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        },
      ];
    case 'water-rivers':
      return [
        { ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 12, 2.5, 16, 5] } },
        {
          ...base,
          id: id('-label'),
          type: 'symbol',
          minzoom: 11,
          layout: { 'symbol-placement': 'line', 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': OVERLAY_LABEL_SIZE },
          paint: { 'text-color': COLORS.river, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        },
      ];
    case 'water-streams':
      return [{ ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.stream, 'line-width': 1 } }];
    case 'water-canals':
      return [
        { ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.canal, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 16, 3] } },
        {
          ...base,
          id: id('-label'),
          type: 'symbol',
          minzoom: 13,
          layout: { 'symbol-placement': 'line', 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': OVERLAY_LABEL_SIZE },
          paint: { 'text-color': COLORS.canal, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        },
      ];
    case 'water-reservoirs':
      return [
        { ...base, id: id(''), type: 'fill', paint: { 'fill-color': '#7fb3e0', 'fill-opacity': 0.6 } },
        { ...base, id: id('-outline'), type: 'line', paint: { 'line-color': COLORS.waterOutline, 'line-width': 1 } },
      ];
    case 'water-bodies':
      return [
        { ...base, id: id(''), type: 'fill', paint: { 'fill-color': COLORS.water, 'fill-opacity': 0.6 } },
        { ...base, id: id('-outline'), type: 'line', paint: { 'line-color': COLORS.waterOutline, 'line-width': 0.75 } },
      ];
    case 'roads':
      return [
        {
          ...base,
          id: id(''),
          type: 'line',
          paint: {
            'line-color': COLORS.road,
            'line-width': ['match', ['get', 'kind'], 'road_major', ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 4], ['interpolate', ['linear'], ['zoom'], 14, 0.8, 16, 2]],
          },
        },
      ];
    case 'coastline':
      return [{ ...base, id: id(''), type: 'line', paint: { 'line-color': COLORS.coastline, 'line-width': 1.5 } }];
    default:
      return [];
  }
}

/** Highlight layer for a selected admin area or village. */
export function highlightLayers(layer: LayerDef, key: string, value: string | number): LayerSpecification[] {
  const base = { source: overlaySourceId(layer.id), 'source-layer': layer.sourceLayer!, filter: ['==', ['get', key], value] as never };
  const id = `${OVERLAY_PREFIX}highlight-${layer.id}`;
  if (layer.legend.type === 'circle') {
    return [{ ...base, id, type: 'circle', paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#b8892e', 'circle-stroke-width': 3 } }];
  }
  return [
    { ...base, id: `${id}-fill`, type: 'fill', paint: { 'fill-color': '#b8892e', 'fill-opacity': 0.08 } },
    { ...base, id, type: 'line', paint: { 'line-color': '#b8892e', 'line-width': 3 } },
  ];
}

export function selectionLayers(): LayerSpecification[] {
  return [
    { id: `${OVERLAY_PREFIX}selection-halo`, type: 'circle', source: SELECTION_SOURCE, paint: { 'circle-radius': 12, 'circle-color': '#b8892e', 'circle-opacity': 0.18 } },
    { id: `${OVERLAY_PREFIX}selection`, type: 'circle', source: SELECTION_SOURCE, paint: { 'circle-radius': 6, 'circle-color': '#b8892e', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
  ];
}

/** GeoJSON source for a live station layer: clustered at province zooms (≤ 9). */
export function stationSource(layer: LayerDef, origin: string): SourceSpecification {
  return { type: 'geojson', data: `${origin}/api/layers/${layer.id}`, cluster: true, clusterMaxZoom: 9, clusterRadius: 36 };
}

/**
 * Station layers. The fill colour is the source's own official status colour
 * when it publishes one (ThaiWater water level); otherwise a neutral layer
 * colour with no meaning attached. Values are labelled from zoom 10.
 */
export function stationLayers(layer: LayerDef, locale: Locale): LayerSpecification[] {
  const source = overlaySourceId(layer.id);
  const id = (s: string) => `${OVERLAY_PREFIX}${layer.id}${s}`;
  const neutral = layer.legend.type === 'circle' ? layer.legend.color : '#475569';
  const unitLabel = layer.variable === 'rain_24h' ? (locale === 'th' ? ' มม.' : ' mm') : layer.variable === 'water_level' ? (locale === 'th' ? ' ม.รทก.' : ' m MSL') : '';
  return [
    {
      id: id('-cluster'),
      type: 'circle',
      source,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': layer.variable === 'rain_24h' ? '#eff6ff' : '#f8fafc',
        'circle-stroke-color': neutral,
        'circle-stroke-width': 2,
        'circle-radius': ['step', ['get', 'point_count'], 12, 10, 15, 30, 19],
      },
    },
    {
      id: id('-cluster-count'),
      type: 'symbol',
      source,
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true },
      paint: { 'text-color': '#1f2937' },
    },
    {
      id: id(''),
      type: 'circle',
      source,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8],
        'circle-color': ['coalesce', ['get', 'official_color'], neutral],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.75,
      },
    },
    {
      id: id('-label'),
      type: 'symbol',
      source,
      minzoom: 10,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['concat', ['number-format', ['get', 'value'], { 'max-fraction-digits': 2 }], unitLabel],
        'text-font': ['Noto Sans Regular'],
        'text-size': OVERLAY_LABEL_SIZE,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
}

/** GeoJSON source for a live hazard-event layer (not clustered: events are few and far apart). */
export function hazardSource(layer: LayerDef, origin: string): SourceSpecification {
  return { type: 'geojson', data: `${origin}/api/layers/${layer.id}` };
}

/**
 * Earthquake epicentres. Circle size follows the magnitude USGS publishes;
 * one colour, because no severity class is published with the event.
 */
export function earthquakeLayers(layer: LayerDef): LayerSpecification[] {
  const source = overlaySourceId(layer.id);
  const id = (s: string) => `${OVERLAY_PREFIX}${layer.id}${s}`;
  const color = layer.legend.type === 'circle' ? layer.legend.color : '#7c3aed';
  return [
    {
      id: id(''),
      type: 'circle',
      source,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mag'], 4], 4, 4, 5, 7, 6, 11, 7, 16, 8, 22],
        'circle-color': color,
        'circle-opacity': 0.55,
        'circle-stroke-color': color,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: id('-label'),
      type: 'symbol',
      source,
      layout: {
        'text-field': ['concat', 'M', ['number-format', ['get', 'mag'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }]],
        'text-font': ['Noto Sans Regular'],
        'text-size': OVERLAY_LABEL_SIZE,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#4c1d95', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
}

/** Citizen reports (polled; not clustered so urgent reports stay visible). */
export function reportSource(origin: string): SourceSpecification {
  return { type: 'geojson', data: `${origin}/api/reports?format=geojson&hours=72` };
}

/**
 * Report markers: colour is the urgency the reporter chose; closed reports
 * are grey. Ring = still open.
 */
export function reportLayers(layer: LayerDef, urgencyColors: Record<string, string>, openStatuses: string[], locale: Locale = 'th'): LayerSpecification[] {
  const source = overlaySourceId(layer.id);
  const id = (s: string) => `${OVERLAY_PREFIX}${layer.id}${s}`;
  const isOpen = ['in', ['get', 'status'], ['literal', openStatuses]];
  const color = ['case', isOpen, ['match', ['get', 'urgency'], ...Object.entries(urgencyColors).flat(), '#64748b'], '#9ca3af'];
  return [
    {
      id: id('-halo'),
      type: 'circle',
      source,
      filter: isOpen as never,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 14], 'circle-color': color as never, 'circle-opacity': 0.22 },
    },
    {
      id: id(''),
      type: 'circle',
      source,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8],
        'circle-color': color as never,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
    {
      // Latest water level people reported here, e.g. "~100 ซม.".
      id: id('-depth'),
      type: 'symbol',
      source,
      minzoom: 11,
      filter: ['all', isOpen, ['has', 'depth_cm'], ['!=', ['get', 'depth_cm'], null]] as never,
      layout: {
        'text-field': ['concat', '~', ['to-string', ['get', 'depth_cm']], locale === 'th' ? ' ซม.' : ' cm'],
        'text-font': ['Noto Sans Regular'],
        'text-size': OVERLAY_LABEL_SIZE,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#0e5f73', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
  ];
}

export function cctvSource(origin: string): SourceSpecification {
  return { type: 'geojson', data: `${origin}/api/cctv?format=geojson` };
}

/**
 * City CCTV cameras, coloured by type. Offline cameras are faded; the one
 * playing in the panel gets a dark ring. `mode` 'all' shows every type.
 */
export function cctvLayers(layer: LayerDef, modeColors: Record<string, string>, otherColor: string, mode: string, selectedId: string | null): LayerSpecification[] {
  const source = overlaySourceId(layer.id);
  const id = (x: string) => `${OVERLAY_PREFIX}${layer.id}${x}`;
  const filter = (mode === 'all' ? ['has', 'id'] : ['==', ['get', 'mode'], mode]) as never;
  const color = ['match', ['get', 'mode'], ...Object.entries(modeColors).flat(), otherColor] as never;
  const offline = ['==', ['get', 'status'], 'offline'];
  return [
    {
      id: id('-selected'),
      type: 'circle',
      source,
      filter: ['==', ['get', 'id'], selectedId ?? ''] as never,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 16, 16], 'circle-color': '#1d1912', 'circle-opacity': 0.9 },
    },
    {
      id: id(''),
      type: 'circle',
      source,
      filter,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13, 6.5, 16, 9],
        'circle-color': color,
        'circle-opacity': ['case', offline, 0.35, 1] as never,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.8,
      },
    },
  ];
}

export const DRAFT_SOURCE = `${OVERLAY_PREFIX}report-draft`;

/** Where the report being written will be placed. */
export function draftLayers(): LayerSpecification[] {
  return [
    { id: `${OVERLAY_PREFIX}report-draft-halo`, type: 'circle', source: DRAFT_SOURCE, paint: { 'circle-radius': 16, 'circle-color': '#dc2626', 'circle-opacity': 0.2 } },
    { id: `${OVERLAY_PREFIX}report-draft`, type: 'circle', source: DRAFT_SOURCE, paint: { 'circle-radius': 7, 'circle-color': '#dc2626', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } },
  ];
}

// ---------------------------------------------------------------- 3D view

export const TERRAIN_SOURCE = 'n3d-terrain';
export const HILLSHADE_SOURCE = 'n3d-hillshade-dem';
export const BUILDINGS_SOURCE = 'n3d-buildings';
export const BUILDINGS_LAYER = 'n3d-buildings';
export const HILLSHADE_LAYER = 'n3d-hillshade';

const TERRARIUM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];

/** Elevation (Mapzen Terrain Tiles on AWS Open Data). Two copies: one drives the 3D surface, one the hillshade. */
export function terrainSource(): SourceSpecification {
  return { type: 'raster-dem', tiles: TERRARIUM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 14 };
}

/** OpenStreetMap buildings in the OpenMapTiles schema, served by OpenFreeMap. */
export function buildingsSource(): SourceSpecification {
  return { type: 'vector', url: 'https://tiles.openfreemap.org/planet' };
}

export function hillshadeLayer(): LayerSpecification {
  return {
    id: HILLSHADE_LAYER,
    type: 'hillshade',
    source: HILLSHADE_SOURCE,
    paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#3b2f1d', 'hillshade-highlight-color': '#fff8e8' },
  };
}

/**
 * Buildings extruded to the height OSM gives (render_height), else one
 * storey. Warm stone, like the city's old walls; heights are as mapped, not
 * modelled.
 */
export function buildingsLayer(dark: boolean): LayerSpecification {
  return {
    id: BUILDINGS_LAYER,
    type: 'fill-extrusion',
    source: BUILDINGS_SOURCE,
    'source-layer': 'building',
    minzoom: 13,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': dark ? '#5a4c37' : '#e6d9bf',
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, ['coalesce', ['get', 'render_height'], 4]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.88,
    },
  };
}

// ---------------------------------------------------------------- province-only view

export const MASK_SOURCE = 'n360mask-src';
export const MASK_LAYER = 'n360mask-fill';
export const MASK_EDGE_LAYER = 'n360mask-edge';

export function maskSource(origin: string): SourceSpecification {
  return { type: 'geojson', data: `${origin}/api/province/mask` };
}

/**
 * Covers everything outside the province so only Nakhon Si Thammarat is
 * shown, with a soft gold glow along the boundary. Drawn above the basemap
 * (and 3D buildings) but below every data overlay.
 */
export function maskLayers(basemap: BasemapId): LayerSpecification[] {
  const light = basemap === 'light' || basemap === 'terrain';
  return [
    {
      id: MASK_LAYER,
      type: 'fill',
      source: MASK_SOURCE,
      paint: { 'fill-color': light ? '#ebe8e1' : '#14110c', 'fill-opacity': light ? 0.94 : 0.9, 'fill-antialias': false },
    },
    {
      id: MASK_EDGE_LAYER,
      type: 'line',
      source: MASK_SOURCE,
      paint: { 'line-color': '#b8892e', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 5, 12, 10], 'line-blur': ['interpolate', ['linear'], ['zoom'], 7, 5, 12, 9], 'line-opacity': light ? 0.35 : 0.5 },
    },
  ];
}
