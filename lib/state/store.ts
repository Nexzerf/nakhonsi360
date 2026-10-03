'use client';

import { create } from 'zustand';
import type { Locale } from '@/lib/freshness/format';
import { DEFAULT_LAYER_IDS, type BasemapId } from '@/lib/registry/layers';
import type { BBox } from '@/lib/types';
import type { CctvMode } from '@/lib/cctv/schema';
import { translate } from '@/lib/i18n';

export type SheetSnap = 'peek' | 'half' | 'full';

/** Left-side task panels (reports, emergency numbers). */
export type PanelId = 'report' | 'reports' | 'emergency' | 'cctv';
export type CctvFilter = CctvMode | 'all';

export interface DraftLocation {
  lat: number;
  lng: number;
  source: 'gps' | 'map';
  accuracyM?: number;
}

export interface Selection {
  lat: number;
  lng: number;
  /** Title from a search result or clicked feature; otherwise the inspector derives one. */
  label?: string;
  /** What was selected: drives the inspector's eyebrow and breadcrumb depth. */
  kind?: 'point' | 'province' | 'district' | 'subdistrict' | 'village' | 'station' | 'earthquake' | 'water' | 'road' | 'place';
  /** Feature to highlight, when the selection came from a feature. */
  highlight?: { layerId: string; key: string; value: string | number };
}

export interface CameraRequest {
  id: number;
  center?: [number, number];
  zoom?: number;
  bbox?: BBox;
}

interface MapState {
  locale: Locale;
  basemap: BasemapId;
  enabledLayers: string[];
  selection: Selection | null;
  sheetSnap: SheetSnap;
  layerPanelOpen: boolean;
  infoSourceId: string | null;
  infoLayerId: string | null;
  camera: CameraRequest | null;
  zoom: number;
  /** Vector layers whose tiles failed to load, with the time of the failure. */
  layerErrors: Record<string, number>;
  basemapFailed: boolean;
  panel: PanelId | null;
  /** Report shown in detail inside the reports panel. */
  reportId: string | null;
  /** Waiting for a map tap to place the report. */
  picking: boolean;
  draftLocation: DraftLocation | null;
  /** 3D view: terrain relief and extruded buildings, tilted camera. */
  view3d: boolean;
  /** Dashboard cards (left column on desktop, a sheet on mobile). */
  overviewOpen: boolean;
  /** CCTV: which kind of camera is shown, and the camera playing in the panel. */
  cctvMode: CctvFilter;
  cameraId: string | null;

  setLocale: (l: Locale) => void;
  setBasemap: (b: BasemapId) => void;
  toggleLayer: (id: string) => void;
  setLayers: (ids: readonly string[]) => void;
  select: (s: Selection | null) => void;
  setSheetSnap: (s: SheetSnap) => void;
  setLayerPanelOpen: (open: boolean) => void;
  showInfo: (layerId: string | null, sourceId: string | null) => void;
  flyTo: (c: Omit<CameraRequest, 'id'>) => void;
  setZoom: (z: number) => void;
  setHighlight: (h: Selection['highlight']) => void;
  reportLayerError: (layerId: string) => void;
  clearLayerError: (layerId: string) => void;
  setBasemapFailed: (failed: boolean) => void;
  openPanel: (p: PanelId | null) => void;
  openReport: (id: string | null) => void;
  setPicking: (picking: boolean) => void;
  setDraftLocation: (l: DraftLocation | null) => void;
  setView3d: (on: boolean) => void;
  setOverviewOpen: (open: boolean) => void;
  setCctvMode: (m: CctvFilter) => void;
  openCamera: (id: string | null) => void;
}

let cameraSeq = 0;

export const useMapStore = create<MapState>((set) => ({
  locale: 'th',
  basemap: 'light',
  enabledLayers: [...DEFAULT_LAYER_IDS],
  selection: null,
  sheetSnap: 'half',
  layerPanelOpen: false,
  infoSourceId: null,
  infoLayerId: null,
  camera: null,
  zoom: 8,
  layerErrors: {},
  basemapFailed: false,
  panel: null,
  reportId: null,
  picking: false,
  draftLocation: null,
  view3d: false,
  // Opened on wide screens after mount (MapApp), so server and client render the same.
  overviewOpen: false,
  cctvMode: 'all',
  cameraId: null,

  setLocale: (locale) => set({ locale }),
  setBasemap: (basemap) => set({ basemap }),
  toggleLayer: (id) =>
    set((s) => ({
      enabledLayers: s.enabledLayers.includes(id) ? s.enabledLayers.filter((x) => x !== id) : [...s.enabledLayers, id],
    })),
  setLayers: (ids) => set({ enabledLayers: [...new Set(ids)] }),
  select: (selection) => set((s) => ({ selection, sheetSnap: 'half', ...(selection ? { panel: s.picking ? s.panel : null, layerPanelOpen: false } : {}) })),
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  setLayerPanelOpen: (layerPanelOpen) => set((s) => ({ layerPanelOpen, panel: layerPanelOpen ? null : s.panel })),
  showInfo: (infoLayerId, infoSourceId) => set({ infoLayerId, infoSourceId }),
  flyTo: (c) => set({ camera: { ...c, id: ++cameraSeq } }),
  setZoom: (zoom) => set({ zoom }),
  setHighlight: (highlight) => set((s) => (s.selection ? { selection: { ...s.selection, highlight } } : {})),
  reportLayerError: (layerId) => set((s) => (s.layerErrors[layerId] ? {} : { layerErrors: { ...s.layerErrors, [layerId]: Date.now() } })),
  clearLayerError: (layerId) =>
    set((s) => {
      if (!s.layerErrors[layerId]) return {};
      const rest = { ...s.layerErrors };
      delete rest[layerId];
      return { layerErrors: rest };
    }),
  setBasemapFailed: (basemapFailed) => set({ basemapFailed }),
  openPanel: (panel) =>
    set((s) => ({
      panel,
      picking: false,
      ...(panel ? { layerPanelOpen: false } : {}),
      ...(panel !== 'reports' ? { reportId: null } : {}),
      ...(panel !== 'cctv' ? { cameraId: null } : {}),
      // The camera list and the camera pins go together.
      ...(panel === 'cctv' && !s.enabledLayers.includes('cctv') ? { enabledLayers: [...s.enabledLayers, 'cctv'] } : {}),
    })),
  openReport: (reportId) => set({ panel: 'reports', reportId, picking: false, layerPanelOpen: false }),
  setPicking: (picking) => set({ picking }),
  setDraftLocation: (draftLocation) => set({ draftLocation, picking: false }),
  setView3d: (view3d) => set({ view3d }),
  setOverviewOpen: (overviewOpen) => set({ overviewOpen }),
  setCctvMode: (cctvMode) => set({ cctvMode }),
  openCamera: (cameraId) =>
    set((s) => ({
      cameraId,
      panel: 'cctv',
      picking: false,
      layerPanelOpen: false,
      selection: null,
      enabledLayers: s.enabledLayers.includes('cctv') ? s.enabledLayers : [...s.enabledLayers, 'cctv'],
    })),
}));

/** Translation hook bound to the current UI locale. */
export function useT() {
  const locale = useMapStore((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
