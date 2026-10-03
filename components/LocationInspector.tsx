'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { formatCoord, formatDateTime, formatDistance, formatRelative } from '@/lib/freshness/format';
import { placeName } from '@/lib/i18n';
import { findSource } from '@/lib/registry/sources';
import { COLORS, LANDSLIDE_GRADE_COLORS, shorelineColor, type IconId } from '@/lib/registry/layers';
import { useIsMobile } from '@/lib/hooks';
import { useMapStore, useT, type SheetSnap } from '@/lib/state/store';
import type { AdminCard, CardResult, ConditionReading, ConditionsCard, ContextCard, EarthquakeEvent, FeatureKind, GeohazardPlace, GeohazardSummary, HazardsCard, InspectResponse, InspectSection, SourceRef, VariableConditions, VillageCard } from '@/lib/types';
import { CONDITION_VARIABLES } from '@/lib/registry/stationRules';
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

type SectionQuery<T> = ReturnType<typeof useSection<T>>;

// ---------------------------------------------------------------- building blocks

function Card({ id, title, icon, aside, children }: { id: string; title: string; icon: IconId | 'info'; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="tile lift bg-surface">
      <header className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-fg-muted">
          <Icon name={icon} size={16} />
        </span>
        <h3 id={id} className="flex-1 text-[15px] font-semibold">
          {title}
        </h3>
        {aside}
      </header>
      <div className="px-3.5 pb-3">{children}</div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5 py-1" aria-busy="true">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-1/2" />
    </div>
  );
}

function EmptyState({ main, reason, action }: { main: string; reason?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md bg-surface-subtle px-3 py-2.5">
      <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full border border-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{main}</p>
        {reason && <p className="mt-0.5 text-xs text-fg-subtle">{reason}</p>}
        {action}
      </div>
    </div>
  );
}

/** Loading / error / empty states shared by every card. Returns null when the card has data. */
function CardState<T>({ q }: { q: SectionQuery<T> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  if (q.isPending) return <Skeleton />;
  const r = q.data;
  if (!r || r.status === 'ok') return null;
  const retry = (
    <button type="button" onClick={() => q.refetch()} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent">
      <Icon name="retry" size={16} /> {t('error.retry')}
    </button>
  );
  switch (r.status) {
    case 'timeout':
      return <EmptyState main={t('error.timeout')} action={retry} />;
    case 'error':
      return <EmptyState main={t('error.loadFailed')} action={retry} />;
    case 'unavailable':
      return <EmptyState main={t('empty.noPublicData')} reason={t('empty.dbNotConfigured')} />;
    case 'not_imported':
      return <EmptyState main={t('empty.noPublicData')} reason={`${t('empty.notImported')}: ${r.sourceIds.map((id) => findSource(id)?.organization ?? id).join(', ')}`} />;
    case 'not_connected':
      return <EmptyState main={t('empty.noPublicData')} reason={t('empty.notConnected', { phase: r.phase })} />;
    case 'empty':
      if (r.reason === 'outside_study_area') return <EmptyState main={t('empty.outsideStudyArea')} />;
      if (r.reason === 'no_features_in_radius') return <EmptyState main={t('empty.noPublicData')} reason={t('empty.noFeatureInRadius', { radius: formatDistance(r.radiusM ?? 0, locale) })} />;
      return <EmptyState main={t('empty.noPublicData')} />;
  }
}

function SourceFooter({ refs }: { refs: SourceRef[] }) {
  const t = useT();
  return (
    <div className="mt-2.5 space-y-1 border-t border-line pt-2">
      {refs.map((s) => {
        const src = findSource(s.sourceId);
        return (
          <div key={s.sourceId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
            <span>{t('inspector.sourceLabel')}:</span>
            <button type="button" className="min-h-6 text-left text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-accent" onClick={() => useMapStore.getState().showInfo(null, s.sourceId)}>
              {src?.attribution ?? s.sourceId}
            </button>
            <DataFreshness sourceId={s.sourceId} observedAt={s.observedAt} fetchedAt={s.fetchedAt} />
          </div>
        );
      })}
    </div>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="-mx-1.5 flex min-h-12 w-[calc(100%+0.75rem)] items-center gap-3 rounded-md px-1.5 text-left hover:bg-surface-subtle">
      {children}
    </button>
  );
}

function Distance({ meters }: { meters: number }) {
  const locale = useMapStore((s) => s.locale);
  return <span className="tabular shrink-0 text-sm font-medium text-fg">{formatDistance(meters, locale)}</span>;
}

// ---------------------------------------------------------------- cards

function AdminCardView({ q }: { q: SectionQuery<AdminCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const labels: Record<number, string> = { 1: t('inspector.admin.province'), 2: t('inspector.admin.district'), 3: t('inspector.admin.subdistrict') };
  return (
    <Card id="card-admin" title={t('inspector.sections.admin')} icon="district">
      {q.data?.status === 'ok' ? (
        <>
          <dl className="divide-y divide-line">
            {q.data.data.levels.map((l) => (
              <div key={l.pcode} className="flex items-baseline gap-3 py-1.5">
                <dt className="w-16 shrink-0 text-xs text-fg-subtle">{labels[l.level]}</dt>
                <dd className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span className="text-sm">{placeName(locale, l.nameTh, l.nameEn)}</span>
                  <span className="tabular text-xs text-fg-subtle">{l.pcode}</span>
                </dd>
              </div>
            ))}
          </dl>
          <SourceFooter refs={q.data.sources} />
        </>
      ) : (
        <CardState q={q} />
      )}
    </Card>
  );
}

function VillageCardView({ q }: { q: SectionQuery<VillageCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  return (
    <Card id="card-village" title={t('inspector.sections.village')} icon="village">
      {q.data?.status === 'ok' ? (
        <>
          <ul>
            {q.data.data.nearest.map((v) => (
              <li key={v.id}>
                <RowButton
                  onClick={() => {
                    const s = useMapStore.getState();
                    s.flyTo({ center: [v.lng, v.lat], zoom: 15 });
                    s.select({ lat: v.lat, lng: v.lng, label: placeName(locale, v.nameTh, v.nameEn) ?? undefined, highlight: { layerId: 'villages', key: 'id', value: v.id } });
                  }}
                >
                  <span aria-hidden="true" className="tabular flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${COLORS.village} 12%, transparent)`, color: COLORS.village }}>
                    {v.moo ?? <Icon name="village" size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{placeName(locale, v.nameTh, v.nameEn)}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {[v.moo ? t('inspector.village.moo', { moo: v.moo }) : null, v.subdistrictTh ? `ต.${v.subdistrictTh}` : null, v.districtTh ? `อ.${v.districtTh}` : null, t('inspector.village.code', { code: v.id })].filter(Boolean).join(' · ')}
                    </span>
                    {v.sharedLocationCount > 1 && (
                      <span className="mt-0.5 flex items-start gap-1 text-[11px] text-warn">
                        <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                        {t('inspector.village.sharedLocation', { n: v.sharedLocationCount - 1 })}
                      </span>
                    )}
                  </span>
                  <Distance meters={v.distanceM} />
                </RowButton>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-fg-subtle">{t('inspector.village.nearestNote')}</p>
          <SourceFooter refs={q.data.sources} />
        </>
      ) : (
        <CardState q={q} />
      )}
    </Card>
  );
}

const CONTEXT_ORDER: FeatureKind[] = ['river', 'canal', 'stream', 'drain', 'reservoir', 'water', 'road_major', 'road_minor', 'coastline'];
const CONTEXT_STYLE: Record<FeatureKind, { icon: IconId; color: string }> = {
  river: { icon: 'river', color: COLORS.river },
  canal: { icon: 'canal', color: COLORS.canal },
  stream: { icon: 'stream', color: COLORS.stream },
  drain: { icon: 'canal', color: COLORS.canal },
  reservoir: { icon: 'reservoir', color: COLORS.waterOutline },
  water: { icon: 'water', color: COLORS.waterOutline },
  road_major: { icon: 'road', color: '#5b6270' },
  road_minor: { icon: 'road', color: '#8a8f98' },
  coastline: { icon: 'coastline', color: COLORS.coastline },
};

function ContextCardView({ q }: { q: SectionQuery<ContextCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  if (q.data?.status !== 'ok') {
    return (
      <Card id="card-context" title={t('inspector.sections.context')} icon="river">
        <CardState q={q} />
      </Card>
    );
  }
  const { features, radiusM } = q.data.data;
  const byKind = new Map(features.map((f) => [f.kind, f]));
  const missing = CONTEXT_ORDER.filter((k) => !byKind.has(k));
  return (
    <Card id="card-context" title={t('inspector.sections.context')} icon="river">
      <ul>
        {CONTEXT_ORDER.filter((k) => byKind.has(k)).map((k) => {
          const f = byKind.get(k)!;
          const st = CONTEXT_STYLE[k];
          return (
            <li key={k}>
              <RowButton onClick={() => useMapStore.getState().flyTo({ center: [f.nearestLng, f.nearestLat], zoom: 15 })}>
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${st.color} 13%, transparent)`, color: st.color }}>
                  <Icon name={st.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-fg-subtle">{t(`inspector.features.${k}`)}</span>
                  <span className="block truncate text-sm">{placeName(locale, f.nameTh, f.nameEn) ?? <span className="text-fg-subtle">{t('empty.unnamed')}</span>}</span>
                </span>
                {f.distanceM < 1 ? <span className="chip">{t('inspector.features.inside')}</span> : <Distance meters={f.distanceM} />}
              </RowButton>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 && (
        <p className="mt-1 text-xs text-fg-subtle">
          {missing.map((k) => t(`inspector.features.${k}`)).join(', ')}: {t('empty.noFeatureInRadius', { radius: formatDistance(radiusM, locale) })}
        </p>
      )}
      <p className="mt-1 text-xs text-fg-subtle">{t('inspector.features.osmNote')}</p>
      <SourceFooter refs={q.data.sources} />
    </Card>
  );
}

// ---------------------------------------------------------------- current conditions

function formatValue(v: number, variable: string, locale: string): string {
  const decimals = CONDITION_VARIABLES.find((r) => r.variable === variable)?.decimals ?? 1;
  return v.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Reading({ r, variable, elsewhere }: { r: ConditionReading; variable: string; elsewhere?: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const src = findSource(r.sourceId);
  const station = placeName(locale, r.stationNameTh, r.stationNameEn);
  const org = src ? (locale === 'en' ? src.organizationEn : src.organization) : r.sourceId;
  return (
    <div className={elsewhere ? 'rounded-md border border-dashed border-line-strong px-3 py-2' : ''}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`tabular font-semibold tracking-tight ${elsewhere ? 'text-lg text-fg-muted' : 'text-2xl'}`}>{formatValue(r.value, variable, locale)}</span>
        <span className="text-sm text-fg-muted">{t(`units.${r.unit}`)}</span>
        {r.officialStatus && (
          <span className="chip" style={r.officialColor ? { borderColor: r.officialColor } : undefined}>
            {r.officialColor && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: r.officialColor }} />}
            {r.officialStatus}
          </span>
        )}
      </div>
      {(r.officialDetail || r.bankPercent !== null) && (
        <p className="mt-0.5 text-xs text-fg-muted">
          {[r.officialDetail, r.bankPercent !== null ? t('conditions.bankPct', { pct: formatValue(r.bankPercent, 'water_level_bank_pct', locale) }) : null].filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="mt-1 text-xs text-fg-subtle">
        {station && <span className="text-fg-muted">{station}</span>}
        {' · '}
        {r.distanceM < 50 ? t('conditions.atStation') : t('conditions.distance', { distance: formatDistance(r.distanceM, locale) })}
        {r.agencyTh && <> · {t('conditions.via', { agency: r.agencyTh, source: org })}</>}
      </p>
      <div className="mt-1">
        <DataFreshness sourceId={r.sourceId} observedAt={r.observedAt} fetchedAt={r.fetchedAt} />
      </div>
      {r.officialStatus && !elsewhere && (
        <p className="mt-1 text-[11px] text-fg-subtle">{t('conditions.statusNote', { source: src?.organization ?? r.sourceId })}</p>
      )}
    </div>
  );
}

function VariableRow({ v }: { v: VariableConditions }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const rule = CONDITION_VARIABLES.find((r) => r.variable === v.variable);
  const label = rule ? (locale === 'en' ? rule.en : rule.th) : v.variable;
  const radius = formatDistance(v.rule.radiusM, locale);
  return (
    <li className="py-2.5 first:pt-0.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-muted">{label}</span>
        {v.disagree && (
          <span className="chip border-warn text-warn">
            <Icon name="alert" size={12} /> {t('conditions.disagree')}
          </span>
        )}
      </div>
      {v.readings.length > 0 ? (
        <div className="space-y-3">
          {v.readings.map((r) => (
            <Reading key={r.sourceId} r={r} variable={v.variable} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <EmptyState
            main={v.rule.kind === 'same_river' ? t('conditions.noStationRiver', { radius }) : t('conditions.noStationRadius', { radius })}
            reason={v.rule.kind === 'same_river' ? t('conditions.riverRuleNote') : undefined}
          />
          {v.elsewhere && (
            <div>
              <p className="mb-1 text-[11px] text-fg-subtle">{t('conditions.elsewhere')}</p>
              <Reading r={v.elsewhere} variable={v.variable} elsewhere />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ConditionsCardView({ q }: { q: SectionQuery<ConditionsCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const r = q.data;
  if (r?.status === 'not_connected') {
    return (
      <Card id="card-conditions" title={t('inspector.sections.conditions')} icon="rain" aside={<span className="chip">{t('layers.plannedPhase', { phase: r.phase })}</span>}>
        <EmptyState main={t('empty.noPublicData')} reason={`${t('inspector.plannedLabel')}: ${t('inspector.planned.conditions')}`} />
      </Card>
    );
  }
  if (r?.status !== 'ok') {
    return (
      <Card id="card-conditions" title={t('inspector.sections.conditions')} icon="rain">
        <CardState q={q} />
      </Card>
    );
  }
  const live = r.data.variables.filter((v) => v.connectedSourceIds.length > 0);
  const pending = r.data.variables.filter((v) => v.connectedSourceIds.length === 0);
  const label = (variable: string) => {
    const rule = CONDITION_VARIABLES.find((x) => x.variable === variable);
    return rule ? (locale === 'en' ? rule.en : rule.th) : variable;
  };
  return (
    <Card id="card-conditions" title={t('inspector.sections.conditions')} icon="rain">
      <ul className="divide-y divide-line">
        {live.map((v) => (
          <VariableRow key={v.variable} v={v} />
        ))}
      </ul>
      {pending.length > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-fg-subtle">
          {t('conditions.pending')}: {pending.map((v) => label(v.variable)).join(', ')}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- hazards

function Quake({ e }: { e: EarthquakeEvent }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const when = new Date(e.observedAt);
  const fmt = (v: number, d: number) => v.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <RowButton
          onClick={() => {
            const s = useMapStore.getState();
            s.flyTo({ center: [e.lng, e.lat], zoom: 6 });
            s.select({ lat: e.lat, lng: e.lng, label: [`M${e.mag.toFixed(1)}`, e.place].filter(Boolean).join(' · '), kind: 'earthquake' });
          }}
        >
          <span className="tabular flex h-8 min-w-10 shrink-0 items-center justify-center rounded-md px-1 text-xs font-semibold" style={{ background: 'color-mix(in srgb, #7c3aed 12%, transparent)', color: '#6d28d9' }}>
            M{fmt(e.mag, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" lang="en">{e.place ?? e.id}</span>
            <span className="block truncate text-xs text-fg-subtle" title={[formatDateTime(when, locale), e.magType ? `M${e.magType}` : null].filter(Boolean).join(' · ')}>
              {[formatRelative(when, locale), e.depthKm !== null ? t('hazards.depth', { depth: fmt(e.depthKm, 0) }) : null, e.status === 'reviewed' ? t('hazards.reviewed') : e.status === 'automatic' ? t('hazards.automatic') : e.status]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {e.distanceM < 1000 ? <span className="chip">{t('inspector.features.inside')}</span> : <Distance meters={e.distanceM} />}
        </RowButton>
      </div>
      {e.url?.startsWith('https://earthquake.usgs.gov/') && (
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="icon-btn shrink-0 text-fg-subtle hover:text-accent" aria-label={`${t('hazards.eventPage')}: ${e.place ?? e.id}`} title={t('hazards.eventPage')}>
          <Icon name="external" size={16} />
        </a>
      )}
    </div>
  );
}

function HazardsCardView({ q }: { q: SectionQuery<HazardsCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const r = q.data;
  if (r?.status === 'not_connected') {
    return (
      <Card id="card-hazards" title={t('inspector.sections.hazards')} icon="warning" aside={<span className="chip">{t('layers.plannedPhase', { phase: r.phase })}</span>}>
        <EmptyState main={t('empty.noPublicData')} reason={`${t('inspector.plannedLabel')}: ${t('inspector.planned.hazards')}`} />
      </Card>
    );
  }
  if (r?.status !== 'ok') {
    return (
      <Card id="card-hazards" title={t('inspector.sections.hazards')} icon="warning">
        <CardState q={q} />
      </Card>
    );
  }
  const eq = r.data.earthquakes;
  const vars = eq ? { mag: eq.minMagnitude, radius: eq.radiusKm.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB'), days: eq.windowDays } : null;
  const nearestShown = eq?.nearest && eq.recent.some((e) => e.id === eq.nearest!.id);
  return (
    <Card id="card-hazards" title={t('inspector.sections.hazards')} icon="warning">
      {r.data.geohazard && <Geohazards g={r.data.geohazard} />}
      {eq && vars && (
        <div className={r.data.geohazard ? 'mt-3 border-t border-line pt-3' : ''}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
              <Icon name="earthquake" size={14} /> {t('hazards.earthquakes')}
            </span>
            {eq.total > 0 && <span className="tabular text-xs text-fg-subtle">{t('hazards.count', { n: eq.total })}</span>}
          </div>
          <p className="mb-1 text-xs text-fg-subtle">{t('hazards.scope', vars)}</p>
          {eq.total === 0 ? (
            <EmptyState main={t('hazards.none', vars)} />
          ) : (
            <>
              <p className="mt-2 text-[11px] text-fg-subtle">{t('hazards.recent')}</p>
              <ul>
                {eq.recent.map((e) => (
                  <li key={e.id}>
                    <Quake e={e} />
                  </li>
                ))}
              </ul>
              {eq.nearest && !nearestShown && (
                <>
                  <p className="mt-2 text-[11px] text-fg-subtle">{t('hazards.nearest')}</p>
                  <Quake e={eq.nearest} />
                </>
              )}
            </>
          )}
          <p className="mt-1 text-xs text-fg-subtle">{t('hazards.placeNote')}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{t('hazards.smallNote')}</p>
        </div>
      )}
      {r.data.pendingSourceIds.length > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-fg-subtle">
          {t('hazards.pending')}: {[...new Set(r.data.pendingSourceIds.map((id) => findSource(id)?.[locale === 'en' ? 'datasetNameEn' : 'datasetName'] ?? id))].join(', ')}
        </p>
      )}
      <SourceFooter refs={r.sources} />
    </Card>
  );
}

function Geohazards({ g }: { g: GeohazardSummary }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const s = g.susceptibility;
  return (
    <div className="space-y-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
        <Icon name="landslide" size={14} /> {t('geohazard.title')}
      </span>
      {s ? (
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 rounded border border-black/10" style={{ background: LANDSLIDE_GRADE_COLORS[s.grade ?? 0] ?? '#e5e7eb' }} />
          <div className="min-w-0">
            <p className="text-sm">
              {t('geohazard.susceptibility')}: <strong>{s.level}</strong>
            </p>
            {s.desc && <p className="text-xs text-fg-subtle">{s.desc}</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">{t('geohazard.notAssessed')}</p>
      )}
      {g.inFlashFloodArea && (
        <p className="flex items-start gap-2 rounded-lg bg-[#fb923c]/10 px-2.5 py-1.5 text-sm text-[#9a3412]">
          <Icon name="flood" size={16} className="mt-0.5 shrink-0" /> {t('geohazard.flashFlood')}
        </p>
      )}
      {g.riskVillages.length > 0 && (
        <div>
          <p className="text-[11px] text-fg-subtle">{t('geohazard.riskVillages')}</p>
          <ul>
            {g.riskVillages.map((v) => (
              <li key={v.id}>
                <PlaceRow p={v} color="#dc2626" detail={v.risk} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.safePoints.length > 0 && (
        <div>
          <p className="text-[11px] text-fg-subtle">{t('geohazard.safePoints')}</p>
          <ul>
            {g.safePoints.map((v) => (
              <li key={v.id}>
                <PlaceRow p={v} color="#15803d" detail={[v.moo ? t('geohazard.moo', { moo: v.moo }) : null, v.tambon ? `ต.${v.tambon}` : null].filter(Boolean).join(' ')} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-fg-subtle">{t('geohazard.safeNote')}</p>
        </div>
      )}
      {g.coast && (
        <p className="flex items-start gap-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1 w-4 shrink-0 rounded" style={{ background: shorelineColor(g.coast.status) }} />
          <span>
            {t('geohazard.coast')}: <strong>{g.coast.status ?? '—'}</strong>
            <span className="block text-xs text-fg-subtle">
              {[g.coast.beach, formatDistance(g.coast.distanceM, locale), g.coast.year ? t('geohazard.dataYear', { year: g.coast.year }) : null].filter(Boolean).join(' · ')}
            </span>
          </span>
        </p>
      )}
      <p className="text-xs text-fg-subtle">{t('geohazard.surveyNote')}</p>
    </div>
  );
}

function PlaceRow({ p, color, detail }: { p: GeohazardPlace; color: string; detail: string | null }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  return (
    <RowButton
      onClick={() => {
        const s = useMapStore.getState();
        s.flyTo({ center: [p.lng, p.lat], zoom: 15 });
        s.select({ lat: p.lat, lng: p.lng, label: [p.name, p.moo ? t('geohazard.moo', { moo: p.moo }) : null].filter(Boolean).join(' ') || undefined, kind: 'point' });
      }}
    >
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{p.name ?? '—'}</span>
        <span className="block truncate text-xs text-fg-subtle">
          {[detail, p.yearBe ? t('geohazard.surveyYear', { year: p.yearBe }) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="tabular shrink-0 text-xs text-fg-subtle">{formatDistance(p.distanceM, locale)}</span>
    </RowButton>
  );
}

/**
 * The few things most people want first, in one line each: rain, the river
 * level here, landslide susceptibility, the nearest safe point. Only local
 * values (the same rules as the cards below); anything else stays in the cards.
 */
function QuickSummary({ conditions, hazards }: { conditions: SectionQuery<ConditionsCard>; hazards: SectionQuery<HazardsCard> }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const vars = conditions.data?.status === 'ok' ? conditions.data.data.variables : [];
  const rain = vars.find((v) => v.variable === 'rain_24h')?.readings[0];
  const water = vars.find((v) => v.variable === 'water_level')?.readings[0];
  const geo = hazards.data?.status === 'ok' ? hazards.data.data.geohazard : null;
  const safe = geo?.safePoints[0];
  const station = (r: ConditionReading) => placeName(locale, r.stationNameTh, r.stationNameEn) ?? r.stationId;
  const fmt = (n: number, d = 1) => n.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { maximumFractionDigits: d });

  const rows: { key: string; color: string; text: React.ReactNode; sub: string; onClick?: () => void }[] = [];
  if (rain) {
    rows.push({
      key: 'rain',
      color: rain.value >= 35 ? '#1d4ed8' : rain.value > 0 ? '#60a5fa' : '#cbd5e1',
      text: t('summary.rain', { value: fmt(rain.value) }),
      sub: `${station(rain)} · ${formatDistance(rain.distanceM, locale)}`,
    });
  }
  if (water) {
    rows.push({
      key: 'water',
      color: water.officialColor ?? '#94a3b8',
      text: water.officialStatus ? t('summary.water', { status: water.officialStatus }) : t('summary.waterValue', { value: fmt(water.value, 2), unit: water.unit }),
      sub: `${station(water)}${water.riverName ? ` · ${water.riverName}` : ''} · ${formatDistance(water.distanceM, locale)}`,
    });
  }
  if (geo?.susceptibility) {
    rows.push({ key: 'landslide', color: LANDSLIDE_GRADE_COLORS[geo.susceptibility.grade ?? 0] ?? '#e5e7eb', text: t('summary.landslide', { level: geo.susceptibility.level }), sub: t('summary.landslideSource') });
  }
  if (geo?.inFlashFloodArea) rows.push({ key: 'flash', color: '#fb923c', text: t('summary.flashFlood'), sub: t('summary.landslideSource') });
  if (safe) {
    rows.push({
      key: 'safe',
      color: '#15803d',
      text: t('summary.safe', { name: safe.name ?? '—' }),
      sub: `${formatDistance(safe.distanceM, locale)} · ${t('summary.tapToSee')}`,
      onClick: () => {
        const s = useMapStore.getState();
        s.flyTo({ center: [safe.lng, safe.lat], zoom: 15 });
        s.select({ lat: safe.lat, lng: safe.lng, label: safe.name ?? undefined, kind: 'point' });
      },
    });
  }
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="summary-title" className="panel-solid rounded-[14px] border border-line p-3">
      <h3 id="summary-title" className="mb-1.5 text-sm font-semibold">{t('summary.title')}</h3>
      <ul className="space-y-1">
        {rows.map((r) => {
          const body = (
            <>
              <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: r.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-medium">{r.text}</span>
                <span className="block truncate text-xs text-fg-subtle">{r.sub}</span>
              </span>
            </>
          );
          return (
            <li key={r.key}>
              {r.onClick ? (
                <button type="button" onClick={r.onClick} className="flex w-full items-start gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-surface-subtle">
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 px-1 py-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- inspector

// Mobile sheet sits above the tab bar (84 px) and below the search bar (68 px).
const SNAP_HEIGHT: Record<SheetSnap, string> = { peek: '132px', half: '46vh', full: 'calc(100dvh - 68px - 84px)' };

export function LocationInspector() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const selection = useMapStore((s) => s.selection);
  const snap = useMapStore((s) => s.sheetSnap);
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const admin = useSection<AdminCard>('admin', selection);
  const village = useSection<VillageCard>('village', selection);
  const context = useSection<ContextCard>('context', selection);
  const conditions = useSection<ConditionsCard>('conditions', selection);
  const hazards = useSection<HazardsCard>('hazards', selection);

  // Highlight the containing subdistrict when the user clicked a bare point.
  useEffect(() => {
    if (!selection || selection.highlight || admin.data?.status !== 'ok') return;
    const sub = admin.data.data.levels.find((l) => l.level === 3);
    if (sub) useMapStore.getState().setHighlight({ layerId: 'admin-subdistrict', key: 'pcode', value: sub.pcode });
  }, [admin.data, selection]);

  useEffect(() => {
    setCopied(false);
    setMoreOpen(false);
  }, [selection?.lat, selection?.lng]);

  if (!selection) return null;

  const levels = admin.data?.status === 'ok' ? admin.data.data.levels : [];
  const sub = levels.find((l) => l.level === 3);
  const isVillage = selection.highlight?.layerId === 'villages';
  const title = selection.label ?? (sub ? (locale === 'th' || !sub.nameEn ? `ต.${sub.nameTh}` : sub.nameEn) : t('inspector.selectedPoint'));
  const kindKey = selection.kind ?? (isVillage ? 'village' : selection.label ? 'place' : sub ? 'subdistrict' : 'point');
  const kind = t(`inspector.type.${kindKey === 'point' && sub && !selection.label ? 'subdistrict' : kindKey}`);
  // An admin-area selection stops the breadcrumb at its own level.
  const maxLevel = kindKey === 'province' ? 1 : kindKey === 'district' ? 2 : 3;
  const crumbLevels = levels.filter((l) => l.level <= maxLevel);
  const villageCrumb = isVillage && selection.label ? { name: selection.label, lng: selection.lng, lat: selection.lat } : undefined;

  const allRefs = [conditions, hazards, admin, village, context].flatMap((q) => (q.data && 'sources' in q.data ? q.data.sources : []));
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
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.height = `${Math.max(96, drag.current.h - (e.clientY - drag.current.y))}px`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const h = sheetRef.current.getBoundingClientRect().height;
    sheetRef.current.style.height = '';
    sheetRef.current.style.transition = '';
    drag.current = null;
    if (moved < 6) return cycleSnap();
    const vh = window.innerHeight;
    const snaps: Array<[SheetSnap, number]> = [
      ['peek', 132],
      ['half', vh * 0.46],
      ['full', vh - 68 - 84],
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
          ? 'panel anim-slide-up fixed inset-x-2 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 flex flex-col overflow-hidden transition-[height] duration-200 ease-out'
          : 'panel anim-slide-right absolute top-[76px] right-3 bottom-[72px] z-20 flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden'
      }
      style={isMobile ? { height: SNAP_HEIGHT[snap] } : undefined}
    >
      {isMobile && (
        <button
          type="button"
          className="flex h-5 w-full shrink-0 cursor-grab touch-none items-end justify-center"
          aria-label={snap === 'full' ? t('inspector.collapse') : t('inspector.expand')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </button>
      )}

      <div aria-hidden="true" className="thai-band" />
      <header className="flex items-start gap-2 border-b border-line bg-surface pt-2 pr-1.5 pb-3 pl-4 md:pt-3.5">
        <div className="min-w-0 flex-1">
          {kind !== title && <p className="eyebrow">{kind}</p>}
          <h2 id="inspector-title" className="font-display mt-0.5 text-xl leading-snug font-semibold" tabIndex={-1}>
            {title}
          </h2>
          {crumbLevels.length > 0 && (
            <div className="mt-1">
              <GeoBreadcrumb levels={crumbLevels} village={villageCrumb} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={copy} className="chip min-h-8 hover:border-line-strong hover:text-fg" aria-label={`${t('inspector.copyCoords')} ${formatCoord(selection.lat, selection.lng)}`}>
              <Icon name="pin" size={13} />
              <span className="tabular">{formatCoord(selection.lat, selection.lng)}</span>
              <Icon name={copied ? 'check' : 'copy'} size={13} className={copied ? 'text-ok' : ''} />
            </button>
            <span role="status" className="text-xs text-ok">
              {copied ? t('inspector.copied') : ''}
            </span>
          </div>
        </div>
        <button type="button" onClick={close} className="icon-btn shrink-0" aria-label={t('inspector.close')}>
          <Icon name="close" />
        </button>
      </header>

      <div className="stagger scroll-thin flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-surface-subtle/60 p-2.5 pb-6">
        <QuickSummary conditions={conditions} hazards={hazards} />
        <ConditionsCardView q={conditions} />
        <HazardsCardView q={hazards} />
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="inspector-more"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-sm font-semibold text-fg-muted hover:text-fg"
        >
          {moreOpen ? t('summary.less') : t('summary.more')}
          <Icon name="chevron" size={16} className={moreOpen ? 'rotate-180' : ''} />
        </button>
        <div id="inspector-more" hidden={!moreOpen} className="space-y-2.5">
          <VillageCardView q={village} />
          <ContextCardView q={context} />
          <AdminCardView q={admin} />
          <Card id="card-sources" title={t('inspector.sections.sources')} icon="info">
            {uniqueRefs.length === 0 ? (
              <EmptyState main={t('empty.noPublicData')} />
            ) : (
              <ul className="divide-y divide-line">
                {uniqueRefs.map((r) => {
                  const src = findSource(r.sourceId);
                  if (!src) return null;
                  return (
                    <li key={r.sourceId} className="py-2">
                      <button type="button" className="text-left text-sm font-medium hover:text-accent" onClick={() => useMapStore.getState().showInfo(null, r.sourceId)}>
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
      </div>
    </aside>
  );
}
