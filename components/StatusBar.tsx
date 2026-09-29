'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelative, formatDateTime } from '@/lib/freshness/format';
import { useSources } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { CURRENT_PHASE } from '@/lib/registry/layers';
import { Dot, STATUS_COLOR } from '@/components/DataFreshness';
import { Icon } from '@/components/Icon';

/** Per-provider health dots and the latest update, for sources active in this phase. */
export function StatusBar() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const { data, isError } = useSources();
  const [open, setOpen] = useState(false);

  const active = (data?.sources ?? []).filter((s) => s.phase <= CURRENT_PHASE && s.health.status !== 'external');
  const ok = active.filter((s) => s.health.status === 'ok').length;
  const last = active
    .map((s) => s.health.lastImport?.importedAt ?? s.health.lastRun?.finishedAt)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);

  const summary =
    isError || data?.database === 'error' ? (
      <span className="text-danger">{t('error.loadFailed')}</span>
    ) : data?.database === 'not_configured' ? (
      <span>{t('status.dbDown')}</span>
    ) : (
      <span className="tabular">{t('status.summary', { ok, total: active.length })}</span>
    );

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="status-details"
        className="panel flex min-h-11 items-center gap-2.5 px-3.5 text-xs text-fg-muted hover:text-fg"
      >
        <span className="sr-only">{t('status.label')}: </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {active.map((s) => (
            <Dot key={s.id} color={STATUS_COLOR[s.health.status]} className="h-2! w-2!" />
          ))}
        </span>
        {summary}
        <span aria-hidden="true" className="hidden h-3.5 w-px bg-line sm:block" />
        <span className="tabular hidden sm:inline" title={last ? formatDateTime(new Date(last), locale) : undefined}>
          {last ? t('status.lastUpdate', { time: formatRelative(new Date(last), locale) }) : t('status.noUpdate')}
        </span>
        <Icon name="chevron" size={14} className={`transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <div id="status-details" className="panel rise absolute right-0 bottom-full mb-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden">
          <p className="eyebrow border-b border-line px-4 py-2.5">{t('status.label')}</p>
          <ul className="py-1">
            {active.map((s) => (
              <li key={s.id}>
                <button type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-surface-subtle" onClick={() => useMapStore.getState().showInfo(null, s.id)}>
                  <Dot color={STATUS_COLOR[s.health.status]} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{locale === 'en' ? s.organizationEn : s.organization}</span>
                    <span className="block text-xs text-fg-subtle">{t(`status.${s.health.status}`)}</span>
                  </span>
                  <Icon name="info" size={16} className="text-fg-subtle" />
                </button>
              </li>
            ))}
          </ul>
          <Link href="/about-data" className="flex min-h-11 items-center gap-1.5 border-t border-line px-4 text-sm font-medium text-accent hover:bg-surface-subtle">
            {t('app.aboutData')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
