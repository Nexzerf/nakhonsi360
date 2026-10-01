'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '@/lib/freshness/format';
import { HAZARDS, NEEDS, STATUSES, URGENCIES, WATER_DEPTH_PRESETS, WATER_TRENDS, type PublicReport } from '@/lib/reports/schema';
import { REPORTS_REFRESH_MS, useMyReports, useReport, useReports } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

const label = (locale: string, x: { th: string; en: string } | undefined) => (x ? (locale === 'en' ? x.en : x.th) : '');
const hazardOf = (id: string) => HAZARDS.find((h) => h.id === id);
const urgencyOf = (id: string) => URGENCIES.find((u) => u.id === id);
const statusOf = (id: string) => STATUSES.find((s) => s.id === id);

/** Re-render every few seconds so "x seconds ago" stays true. */
function useNow(ms = 5000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function StatusChip({ status }: { status: string }) {
  const locale = useMapStore((s) => s.locale);
  const s = statusOf(status);
  return (
    <span className="chip" style={s ? { borderColor: s.color, color: s.color } : undefined}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s?.color }} />
      {label(locale, s)}
    </span>
  );
}

function LiveLine({ updatedAt, failed }: { updatedAt: number; failed: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const now = useNow();
  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-fg-subtle">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${failed ? 'bg-danger' : 'animate-pulse bg-ok'}`} />
      {failed ? t('reports.refreshFailed') : t('reports.live', { s: REPORTS_REFRESH_MS / 1000 })}
      {updatedAt > 0 && <> · {t('reports.checked', { time: formatRelative(new Date(updatedAt), locale, now) })}</>}
    </p>
  );
}

function place(r: PublicReport): string {
  return [r.subdistrictTh ? `ต.${r.subdistrictTh}` : null, r.districtTh ? `อ.${r.districtTh}` : null].filter(Boolean).join(' ');
}

function ReportRow({ r, mine }: { r: PublicReport; mine: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const h = hazardOf(r.hazard);
  const u = urgencyOf(r.urgency);
  const closed = !statusOf(r.status)?.open;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          useMapStore.getState().openReport(r.id);
          useMapStore.getState().flyTo({ center: [r.lng, r.lat], zoom: 14 });
        }}
        className={`flex w-full items-start gap-3 rounded-md px-1.5 py-2.5 text-left hover:bg-surface-subtle ${closed ? 'opacity-70' : ''}`}
      >
        <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${u?.color} 14%, transparent)`, color: u?.color }}>
          <Icon name={h?.icon ?? 'warning'} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{label(locale, h)}</span>
            <span className="text-xs font-medium" style={{ color: u?.color }}>
              {label(locale, u)}
            </span>
            {mine && <span className="chip border-accent text-accent">{t('reports.mine')}</span>}
          </span>
          <span className="block truncate text-xs text-fg-muted">{[place(r) || t('reports.noArea'), r.placeNote].filter(Boolean).join(' · ')}</span>
          {r.needs.length > 0 && <span className="block truncate text-xs text-fg-subtle">{t('reports.needs')}: {r.needs.map((n) => label(locale, NEEDS.find((x) => x.id === n))).join(', ')}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <StatusChip status={r.status} />
            <span className="text-xs text-fg-subtle" title={formatDateTime(new Date(r.createdAt), locale)}>
              {formatRelative(new Date(r.createdAt), locale)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

function ReportList() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const q = useReports();
  const mine = useMyReports();
  const [hazard, setHazard] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);

  const all = q.data?.reports ?? [];
  const shown = all.filter((r) => (!hazard || r.hazard === hazard) && (!openOnly || statusOf(r.status)?.open) && (!mineOnly || mine.has(r.id)));
  const present = HAZARDS.filter((h) => all.some((r) => r.hazard === h.id));
  const lifeOpen = all.filter((r) => r.urgency === 'life' && statusOf(r.status)?.open).length;

  return (
    <SidePanel id="reports-panel" title={t('reports.title')}>
      <LiveLine updatedAt={q.dataUpdatedAt} failed={q.isError} />
      <button type="button" onClick={() => useMapStore.getState().openPanel('report')} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 font-semibold text-white">
        <Icon name="megaphone" /> {t('actions.report')}
      </button>

      {lifeOpen > 0 && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{t('reports.lifeOpen', { n: lifeOpen })}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('reports.filter')}>
        <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly(!openOnly)} className={`chip min-h-9 ${openOnly ? 'border-accent text-accent' : ''}`}>
          {t('reports.openOnly')}
        </button>
        {mine.size > 0 && (
          <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)} className={`chip min-h-9 ${mineOnly ? 'border-accent text-accent' : ''}`}>
            {t('reports.mineOnly')}
          </button>
        )}
        {present.length > 1 &&
          present.map((h) => (
            <button key={h.id} type="button" aria-pressed={hazard === h.id} onClick={() => setHazard(hazard === h.id ? null : h.id)} className={`chip min-h-9 ${hazard === h.id ? 'border-accent text-accent' : ''}`}>
              {label(locale, h)}
            </button>
          ))}
      </div>

      {q.isPending ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
        </div>
      ) : q.isError && !q.data ? (
        <p className="mt-3 rounded-md bg-surface-subtle px-3 py-2.5 text-sm">{t('reports.loadFailed')}</p>
      ) : shown.length === 0 ? (
        <p className="mt-3 rounded-md bg-surface-subtle px-3 py-2.5 text-sm text-fg-muted">{all.length ? t('reports.noneFiltered') : t('reports.none')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {shown.map((r) => (
            <ReportRow key={r.id} r={r} mine={mine.has(r.id)} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-fg-subtle">{t('reports.unverifiedNote')}</p>
    </SidePanel>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-28 shrink-0 text-xs text-fg-subtle">{k}</dt>
      <dd className="min-w-0 flex-1 text-sm">{v}</dd>
    </div>
  );
}

function ReportDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const q = useReport(id);
  const mine = useMyReports();
  const back = () => useMapStore.getState().openReport(null);
  const r = q.data?.report;

  if (!r) {
    return (
      <SidePanel id="reports-panel" title={t('reports.detailTitle')} onBack={back}>
        {q.isPending ? <div className="skeleton h-24" aria-busy="true" /> : <p className="text-sm">{t('reports.notFound')}</p>}
      </SidePanel>
    );
  }
  const h = hazardOf(r.hazard);
  const u = urgencyOf(r.urgency);
  const depthLabel = r.waterDepthCm !== null ? WATER_DEPTH_PRESETS.find((p) => p.cm === r.waterDepthCm) : undefined;
  return (
    <SidePanel id="reports-panel" title={label(locale, h)} onBack={back}>
      <LiveLine updatedAt={q.dataUpdatedAt} failed={q.isError} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip status={r.status} />
        <span className="chip" style={{ borderColor: u?.color, color: u?.color }}>
          {label(locale, u)}
        </span>
        {mine.has(r.id) && <span className="chip border-accent text-accent">{t('reports.mine')}</span>}
      </div>
      {r.responderNote && (
        <div className="mt-3 rounded-md border border-accent/40 bg-surface-accent px-3 py-2">
          <p className="text-xs font-semibold text-accent">{t('reports.responderNote')}</p>
          <p className="mt-0.5 text-sm">{r.responderNote}</p>
        </div>
      )}
      <dl className="mt-3 divide-y divide-line">
        <Field k={t('reports.where')} v={<>{place(r) || t('reports.noArea')}{r.placeNote && <span className="block text-fg-muted">{r.placeNote}</span>}</>} />
        <Field
          k={t('reports.when')}
          v={
            <>
              {formatDateTime(new Date(r.createdAt), locale)} <span className="text-fg-subtle">({formatRelative(new Date(r.createdAt), locale)})</span>
            </>
          }
        />
        {r.waterDepthCm !== null && (
          <Field
            k={t('report.waterDepth')}
            v={`${depthLabel ? `${label(locale, depthLabel)} ` : ''}~${r.waterDepthCm} ${t('units.cm')}${r.waterTrend ? ` · ${label(locale, WATER_TRENDS.find((w) => w.id === r.waterTrend))}` : ''}`}
          />
        )}
        {r.needs.length > 0 && <Field k={t('reports.needs')} v={r.needs.map((n) => label(locale, NEEDS.find((x) => x.id === n))).join(', ')} />}
        {(r.people !== null || r.vulnerable) && (
          <Field k={t('report.people')} v={[r.people !== null ? t('reports.peopleN', { n: r.people }) : null, r.vulnerable ? t('report.vulnerable') : null].filter(Boolean).join(' · ')} />
        )}
        {r.details && <Field k={t('report.details')} v={<span className="whitespace-pre-line">{r.details}</span>} />}
        <Field
          k={t('reports.position')}
          v={
            <>
              <span className="tabular">
                {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
              </span>
              <span className="block text-xs text-fg-subtle">{r.locationSource === 'gps' ? t('reports.fromGps', { m: r.gpsAccuracyM ?? '?' }) : t('reports.fromMap')}</span>
            </>
          }
        />
        <Field k={t('reports.contact')} v={r.hasContact ? t('reports.contactPrivate') : t('reports.noContact')} />
        <Field k={t('report.code')} v={<span className="tabular">{r.id}</span>} />
      </dl>

      <h3 className="mt-4 text-sm font-semibold">{t('reports.timeline')}</h3>
      <ol className="mt-1 space-y-2 border-l border-line pl-3">
        <li className="text-sm">
          <span className="block text-xs text-fg-subtle">{formatDateTime(new Date(r.createdAt), locale)}</span>
          {t('reports.created')}
        </li>
        {(q.data?.updates ?? []).map((up, i) => (
          <li key={i} className="text-sm">
            <span className="block text-xs text-fg-subtle">{formatDateTime(new Date(up.at), locale)}</span>
            {up.status && <StatusChip status={up.status} />}
            {up.note && <p className="mt-0.5">{up.note}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-fg-subtle">{t('reports.unverifiedNote')}</p>
    </SidePanel>
  );
}

export function ReportsPanel() {
  const id = useMapStore((s) => s.reportId);
  return id ? <ReportDetail id={id} /> : <ReportList />;
}
