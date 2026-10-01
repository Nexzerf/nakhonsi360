'use client';

import { useEffect, useRef, useState } from 'react';
import { BASEMAPS, LAYERS, LAYER_GROUPS, MAX_VISIBLE_OVERLAYS, type BasemapId, type LayerDef } from '@/lib/registry/layers';
import { useSources, layerStatus, layerHasData, layerUsable } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { placeName } from '@/lib/i18n';
import { formatDateTime } from '@/lib/freshness/format';
import { Icon } from '@/components/Icon';
import { Dot, STATUS_COLOR } from '@/components/DataFreshness';

export function LayerButton() {
  const t = useT();
  const open = useMapStore((s) => s.layerPanelOpen);
  return (
    <button
      type="button"
      className={`flex h-full min-w-12 items-center justify-center gap-2 px-3 text-sm font-medium ${open ? 'bg-surface-accent text-accent' : 'text-fg-muted hover:bg-surface-subtle hover:text-fg'}`}
      aria-expanded={open}
      aria-controls="layer-panel"
      onClick={() => useMapStore.getState().setLayerPanelOpen(!open)}
    >
      <Icon name="layers" />
      <span className="hidden sm:inline">{t('layers.title')}</span>
      <span className="sr-only sm:hidden">{t('layers.open')}</span>
    </button>
  );
}

/** Colour used for a layer's icon tile, taken from its legend symbol. */
function layerColor(layer: LayerDef): string {
  // Admin boundaries are drawn in greys that vanish on dark surfaces; use the text colour instead.
  if (layer.group === 'admin' && layer.id !== 'villages') return 'var(--fg-muted)';
  return layer.legend.type === 'fill' ? layer.legend.outline : layer.legend.color;
}

function LayerRow({ layer }: { layer: LayerDef }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const enabled = useMapStore((s) => s.enabledLayers.includes(layer.id));
  const zoom = useMapStore((s) => s.zoom);
  const failedAt = useMapStore((s) => s.layerErrors[layer.id]);
  const { data } = useSources();
  const available = layerUsable(layer, data);
  const status = failedAt ? 'down' : layerStatus(layer, data);
  const hasData = layerHasData(layer, data);
  const name = placeName(locale, layer.th, layer.en)!;
  const labelId = `layer-${layer.id}-label`;
  const noteId = `layer-${layer.id}-note`;
  const lastImport = layer.sourceIds.map((id) => data?.sources.find((s) => s.id === id)?.health.lastImport?.importedAt).find(Boolean);

  let note: string | null = null;
  if (!available) note = t('layers.plannedPhase', { phase: layer.phase });
  else if (failedAt) note = `${t('error.loadFailed')}${lastImport ? ` · ${t('error.lastSuccess', { time: formatDateTime(new Date(lastImport), locale) })}` : ''}`;
  else if (!hasData) note = status === 'unknown' ? t('status.dbDown') : t('layers.notImported');
  else if (enabled && zoom < layer.minzoom) note = `${t('layers.hiddenAtZoom')} · ${t('layers.minzoom', { zoom: layer.minzoom })}`;

  const toggle = () => {
    useMapStore.getState().clearLayerError(layer.id);
    useMapStore.getState().toggleLayer(layer.id);
  };
  const color = layerColor(layer);

  return (
    <li className={`group flex items-center gap-3 rounded-md py-1 pr-1 pl-2 ${available ? 'hover:bg-surface-subtle' : ''}`}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ background: available ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--surface-sunken)', color: available ? color : 'var(--fg-subtle)' }}
      >
        <Icon name={layer.icon} size={17} />
      </span>
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left disabled:cursor-not-allowed"
        onClick={toggle}
        disabled={!available}
        tabIndex={-1}
        aria-hidden="true"
      >
        <span id={labelId} className={`text-sm ${available ? 'text-fg' : 'text-fg-subtle'}`}>
          {name}
        </span>
        {note && (
          <span id={noteId} className={`flex items-center gap-1.5 text-xs ${failedAt ? 'text-danger' : 'text-fg-subtle'}`}>
            {available && <Dot color={STATUS_COLOR[status]} className="h-1.5! w-1.5!" />}
            {note}
          </span>
        )}
      </button>
      <button
        type="button"
        className="icon-btn h-11 w-9 min-w-9 opacity-70 group-hover:opacity-100"
        onClick={() => useMapStore.getState().showInfo(layer.id, null)}
        aria-label={`${t('layers.info')}: ${name}`}
      >
        <Icon name="info" size={17} />
      </button>
      <span className="flex min-h-11 items-center pr-1">
        <button
          type="button"
          role="switch"
          aria-checked={available && enabled}
          aria-labelledby={labelId}
          aria-describedby={note ? noteId : undefined}
          disabled={!available}
          onClick={toggle}
          className="switch"
        />
      </span>
    </li>
  );
}

/** Tiny CSS previews so the basemap choice is visual, not just a word. */
const BASEMAP_PREVIEW: Record<BasemapId, string> = {
  light: 'linear-gradient(135deg, #f4f3ef 0 55%, #cfe3f3 55% 70%, #f4f3ef 70%)',
  dark: 'linear-gradient(135deg, #1d2633 0 55%, #253a55 55% 70%, #1d2633 70%)',
  satellite: 'radial-gradient(circle at 30% 35%, #5d7a45 0 22%, transparent 23%), linear-gradient(135deg, #3e5b36 0 50%, #2c4a5e 50% 65%, #6b7b4c 65%)',
  terrain: 'repeating-radial-gradient(circle at 65% 60%, #efe6cf 0 5px, #d8c9a1 5px 6px), #efe6cf',
};

function GroupSection({ group, layers, defaultOpen }: { group: (typeof LAYER_GROUPS)[number]; layers: LayerDef[]; defaultOpen: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const enabled = useMapStore((s) => s.enabledLayers);
  const [open, setOpen] = useState(defaultOpen);
  const { data } = useSources();
  const available = layers.filter((l) => layerUsable(l, data));
  const on = available.filter((l) => enabled.includes(l.id)).length;
  const phase = Math.min(...layers.map((l) => l.phase));
  const headId = `group-${group.id}`;
  return (
    <section className="border-t border-line py-1 first:border-t-0" aria-labelledby={headId}>
      <h3 id={headId}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-2 text-left">
          <span className="flex-1 text-sm font-semibold">{placeName(locale, group.th, group.en)}</span>
          {available.length > 0 ? (
            <span className="tabular text-xs text-fg-subtle">
              {on}/{available.length}
            </span>
          ) : (
            <span className="chip">{t('layers.plannedPhase', { phase })}</span>
          )}
          <Icon name="chevron" size={16} className={`text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      {open && (
        <ul className="pb-1">
          {layers.map((l) => (
            <LayerRow key={l.id} layer={l} />
          ))}
        </ul>
      )}
    </section>
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
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useMapStore.getState().setLayerPanelOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const visibleCount = LAYERS.filter((l) => enabled.includes(l.id) && layerUsable(l, data) && layerHasData(l, data) && zoom >= l.minzoom).length;
  const current = BASEMAPS.find((b) => b.id === basemap)!;

  return (
    <div
      id="layer-panel"
      ref={panelRef}
      role="dialog"
      aria-label={t('layers.title')}
      className="panel rise fixed inset-x-0 bottom-0 z-40 flex max-h-[78vh] flex-col rounded-b-none md:absolute md:inset-x-auto md:top-[72px] md:right-3 md:bottom-auto md:max-h-[calc(100vh-10rem)] md:w-[340px] md:rounded-b-lg"
    >
      <div aria-hidden="true" className="thai-band rounded-t-lg" />
      <div className="flex items-center justify-between py-1 pr-1 pl-4">
        <h2 className="text-base font-semibold">{t('layers.title')}</h2>
        <button type="button" className="icon-btn" onClick={() => useMapStore.getState().setLayerPanelOpen(false)} aria-label={t('layers.close')}>
          <Icon name="close" />
        </button>
      </div>

      <div className="scroll-thin overflow-y-auto px-2 pb-3">
        <fieldset className="px-2 pb-3">
          <legend className="eyebrow mb-2">{t('layers.basemap')}</legend>
          <div className="grid grid-cols-4 gap-2">
            {BASEMAPS.map((b) => {
              const selected = basemap === b.id;
              return (
                <label key={b.id} className="group flex cursor-pointer flex-col items-center gap-1">
                  <input type="radio" name="basemap" value={b.id} checked={selected} onChange={() => useMapStore.getState().setBasemap(b.id)} className="peer sr-only" />
                  <span
                    aria-hidden="true"
                    className={`h-12 w-full rounded-md border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] ${selected ? 'border-accent ring-2 ring-accent' : 'border-line group-hover:border-line-strong'}`}
                    style={{ background: BASEMAP_PREVIEW[b.id] }}
                  />
                  <span className={`text-xs ${selected ? 'font-semibold text-accent' : 'text-fg-muted'}`}>{placeName(locale, b.th, b.en)}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {basemapFailed ? (
              <p className="flex items-center gap-1.5 text-xs text-danger">
                <Icon name="alert" size={14} /> {t('error.loadFailed')}
              </p>
            ) : (
              <span />
            )}
            <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-fg-subtle hover:text-accent" onClick={() => useMapStore.getState().showInfo(null, current.sourceId)}>
              <Icon name="info" size={14} />
              {t('layers.info')}
            </button>
          </div>
        </fieldset>

        {visibleCount > MAX_VISIBLE_OVERLAYS && (
          <p role="status" className="mx-2 mb-2 flex items-start gap-2 rounded-md bg-surface-subtle px-3 py-2 text-xs text-fg-muted">
            <Icon name="info" size={16} className="shrink-0 text-warn" />
            {t('layers.tooMany', { count: visibleCount, max: MAX_VISIBLE_OVERLAYS })}
          </p>
        )}

        <div className="rounded-lg border border-line">
          {LAYER_GROUPS.map((g) => {
            const layers = LAYERS.filter((l) => l.group === g.id);
            if (!layers.length) return null;
            return <GroupSection key={g.id} group={g} layers={layers} defaultOpen={layers.some((l) => layerUsable(l, data))} />;
          })}
        </div>
      </div>
    </div>
  );
}
