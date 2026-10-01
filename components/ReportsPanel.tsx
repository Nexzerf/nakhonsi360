'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatDistance, formatRelative } from '@/lib/freshness/format';
import { useQueryClient } from '@tanstack/react-query';
import { HAZARDS, LIMITS, NEEDS, STATUSES, UPDATE_ACTIONS, URGENCIES, WATER_DEPTH_PRESETS, WATER_HAZARDS, WATER_TRENDS, type PublicReport, type ReportPhoto, type ReportUpdate, type UpdateActionId, type WaterTrend } from '@/lib/reports/schema';
import { REPORTS_REFRESH_MS, editTokenFor, saveHelperName, savedHelperName, useMyReports, useReport, useReports } from '@/lib/reports/client';
import { telHref } from '@/lib/registry/emergency';
import { useMapStore, useT } from '@/lib/state/store';
import { SidePanel } from '@/components/SidePanel';
import { DepthPicker, ObservedPicker, PhotoPicker, observedIso, type Observed } from '@/components/ReportFields';
import { uploadPhotos, type PreparedPhoto } from '@/lib/reports/photo';
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
          <EvidenceLine r={r} />
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

/** Depth, photos and confirmations at a glance (list rows). */
function EvidenceLine({ r }: { r: PublicReport }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const depth = r.latestDepthCm !== null ? WATER_DEPTH_PRESETS.find((p) => p.cm === r.latestDepthCm) : undefined;
  const parts = [
    r.latestDepthCm !== null ? `${t('reports.water')} ${depth ? `${label(locale, depth)} ` : ''}~${r.latestDepthCm} ${t('units.cm')}` : null,
    r.photoCount > 0 ? t('evidence.photosN', { n: r.photoCount }) : null,
    r.confirmCount > 0 ? t('evidence.confirmsN', { n: r.confirmCount }) : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className="block truncate text-xs font-medium text-fg">{parts.join(' · ')}</span>;
}

const MATCH_MINUTES = 60;
const NEAR_METRES = 500;

/** What a photo's own file says, compared with the report. Facts, not a verdict. */
function PhotoFacts({ p, observedAt }: { p: ReportPhoto; observedAt: string }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const facts: { ok: boolean; text: string }[] = [];
  if (p.exifTakenAt) {
    const diffMin = Math.round(Math.abs(new Date(p.exifTakenAt).getTime() - new Date(observedAt).getTime()) / 60_000);
    facts.push({
      ok: diffMin <= MATCH_MINUTES,
      text: `${t('photos.takenAt', { time: formatDateTime(new Date(p.exifTakenAt), locale) })} · ${diffMin <= MATCH_MINUTES ? t('evidence.timeMatches', { min: diffMin }) : t('evidence.timeDiffers', { h: Math.round(diffMin / 60) })}`,
    });
  }
  if (p.exifDistanceM !== null) {
    facts.push({ ok: p.exifDistanceM <= NEAR_METRES, text: t('evidence.distance', { distance: formatDistance(p.exifDistanceM, locale) }) });
  }
  if (!facts.length) return <span className="text-[11px] text-fg-subtle">{t('evidence.noMeta')}</span>;
  return (
    <>
      {facts.map((f, i) => (
        <span key={i} className={`flex items-start gap-1 text-[11px] leading-tight ${f.ok ? 'text-ok' : 'text-warn'}`}>
          <Icon name={f.ok ? 'check' : 'alert'} size={12} className="mt-px shrink-0" />
          {f.text}
        </span>
      ))}
    </>
  );
}

function PhotoGrid({ photos, observedAt }: { photos: ReportPhoto[]; observedAt: string }) {
  const t = useT();
  if (!photos.length) return null;
  return (
    <ul className="mt-1.5 grid grid-cols-2 gap-1.5">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-md border border-line">
          <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={t('photos.open')}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user photos served by our API */}
            <img src={p.url} alt={t('photos.alt')} loading="lazy" width={p.width ?? undefined} height={p.height ?? undefined} className="aspect-[4/3] w-full bg-surface-sunken object-cover" />
          </a>
          <div className="space-y-0.5 px-1.5 py-1">
            <PhotoFacts p={p} observedAt={observedAt} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function depthText(locale: string, t: ReturnType<typeof useT>, cm: number, trend: WaterTrend | null) {
  const preset = WATER_DEPTH_PRESETS.find((p) => p.cm === cm);
  return `${preset ? `${label(locale, preset)} ` : ''}~${cm} ${t('units.cm')}${trend ? ` · ${label(locale, WATER_TRENDS.find((w) => w.id === trend))}` : ''}`;
}

function UpdateLine({ up, photos }: { up: ReportUpdate; photos: ReportPhoto[] }) {
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
        <span className="text-sm font-medium" style={{ color: up.action === 'confirm' ? 'var(--ok)' : statusOf(action?.status ?? '')?.color }}>
          {label(locale, action)}
        </span>
      )}
      {up.waterDepthCm !== null && (
        <p className="text-sm">
          {t('reports.water')} {depthText(locale, t, up.waterDepthCm, up.waterTrend)}
          {up.observedAt && <span className="text-xs text-fg-subtle"> · {t('evidence.seenAt', { time: formatDateTime(new Date(up.observedAt), locale) })}</span>}
        </p>
      )}
      {up.note && <p className="text-sm whitespace-pre-line">{up.note}</p>}
      <PhotoGrid photos={photos} observedAt={up.observedAt ?? up.at} />
    </>
  );
}

/** Anyone can help: confirm, report the current level, say what they are doing. Photos optional. */
function HelpBox({ r, mine }: { r: PublicReport; mine: boolean }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const qc = useQueryClient();
  const [action, setAction] = useState<UpdateActionId | null>(null);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [depth, setDepth] = useState('');
  const [trend, setTrend] = useState<WaterTrend | null>(null);
  const [observed, setObserved] = useState<Observed>({ minutes: 0 });
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setName(savedHelperName()), []);

  const open = statusOf(r.status)?.open ?? true;
  const water = WATER_HAZARDS.includes(r.hazard);
  const actions = UPDATE_ACTIONS.filter((a) => {
    if (a.id === 'confirm' && mine) return false;
    if (a.id === 'level' && !water) return false;
    return open ? a.id !== 'still_need' : ['still_need', 'note', 'level', 'confirm'].includes(a.id);
  });
  const withLevel = action === 'level' || (water && action === 'confirm');

  const reset = () => {
    setAction(null);
    setNote('');
    setDepth('');
    setTrend(null);
    setObserved({ minutes: 0 });
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  const send = async () => {
    if (!action) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/reports/${r.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note,
          authorName: mine ? null : name,
          editToken: mine ? editTokenFor(r.id) : null,
          waterDepthCm: withLevel && depth !== '' ? Number(depth) : null,
          waterTrend: withLevel ? trend : null,
          observedAt: withLevel ? observedIso(observed) : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { updateId?: string; photoToken?: string };
      if (res.ok) {
        saveHelperName(name);
        let text = t('help.sent');
        if (photos.length && body.updateId && body.photoToken) {
          const up = await uploadPhotos(r.id, photos, { updateId: body.updateId, photoToken: body.photoToken });
          if (up.failed) text = t('photos.someFailed', { sent: up.sent, failed: up.failed });
        }
        reset();
        setMsg({ ok: true, text });
        qc.invalidateQueries({ queryKey: ['report', r.id] });
        qc.invalidateQueries({ queryKey: ['reports'] });
        window.dispatchEvent(new Event('n360-reports-changed'));
      } else {
        const key = res.status === 429 ? 'help.rateLimited' : res.status === 409 ? 'help.cannotConfirm' : res.status === 422 ? (action === 'level' ? 'help.needLevel' : 'help.needNote') : 'help.failed';
        setMsg({ ok: false, text: t(key) });
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
            className={`min-h-11 rounded-lg border px-2 text-sm ${action === a.id ? 'border-accent bg-surface-accent font-semibold' : 'border-line hover:border-line-strong'} ${a.id === 'confirm' || a.id === 'level' ? 'col-span-2' : ''}`}
          >
            {mine && a.id === 'resolved' ? t('help.resolvedMine') : label(locale, a)}
          </button>
        ))}
      </div>
      {action && (
        <div className="mt-2 space-y-2">
          {action === 'confirm' && <p className="text-xs text-fg-muted">{t('help.confirmNote')}</p>}
          {withLevel && (
            <div className="space-y-2 rounded-md bg-surface-subtle p-2">
              <p className="text-xs font-semibold">{action === 'level' ? t('report.waterDepth') : t('help.levelOptional')}</p>
              <DepthPicker depth={depth} setDepth={setDepth} trend={trend} setTrend={setTrend} />
              <p className="pt-1 text-xs font-semibold">{t('report.observed')}</p>
              <ObservedPicker value={observed} onChange={setObserved} />
            </div>
          )}
          <PhotoPicker photos={photos} setPhotos={setPhotos} />
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
          <button
            type="button"
            onClick={send}
            disabled={busy || (action === 'note' && !note.trim()) || (action === 'level' && depth === '')}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
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

/** The facts that help judge whether a report is real. */
function EvidenceBox({ r, photos, updates }: { r: PublicReport; photos: ReportPhoto[]; updates: ReportUpdate[] }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const timed = photos.filter((p) => p.exifTakenAt);
  const matching = timed.filter((p) => {
    const ref = p.updateId ? updates.find((u) => u.id === p.updateId)?.observedAt ?? r.observedAt : r.observedAt;
    return Math.abs(new Date(p.exifTakenAt!).getTime() - new Date(ref).getTime()) <= MATCH_MINUTES * 60_000;
  }).length;
  const near = photos.filter((p) => p.exifDistanceM !== null && p.exifDistanceM <= NEAR_METRES).length;
  const located = photos.filter((p) => p.exifDistanceM !== null).length;
  const levelReadings = updates.filter((u) => u.waterDepthCm !== null).length + (r.waterDepthCm !== null ? 1 : 0);
  const rows: { icon: 'check' | 'alert' | 'info'; text: string }[] = [
    { icon: r.confirmCount > 0 ? 'check' : 'info', text: r.confirmCount > 0 ? t('evidence.confirmsN', { n: r.confirmCount }) : t('evidence.noConfirms') },
    { icon: photos.length > 0 ? 'check' : 'info', text: photos.length > 0 ? t('evidence.photosN', { n: photos.length }) : t('evidence.noPhotos') },
  ];
  if (timed.length) rows.push({ icon: matching === timed.length ? 'check' : 'alert', text: t('evidence.photoTimes', { match: matching, n: timed.length }) });
  if (located) rows.push({ icon: near === located ? 'check' : 'alert', text: t('evidence.photoPlaces', { near, n: located }) });
  if (levelReadings > 1) rows.push({ icon: 'info', text: t('evidence.levelReadings', { n: levelReadings }) });
  return (
    <section aria-labelledby="evidence-title" className="mt-3 rounded-lg border border-line bg-surface-subtle p-3">
      <h3 id="evidence-title" className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon name="shield" size={16} /> {t('evidence.title')}
      </h3>
      <ul className="mt-1.5 space-y-1">
        <li className="text-sm">
          {t('evidence.seen', { seen: formatDateTime(new Date(r.observedAt), locale), sent: formatDateTime(new Date(r.createdAt), locale) })}
        </li>
        {rows.map((row, i) => (
          <li key={i} className={`flex items-start gap-1.5 text-sm ${row.icon === 'check' ? 'text-ok' : row.icon === 'alert' ? 'text-warn' : 'text-fg-muted'}`}>
            <Icon name={row.icon} size={15} className="mt-0.5 shrink-0" />
            {row.text}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-fg-subtle">{t('evidence.note')}</p>
    </section>
  );
}

/** Water level over time at this place, newest first. */
function LevelHistory({ r, updates }: { r: PublicReport; updates: ReportUpdate[] }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const readings = [
    ...(r.waterDepthCm !== null ? [{ at: r.observedAt, cm: r.waterDepthCm, trend: r.waterTrend, who: t('reports.byReporter') }] : []),
    ...updates.filter((u) => u.waterDepthCm !== null).map((u) => ({ at: u.observedAt ?? u.at, cm: u.waterDepthCm!, trend: u.waterTrend, who: u.byReporter ? t('reports.byReporter') : u.authorName ?? t('reports.anonymous') })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!readings.length) return null;
  const max = Math.max(...readings.map((x) => x.cm), 1);
  return (
    <section aria-labelledby="levels-title" className="mt-3">
      <h3 id="levels-title" className="text-sm font-semibold">{t('evidence.levelsTitle')}</h3>
      <ol className="mt-1 space-y-1">
        {readings.map((x, i) => (
          <li key={i} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
            <span className="tabular text-xs text-fg-subtle">{formatDateTime(new Date(x.at), locale)}</span>
            <span>
              <span aria-hidden="true" className="mb-0.5 block h-1.5 rounded-full bg-[#0891b2]" style={{ width: `${Math.max(6, (x.cm / max) * 100)}%` }} />
              <span className="text-xs">
                {depthText(locale, t, x.cm, x.trend)} <span className="text-fg-subtle">· {x.who}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
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
  const updates = q.data?.updates ?? [];
  const photos = q.data?.photos ?? [];
  const h = hazardOf(r.hazard);
  const u = urgencyOf(r.urgency);
  const isMine = mine.has(r.id);
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

      {r.latestDepthCm !== null && (
        <p className="mt-3 text-lg font-semibold">
          {t('reports.water')} {depthText(locale, t, r.latestDepthCm, null)}
          {r.latestDepthAt && <span className="ml-1 text-xs font-normal text-fg-subtle">{t('evidence.seenAt', { time: formatRelative(new Date(r.latestDepthAt), locale) })}</span>}
        </p>
      )}

      {r.contactPhone && !isMine && (
        <a href={telHref(r.contactPhone)} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-accent px-4 font-semibold text-accent hover:bg-surface-accent">
          <Icon name="phone" /> {t('reports.callReporter', { name: r.contactName ?? t('reports.reporter') })} <span className="tabular">{r.contactPhone}</span>
        </a>
      )}

      <EvidenceBox r={r} photos={photos} updates={updates} />
      <PhotoGrid photos={photos.filter((p) => p.updateId === null)} observedAt={r.observedAt} />

      <dl className="mt-3 divide-y divide-line">
        <Field k={t('reports.where')} v={<>{place(r) || t('reports.noArea')}{r.placeNote && <span className="block text-fg-muted">{r.placeNote}</span>}</>} />
        <Field
          k={t('report.observed')}
          v={
            <>
              {formatDateTime(new Date(r.observedAt), locale)} <span className="text-fg-subtle">({formatRelative(new Date(r.observedAt), locale)})</span>
            </>
          }
        />
        {r.waterDepthCm !== null && <Field k={t('evidence.firstLevel')} v={depthText(locale, t, r.waterDepthCm, r.waterTrend)} />}
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

      <LevelHistory r={r} updates={updates} />
      <HelpBox r={r} mine={isMine} />

      <h3 className="mt-4 text-sm font-semibold">{t('reports.timeline')}</h3>
      <ol className="mt-1 space-y-2 border-l border-line pl-3">
        <li className="text-sm">
          <span className="block text-xs text-fg-subtle">{formatDateTime(new Date(r.createdAt), locale)}</span>
          {t('reports.created')}
        </li>
        {updates.map((up) => (
          <li key={up.id}>
            <UpdateLine up={up} photos={photos.filter((p) => p.updateId === up.id)} />
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
