'use client';

import { classifyFreshness, classifyQuality } from '@/lib/freshness/classify';
import { formatDate, formatDateTime, formatRelative } from '@/lib/freshness/format';
import { findSource } from '@/lib/registry/sources';
import { useMapStore, useT } from '@/lib/state/store';
import type { Freshness, Quality, SourceStatus } from '@/lib/types';

const FRESHNESS_COLOR: Record<Freshness, string> = {
  LIVE: 'var(--ok)',
  RECENT: 'var(--info)',
  HISTORICAL: 'var(--neutral-dot)',
  ARCHIVED: 'var(--muted-dot)',
};

const QUALITY_COLOR: Record<Quality, string> = {
  CURRENT: 'var(--ok)',
  OFFICIAL_HISTORICAL: 'var(--info)',
  DELAYED: 'var(--warn)',
  NO_OBSERVATION: 'var(--muted-dot)',
};

export const STATUS_COLOR: Record<SourceStatus, string> = {
  ok: 'var(--ok)',
  degraded: 'var(--warn)',
  down: 'var(--danger)',
  not_imported: 'var(--neutral-dot)',
  not_connected: 'var(--muted-dot)',
  external: 'var(--info)',
  unknown: 'var(--muted-dot)',
};

export function Dot({ color, className = '' }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

/**
 * Badge such as "ย้อนหลัง · ข้อมูล ณ 21 ม.ค. 2565". Static datasets use the
 * date the source states; if the source states none, the badge says so
 * instead of showing the import time as if it were the data date.
 */
export function DataFreshness({ sourceId, observedAt, fetchedAt, checkedNothingFound }: { sourceId: string; observedAt: string | null; fetchedAt: string | null; checkedNothingFound?: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const src = findSource(sourceId);
  if (!src) return null;
  const observed = observedAt ? new Date(observedAt) : null;
  const quality = classifyQuality(observed, src);

  if (!observed && checkedNothingFound && fetchedAt) {
    // Nothing detected is a result: say when the source was last checked, not "no date stated".
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted" title={formatDateTime(new Date(fetchedAt), locale)}>
        <Dot color="var(--neutral-dot)" />
        <span className="tabular">{t('provenance.checkedNothingFound', { time: formatRelative(new Date(fetchedAt), locale) })}</span>
      </span>
    );
  }

  if (!observed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle" title={fetchedAt ? `${t('provenance.fetched')} ${formatDateTime(new Date(fetchedAt), locale)}` : undefined}>
        <Dot color={QUALITY_COLOR[quality]} />
        {t('provenance.observedUnknown')}
      </span>
    );
  }

  const freshness = classifyFreshness(observed, src);
  const isStatic = src.expectedUpdateMinutes === null;
  const when = isStatic ? formatDate(observed, locale) : formatRelative(observed, locale);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted" title={`${t(`freshness.quality.${quality}`)} · ${formatDateTime(observed, locale)}`}>
      <Dot color={FRESHNESS_COLOR[freshness]} />
      <span className="font-medium">{t(`freshness.${freshness}`)}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular">{isStatic ? t('freshness.observed', { time: when }) : t('freshness.updated', { time: when })}</span>
    </span>
  );
}
