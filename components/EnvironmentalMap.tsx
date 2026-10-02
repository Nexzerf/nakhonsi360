'use client';

import maplibregl, { type Map as MlMap, type StyleSpecification, type GeoJSONSource } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapStore, useT } from '@/lib/state/store';
import { useSources, layerHasData, useIsMobile } from '@/lib/hooks';
import { getLayer, type LayerDef } from '@/lib/registry/layers';
import { findSource } from '@/lib/registry/sources';
import { OPEN_STATUSES, URGENCIES } from '@/lib/reports/schema';
import { CCTV_MODES, CCTV_OTHER_COLOR } from '@/lib/cctv/schema';
import {
  FALLBACK_STYLE,
  OVERLAY_PREFIX,
  SELECTION_SOURCE,
  basemapStyle,
  BASEMAP_STYLE_URL,
  satelliteStyle,
  cctvLayers,
  cctvSource,
  BUILDINGS_LAYER,
  BUILDINGS_SOURCE,
  buildingsLayer,
  buildingsSource,
  HILLSHADE_LAYER,
  HILLSHADE_SOURCE,
  hillshadeLayer,
  TERRAIN_SOURCE,
  terrainSource,
  DRAFT_SOURCE,
  draftLayers,
  earthquakeLayers,
  hazardSource,
  highlightLayers,
  localizeBasemap,
  MASK_LAYER,
  MASK_SOURCE,
  maskLayers,
  maskSource,
  overlayLayers,
  overlaySourceId,
  reportLayers,
  reportSource,
  selectionLayers,
  stationLayers,
  stationSource,
  vectorSource,
} from '@/lib/map/style';
import { THAILAND_ENVELOPE } from '@/lib/geo/bbox';
import { ESRI_PROTOCOL, loadEsriTile } from '@/lib/map/esriImagery';
import type { BBox } from '@/lib/types';
import { Icon } from '@/components/Icon';

const PMTILES_BASE = process.env.NEXT_PUBLIC_PMTILES_BASE_URL || undefined;

/** Draw order, bottom to top. */
const Z_ORDER = [
  'water-bodies', 'water-reservoirs', 'roads', 'coastline', 'water-streams', 'water-canals', 'water-rivers',
  'admin-subdistrict', 'admin-district', 'admin-province', 'villages',
  'rain-24h', 'water-stations', 'earthquake', 'cctv', 'citizen-reports',
];

const URGENCY_COLORS = Object.fromEntries(URGENCIES.map((u) => [u.id, u.color]));
const CCTV_COLORS = Object.fromEntries(CCTV_MODES.map((m) => [m.id, m.color]));

/** Live station layers, clickable like villages. */
const STATION_LAYER_IDS = ['water-stations', 'rain-24h'];
/** Live GeoJSON layers refreshed on a timer. */
const LIVE_LAYER_IDS = [...STATION_LAYER_IDS, 'earthquake'];
const QUAKE_LAYER = `${OVERLAY_PREFIX}earthquake`;
const REPORT_LAYER = `${OVERLAY_PREFIX}citizen-reports`;
const CCTV_LAYER = `${OVERLAY_PREFIX}cctv`;
/** Camera status is refreshed about as often as the municipality updates it. */
const CCTV_REFRESH_MS = 60_000;
/** Reports are polled more often than station data. */
const REPORT_REFRESH_MS = 15_000;

let protocolRegistered = false;
let esriProtocolRegistered = false;

/**
 * The style itself is parsed and ready for layers. Unlike isStyleLoaded(),
 * this does not wait for every basemap tile, which on a slow connection
 * would skip adding the overlays until something else changed.
 */
function styleReady(map: MlMap): boolean {
  return Boolean((map.style as unknown as { _loaded?: boolean } | undefined)?._loaded);
}

/** Zoom-out headroom beyond "whole province fits the screen". */
const PROVINCE_ZOOM_SLACK = 0.5;

/**
 * Keep the camera on the province: no zooming out past the whole province
 * (plus a little slack), and no panning further than what that widest view
 * shows. Derived from the current viewport so the province always fits,
 * whatever the screen shape. Recomputed on resize.
 */
function limitToProvince(map: MlMap, b: BBox) {
  map.setMaxBounds(null);
  const fit = map.cameraForBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 16 });
  if (fit?.zoom === undefined || !fit.center) return;
  const minZoom = Math.max(0, fit.zoom - PROVINCE_ZOOM_SLACK);
  const worldPx = 512 * 2 ** minZoom;
  const c = maplibregl.MercatorCoordinate.fromLngLat(maplibregl.LngLat.convert(fit.center));
  const hw = map.getCanvas().clientWidth / 2 / worldPx;
  const hh = map.getCanvas().clientHeight / 2 / worldPx;
  const sw = new maplibregl.MercatorCoordinate(c.x - hw, c.y + hh).toLngLat();
  const ne = new maplibregl.MercatorCoordinate(c.x + hw, c.y - hh).toLngLat();
  map.setMinZoom(minZoom);
  map.setMaxBounds([sw, ne]);
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function fetchStyle(url: string, timeoutMs = 8000): Promise<StyleSpecification> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`style ${r.status}`);
    return (await r.json()) as StyleSpecification;
  } finally {
    clearTimeout(t);
  }
}

export function EnvironmentalMap({ initialBounds }: { initialBounds: BBox | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const attributionRef = useRef<{ key: string; ctrl: maplibregl.AttributionControl } | null>(null);
  // The map starts on a blank placeholder style; overlays wait for the real
  // basemap so their data is not downloaded twice (setStyle drops sources).
  const basemapSetRef = useRef(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const t = useT();

  const locale = useMapStore((s) => s.locale);
  const basemap = useMapStore((s) => s.basemap);
  const enabledLayers = useMapStore((s) => s.enabledLayers);
  const selection = useMapStore((s) => s.selection);
  const camera = useMapStore((s) => s.camera);
  const draft = useMapStore((s) => s.draftLocation);
  const view3d = useMapStore((s) => s.view3d);
  // Something occupies the right column on desktop (inspector, task panel or layers).
  const rightPanelOpen = useMapStore((s) => Boolean(s.selection || s.panel || s.layerPanelOpen));
  const panel = useMapStore((s) => s.panel);
  const cctvMode = useMapStore((s) => s.cctvMode);
  const cameraId = useMapStore((s) => s.cameraId);
  const { data: sources } = useSources();
  const isMobile = useIsMobile();

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!esriProtocolRegistered) {
      maplibregl.addProtocol(ESRI_PROTOCOL, loadEsriTile);
      esriProtocolRegistered = true;
    }
    if (PMTILES_BASE && !protocolRegistered) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolRegistered = true;
    }
    let map: MlMap;
    try {
      const b = initialBounds ?? THAILAND_ENVELOPE;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: FALLBACK_STYLE,
        bounds: [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        fitBoundsOptions: { padding: 24 },
        attributionControl: false,
        dragRotate: true,
        // 2D until the 3D view is switched on (which raises the limit).
        maxPitch: 0,
        cooperativeGestures: false,
      });
    } catch (err) {
      console.error('[map] init failed', err);
      setMapFailed(true);
      return;
    }
    mapRef.current = map;
    map.getCanvas().setAttribute('aria-label', t('app.mapLabel'));
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // With the province extent known, the map shows only the province.
    if (initialBounds) {
      const b = initialBounds;
      limitToProvince(map, b);
      map.on('resize', () => limitToProvince(map, b));
    }

    map.on('style.load', () => setStyleVersion((v) => v + 1));
    map.on('zoomend', () => useMapStore.getState().setZoom(map.getZoom()));
    useMapStore.getState().setZoom(map.getZoom());

    // A failing overlay source marks only that layer; the map keeps working.
    map.on('error', (e) => {
      const sourceId = (e as unknown as { sourceId?: string }).sourceId;
      if (sourceId?.startsWith(`${OVERLAY_PREFIX}src-`)) {
        useMapStore.getState().reportLayerError(sourceId.slice(`${OVERLAY_PREFIX}src-`.length));
      } else {
        console.warn('[map]', e.error?.message ?? e);
      }
    });

    map.on('click', (e) => {
      if (useMapStore.getState().picking) {
        useMapStore.getState().setDraftLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng, source: 'map' });
        return;
      }
      const cam = map.getLayer(CCTV_LAYER) ? map.queryRenderedFeatures(e.point, { layers: [CCTV_LAYER] })[0] : undefined;
      const camId = (cam?.properties as { id?: string } | undefined)?.id;
      if (camId) {
        useMapStore.getState().openCamera(camId);
        return;
      }
      const report = map.getLayer(REPORT_LAYER) ? map.queryRenderedFeatures(e.point, { layers: [REPORT_LAYER] })[0] : undefined;
      if (report) {
        const id = (report.properties as { id?: string }).id;
        if (id) {
          useMapStore.getState().openReport(id);
          return;
        }
      }
      const stationLayers = STATION_LAYER_IDS.map((id) => `${OVERLAY_PREFIX}${id}`).filter((id) => map.getLayer(id));
      const station = stationLayers.length ? map.queryRenderedFeatures(e.point, { layers: stationLayers })[0] : undefined;
      if (station && station.geometry.type === 'Point') {
        const [lng, lat] = station.geometry.coordinates as [number, number];
        const p = station.properties as { name_th?: string };
        useMapStore.getState().select({ lat, lng, label: p.name_th, kind: 'station' });
        return;
      }
      const quake = map.getLayer(QUAKE_LAYER) ? map.queryRenderedFeatures(e.point, { layers: [QUAKE_LAYER] })[0] : undefined;
      if (quake && quake.geometry.type === 'Point') {
        const [lng, lat] = quake.geometry.coordinates as [number, number];
        const p = quake.properties as { mag?: number; place?: string };
        const label = [typeof p.mag === 'number' ? `M${p.mag.toFixed(1)}` : null, p.place].filter(Boolean).join(' · ');
        useMapStore.getState().select({ lat, lng, label: label || undefined, kind: 'earthquake' });
        return;
      }
      const clusterLayers = STATION_LAYER_IDS.map((id) => `${OVERLAY_PREFIX}${id}-cluster`).filter((id) => map.getLayer(id));
      const cluster = clusterLayers.length ? map.queryRenderedFeatures(e.point, { layers: clusterLayers })[0] : undefined;
      if (cluster && cluster.geometry.type === 'Point') {
        map.easeTo({ center: cluster.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom() + 2, 10), duration: reducedMotion() ? 0 : 500 });
        return;
      }
      const villageLayer = `${OVERLAY_PREFIX}villages`;
      const hits = map.getLayer(villageLayer) ? map.queryRenderedFeatures(e.point, { layers: [villageLayer] }) : [];
      const v = hits[0];
      if (v && v.geometry.type === 'Point') {
        const [lng, lat] = v.geometry.coordinates as [number, number];
        const p = v.properties as { id?: string; name_th?: string };
        useMapStore.getState().select({ lat, lng, label: p.name_th, kind: 'village', highlight: p.id ? { layerId: 'villages', key: 'id', value: p.id } : undefined });
        return;
      }
      useMapStore.getState().select({ lat: e.lngLat.lat, lng: e.lngLat.lng, kind: 'point' });
    });
    map.on('mousemove', (e) => {
      if (useMapStore.getState().picking) {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const hit = [`${OVERLAY_PREFIX}villages`, QUAKE_LAYER, REPORT_LAYER, CCTV_LAYER, ...STATION_LAYER_IDS.flatMap((id) => [`${OVERLAY_PREFIX}${id}`, `${OVERLAY_PREFIX}${id}-cluster`])].filter((id) => map.getLayer(id));
      const over = hit.length > 0 && map.queryRenderedFeatures(e.point, { layers: hit }).length > 0;
      map.getCanvas().style.cursor = over ? 'pointer' : 'crosshair';
    });

    // Keyboard: arrows pan (MapLibre default); Enter inspects the map centre.
    const canvas = map.getCanvas();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        const c = map.getCenter();
        useMapStore.getState().select({ lat: c.lat, lng: c.lng });
      }
    };
    canvas.addEventListener('keydown', onKey);

    return () => {
      canvas.removeEventListener('keydown', onKey);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
  }, []);

  // ---------------------------------------------------------------- basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const style = basemapStyle(basemap);
    (async () => {
      try {
        // Satellite: imagery plus Thai place/road names borrowed from the vector basemap (imagery alone if that fails).
        const spec =
          basemap === 'satellite'
            ? satelliteStyle(await fetchStyle(BASEMAP_STYLE_URL.light!).catch(() => undefined), { hiDpi: window.devicePixelRatio >= 1.5 })
            : typeof style === 'string'
              ? await fetchStyle(style)
              : style;
        if (cancelled) return;
        basemapSetRef.current = true;
        map.setStyle(localizeBasemap(spec, locale), { diff: false });
        useMapStore.getState().setBasemapFailed(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('[map] basemap unavailable, using plain background', err);
        basemapSetRef.current = true;
        map.setStyle(FALLBACK_STYLE, { diff: false });
        useMapStore.getState().setBasemapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basemap, locale]);

  // ---------------------------------------------------------------- overlays
  const syncOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || !basemapSetRef.current || !styleReady(map)) return;
    const origin = window.location.origin;

    for (const l of map.getStyle().layers ?? []) if (l.id.startsWith(OVERLAY_PREFIX)) map.removeLayer(l.id);

    // Cover the rest of the country; added before the overlays so it stays beneath them.
    if (initialBounds) {
      if (!map.getSource(MASK_SOURCE)) map.addSource(MASK_SOURCE, maskSource(origin));
      if (!map.getLayer(MASK_LAYER)) for (const spec of maskLayers(basemap)) map.addLayer(spec);
    }

    const active: LayerDef[] = Z_ORDER.map((id) => getLayer(id)!).filter(
      (l) => l && enabledLayers.includes(l.id) && layerHasData(l, sources),
    );
    for (const layer of active) {
      const srcId = overlaySourceId(layer.id);
      if (layer.variable) {
        if (!map.getSource(srcId)) map.addSource(srcId, stationSource(layer, origin));
        for (const spec of stationLayers(layer, locale)) map.addLayer(spec);
        continue;
      }
      if (layer.reports) {
        if (!map.getSource(srcId)) map.addSource(srcId, reportSource(origin));
        for (const spec of reportLayers(layer, URGENCY_COLORS, OPEN_STATUSES, locale)) map.addLayer(spec);
        continue;
      }
      if (layer.cctv) {
        if (!map.getSource(srcId)) map.addSource(srcId, cctvSource(origin));
        for (const spec of cctvLayers(layer, CCTV_COLORS, CCTV_OTHER_COLOR, cctvMode, cameraId)) map.addLayer(spec);
        continue;
      }
      if (layer.hazardKind === 'earthquake') {
        if (!map.getSource(srcId)) map.addSource(srcId, hazardSource(layer, origin));
        for (const spec of earthquakeLayers(layer)) map.addLayer(spec);
        continue;
      }
      if (!map.getSource(srcId)) map.addSource(srcId, vectorSource(layer, origin, PMTILES_BASE));
      for (const spec of overlayLayers(layer, locale)) map.addLayer(spec);
    }

    const hl = selection?.highlight;
    const hlLayer = hl ? getLayer(hl.layerId) : undefined;
    if (hl && hlLayer?.sourceLayer && layerHasData(hlLayer, sources)) {
      const srcId = overlaySourceId(hlLayer.id);
      if (!map.getSource(srcId)) map.addSource(srcId, vectorSource(hlLayer, origin, PMTILES_BASE));
      for (const spec of highlightLayers(hlLayer, hl.key, hl.value)) map.addLayer(spec);
    }

    if (!map.getSource(DRAFT_SOURCE)) map.addSource(DRAFT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    for (const spec of draftLayers()) map.addLayer(spec);
    (map.getSource(DRAFT_SOURCE) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: draft && panel === 'report' ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [draft.lng, draft.lat] } }] : [],
    });

    if (!map.getSource(SELECTION_SOURCE)) map.addSource(SELECTION_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    for (const spec of selectionLayers()) map.addLayer(spec);
    (map.getSource(SELECTION_SOURCE) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: selection ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [selection.lng, selection.lat] } }] : [],
    });

    // Attribution for every active overlay source (e.g. © OpenStreetMap, DOPA, HDX).
    // Credit only sources that actually deliver data (a live layer may list sources not connected yet).
    const delivering = (id: string) => ['ok', 'degraded', 'down'].includes(sources?.sources.find((x) => x.id === id)?.health.status ?? '');
    const attributions = [
      ...new Set([
        ...active.flatMap((l) => l.sourceIds.filter(delivering).map((id) => findSource(id)?.attribution).filter(Boolean)),
        ...(view3d ? [findSource('basemap.terrain-aws')?.attribution, '© OpenStreetMap contributors (buildings), OpenFreeMap'] : []),
      ]),
    ].filter(Boolean) as string[];
    const key = attributions.join('|');
    if (attributionRef.current?.key !== key) {
      if (attributionRef.current) map.removeControl(attributionRef.current.ctrl);
      const ctrl = new maplibregl.AttributionControl({ compact: true, customAttribution: attributions });
      map.addControl(ctrl, 'bottom-left');
      // Start collapsed (the ⓘ button opens it) so the credits do not cover the map on phones.
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      attributionRef.current = { key, ctrl };
    }
  }, [enabledLayers, sources, selection, locale, draft, panel, view3d, basemap, initialBounds, cctvMode, cameraId]);

  useEffect(() => {
    syncOverlays();
  }, [syncOverlays, styleVersion]);

  // Refresh live layers every 5 minutes.
  useEffect(() => {
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      for (const layerId of LIVE_LAYER_IDS) {
        const src = map.getSource(overlaySourceId(layerId)) as GeoJSONSource | undefined;
        src?.setData(`${window.location.origin}/api/layers/${layerId}`);
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // 3D view: terrain surface + hillshade + extruded OSM buildings, tilted camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const duration = reducedMotion() ? 0 : 800;
      // Beneath the province mask, so buildings outside the province stay covered.
      const firstOverlay = map.getLayer(MASK_LAYER) ? MASK_LAYER : (map.getStyle().layers ?? []).find((l) => l.id.startsWith(OVERLAY_PREFIX))?.id;
      try {
        if (view3d) {
          if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, terrainSource());
          if (!map.getSource(HILLSHADE_SOURCE)) map.addSource(HILLSHADE_SOURCE, terrainSource());
          if (!map.getSource(BUILDINGS_SOURCE)) map.addSource(BUILDINGS_SOURCE, buildingsSource());
          if (!map.getLayer(HILLSHADE_LAYER)) map.addLayer(hillshadeLayer(), firstOverlay);
          if (!map.getLayer(BUILDINGS_LAYER)) map.addLayer(buildingsLayer(basemap === 'dark'), firstOverlay);
          map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.5 });
          map.setMaxPitch(75);
          if (map.getPitch() < 30) map.easeTo({ pitch: 60, duration });
        } else {
          if (map.getTerrain()) map.setTerrain(null);
          for (const id of [BUILDINGS_LAYER, HILLSHADE_LAYER]) if (map.getLayer(id)) map.removeLayer(id);
          if (map.getPitch() > 0) map.jumpTo({ pitch: 0, bearing: 0 });
          map.setMaxPitch(0);
        }
      } catch (err) {
        // The 2D map keeps working if 3D sources are unreachable.
        console.warn('[map] 3D view unavailable', err);
      }
    };
    if (styleReady(map)) apply();
    else map.once('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [view3d, styleVersion, basemap]);

  // Camera status (online/offline).
  useEffect(() => {
    const id = setInterval(() => {
      const src = mapRef.current?.getSource(overlaySourceId('cctv')) as GeoJSONSource | undefined;
      src?.setData(`${window.location.origin}/api/cctv?format=geojson`);
    }, CCTV_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Reports: poll often, and refresh at once after this browser sends one.
  useEffect(() => {
    const refresh = () => {
      const src = mapRef.current?.getSource(overlaySourceId('citizen-reports')) as GeoJSONSource | undefined;
      src?.setData(`${window.location.origin}/api/reports?format=geojson&hours=72`);
    };
    const id = setInterval(refresh, REPORT_REFRESH_MS);
    window.addEventListener('n360-reports-changed', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('n360-reports-changed', refresh);
    };
  }, []);

  // ---------------------------------------------------------------- camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera) return;
    const keepTilt = useMapStore.getState().view3d ? { pitch: Math.max(map.getPitch(), 60) } : {};
    const duration = reducedMotion() ? 0 : 900;
    // Keep the target clear of the inspector: bottom sheet on mobile, right panel on desktop.
    const vh = window.innerHeight;
    const padding = isMobile
      ? { top: 120, left: 24, right: 24, bottom: Math.round(vh * 0.46) + 100 }
      : { top: 96, left: useMapStore.getState().overviewOpen ? 360 : 48, right: 440, bottom: 80 };
    if (camera.bbox) {
      const [w, s, e, n] = camera.bbox;
      if (w === e && s === n) map.flyTo({ center: [w, s], zoom: Math.max(map.getZoom(), 14), padding, duration, ...keepTilt });
      else map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 15, duration, ...keepTilt });
    } else if (camera.center) {
      map.flyTo({ center: camera.center, zoom: camera.zoom ?? Math.max(map.getZoom(), 13), padding, duration, ...keepTilt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to camera requests only
  }, [camera]);

  // ---------------------------------------------------------------- controls
  const tilt = () => (useMapStore.getState().view3d && (mapRef.current?.getPitch() ?? 0) < 30 ? { pitch: 60 } : {});
  const zoomBy = (d: number) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 8) + d, duration: reducedMotion() ? 0 : 250, ...tilt() });
  const resetNorth = () => mapRef.current?.easeTo({ bearing: 0, duration: reducedMotion() ? 0 : 300 });
  const locate = () => {
    setLocateError(false);
    if (!navigator.geolocation) return setLocateError(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        useMapStore.getState().flyTo({ center: [lng, lat], zoom: 14 });
        useMapStore.getState().select({ lat, lng });
      },
      () => setLocateError(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (mapFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-surface-subtle p-6 text-center text-fg-muted">
        {t('error.mapCrashed')}
      </div>
    );
  }

  return (
    <>
      {/* Inline style: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which outranks layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: 'var(--map-bg)' }} />
      {/* Controls sit left of the desktop inspector when it is open; above the mobile sheet otherwise. */}
      <div className={`pointer-events-none absolute bottom-[calc(140px+env(safe-area-inset-bottom))] z-10 flex flex-col items-end gap-2 md:bottom-16 ${rightPanelOpen && !isMobile ? 'right-[424px]' : 'right-3'}`}>
        {locateError && (
          <p role="status" className="panel pointer-events-auto px-3 py-2 text-sm text-danger">
            {t('controls.locateFailed')}
          </p>
        )}
        <div className="panel pointer-events-auto flex flex-col overflow-hidden" role="group" aria-label={t('app.mapLabel')}>
          <button type="button" className="icon-btn rounded-none" onClick={() => zoomBy(1)} aria-label={t('controls.zoomIn')} title={t('controls.zoomIn')}>
            <Icon name="plus" />
          </button>
          <span aria-hidden="true" className="mx-2 h-px bg-line" />
          <button type="button" className="icon-btn rounded-none" onClick={() => zoomBy(-1)} aria-label={t('controls.zoomOut')} title={t('controls.zoomOut')}>
            <Icon name="minus" />
          </button>
          <span aria-hidden="true" className="mx-2 h-px bg-line" />
          <button type="button" className="icon-btn rounded-none" onClick={resetNorth} aria-label={t('controls.compass')} title={t('controls.compass')}>
            <Icon name="compass" />
          </button>

          <span aria-hidden="true" className="mx-2 h-px bg-line" />
          <button type="button" className="icon-btn rounded-none" onClick={locate} aria-label={t('controls.locate')} title={t('controls.locate')}>
            <Icon name="locate" />
          </button>
        </div>
      </div>
    </>
  );
}
