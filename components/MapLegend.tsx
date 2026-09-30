'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as GeoJSON from 'geojson';
import { LAYERS } from '@/lib/registry/layers';
import { useSources, layerHasData, layerUsable } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { placeName } from '@/lib/i18n';
import { Icon } from '@/components/Icon';
import { LegendSwatch } from '@/components/LegendSwatch';

/** Shows only layers that are switched on and have data. */
export function MapLegend() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const enabled = useMapStore((s) => s.enabledLayers);
  const zoom = useMapStore((s) => s.zoom);
  const { data } = useSources();
  const [open, setOpen] = useState(true);
  const active = LAYERS.filter((l) => enabled.includes(l.id) && layerUsable(l, data) && layerHasData(l, data));
  const waterOn = active.some((l) => l.id === 'water-stations');
  // Official statuses present in the current data, exactly as ThaiWater publishes them.
  const { data: water } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['layer', 'water-stations'],
    queryFn: async () => (await fetch('/api/layers/water-stations')).json(),
    enabled: waterOn,
    staleTime: 5 * 60_000,
  });
  const scale = [
    ...new Map(
      (water?.features ?? [])
        .map((f) => f.properties as { official_level: number | null; official_status: string | null; official_color: string | null })
        .filter((p) => p.official_level !== null && p.official_status && p.official_color)
        .sort((a, b) => (b.official_level ?? 0) - (a.official_level ?? 0))
        .map((p) => [p.official_level, p] as const),
    ).values(),
  ];

  return (
    <section className="panel pointer-events-auto w-[248px] overflow-hidden text-sm" aria-labelledby="legend-title">
      <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 hover:bg-surface-subtle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2 id="legend-title" className="flex-1 text-left text-sm font-semibold">
          {t('legend.title')}
        </h2>
        {active.length > 0 && <span className="tabular text-xs text-fg-subtle">{active.length}</span>}
        <Icon name="chevron" size={16} className={`text-fg-subtle transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          {active.length === 0 ? (
            <p className="py-1 text-xs text-fg-subtle">{t('legend.none')}</p>
          ) : (
            <ul className="space-y-0.5">
              {active.map((l) => {
                const hidden = zoom < l.minzoom;
                return (
                  <li key={l.id} className={`flex min-h-7 items-center gap-2.5 ${hidden ? 'text-fg-subtle' : ''}`}>
                    <span className={hidden ? 'opacity-40' : ''}>
                      <LegendSwatch symbol={l.legend} size={20} />
                    </span>
                    <span className="flex-1">{placeName(locale, l.th, l.en)}</span>
                    {hidden && <span className="tabular text-[11px] text-fg-subtle">{t('layers.minzoom', { zoom: l.minzoom })}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {waterOn && scale.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="mb-1 text-[11px] text-fg-subtle">{t('legend.waterScale')}</p>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {scale.map((p) => (
                  <li key={p.official_level} className="flex items-center gap-1.5 text-xs">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-white" style={{ background: p.official_color! }} />
                    {p.official_status}
                  </li>
                ))}
                <li className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-white" style={{ background: '#64748b' }} />
                  {t('legend.noStatus')}
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
