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
        </div>
      )}
    </section>
  );
}
