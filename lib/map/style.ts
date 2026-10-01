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

export function basemapStyle(id: BasemapId): StyleSpecification | string {
  if (id === 'satellite') {
    return rasterStyle(
      'eox-s2cloudless',
      ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
      '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)',
      15,
    );
  }
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

/** Show Thai (or English) names on the OpenMapTiles basemap labels. */
export function localizeBasemap(style: StyleSpecification, locale: Locale): StyleSpecification {
  const field = locale === 'th' ? ['coalesce', ['get', 'name:th'], ['get', 'name']] : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
  return {
    ...style,
    layers: style.layers.map((l) => {
      if (l.id.startsWith(OVERLAY_PREFIX) || l.type !== 'symbol' || !l.layout || !('text-field' in l.layout)) return l;
      return { ...l, layout: { ...l.layout, 'text-field': field as never } };
    }),
  };
}

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
          layout: { 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': 12, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true },
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
          layout: { 'symbol-placement': 'line', 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': 12 },
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
          layout: { 'symbol-placement': 'line', 'text-field': nameField, 'text-font': LABEL_FONT, 'text-size': 11 },
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
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': true },
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
        'text-size': 11,
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
        'text-size': 11,
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
export function reportLayers(layer: LayerDef, urgencyColors: Record<string, string>, openStatuses: string[]): LayerSpecification[] {
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
