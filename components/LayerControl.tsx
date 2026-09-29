'use client';

import { useEffect, useRef } from 'react';
import { BASEMAPS, LAYERS, LAYER_GROUPS, MAX_VISIBLE_OVERLAYS, isLayerAvailable, type LayerDef } from '@/lib/registry/layers';
import { useSources, layerStatus, layerHasData } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { placeName } from '@/lib/i18n';
import { formatDateTime } from '@/lib/freshness/format';
import { Icon } from '@/components/Icon';
import { Dot, STATUS_COLOR } from '@/components/DataFreshness';
import { LegendSwatch } from '@/components/LegendSwatch';

export function LayerButton() {
  const t = useT();
  const open = useMapStore((s) => s.layerPanelOpen);
  return (
    <button
      type="button"
      className="panel icon-btn gap-2 px-3"
      aria-expanded={open}
      aria-controls="layer-panel"
      onClick={() => useMapStore.getState().setLayerPanelOpen(!open)}
    >
      <Icon name="layers" />
      <span className="hidden text-sm font-medium sm:inline">{t('layers.title')}</span>
      <span className="sr-only sm:hidden">{t('layers.open')}</span>
    </button>
  );
}

function LayerRow({ layer }: { layer: LayerDef }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const enabled = useMapStore((s) => s.enabledLayers.includes(layer.id));
  const zoom = useMapStore((s) => s.zoom);
  const failedAt = useMapStore((s) => s.layerErrors[layer.id]);
  const { data } = useSources();
  const available = isLayerAvailable(layer);
  const status = layerStatus(layer, data);
  const hasData = layerHasData(layer, data);
  const inputId = `layer-${layer.id}`;
  const name = placeName(locale, layer.th, layer.en)!;
  const lastImport = layer.sourceIds.map((id) => data?.sources.find((s) => s.id === id)?.health.lastImport?.importedAt).find(Boolean);

  let note: string | null = null;
  if (!available) note = t('layers.plannedPhase', { phase: layer.phase });
  else if (failedAt) note = `${t('error.loadFailed')}${lastImport ? ` · ${t('error.lastSuccess', { time: formatDateTime(new Date(lastImport), locale) })}` : ''}`;
  else if (!hasData) note = status === 'unknown' ? t('status.dbDown') : t('layers.notImported');
  else if (enabled && zoom < layer.minzoom) note = `${t('layers.hiddenAtZoom')} (${t('layers.minzoom', { zoom: layer.minzoom })})`;

  return (
    <li className="flex items-center gap-2">
      <label htmlFor={inputId} className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 ${available ? '' : 'cursor-not-allowed opacity-60'}`}>
        <input
          id={inputId}
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          checked={available && enabled}
          disabled={!available}
          onChange={() => {
            useMapStore.getState().clearLayerError(layer.id);
            useMapStore.getState().toggleLayer(layer.id);
          }}
        />
        <LegendSwatch symbol={layer.legend} size={22} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-sm">
            <Icon name={layer.icon} size={16} className="shrink-0 text-fg-muted" />
            {name}
          </span>
          {note && <span className={`text-xs ${failedAt ? 'text-danger' : 'text-fg-subtle'}`}>{note}</span>}
        </span>
      </label>
      <span title={t(`status.${failedAt ? 'down' : status}`)} className="flex items-center">
        <Dot color={STATUS_COLOR[failedAt ? 'down' : status]} />
        <span className="sr-only">{t(`status.${failedAt ? 'down' : status}`)}</span>
      </span>
      <button type="button" className="icon-btn text-fg-muted" onClick={() => useMapStore.getState().showInfo(layer.id, null)} aria-label={`${t('layers.info')}: ${name}`}>
        <Icon name="info" size={18} />
      </button>
    </li>
  );
}

export function LayerControl() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const open = useMapStore((s) => s.layerPanelOpen);
  const basemap = useMapStore((s) => s.basemap);
  const enabled = useMapStore((s) => s.enabledLayers);
  const zoom = useMapStore((s) => s.zoom);
  const basemapFailed = useMapStore((s) => s.basemapFailed);
  const { data } = useSources();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('input,button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useMapStore.getState().setLayerPanelOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const visibleCount = LAYERS.filter((l) => enabled.includes(l.id) && isLayerAvailable(l) && layerHasData(l, data) && zoom >= l.minzoom).length;

  return (
    <div
      id="layer-panel"
      ref={panelRef}
      role="dialog"
      aria-label={t('layers.title')}
      className="panel fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col rounded-b-none md:absolute md:inset-x-auto md:top-16 md:right-3 md:bottom-auto md:max-h-[calc(100vh-9rem)] md:w-80 md:rounded-b-[8px]"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <h2 className="text-base font-semibold">{t('layers.title')}</h2>
        <button type="button" className="icon-btn" onClick={() => useMapStore.getState().setLayerPanelOpen(false)} aria-label={t('layers.close')}>
          <Icon name="close" />
        </button>
      </div>
      <div className="overflow-y-auto px-3 pb-4">
        <fieldset className="mt-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t('layers.basemap')}</legend>
          <div className="grid grid-cols-2 gap-1">
            {BASEMAPS.map((b) => (
              <label key={b.id} className={`flex min-h-11 cursor-pointer items-center justify-center rounded border px-1 text-center text-sm ${basemap === b.id ? 'border-accent bg-surface-subtle font-medium' : 'border-line'}`}>
                <input type="radio" name="basemap" value={b.id} checked={basemap === b.id} onChange={() => useMapStore.getState().setBasemap(b.id)} className="sr-only" />
                {placeName(locale, b.th, b.en)}
              </label>
            ))}
          </div>
          {basemapFailed && <p className="mt-1 text-xs text-danger">{t('error.loadFailed')}</p>}
          <button type="button" className="mt-1 min-h-11 text-xs text-accent underline" onClick={() => useMapStore.getState().showInfo(null, BASEMAPS.find((b) => b.id === basemap)!.sourceId)}>
            {t('layers.info')}: {placeName(locale, BASEMAPS.find((b) => b.id === basemap)!.th, BASEMAPS.find((b) => b.id === basemap)!.en)}
          </button>
        </fieldset>

        {visibleCount > MAX_VISIBLE_OVERLAYS && (
          <p role="status" className="mt-3 rounded border border-warn px-2 py-1.5 text-xs text-fg">
            {t('layers.tooMany', { count: visibleCount, max: MAX_VISIBLE_OVERLAYS })}
          </p>
        )}

        {LAYER_GROUPS.map((g) => {
          const layers = LAYERS.filter((l) => l.group === g.id);
          if (!layers.length) return null;
          return (
            <section key={g.id} className="mt-4" aria-labelledby={`group-${g.id}`}>
              <h3 id={`group-${g.id}`} className="mb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                {placeName(locale, g.th, g.en)}
              </h3>
              <ul className="space-y-0.5">
                {layers.map((l) => (
                  <LayerRow key={l.id} layer={l} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
