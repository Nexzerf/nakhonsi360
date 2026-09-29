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

/** Worst status among a layer's sources (so one missing source marks the layer). */
export function layerStatus(layer: LayerDef, data: SourcesResponse | undefined): SourceStatus {
  if (!isLayerAvailable(layer)) return 'not_connected';
  if (!data) return 'unknown';
  const order: SourceStatus[] = ['down', 'not_imported', 'unknown', 'degraded', 'not_connected', 'external', 'ok'];
  let worst: SourceStatus = 'ok';
  for (const id of layer.sourceIds) {
    const s = data.sources.find((x) => x.id === id)?.health.status ?? 'unknown';
    if (order.indexOf(s) < order.indexOf(worst)) worst = s;
  }
  return worst;
}

/** True when a layer's tiles can be requested. */
export function layerHasData(layer: LayerDef, data: SourcesResponse | undefined): boolean {
  if (process.env.NEXT_PUBLIC_PMTILES_BASE_URL && isLayerAvailable(layer) && layer.sourceLayer) return true;
  return layerStatus(layer, data) === 'ok';
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
