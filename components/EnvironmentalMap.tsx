'use client';

import maplibregl, { type Map as MlMap, type StyleSpecification, type GeoJSONSource } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapStore, useT } from '@/lib/state/store';
import { useSources, layerHasData, useIsMobile } from '@/lib/hooks';
import { getLayer, type LayerDef } from '@/lib/registry/layers';
import { findSource } from '@/lib/registry/sources';
import {
  FALLBACK_STYLE,
  OVERLAY_PREFIX,
  SELECTION_SOURCE,
  basemapStyle,
  hazardLayers,
  hazardSource,
  highlightLayers,
  localizeBasemap,
  overlayLayers,
  overlaySourceId,
  selectionLayers,
  stationLayers,
  stationSource,
  vectorSource,
} from '@/lib/map/style';
import { THAILAND_ENVELOPE } from '@/lib/geo/bbox';
import type { BBox } from '@/lib/types';
import { Icon } from '@/components/Icon';

const PMTILES_BASE = process.env.NEXT_PUBLIC_PMTILES_BASE_URL || undefined;

/** Draw order, bottom to top. */
const Z_ORDER = [
  'mangroves', 'water-bodies', 'water-reservoirs', 'roads', 'coastline', 'water-streams', 'water-canals', 'water-rivers',
  'admin-subdistrict', 'admin-district', 'admin-province', 'villages',
  'hotspots',
  'rain-24h', 'water-stations',
];

/** Live station layers, clickable like villages. */
const STATION_LAYER_IDS = ['water-stations', 'rain-24h'];
/** Live hazard point layers. */
const HAZARD_LAYER_IDS = ['hotspots'];

let protocolRegistered = false;

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
  const [styleVersion, setStyleVersion] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const t = useT();

  const locale = useMapStore((s) => s.locale);
  const basemap = useMapStore((s) => s.basemap);
  const enabledLayers = useMapStore((s) => s.enabledLayers);
  const selection = useMapStore((s) => s.selection);
  const camera = useMapStore((s) => s.camera);
  const { data: sources } = useSources();
  const isMobile = useIsMobile();

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
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
      const stationLayers = STATION_LAYER_IDS.map((id) => `${OVERLAY_PREFIX}${id}`).filter((id) => map.getLayer(id));
      const station = stationLayers.length ? map.queryRenderedFeatures(e.point, { layers: stationLayers })[0] : undefined;
      if (station && station.geometry.type === 'Point') {
        const [lng, lat] = station.geometry.coordinates as [number, number];
        const p = station.properties as { name_th?: string };
        useMapStore.getState().select({ lat, lng, label: p.name_th, kind: 'station' });
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
      const hit = [`${OVERLAY_PREFIX}villages`, ...STATION_LAYER_IDS.flatMap((id) => [`${OVERLAY_PREFIX}${id}`, `${OVERLAY_PREFIX}${id}-cluster`])].filter((id) => map.getLayer(id));
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
        const spec = typeof style === 'string' ? await fetchStyle(style) : style;
        if (cancelled) return;
        map.setStyle(localizeBasemap(spec, locale), { diff: false });
        useMapStore.getState().setBasemapFailed(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('[map] basemap unavailable, using plain background', err);
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
    if (!map || !map.isStyleLoaded()) return;
    const origin = window.location.origin;

    for (const l of map.getStyle().layers ?? []) if (l.id.startsWith(OVERLAY_PREFIX)) map.removeLayer(l.id);

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
      if (layer.hazard) {
        if (!map.getSource(srcId)) map.addSource(srcId, hazardSource(layer, origin));
        for (const spec of hazardLayers(layer)) map.addLayer(spec);
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

    if (!map.getSource(SELECTION_SOURCE)) map.addSource(SELECTION_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    for (const spec of selectionLayers()) map.addLayer(spec);
    (map.getSource(SELECTION_SOURCE) as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: selection ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [selection.lng, selection.lat] } }] : [],
    });

    // Attribution for every active overlay source (e.g. © OpenStreetMap, DOPA, HDX).
    // Credit only sources that actually deliver data (a live layer may list sources not connected yet).
    const delivering = (id: string) => ['ok', 'degraded', 'down'].includes(sources?.sources.find((x) => x.id === id)?.health.status ?? '');
    const attributions = [...new Set(active.flatMap((l) => l.sourceIds.filter(delivering).map((id) => findSource(id)?.attribution).filter(Boolean)))] as string[];
    const key = attributions.join('|');
    if (attributionRef.current?.key !== key) {
      if (attributionRef.current) map.removeControl(attributionRef.current.ctrl);
      const ctrl = new maplibregl.AttributionControl({ compact: true, customAttribution: attributions });
      map.addControl(ctrl, 'bottom-left');
      attributionRef.current = { key, ctrl };
    }
  }, [enabledLayers, sources, selection, locale]);

  useEffect(() => {
    syncOverlays();
  }, [syncOverlays, styleVersion]);

  // Refresh live station and hazard layers every 5 minutes.
  useEffect(() => {
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      for (const layerId of [...STATION_LAYER_IDS, ...HAZARD_LAYER_IDS]) {
        const src = map.getSource(overlaySourceId(layerId)) as GeoJSONSource | undefined;
        src?.setData(`${window.location.origin}/api/layers/${layerId}`);
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------- camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera) return;
    const duration = reducedMotion() ? 0 : 900;
    // Keep the target clear of the inspector: bottom sheet on mobile, right panel on desktop.
    const vh = window.innerHeight;
    const padding = isMobile
      ? { top: 80, left: 24, right: 24, bottom: Math.round(vh * 0.52) + 16 }
      : { top: 88, left: 48, right: 440, bottom: 64 };
    if (camera.bbox) {
      const [w, s, e, n] = camera.bbox;
      if (w === e && s === n) map.flyTo({ center: [w, s], zoom: Math.max(map.getZoom(), 14), padding, duration });
      else map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 15, duration });
    } else if (camera.center) {
      map.flyTo({ center: camera.center, zoom: camera.zoom ?? Math.max(map.getZoom(), 13), padding, duration });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to camera requests only
  }, [camera]);

  // ---------------------------------------------------------------- controls
  const zoomBy = (d: number) => mapRef.current?.easeTo({ zoom: (mapRef.current?.getZoom() ?? 8) + d, duration: reducedMotion() ? 0 : 250 });
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
      <div className={`pointer-events-none absolute bottom-24 z-10 flex flex-col items-end gap-2 md:bottom-16 ${selection && !isMobile ? 'right-[424px]' : 'right-3'}`}>
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
