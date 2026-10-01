'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '@/lib/freshness/format';
import { useQueryClient } from '@tanstack/react-query';
import { HAZARDS, LIMITS, NEEDS, STATUSES, UPDATE_ACTIONS, URGENCIES, WATER_DEPTH_PRESETS, WATER_TRENDS, type PublicReport, type ReportUpdate, type UpdateActionId } from '@/lib/reports/schema';
import { REPORTS_REFRESH_MS, editTokenFor, saveHelperName, savedHelperName, useMyReports, useReport, useReports } from '@/lib/reports/client';
import { telHref } from '@/lib/registry/emergency';
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
      {updatedAt > 0 && <> · {t('reports.checked', { time: formatRelative(new Date(updatedAt), locale, new Date(Math.max(now.getTime(), updatedAt))) })}</>}
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
          {r.lastUpdate && (
            <span className="block truncate text-xs text-fg-muted">
              ↳ {[r.lastUpdate.action !== 'note' ? label(locale, UPDATE_ACTIONS.find((a) => a.id === r.lastUpdate!.action)) : null, r.lastUpdate.note].filter(Boolean).join(': ')}
            </span>
          )}
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

function UpdateLine({ up }: { up: ReportUpdate }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const action = UPDATE_ACTIONS.find((a) => a.id === up.action);
  const who = up.byReporter ? t('reports.byReporter') : up.authorName ?? t('reports.anonymous');
  return (
    <>
      <span className="block text-xs text-fg-subtle">
        {formatDateTime(new Date(up.at), locale)} · {who}
      </span>
      {up.action !== 'note' && (
        <span className="text-sm font-medium" style={{ color: statusOf(action?.status ?? '')?.color }}>
          {label(locale, action)}
        </span>
      )}
      {up.note && <p className="text-sm whitespace-pre-line">{up.note}</p>}
    </>
  );
}

/** Anyone can help: say what they are doing, so others can coordinate. */
function HelpBox({ r, mine }: { r: PublicReport; mine: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const qc = useQueryClient();
  const [action, setAction] = useState<UpdateActionId | null>(null);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setName(savedHelperName()), []);

  const open = statusOf(r.status)?.open ?? true;
  const actions = UPDATE_ACTIONS.filter((a) => (open ? a.id !== 'still_need' : a.id === 'still_need' || a.id === 'note'));

  const send = async () => {
    if (!action) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/reports/${r.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, authorName: mine ? null : name, editToken: mine ? editTokenFor(r.id) : null }),
      });
      if (res.ok) {
        saveHelperName(name);
        setAction(null);
        setNote('');
        setMsg({ ok: true, text: t('help.sent') });
        qc.invalidateQueries({ queryKey: ['report', r.id] });
        qc.invalidateQueries({ queryKey: ['reports'] });
        window.dispatchEvent(new Event('n360-reports-changed'));
      } else {
        setMsg({ ok: false, text: res.status === 429 ? t('help.rateLimited') : res.status === 422 ? t('help.needNote') : t('help.failed') });
      }
    } catch {
      setMsg({ ok: false, text: t('help.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="help-title" className="mt-4 rounded-lg border border-line p-3">
      <h3 id="help-title" className="text-sm font-semibold">{mine ? t('help.titleMine') : t('help.title')}</h3>
      <p className="mt-0.5 text-xs text-fg-subtle">{mine ? t('help.introMine') : t('help.intro')}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={action === a.id}
            onClick={() => setAction(action === a.id ? null : a.id)}
            className={`min-h-11 rounded-lg border px-2 text-sm ${action === a.id ? 'border-accent bg-surface-accent font-semibold' : 'border-line hover:border-line-strong'}`}
          >
            {mine && a.id === 'resolved' ? t('help.resolvedMine') : label(locale, a)}
          </button>
        ))}
      </div>
      {action && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={LIMITS.updateNote}
            rows={2}
            className="block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            placeholder={t(action === 'note' ? 'help.notePlaceholderRequired' : 'help.notePlaceholder')}
            aria-label={t('help.note')}
          />
          {!mine && (
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.authorName} className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm" placeholder={t('help.namePlaceholder')} aria-label={t('help.name')} />
          )}
          <button type="button" onClick={send} disabled={busy || (action === 'note' && !note.trim())} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
            <Icon name="send" size={16} /> {busy ? t('report.sending') : t('help.send')}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function ReportDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const q = useReport(id);
  const mine = useMyReports();
  const [flagged, setFlagged] = useState(false);
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
  const isMine = mine.has(r.id);
  const depthLabel = r.waterDepthCm !== null ? WATER_DEPTH_PRESETS.find((p) => p.cm === r.waterDepthCm) : undefined;
  const flag = async () => {
    if (!window.confirm(t('help.flagConfirm'))) return;
    const res = await fetch(`/api/reports/${r.id}/flag`, { method: 'POST' }).catch(() => null);
    if (res?.ok) setFlagged(true);
  };
  return (
    <SidePanel id="reports-panel" title={label(locale, h)} onBack={back}>
      <LiveLine updatedAt={q.dataUpdatedAt} failed={q.isError} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip status={r.status} />
        <span className="chip" style={{ borderColor: u?.color, color: u?.color }}>
          {label(locale, u)}
        </span>
        {isMine && <span className="chip border-accent text-accent">{t('reports.mine')}</span>}
      </div>

      {r.contactPhone && !isMine && (
        <a href={telHref(r.contactPhone)} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-accent px-4 font-semibold text-accent hover:bg-surface-accent">
          <Icon name="phone" /> {t('reports.callReporter', { name: r.contactName ?? t('reports.reporter') })} <span className="tabular">{r.contactPhone}</span>
        </a>
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
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer" className="tabular inline-flex items-center gap-1 text-accent underline">
                {r.lat.toFixed(5)}, {r.lng.toFixed(5)} <Icon name="external" size={13} />
              </a>
              <span className="block text-xs text-fg-subtle">{r.locationSource === 'gps' ? t('reports.fromGps', { m: r.gpsAccuracyM ?? '?' }) : t('reports.fromMap')}</span>
            </>
          }
        />
        <Field k={t('report.code')} v={<span className="tabular">{r.id}</span>} />
      </dl>

      <HelpBox r={r} mine={isMine} />

      <h3 className="mt-4 text-sm font-semibold">{t('reports.timeline')}</h3>
      <ol className="mt-1 space-y-2 border-l border-line pl-3">
        <li className="text-sm">
          <span className="block text-xs text-fg-subtle">{formatDateTime(new Date(r.createdAt), locale)}</span>
          {t('reports.created')}
        </li>
        {(q.data?.updates ?? []).map((up, i) => (
          <li key={i}>
            <UpdateLine up={up} />
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-fg-subtle">{t('reports.unverifiedNote')}</p>
      {!isMine &&
        (flagged ? (
          <p className="mt-2 text-xs text-fg-subtle">{t('help.flagged')}</p>
        ) : (
          <button type="button" onClick={flag} className="mt-2 min-h-11 text-xs text-fg-subtle underline hover:text-danger">
            {t('help.flag')}
          </button>
        ))}
    </SidePanel>
  );
}

export function ReportsPanel() {
  const id = useMapStore((s) => s.reportId);
  return id ? <ReportDetail id={id} /> : <ReportList />;
}
