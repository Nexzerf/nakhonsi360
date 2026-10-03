'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CCTV_BASE, CCTV_MODES, modeColor, streamUrl, type Camera, type CctvResponse } from '@/lib/cctv/schema';
import { formatCoord, formatDateTime } from '@/lib/freshness/format';
import { useMapStore, useT, type CctvFilter } from '@/lib/state/store';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

const REFRESH_MS = 60_000;

export function useCctv(enabled = true) {
  return useQuery<CctvResponse>({
    queryKey: ['cctv'],
    queryFn: async ({ signal }) => {
      const r = await fetch('/api/cctv', { signal });
      const body = (await r.json()) as CctvResponse;
      if (!r.ok || body.status !== 'ok') throw new Error('cctv unavailable');
      return body;
    },
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    enabled,
    retry: 1,
  });
}

const FILTERS: CctvFilter[] = ['all', ...CCTV_MODES.map((m) => m.id)];

export function CctvPanel() {
  const t = useT();
  const cameraId = useMapStore((s) => s.cameraId);
  const q = useCctv();
  const cams = q.data?.cameras ?? [];
  const cam = cameraId ? (cams.find((c) => c.id === cameraId) ?? null) : null;
  const close = () => useMapStore.getState().openPanel(null);

  return (
    <SidePanel id="cctv-panel" title={cam ? cam.name : t('cctv.title')} onBack={cam ? () => useMapStore.getState().openCamera(null) : undefined} onClose={close}>
      {cam ? <CameraView cam={cam} /> : <CameraList q={q} cams={cams} />}
    </SidePanel>
  );
}

function CameraList({ q, cams }: { q: ReturnType<typeof useCctv>; cams: Camera[] }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const mode = useMapStore((s) => s.cctvMode);
  const [text, setText] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: cams.length };
    for (const cam of cams) c[cam.mode] = (c[cam.mode] ?? 0) + 1;
    return c;
  }, [cams]);
  const needle = text.trim().toLowerCase();
  const shown = cams.filter((c) => (mode === 'all' || c.mode === mode) && (!needle || c.name.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle)));
  const online = cams.filter((c) => c.status === 'online').length;

  if (q.isError && !q.data) {
    return (
      <div className="tile flex flex-col items-start gap-3 p-4 text-sm">
        <p className="flex items-start gap-2 text-danger">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" /> {t('cctv.unavailable')}
        </p>
        <button type="button" className="btn-dark" onClick={() => void q.refetch()}>
          <Icon name="retry" size={16} /> {t('cctv.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="scroll-thin -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="group" aria-label={t('cctv.title')}>
        {FILTERS.map((f) => {
          const active = mode === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => useMapStore.getState().setCctvMode(f)}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${active ? 'border-transparent bg-niello text-white' : 'border-line bg-surface hover:bg-surface-subtle'}`}
            >
              {f !== 'all' && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: modeColor(f) }} />}
              {t(`cctv.modes.${f}`)}
              {q.data && <span className={`tabular text-xs ${active ? 'text-white/75' : 'text-fg-subtle'}`}>{counts[f] ?? 0}</span>}
            </button>
          );
        })}
      </div>

      {q.data && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ok">
            <span aria-hidden="true" className="anim-pulse h-2 w-2 rounded-full bg-ok" /> {t('cctv.summary', { online, total: cams.length })}
          </span>
          <span>· {t('cctv.checked', { time: formatDateTime(new Date(q.data.fetchedAt), locale) })}</span>
        </p>
      )}

      <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
        <Icon name="search" size={17} className="shrink-0 text-fg-subtle" />
        <span className="sr-only">{t('cctv.searchLabel')}</span>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('cctv.search')} className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
      </label>

      {q.isPending && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      )}

      {q.data && shown.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">{t('cctv.none')}</p>}

      <ul className="stagger space-y-1.5">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                const s = useMapStore.getState();
                s.openCamera(c.id);
                s.flyTo({ center: [c.lng, c.lat], zoom: 16 });
              }}
              className="tile lift flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: modeColor(c.mode), opacity: c.status === 'offline' ? 0.45 : 1 }}>
                <Icon name="cctv" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block text-xs text-fg-subtle">
                  {t(`cctv.modes.${c.mode}`)} · <StatusText status={c.status} />
                </span>
              </span>
              <Icon name="chevron" size={16} className="-rotate-90 shrink-0 text-fg-subtle" />
            </button>
          </li>
        ))}
      </ul>

      <SourceNote />
    </div>
  );
}

function StatusText({ status }: { status: Camera['status'] }) {
  const t = useT();
  if (status === 'online') return <span className="text-ok">{t('cctv.online')}</span>;
  if (status === 'offline') return <span className="text-danger">{t('cctv.offline')}</span>;
  return <span>{t('cctv.unknown')}</span>;
}

const HD_KEY = 'n360.cctvHd';

/** Sharpest by default; the low-bitrate stream when the viewer asked to save data or the connection is slow, or chose it before. */
function initialHd(): boolean {
  try {
    const saved = localStorage.getItem(HD_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // storage blocked: fall through
  }
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || (c?.effectiveType && c.effectiveType !== '4g'));
}

function CameraView({ cam }: { cam: Camera }) {
  const t = useT();
  const [hd, setHdState] = useState(initialHd);
  const setHd = (v: boolean) => {
    setHdState(v);
    try {
      localStorage.setItem(HD_KEY, v ? '1' : '0');
    } catch {
      // not remembered, still switched
    }
  };
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = streamUrl(cam.id, hd);

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#1e1e1e]">
        <iframe
          key={src}
          src={src}
          title={cam.name}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(src)}
          className="absolute inset-0 h-full w-full border-0"
        />
        {loaded !== src && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
            <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {t('cctv.loading')}
          </div>
        )}
        <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
          <span aria-hidden="true" className="anim-pulse h-1.5 w-1.5 rounded-full bg-red-500" /> LIVE
        </span>
      </div>

      {cam.status === 'offline' && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/5 px-3 py-2 text-sm text-danger">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" /> {t('cctv.offlineNote')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label={t('cctv.quality')}>
          <button type="button" aria-pressed={!hd} onClick={() => setHd(false)}>
            {t('cctv.standard')}
          </button>
          <button type="button" aria-pressed={hd} onClick={() => setHd(true)}>
            {t('cctv.hd')}
          </button>
        </div>
        <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface-subtle" onClick={() => useMapStore.getState().flyTo({ center: [cam.lng, cam.lat], zoom: 17 })}>
          <Icon name="pin" size={16} /> {t('cctv.showOnMap')}
        </button>
      </div>
      {hd && <p className="text-xs text-fg-subtle">{t('cctv.hdNote')}</p>}

      <dl className="tile grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3 text-sm">
        <dt className="text-fg-subtle">{t('cctv.group')}</dt>
        <dd className="flex items-center gap-1.5 font-medium">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: modeColor(cam.mode) }} />
          {t(`cctv.modes.${cam.mode}`)}
        </dd>
        <dt className="text-fg-subtle">{t('cctv.status')}</dt>
        <dd className="font-medium">
          <StatusText status={cam.status} />
        </dd>
        <dt className="text-fg-subtle">{t('cctv.cameraId')}</dt>
        <dd className="tabular">{cam.id}</dd>
        <dt className="text-fg-subtle">{t('cctv.location')}</dt>
        <dd className="tabular">{formatCoord(cam.lat, cam.lng)}</dd>
      </dl>
      {cam.mode === 'water' && <p className="text-sm text-fg-muted">{t('cctv.waterHint')}</p>}

      <SourceNote />
    </div>
  );
}

function SourceNote() {
  const t = useT();
  return (
    <div className="space-y-1.5 border-t border-line pt-3 text-xs text-fg-subtle">
      <p>{t('cctv.liveFrom')}</p>
      <p>{t('cctv.coverage')}</p>
      <a href={CCTV_BASE} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-accent underline">
        {t('cctv.openSource')} <Icon name="external" size={13} />
      </a>
    </div>
  );
}
