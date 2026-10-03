'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useMapStore, useT } from '@/lib/state/store';
import { formatDateTime } from '@/lib/freshness/format';
import type { WarningsResponse } from '@/lib/types';
import { Icon } from '@/components/Icon';

/**
 * TMD announcements in effect, shown while the "คำเตือนภัย" layer is on.
 * They are national notices: the text says which regions they cover, so the
 * banner never claims one applies to the province.
 */
export function WarningsBanner() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const on = useMapStore((s) => s.enabledLayers.includes('weather-warnings'));
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery<WarningsResponse>({
    queryKey: ['warnings'],
    queryFn: async ({ signal }) => (await fetch('/api/warnings', { signal })).json(),
    refetchInterval: 5 * 60_000,
    enabled: on,
  });
  if (!on || !q.data || q.data.status === 'not_connected') return null;
  const d = q.data;
  const time = (iso: string | null) => (iso ? formatDateTime(new Date(iso), locale) : '—');

  return (
    <section aria-label={t('warnings.title')} className="panel pointer-events-auto w-full max-w-[34rem] overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon name="warning" size={18} className={d.warnings.length ? 'shrink-0 text-warn' : 'shrink-0 text-fg-subtle'} />
        <h2 className="flex-1 font-semibold">{d.warnings.length ? t('warnings.active', { count: d.warnings.length }) : t('warnings.none')}</h2>
        <button type="button" className="icon-btn h-9 w-9 min-w-9" onClick={() => useMapStore.getState().toggleLayer('weather-warnings')} aria-label={t('warnings.hide')}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {d.warnings.length > 0 && (
        <ul className="max-h-[40vh] space-y-1 overflow-y-auto border-t border-line px-3 py-2">
          {d.warnings.map((w) => {
            const title = (locale === 'en' && w.titleEn) || w.titleTh;
            const headline = (locale === 'en' && w.headlineEn) || w.headlineTh;
            const url = (locale === 'en' && w.urlEn) || w.urlTh;
            const expanded = open === w.id;
            return (
              <li key={w.id}>
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : w.id)} className="flex min-h-11 w-full items-start gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-fg-subtle">
                      {t('warnings.effect', { from: time(w.effectStart), to: time(w.effectEnd) })}
                    </span>
                  </span>
                  <Icon name="chevron" size={16} className={`mt-1 shrink-0 text-fg-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="space-y-2 pb-2 text-fg-muted">
                    {headline && <p className="whitespace-pre-line">{headline}</p>}
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-accent underline">
                        {t('warnings.full')} <Icon name="external" size={13} />
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line px-3 py-1.5 text-xs text-fg-subtle">
        {t('warnings.note')} · {t('warnings.checked', { time: time(d.checkedAt) })}
      </p>
    </section>
  );
}
