'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SourceStatus, SourcesResponse } from '@/lib/types';
import type { LayerDef } from '@/lib/registry/layers';
import { isLayerAvailable } from '@/lib/registry/layers';

export function useSources() {
  return useQuery<SourcesResponse>({
    queryKey: ['sources'],
    queryFn: async () => {
      const r = await fetch('/api/sources');
      if (!r.ok) throw new Error(`sources ${r.status}`);
      return r.json();
    },
    refetchInterval: 5 * 60_000,
  });
}

const LIVE_STATES: SourceStatus[] = ['ok', 'degraded', 'down'];

function sourceStatus(id: string, data: SourcesResponse | undefined): SourceStatus {
  return data?.sources.find((x) => x.id === id)?.health.status ?? 'unknown';
}

/**
 * A layer can be switched on when its phase is built, or — for later-phase
 * live layers — as soon as one of its sources has delivered data.
 */
export function layerUsable(layer: LayerDef, data: SourcesResponse | undefined): boolean {
  if (isLayerAvailable(layer)) return true;
  // Tiles served straight from the agency: usable whenever the source is listed as external.
  if (layer.raster?.tiles && layer.sourceIds.some((id) => sourceStatus(id, data) === 'external')) return true;
  return layer.sourceIds.some((id) => LIVE_STATES.includes(sourceStatus(id, data)));
}

/** Worst status among a layer's connected sources (so one missing source marks the layer). */
export function layerStatus(layer: LayerDef, data: SourcesResponse | undefined): SourceStatus {
  if (!layerUsable(layer, data)) return 'not_connected';
  if (!data) return 'unknown';
  const order: SourceStatus[] = ['down', 'not_imported', 'unknown', 'degraded', 'external', 'ok'];
  // Later-phase layers can list sources that are not connected yet (e.g. TMD rain beside ThaiWater); ignore those.
  const ids = isLayerAvailable(layer) ? layer.sourceIds : layer.sourceIds.filter((id) => LIVE_STATES.includes(sourceStatus(id, data)));
  let worst: SourceStatus = 'ok';
  for (const id of ids) {
    const s = sourceStatus(id, data);
    if (order.indexOf(s) < order.indexOf(worst)) worst = s;
  }
  return worst;
}

/** True when a layer's data can be requested. */
export function layerHasData(layer: LayerDef, data: SourcesResponse | undefined): boolean {
  // Fetched live from the municipality on request; /api/cctv reports its own availability.
  if (layer.cctv) return true;
  if (layer.raster?.tiles && layer.sourceIds.some((id) => sourceStatus(id, data) === 'external')) return true;
  if (process.env.NEXT_PUBLIC_PMTILES_BASE_URL && isLayerAvailable(layer) && layer.sourceLayer) return true;
  const s = layerStatus(layer, data);
  return layer.sourceLayer ? s === 'ok' : s === 'ok' || s === 'degraded';
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
