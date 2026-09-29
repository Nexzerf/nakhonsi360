'use client';

import { useEffect, useRef } from 'react';
import { formatDate, formatDateTime } from '@/lib/freshness/format';
import { getLayer, isLayerAvailable } from '@/lib/registry/layers';
import { findSource } from '@/lib/registry/sources';
import { useSources } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { placeName } from '@/lib/i18n';
import type { DataSource, SourceHealth } from '@/lib/types';
import { Dot, STATUS_COLOR } from '@/components/DataFreshness';
import { Icon } from '@/components/Icon';

/** Full metadata for one source: organisation, dataset, licence, dates, counts, link. */
export function SourceDetails({ source, health }: { source: DataSource; health?: SourceHealth }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const imp = health?.lastImport ?? null;
  const rows: Array<[string, React.ReactNode]> = [
    [t('provenance.organization'), locale === 'en' ? source.organizationEn : source.organization],
    [t('provenance.dataset'), locale === 'en' ? source.datasetNameEn : source.datasetName],
    [t('provenance.coverage'), source.coverage],
    [
      t('provenance.updates'),
      source.expectedUpdateMinutes === null ? t('provenance.static') : t('provenance.everyMinutes', { minutes: source.expectedUpdateMinutes }),
    ],
    [t('provenance.license'), source.license],
    [t('provenance.attribution'), source.attribution],
  ];
  if (imp) {
    rows.push([t('provenance.observed'), imp.sourceDate ? formatDate(new Date(imp.sourceDate), locale) : t('provenance.observedUnknown')]);
    rows.push([t('provenance.fetched'), formatDateTime(new Date(imp.importedAt), locale)]);
    rows.push([t('provenance.sourceFile'), <span key="f" className="break-all">{imp.sourceFile}{imp.sourceVersion ? ` (${imp.sourceVersion})` : ''}</span>]);
    rows.push([
      '',
      <span key="c" className="tabular">
        {t('provenance.importCounts', { source: imp.sourceRecordCount.toLocaleString(), imported: imp.importedCount.toLocaleString(), rejected: imp.rejectedCount.toLocaleString() })}
      </span>,
    ]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {health && (
          <span className="inline-flex items-center gap-1.5 rounded border border-line px-1.5 py-0.5">
            <Dot color={STATUS_COLOR[health.status]} />
            {t(`status.${health.status}`)}
          </span>
        )}
        <span className={`rounded border px-1.5 py-0.5 ${source.verified ? 'border-ok text-ok' : 'border-warn text-warn'}`}>
          {source.verified ? t('provenance.verified') : t('provenance.unverified')}
        </span>
        {source.requiresKey && <span className="rounded border border-line px-1.5 py-0.5 text-fg-muted">{t('provenance.requiresKey')}</span>}
      </div>
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="text-fg-subtle">{k}</dt>
            <dd className="text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {!imp && health && (health.status === 'not_imported' || health.status === 'unknown') && <p className="text-sm text-fg-muted">{t('provenance.noImport')}</p>}
      <p className="text-xs text-fg-subtle">{source.verificationNote}</p>
      <a href={source.endpoint.replace(/\{[^}]+\}.*$/, '')} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent underline">
        {t('provenance.link')} <Icon name="external" size={16} />
      </a>
    </div>
  );
}

/** Dialog opened from a layer's ⓘ button. */
export function DataProvenanceDialog() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const layerId = useMapStore((s) => s.infoLayerId);
  const sourceId = useMapStore((s) => s.infoSourceId);
  const close = () => useMapStore.getState().showInfo(null, null);
  const { data } = useSources();
  const ref = useRef<HTMLDialogElement>(null);
  const open = Boolean(layerId || sourceId);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const layer = layerId ? getLayer(layerId) : undefined;
  const ids = layer ? layer.sourceIds : sourceId ? [sourceId] : [];
  const title = layer ? placeName(locale, layer.th, layer.en) : t('provenance.title');

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      className="m-auto max-h-[85vh] w-[min(560px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-0 text-fg shadow-lg backdrop:bg-black/30"
      aria-labelledby="provenance-title"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <h2 id="provenance-title" className="text-base font-semibold">
              {t('provenance.title')} · {title}
            </h2>
            <button type="button" className="icon-btn" onClick={close} aria-label={t('layers.close')}>
              <Icon name="close" />
            </button>
          </div>
          <div className="space-y-5 overflow-y-auto px-4 py-3">
            {layer && !isLayerAvailable(layer) && (
              <p className="rounded border border-line bg-surface-subtle p-2 text-sm">{t('empty.notConnected', { phase: layer.phase })}</p>
            )}
            {layer && (locale === 'en' ? layer.zoomNoteEn : layer.zoomNoteTh) && (
              <p className="text-sm text-fg-muted">
                {t('provenance.zoomNote')}: {locale === 'en' ? layer.zoomNoteEn : layer.zoomNoteTh}
              </p>
            )}
            {ids.map((id) => {
              const src = findSource(id);
              if (!src) return null;
              const health = data?.sources.find((s) => s.id === id)?.health;
              return (
                <section key={id} aria-label={src.datasetName}>
                  <SourceDetails source={src} health={health} />
                </section>
              );
            })}
          </div>
        </div>
      )}
    </dialog>
  );
}
