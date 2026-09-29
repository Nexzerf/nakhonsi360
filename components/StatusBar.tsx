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

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="status-details"
        className="panel flex min-h-11 items-center gap-2 px-3 text-xs text-fg-muted"
      >
        <span className="sr-only">{t('status.label')}: </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {active.map((s) => (
            <Dot key={s.id} color={STATUS_COLOR[s.health.status]} />
          ))}
        </span>
        {isError || data?.database === 'error' ? (
          <span className="text-danger">{t('error.loadFailed')}</span>
        ) : data?.database === 'not_configured' ? (
          <span>{t('status.dbDown')}</span>
        ) : (
          <span className="tabular">{t('status.summary', { ok, total: active.length })}</span>
        )}
        <span aria-hidden="true">·</span>
        <span className="tabular" title={last ? formatDateTime(new Date(last), locale) : undefined}>
          {last ? t('status.lastUpdate', { time: formatRelative(new Date(last), locale) }) : t('status.noUpdate')}
        </span>
        <Icon name="chevron" size={14} className={open ? '' : 'rotate-180'} />
      </button>
      {open && (
        <div id="status-details" className="panel absolute right-0 bottom-full mb-1 w-72 max-w-[calc(100vw-2rem)] p-3 text-sm">
          <ul className="space-y-1.5">
            {active.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <Dot color={STATUS_COLOR[s.health.status]} className="mt-1.5" />
                <button type="button" className="text-left" onClick={() => useMapStore.getState().showInfo(null, s.id)}>
                  <span className="block">{locale === 'en' ? s.organizationEn : s.organization}</span>
                  <span className="block text-xs text-fg-subtle">{t(`status.${s.health.status}`)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/about-data" className="mt-2 inline-flex min-h-11 items-center text-accent underline">
            {t('app.aboutData')}
          </Link>
        </div>
      )}
    </div>
  );
}
