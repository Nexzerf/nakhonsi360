'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type * as GeoJSON from 'geojson';
import { formatDateTime, formatRelative } from '@/lib/freshness/format';
import { OPEN_STATUSES, STATUSES } from '@/lib/reports/schema';
import { useReports } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

const HOURS = 72;

/** Count up to a number when it first appears or changes (instant with reduced motion). */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(a + (target - a) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
const BUCKET_H = 3;

/** A live layer as GeoJSON; null when its source is not connected or the database is down. */
function useLayerGeo(layerId: string) {
  return useQuery<GeoJSON.FeatureCollection | null>({
    queryKey: ['layer', layerId],
    queryFn: async () => {
      const r = await fetch(`/api/layers/${layerId}`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 0,
  });
}

function Card({ title, aside, onClick, children, label }: { title: string; aside?: React.ReactNode; onClick?: () => void; children: React.ReactNode; label?: string }) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-left text-[13px] font-bold">{title}</h3>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} className="panel lift block w-full p-3.5 text-left">
      {inner}
    </button>
  ) : (
    <section className="panel p-3.5">{inner}</section>
  );
}

/** Proportion bar with labels underneath, as in the reference "Shipment status" card. */
function SplitBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return null;
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: parts.filter((p) => p.value > 0).map((p) => `${Math.max(p.value / total, 0.12)}fr`).join(' ') }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.key} className="min-w-0">
            <p className="truncate text-[11px] text-fg-muted">{p.label}</p>
            <p className="tabular text-[11px] text-fg-subtle">{Math.round((p.value / total) * 100)}%</p>
            <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full" style={{ background: p.color }} />
          </div>
        ))}
    </div>
  );
}

function Source({ text, at }: { text: string; at: string | null }) {
  const locale = useMapStore((s) => s.locale);
  return (
    <p className="mt-2 truncate text-[11px] text-fg-subtle" title={at ? formatDateTime(new Date(at), locale) : undefined}>
      {text}
      {at ? ` · ${formatRelative(new Date(at), locale)}` : ''}
    </p>
  );
}

const latest = (fc: GeoJSON.FeatureCollection | null | undefined, key = 'observed_at') =>
  (fc?.features ?? [])
    .map((f) => (f.properties as Record<string, unknown>)[key])
    .filter((x): x is string => typeof x === 'string')
    .sort()
    .at(-1) ?? null;

function enable(layerId: string) {
  const s = useMapStore.getState();
  if (!s.enabledLayers.includes(layerId)) s.toggleLayer(layerId);
}

export function OverviewCards() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const reports = useReports();
  const water = useLayerGeo('water-stations');
  const rain = useLayerGeo('rain-24h');
  const quakes = useLayerGeo('earthquake');

  // ---- citizen reports
  const all = reports.data?.reports ?? [];
  const open = all.filter((r) => (OPEN_STATUSES as string[]).includes(r.status));
  const life = open.filter((r) => r.urgency === 'life').length;
  const now = Date.now();
  const buckets = Array.from({ length: HOURS / BUCKET_H }, () => 0);
  for (const r of all) {
    const ageH = (now - new Date(r.createdAt).getTime()) / 3_600_000;
    if (ageH >= 0 && ageH < HOURS) buckets[buckets.length - 1 - Math.floor(ageH / BUCKET_H)]!++;
  }
  const maxB = Math.max(1, ...buckets);

  // ---- ThaiWater water level, by the status scale ThaiWater publishes
  type WaterProps = { official_level: number | null; official_status: string | null; official_color: string | null; name_th: string | null };
  const wp = (water.data?.features ?? []).map((f) => f.properties as WaterProps);
  const byLevel = new Map<string, { label: string; color: string; value: number; level: number }>();
  for (const p of wp) {
    const k = p.official_status ?? '—';
    const e = byLevel.get(k) ?? { label: p.official_status ?? t('legend.noStatus'), color: p.official_color ?? '#94a3b8', value: 0, level: p.official_level ?? -1 };
    e.value++;
    byLevel.set(k, e);
  }
  const waterParts = [...byLevel.entries()].sort((a, b) => b[1].level - a[1].level).map(([k, v]) => ({ key: k, ...v }));
  const topWater = [...wp].filter((p) => p.official_level !== null).sort((a, b) => (b.official_level ?? 0) - (a.official_level ?? 0))[0];

  // ---- rain 24 h
  type RainProps = { value: number; name_th: string | null };
  const rp = (rain.data?.features ?? []).map((f) => f.properties as RainProps);
  const wet = rp.filter((p) => p.value > 0).length;
  const maxRain = [...rp].sort((a, b) => b.value - a.value)[0];

  // ---- earthquakes
  type QuakeProps = { mag: number; place: string | null };
  const qp = (quakes.data?.features ?? []).map((f) => f.properties as QuakeProps);
  const biggest = [...qp].sort((a, b) => b.mag - a.mag)[0];

  const openShown = useCountUp(open.length);
  const quakesShown = useCountUp(qp.length);
  const rainShown = useCountUp(maxRain?.value ?? 0);
  const fmt = (n: number, d = 0) => n.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });

  return (
    <div className="stagger space-y-2.5">
      {/* Hero: open reports + reports per 3 h over 72 h */}
      <Card
        title={t('overview.reportsTitle')}
        label={t('overview.openReports')}
        onClick={() => useMapStore.getState().openPanel('reports')}
        aside={life > 0 ? <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{t('overview.lifeN', { n: life })}</span> : undefined}
      >
        {reports.isError && !reports.data ? (
          <p className="text-sm text-fg-subtle">{t('overview.unavailable')}</p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="tabular text-[34px] leading-none font-extrabold tracking-tight">{fmt(Math.round(openShown))}</span>
              <span className="text-sm text-fg-muted">{t('overview.openOf', { n: fmt(all.length) })}</span>
            </p>
            <div className="mt-3 flex h-14 items-end gap-[3px]" aria-label={t('overview.perBucket', { h: BUCKET_H })} role="img">
              {buckets.map((v, i) => (
                <span
                  key={i}
                  className="bar-grow flex-1 rounded-t-[3px]"
                  style={{ animationDelay: `${120 + i * 18}ms`, height: `${v ? Math.max(8, (v / maxB) * 100) : 4}%`, background: i === buckets.length - 1 ? 'var(--gold)' : v ? 'var(--fg-muted)' : 'var(--border)' }}
                  title={`${v}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
              <span>{t('overview.hoursAgo', { h: HOURS })}</span>
              <span>{t('overview.now')}</span>
            </div>
          </>
        )}
      </Card>

      {all.length > 0 && (
        <Card title={t('overview.statusTitle')} aside={<span className="text-[11px] text-fg-subtle">{t('overview.last72')}</span>}>
          <SplitBar parts={STATUSES.map((s) => ({ key: s.id, label: locale === 'en' ? s.en : s.th, value: all.filter((r) => r.status === s.id).length, color: s.color }))} />
        </Card>
      )}

      <Card title={t('overview.waterTitle')} onClick={() => enable('water-stations')} label={t('overview.showOnMap')} aside={wp.length ? <span className="tabular text-[11px] text-fg-subtle">{t('overview.stationsN', { n: wp.length })}</span> : undefined}>
        {!water.data || !wp.length ? (
          <p className="text-sm text-fg-subtle">{t('overview.notConnected')}</p>
        ) : (
          <>
            {topWater && (
              <p className="mb-2 flex items-center gap-1.5 text-sm">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: topWater.official_color ?? '#94a3b8' }} />
                <span className="truncate">
                  {t('overview.highest')} <strong>{topWater.official_status}</strong> · {topWater.name_th}
                </span>
              </p>
            )}
            <SplitBar parts={waterParts} />
            <Source text={t('overview.waterSource')} at={latest(water.data)} />
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <Card title={t('overview.rainTitle')} onClick={() => enable('rain-24h')} label={t('overview.showOnMap')}>
          {!rain.data || !rp.length ? (
            <p className="text-xs text-fg-subtle">{t('overview.notConnected')}</p>
          ) : (
            <>
              <p className="tabular text-2xl leading-none font-extrabold">
                {fmt(rainShown, 1)}
                <span className="ml-1 text-xs font-normal text-fg-muted">{t('units.mm')}</span>
              </p>
              <p className="mt-1 truncate text-[11px] text-fg-muted">{t('overview.rainMax', { name: maxRain?.name_th ?? '—' })}</p>
              <p className="text-[11px] text-fg-subtle">{t('overview.rainWet', { n: wet, total: rp.length })}</p>
            </>
          )}
        </Card>
        <Card title={t('overview.quakeTitle')} onClick={() => enable('earthquake')} label={t('overview.showOnMap')}>
          {!quakes.data ? (
            <p className="text-xs text-fg-subtle">{t('overview.notConnected')}</p>
          ) : (
            <>
              <p className="tabular text-2xl leading-none font-extrabold">{fmt(Math.round(quakesShown))}</p>
              <p className="mt-1 truncate text-[11px] text-fg-muted">{biggest ? t('overview.quakeMax', { mag: biggest.mag.toFixed(1), place: biggest.place ?? '' }) : t('overview.quakeNone')}</p>
              <p className="text-[11px] text-fg-subtle">{t('overview.quakeScope')}</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Mobile: compact live numbers under the search bar; tapping opens the overview. */
export function KpiChips() {
  const t = useT();
  const reports = useReports();
  const water = useLayerGeo('water-stations');
  const all = reports.data?.reports ?? [];
  const open = all.filter((r) => (OPEN_STATUSES as string[]).includes(r.status));
  const life = open.filter((r) => r.urgency === 'life').length;
  const wp = (water.data?.features ?? []).map((f) => f.properties as { official_level: number | null; official_status: string | null; official_color: string | null });
  const top = [...wp].filter((p) => p.official_level !== null).sort((a, b) => (b.official_level ?? 0) - (a.official_level ?? 0))[0];
  const chip = 'panel pointer-events-auto flex min-h-10 shrink-0 items-center gap-1.5 rounded-full! px-3 text-xs font-bold';
  return (
    <div className="stagger scroll-thin pointer-events-none -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
      <button type="button" className={chip} onClick={() => useMapStore.getState().openPanel('reports')}>
        <Icon name="list" size={15} /> {t('overview.chipOpen', { n: open.length })}
      </button>
      <button type="button" className={chip} onClick={() => useMapStore.getState().openPanel('cctv')}>
        <Icon name="cctv" size={15} /> {t('nav.cctv')}
      </button>
      {life > 0 && (
        <button type="button" className={`${chip} text-danger`} onClick={() => useMapStore.getState().openPanel('reports')}>
          <span aria-hidden="true" className="anim-pulse h-2 w-2 rounded-full bg-danger" /> {t('overview.lifeN', { n: life })}
        </button>
      )}
      {top && (
        <button type="button" className={chip} onClick={() => enable('water-stations')}>
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: top.official_color ?? '#94a3b8' }} />
          {t('overview.chipWater', { status: top.official_status ?? '' })}
        </button>
      )}
      <button type="button" className={chip} onClick={() => useMapStore.getState().setOverviewOpen(true)}>
        <Icon name="province" size={15} /> {t('overview.title')}
      </button>
    </div>
  );
}
