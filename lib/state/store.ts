'use client';

import { create } from 'zustand';
import type { Locale } from '@/lib/freshness/format';
import { DEFAULT_LAYER_IDS, type BasemapId } from '@/lib/registry/layers';
import type { BBox } from '@/lib/types';
import { translate } from '@/lib/i18n';

export type SheetSnap = 'peek' | 'half' | 'full';

export interface Selection {
  lat: number;
  lng: number;
  /** Title from a search result or clicked feature; otherwise the inspector derives one. */
  label?: string;
  /** What was selected: drives the inspector's eyebrow and breadcrumb depth. */
  kind?: 'point' | 'province' | 'district' | 'subdistrict' | 'village' | 'station' | 'water' | 'road' | 'place';
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

  setLocale: (l: Locale) => void;
  setBasemap: (b: BasemapId) => void;
  toggleLayer: (id: string) => void;
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

  setLocale: (locale) => set({ locale }),
  setBasemap: (basemap) => set({ basemap }),
  toggleLayer: (id) =>
    set((s) => ({
      enabledLayers: s.enabledLayers.includes(id) ? s.enabledLayers.filter((x) => x !== id) : [...s.enabledLayers, id],
    })),
  select: (selection) => set({ selection, sheetSnap: 'half' }),
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  setLayerPanelOpen: (layerPanelOpen) => set({ layerPanelOpen }),
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
}));

/** Translation hook bound to the current UI locale. */
export function useT() {
  const locale = useMapStore((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
