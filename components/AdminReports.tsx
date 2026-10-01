'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, formatRelative } from '@/lib/freshness/format';
import { HAZARDS, NEEDS, STATUSES, URGENCIES, LIMITS, type AdminReport, type StatusId } from '@/lib/reports/schema';
import { REPORTS_REFRESH_MS } from '@/lib/reports/client';
import { telHref } from '@/lib/registry/emergency';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

const th = (x: { th: string } | undefined) => x?.th ?? '';

function Login({ onDone, configured }: { onDone: () => void; configured: boolean }) {
  const t = useT();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!configured) return <p className="rounded-md bg-surface-subtle p-3 text-sm">{t('admin.notConfigured')}</p>;
  return (
    <form
      className="max-w-sm space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
        setBusy(false);
        if (r?.ok) onDone();
        else setError(t('admin.wrongToken'));
      }}
    >
      <label className="block text-sm font-medium">
        {t('admin.token')}
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" className="mt-1 block min-h-11 w-full rounded-md border border-line bg-surface px-3" />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 rounded-md bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
        {t('admin.signIn')}
      </button>
    </form>
  );
}

function ReportCard({ r }: { r: AdminReport }) {
  const t = useT();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const u = URGENCIES.find((x) => x.id === r.urgency);
  const s = STATUSES.find((x) => x.id === r.status);

  const save = async (body: { status?: StatusId; note?: string; hidden?: boolean }) => {
    setBusy(true);
    setError(false);
    const res = await fetch(`/api/reports/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(true);
    if (body.note) setNote('');
    qc.invalidateQueries({ queryKey: ['admin-reports'] });
  };

  return (
    <li className={`rounded-lg border p-3 ${r.hidden ? 'border-dashed opacity-60' : 'border-line'}`} style={{ borderLeft: `4px solid ${u?.color}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{th(HAZARDS.find((h) => h.id === r.hazard))}</span>
        <span className="text-sm font-medium" style={{ color: u?.color }}>{th(u)}</span>
        <span className="chip" style={{ borderColor: s?.color, color: s?.color }}>{th(s)}</span>
        {r.hidden && <span className="chip">{t('admin.hidden')}</span>}
        <span className="ml-auto text-xs text-fg-subtle" title={formatDateTime(new Date(r.createdAt), 'th')}>
          {formatRelative(new Date(r.createdAt), 'th')} · {r.id}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {[r.subdistrictTh ? `ต.${r.subdistrictTh}` : null, r.districtTh ? `อ.${r.districtTh}` : null, r.placeNote].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className="text-xs text-fg-muted">
        {[
          r.waterDepthCm !== null ? `น้ำ ~${r.waterDepthCm} ซม.${r.waterTrend ? ` (${r.waterTrend === 'rising' ? 'กำลังขึ้น' : r.waterTrend === 'falling' ? 'กำลังลด' : 'ทรงตัว'})` : ''}` : null,
          r.people !== null ? `${r.people} คน` : null,
          r.vulnerable ? 'มีผู้สูงอายุ/เด็ก/ผู้ป่วย/ผู้พิการ' : null,
          r.needs.length ? `ต้องการ: ${r.needs.map((n) => th(NEEDS.find((x) => x.id === n))).join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {r.details && <p className="mt-1 text-sm whitespace-pre-line">{r.details}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {r.contactPhone ? (
          <a href={telHref(r.contactPhone)} className="tabular inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-3 font-semibold text-accent">
            <Icon name="phone" size={15} /> {r.contactName ? `${r.contactName} ` : ''}
            {r.contactPhone}
          </a>
        ) : (
          <span className="text-fg-subtle">{t('admin.noPhone')}</span>
        )}
        <a href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer" className="tabular inline-flex min-h-11 items-center gap-1 rounded-md border border-line px-3 text-accent">
          <Icon name="pin" size={15} /> {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
        </a>
      </div>
      {r.responderNote && <p className="mt-2 rounded bg-surface-accent px-2 py-1 text-sm">{t('reports.responderNote')}: {r.responderNote}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STATUSES.filter((x) => x.id !== r.status && x.id !== 'new').map((x) => (
          <button key={x.id} type="button" disabled={busy} onClick={() => save({ status: x.id })} className="min-h-10 rounded-md border px-2.5 text-sm disabled:opacity-50" style={{ borderColor: x.color, color: x.color }}>
            {x.th}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={() => save({ hidden: !r.hidden })} className="min-h-10 rounded-md border border-line px-2.5 text-sm text-fg-muted disabled:opacity-50">
          {r.hidden ? t('admin.unhide') : t('admin.hide')}
        </button>
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) save({ note: note.trim() });
        }}
      >
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.responderNote} className="min-h-10 flex-1 rounded-md border border-line bg-surface px-3 text-sm" placeholder={t('admin.notePlaceholder')} aria-label={t('admin.notePlaceholder')} />
        <button type="submit" disabled={busy || !note.trim()} className="min-h-10 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-50">
          {t('admin.postNote')}
        </button>
      </form>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{t('admin.saveFailed')}</p>}
    </li>
  );
}

export function AdminReports() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const qc = useQueryClient();
  const session = useQuery<{ configured: boolean; signedIn: boolean }>({
    queryKey: ['admin-session'],
    queryFn: async () => (await fetch('/api/admin/session')).json(),
  });
  const signedIn = session.data?.signedIn === true;
  const list = useQuery<{ generatedAt: string; reports: AdminReport[] }>({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const r = await fetch('/api/admin/reports');
      if (r.status === 403) qc.invalidateQueries({ queryKey: ['admin-session'] });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: signedIn,
    refetchInterval: REPORTS_REFRESH_MS,
  });
  const [showClosed, setShowClosed] = useState(false);
  const reports = (list.data?.reports ?? []).filter((r) => showClosed || STATUSES.find((s) => s.id === r.status)?.open);

  return (
    <main className="mx-auto min-h-full max-w-3xl bg-surface px-4 py-5 text-fg">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center text-accent underline">← {t('emergency.backToMap')}</Link>
        {signedIn && (
          <button
            type="button"
            className="min-h-11 px-2 text-sm text-fg-muted"
            onClick={async () => {
              await fetch('/api/admin/session', { method: 'DELETE' });
              qc.invalidateQueries({ queryKey: ['admin-session'] });
            }}
          >
            {t('admin.signOut')}
          </button>
        )}
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{t('admin.title')}</h1>
      <p className="mt-1 mb-4 text-sm text-fg-muted">{t('admin.intro')}</p>
      {session.isPending ? (
        <div className="skeleton h-20" />
      ) : !signedIn ? (
        <Login configured={session.data?.configured ?? false} onDone={() => qc.invalidateQueries({ queryKey: ['admin-session'] })} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span role="status" className="flex items-center gap-1.5 text-fg-subtle">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${list.isError ? 'bg-danger' : 'animate-pulse bg-ok'}`} />
              {list.dataUpdatedAt ? t('reports.checked', { time: formatRelative(new Date(list.dataUpdatedAt), locale) }) : ''}
            </span>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="h-5 w-5" />
              {t('admin.showClosed')}
            </label>
          </div>
          {reports.length === 0 ? (
            <p className="rounded-md bg-surface-subtle p-3 text-sm">{list.isPending ? '…' : t('reports.none')}</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <ReportCard key={r.id} r={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
