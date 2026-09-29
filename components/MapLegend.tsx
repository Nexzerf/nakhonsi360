'use client';

import { useState } from 'react';
import { LAYERS, isLayerAvailable } from '@/lib/registry/layers';
import { useSources, layerHasData } from '@/lib/hooks';
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
  const active = LAYERS.filter((l) => enabled.includes(l.id) && isLayerAvailable(l) && layerHasData(l, data));

  return (
    <section className="panel pointer-events-auto w-60 max-w-[calc(100vw-2rem)] text-sm" aria-labelledby="legend-title">
      <button type="button" className="flex min-h-11 w-full items-center justify-between px-3" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2 id="legend-title" className="text-sm font-semibold">
          {t('legend.title')}
        </h2>
        <Icon name="chevron" size={18} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          {active.length === 0 ? (
            <p className="text-xs text-fg-subtle">{t('legend.none')}</p>
          ) : (
            <ul className="space-y-1">
              {active.map((l) => (
                <li key={l.id} className={`flex items-center gap-2 ${zoom < l.minzoom ? 'opacity-50' : ''}`}>
                  <LegendSwatch symbol={l.legend} size={20} />
                  <Icon name={l.icon} size={14} className="text-fg-muted" />
                  <span>{placeName(locale, l.th, l.en)}</span>
                  {zoom < l.minzoom && <span className="text-xs text-fg-subtle">{t('layers.minzoom', { zoom: l.minzoom })}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
