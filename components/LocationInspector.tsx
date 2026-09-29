'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { formatCoord, formatDistance } from '@/lib/freshness/format';
import { placeName } from '@/lib/i18n';
import { findSource } from '@/lib/registry/sources';
import { useIsMobile } from '@/lib/hooks';
import { useMapStore, useT, type SheetSnap } from '@/lib/state/store';
import type { AdminCard, CardResult, ContextCard, FeatureKind, InspectResponse, InspectSection, SourceRef, VillageCard } from '@/lib/types';
import { DataFreshness } from '@/components/DataFreshness';
import { GeoBreadcrumb } from '@/components/GeoBreadcrumb';
import { Icon } from '@/components/Icon';

type Sel = { lat: number; lng: number };

function useSection<T>(section: InspectSection, sel: Sel | null) {
  const lat = (sel?.lat ?? 0).toFixed(6);
  const lng = (sel?.lng ?? 0).toFixed(6);
  return useQuery<CardResult<T>>({
    queryKey: ['inspect', section, lat, lng],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/inspect?lat=${lat}&lng=${lng}&section=${section}`, { signal });
      if (!r.ok) return { status: 'error' };
      const body = (await r.json()) as InspectResponse;
      return (body.sections[section] as CardResult<T> | undefined) ?? { status: 'error' };
    },
    staleTime: 5 * 60_000,
    retry: 0,
    enabled: sel !== null,
  });
}

// ---------------------------------------------------------------- card shell

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line px-4 py-3">
      <h3 id={id} className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 bg-fg" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-1/2" />
    </div>
  );
}

/** Loading / error / empty states shared by every card. Returns null when the card has data. */
function CardState<T>({ q, radiusM }: { q: ReturnType<typeof useSection<T>>; radiusM?: number }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  if (q.isPending) return <Skeleton />;
  const r = q.data;
  if (!r || r.status === 'ok') return null;
  const retry = (
    <button type="button" onClick={() => q.refetch()} className="ml-2 inline-flex min-h-11 items-center gap-1 text-accent underline">
      <Icon name="retry" size={16} /> {t('error.retry')}
    </button>
  );
  let main = t('empty.noPublicData');
  let reason: React.ReactNode = null;
  switch (r.status) {
    case 'timeout':
      return (
        <p className="text-sm text-fg-muted">
          {t('error.timeout')} {retry}
        </p>
      );
    case 'error':
      return (
        <p className="text-sm text-danger">
          {t('error.loadFailed')} {retry}
        </p>
      );
    case 'unavailable':
      reason = t('empty.dbNotConfigured');
      break;
    case 'not_imported':
      reason = `${t('empty.notImported')}: ${r.sourceIds.map((id) => findSource(id)?.organization ?? id).join(', ')}`;
      break;
    case 'not_connected':
      reason = t('empty.notConnected', { phase: r.phase });
      break;
    case 'empty':
      if (r.reason === 'outside_study_area') main = t('empty.outsideStudyArea');
      else if (r.reason === 'no_features_in_radius') reason = t('empty.noFeatureInRadius', { radius: formatDistance(r.radiusM ?? radiusM ?? 0, locale) });
      break;
  }
  return (
    <div className="text-sm">
      <p className="text-fg">{main}</p>
      {reason && <p className="mt-0.5 text-xs text-fg-subtle">{reason}</p>}
    </div>
  );
}

function SourceLine({ refs }: { refs: SourceRef[] }) {
  return (
    <div className="mt-2 space-y-1">
      {refs.map((s) => {
        const src = findSource(s.sourceId);
        return (
          <div key={s.sourceId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
            <button type="button" className="min-h-8 underline" onClick={() => useMapStore.getState().showInfo(null, s.sourceId)}>
              {src?.attribution ?? s.sourceId}
            </button>
            <DataFreshness sourceId={s.sourceId} observedAt={s.observedAt} fetchedAt={s.fetchedAt} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- cards

function AdminCardView({ q }: { q: ReturnType<typeof useSection<AdminCard>> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const state = <CardState q={q} />;
  if (q.data?.status !== 'ok') return <Card id="card-admin" title={t('inspector.sections.admin')}>{state}</Card>;
  const labels: Record<number, string> = { 1: t('inspector.admin.province'), 2: t('inspector.admin.district'), 3: t('inspector.admin.subdistrict') };
  return (
    <Card id="card-admin" title={t('inspector.sections.admin')}>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        {q.data.data.levels.map((l) => (
          <div key={l.pcode} className="contents">
            <dt className="text-fg-subtle">{labels[l.level]}</dt>
            <dd>
              {placeName(locale, l.nameTh, l.nameEn)} <span className="tabular text-xs text-fg-subtle">({l.pcode})</span>
            </dd>
          </div>
        ))}
      </dl>
      <SourceLine refs={q.data.sources} />
    </Card>
  );
}

function VillageCardView({ q }: { q: ReturnType<typeof useSection<VillageCard>> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  if (q.data?.status !== 'ok') {
    return (
      <Card id="card-village" title={t('inspector.sections.village')}>
        <CardState q={q} />
      </Card>
    );
  }
  return (
    <Card id="card-village" title={t('inspector.sections.village')}>
      <ul className="space-y-1">
        {q.data.data.nearest.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-baseline justify-between gap-3 rounded px-1 text-left hover:bg-surface-subtle"
              onClick={() => {
                const s = useMapStore.getState();
                s.flyTo({ center: [v.lng, v.lat], zoom: 15 });
                s.select({ lat: v.lat, lng: v.lng, label: placeName(locale, v.nameTh, v.nameEn) ?? undefined, highlight: { layerId: 'villages', key: 'id', value: v.id } });
              }}
            >
              <span>
                <span className="text-sm">{placeName(locale, v.nameTh, v.nameEn)}</span>
                <span className="block text-xs text-fg-subtle">
                  {[v.moo ? t('inspector.village.moo', { moo: v.moo }) : null, v.subdistrictTh ? `ต.${v.subdistrictTh}` : null, v.districtTh ? `อ.${v.districtTh}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="tabular shrink-0 text-sm">{formatDistance(v.distanceM, locale)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-fg-subtle">{t('inspector.village.nearestNote')}</p>
      <SourceLine refs={q.data.sources} />
    </Card>
  );
}

const CONTEXT_ORDER: FeatureKind[] = ['river', 'canal', 'stream', 'drain', 'reservoir', 'water', 'road_major', 'road_minor', 'coastline'];

function ContextCardView({ q }: { q: ReturnType<typeof useSection<ContextCard>> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  if (q.data?.status !== 'ok') {
    return (
      <Card id="card-context" title={t('inspector.sections.context')}>
        <CardState q={q} />
      </Card>
    );
  }
  const { features, radiusM } = q.data.data;
  const byKind = new Map(features.map((f) => [f.kind, f]));
  return (
    <Card id="card-context" title={t('inspector.sections.context')}>
      <ul className="divide-y divide-line">
        {CONTEXT_ORDER.map((k) => {
          const f = byKind.get(k);
          return (
            <li key={k} className="py-1">
              {f ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 rounded px-1 text-left hover:bg-surface-subtle"
                  onClick={() => useMapStore.getState().flyTo({ center: [f.nearestLng, f.nearestLat], zoom: 15 })}
                >
                  <span>
                    <span className="block text-xs text-fg-subtle">{t(`inspector.features.${k}`)}</span>
                    <span className="text-sm">{placeName(locale, f.nameTh, f.nameEn) ?? <span className="text-fg-subtle">{t('empty.unnamed')}</span>}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm">{f.distanceM < 1 ? t('inspector.features.inside') : formatDistance(f.distanceM, locale)}</span>
                </button>
              ) : (
                <div className="flex min-h-11 items-baseline justify-between gap-3 px-1">
                  <span className="text-xs text-fg-subtle">{t(`inspector.features.${k}`)}</span>
                  <span className="text-xs text-fg-subtle">{t('empty.noFeatureInRadius', { radius: formatDistance(radiusM, locale) })}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-fg-subtle">{t('inspector.features.osmNote')}</p>
      <SourceLine refs={q.data.sources} />
    </Card>
  );
}

function PlannedCard({ section, sel }: { section: 'conditions' | 'hazards' | 'satellite'; sel: Sel }) {
  const t = useT();
  const q = useSection<never>(section, sel);
  return (
    <Card id={`card-${section}`} title={t(`inspector.sections.${section}`)}>
      <CardState q={q} />
      {q.data?.status === 'not_connected' && <p className="mt-0.5 text-xs text-fg-subtle">{t(`inspector.planned.${section}`)}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- inspector

const SNAP_HEIGHT: Record<SheetSnap, string> = { peek: '120px', half: '50vh', full: 'calc(100dvh - 64px)' };

export function LocationInspector() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const selection = useMapStore((s) => s.selection);
  const snap = useMapStore((s) => s.sheetSnap);
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const admin = useSection<AdminCard>('admin', selection);
  const village = useSection<VillageCard>('village', selection);
  const context = useSection<ContextCard>('context', selection);

  // Highlight the containing subdistrict when the user clicked a bare point.
  useEffect(() => {
    if (!selection || selection.highlight || admin.data?.status !== 'ok') return;
    const sub = admin.data.data.levels.find((l) => l.level === 3);
    if (sub) useMapStore.getState().setHighlight({ layerId: 'admin-subdistrict', key: 'pcode', value: sub.pcode });
  }, [admin.data, selection]);

  useEffect(() => setCopied(false), [selection?.lat, selection?.lng]);

  if (!selection) return null;

  const levels = admin.data?.status === 'ok' ? admin.data.data.levels : [];
  const sub = levels.find((l) => l.level === 3);
  const title = selection.label ?? (sub ? (locale === 'th' || !sub.nameEn ? `ต.${sub.nameTh}` : sub.nameEn) : t('inspector.selectedPoint'));
  const villageCrumb = selection.highlight?.layerId === 'villages' && selection.label ? { name: selection.label, lng: selection.lng, lat: selection.lat } : undefined;

  const allRefs = [admin, village, context].flatMap((q) => (q.data && 'sources' in q.data ? q.data.sources : []));
  const uniqueRefs = [...new Map(allRefs.map((r) => [r.sourceId, r])).values()];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatCoord(selection.lat, selection.lng));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const close = () => useMapStore.getState().select(null);
  const cycleSnap = () => useMapStore.getState().setSheetSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: sheetRef.current?.getBoundingClientRect().height ?? 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    sheetRef.current.style.height = `${Math.max(80, drag.current.h - (e.clientY - drag.current.y))}px`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const h = sheetRef.current.getBoundingClientRect().height;
    sheetRef.current.style.height = '';
    drag.current = null;
    if (moved < 6) return cycleSnap();
    const vh = window.innerHeight;
    const snaps: Array<[SheetSnap, number]> = [
      ['peek', 120],
      ['half', vh * 0.5],
      ['full', vh - 64],
    ];
    const nearest = snaps.reduce((a, b) => (Math.abs(b[1] - h) < Math.abs(a[1] - h) ? b : a));
    useMapStore.getState().setSheetSnap(nearest[0]);
  };

  return (
    <aside
      ref={sheetRef}
      id="inspector"
      aria-labelledby="inspector-title"
      className={
        isMobile
          ? 'panel fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-b-none transition-[height] duration-200'
          : 'panel absolute top-[68px] right-3 bottom-16 z-20 flex w-[400px] max-w-[calc(100vw-24px)] flex-col'
      }
      style={isMobile ? { height: SNAP_HEIGHT[snap] } : undefined}
    >
      {isMobile && (
        <button
          type="button"
          className="flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center"
          aria-label={snap === 'full' ? t('inspector.collapse') : t('inspector.expand')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="h-1.5 w-12 rounded-full bg-line-strong" />
        </button>
      )}
      <header className="flex items-start gap-2 px-4 pt-2 pb-3 md:pt-3">
        <div className="min-w-0 flex-1">
          <h2 id="inspector-title" className="text-lg leading-snug font-semibold" tabIndex={-1}>
            {title}
          </h2>
          {levels.length > 0 && <GeoBreadcrumb levels={levels} village={villageCrumb} />}
          <div className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
            <span className="tabular">{formatCoord(selection.lat, selection.lng)}</span>
            <button type="button" onClick={copy} className="icon-btn -my-2 text-fg-muted" aria-label={t('inspector.copyCoords')} title={t('inspector.copyCoords')}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            <span role="status" className="text-xs">
              {copied ? t('inspector.copied') : ''}
            </span>
          </div>
        </div>
        <button type="button" onClick={close} className="icon-btn -mr-2" aria-label={t('inspector.close')}>
          <Icon name="close" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
        <PlannedCard section="conditions" sel={selection} />
        <PlannedCard section="hazards" sel={selection} />
        <AdminCardView q={admin} />
        <VillageCardView q={village} />
        <ContextCardView q={context} />
        <PlannedCard section="satellite" sel={selection} />
        <Card id="card-sources" title={t('inspector.sections.sources')}>
          {uniqueRefs.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('empty.noPublicData')}</p>
          ) : (
            <ul className="space-y-2">
              {uniqueRefs.map((r) => {
                const src = findSource(r.sourceId);
                if (!src) return null;
                return (
                  <li key={r.sourceId} className="text-sm">
                    <button type="button" className="text-left underline" onClick={() => useMapStore.getState().showInfo(null, r.sourceId)}>
                      {locale === 'en' ? src.organizationEn : src.organization}
                    </button>
                    <span className="block text-xs text-fg-subtle">{locale === 'en' ? src.datasetNameEn : src.datasetName}</span>
                    <DataFreshness sourceId={r.sourceId} observedAt={r.observedAt} fetchedAt={r.fetchedAt} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </aside>
  );
}
