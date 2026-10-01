'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '@/lib/freshness/format';
import { LIMITS, OBSERVED_PRESETS, WATER_DEPTH_PRESETS, WATER_TRENDS, type WaterTrend } from '@/lib/reports/schema';
import { preparePhoto, type PreparedPhoto } from '@/lib/reports/photo';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

const label = (locale: string, x: { th: string; en: string }) => (locale === 'en' ? x.en : x.th);

export function Toggle({ pressed, onClick, children, color }: { pressed: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${pressed ? 'border-accent bg-surface-accent font-medium text-fg' : 'border-line text-fg-muted hover:border-line-strong'}`}
      style={pressed && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` } : undefined}
    >
      {children}
    </button>
  );
}

/** Water depth by body height or in cm, and whether it is rising. */
export function DepthPicker({ depth, setDepth, trend, setTrend }: { depth: string; setDepth: (v: string) => void; trend: WaterTrend | null; setTrend: (v: WaterTrend | null) => void }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {WATER_DEPTH_PRESETS.map((p) => (
          <Toggle key={p.cm} pressed={depth === String(p.cm)} onClick={() => setDepth(depth === String(p.cm) ? '' : String(p.cm))}>
            {label(locale, p)} <span className="tabular text-xs text-fg-subtle">~{p.cm}</span>
          </Toggle>
        ))}
      </div>
      <label className="mt-1.5 flex items-center gap-2 text-xs text-fg-muted">
        {t('report.depthExact')}
        <input inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, '').slice(0, 4))} className="tabular min-h-11 w-24 rounded-md border border-line bg-surface px-3 text-sm text-fg" aria-label={t('report.depthExact')} />
        {t('units.cm')}
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('report.waterTrend')}>
        {WATER_TRENDS.map((w) => (
          <Toggle key={w.id} pressed={trend === w.id} onClick={() => setTrend(trend === w.id ? null : w.id)}>
            {label(locale, w)}
          </Toggle>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- when it was seen

export type Observed = { minutes: number } | { custom: string };

/** ISO time to send; null = "now" (the server stamps it). */
export function observedIso(o: Observed): string | null {
  if ('minutes' in o) return o.minutes === 0 ? null : new Date(Date.now() - o.minutes * 60_000).toISOString();
  const d = new Date(o.custom);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Value for <input type="datetime-local"> in the device's time zone. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ObservedPicker({ value, onChange }: { value: Observed; onChange: (o: Observed) => void }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const now = new Date();
  const isCustom = 'custom' in value;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {OBSERVED_PRESETS.map((p) => (
          <Toggle key={p.minutes} pressed={!isCustom && value.minutes === p.minutes} onClick={() => onChange({ minutes: p.minutes })}>
            {label(locale, p)}
          </Toggle>
        ))}
        <Toggle pressed={isCustom} onClick={() => onChange({ custom: localInput(new Date(Date.now() - 6 * 3_600_000)) })}>
          {t('report.observedCustom')}
        </Toggle>
      </div>
      {isCustom && (
        <input
          type="datetime-local"
          value={value.custom}
          min={localInput(new Date(now.getTime() - LIMITS.observedMaxAgeHours * 3_600_000))}
          max={localInput(now)}
          onChange={(e) => onChange({ custom: e.target.value })}
          className="tabular mt-1.5 min-h-11 rounded-md border border-line bg-surface px-3 text-sm"
          aria-label={t('report.observedCustom')}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- photos

/** Pick, shrink and preview up to LIMITS.photosPerItem photos. */
export function PhotoPicker({ photos, setPhotos }: { photos: PreparedPhoto[]; setPhotos: (p: PreparedPhoto[]) => void }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(photos);
  latest.current = photos;

  // Free preview URLs when the picker goes away.
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const add = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = LIMITS.photosPerItem - latest.current.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) setError(t('photos.tooMany', { max: LIMITS.photosPerItem }));
    setBusy((n) => n + list.length);
    for (const f of list) {
      try {
        const p = await preparePhoto(f);
        if (!latest.current.some((x) => x.key === p.key)) setPhotos([...latest.current, p]);
        else URL.revokeObjectURL(p.previewUrl);
      } catch {
        setError(t('photos.cannotOpen'));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (key: string) => {
    const p = photos.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.previewUrl);
    setPhotos(photos.filter((x) => x.key !== key));
  };

  return (
    <div>
      {photos.length > 0 && (
        <ul className="mb-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.key} className="relative overflow-hidden rounded-md border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.previewUrl} alt={t('photos.preview')} className="aspect-square w-full object-cover" />
              <button type="button" onClick={() => remove(p.key)} className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-niello/75 text-white" aria-label={t('photos.remove')}>
                <Icon name="close" size={16} />
              </button>
              <p className="bg-surface px-1.5 py-1 text-[11px] leading-tight text-fg-subtle">
                {p.takenAt ? t('photos.takenAt', { time: formatDateTime(new Date(p.takenAt), locale) }) : t('photos.noTime')}
                {p.lat !== null ? ` · ${t('photos.hasGps')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {photos.length < LIMITS.photosPerItem && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy > 0}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-sm font-medium hover:border-accent disabled:opacity-60"
        >
          <Icon name="camera" size={18} /> {busy > 0 ? t('photos.processing') : t('photos.add', { n: photos.length, max: LIMITS.photosPerItem })}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} aria-label={t('photos.addLabel')} />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
      <p className="mt-1 text-xs text-fg-subtle">{t('photos.privacy')}</p>
    </div>
  );
}
