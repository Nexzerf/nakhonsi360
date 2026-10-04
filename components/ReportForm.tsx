'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { formatCoord } from '@/lib/freshness/format';
import { HAZARDS, LIMITS, NEEDS, URGENCIES, WATER_HAZARDS, type HazardId, type NeedId, type UrgencyId, type WaterTrend } from '@/lib/reports/schema';
import { rememberMyReport, expectOwnChange } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import type { AdminCard, CardResult, InspectResponse } from '@/lib/types';
import { CompactCallButtons, PrimaryCallButtons } from '@/components/EmergencyDirectory';
import { DepthPicker, ObservedPicker, PhotoPicker, observedIso, type Observed } from '@/components/ReportFields';
import { uploadPhotos, type PreparedPhoto } from '@/lib/reports/photo';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

const label = (locale: string, x: { th: string; en: string }) => (locale === 'en' ? x.en : x.th);

type Step = 1 | 2 | 3;
const STEPS: Step[] = [1, 2, 3];

/** One question: a clear title, an optional one-line hint, its answer, and its error right under it. */
function Question({ id, title, optional, hint, error, children }: { id?: string; title: string; optional?: boolean; hint?: string; error?: string | null; children: React.ReactNode }) {
  const t = useT();
  return (
    <fieldset id={id} className="mt-6 first:mt-0">
      <legend className="mb-2 text-base leading-snug font-semibold">
        {title}
        {optional && <span className="ml-1.5 text-sm font-normal text-fg-subtle">({t('report.optional')})</span>}
      </legend>
      {hint && <p className="-mt-1 mb-2 text-[13px] leading-snug text-fg-muted">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger">
          <Icon name="alert" size={16} className="shrink-0" /> {error}
        </p>
      )}
    </fieldset>
  );
}

/** Big tappable choice with a clear selected state (filled, check mark). */
function Choice({ pressed, onClick, children, color, className = '' }: { pressed: boolean; onClick: () => void; children: React.ReactNode; color?: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`relative flex min-h-12 items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left text-[15px] leading-snug transition-colors ${
        pressed ? 'border-accent bg-surface-accent font-semibold text-fg' : 'border-line bg-surface text-fg hover:border-line-strong'
      } ${className}`}
      style={pressed && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 10%, var(--surface))` } : undefined}
    >
      {children}
      {pressed && (
        <span aria-hidden="true" className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color ?? 'var(--accent)' }}>
          <Icon name="check" size={13} />
        </span>
      )}
    </button>
  );
}

const inputClass = 'block min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-[15px] text-fg placeholder:text-fg-subtle focus:border-accent';

/** Admin names for the chosen point, so the reporter can check it is the right place. */
function usePlace(lat: number | null, lng: number | null) {
  return useQuery<CardResult<AdminCard> | null>({
    queryKey: ['report-place', lat?.toFixed(5), lng?.toFixed(5)],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/inspect?lat=${lat!.toFixed(6)}&lng=${lng!.toFixed(6)}&section=admin`, { signal });
      if (!r.ok) return null;
      return ((await r.json()) as InspectResponse).sections.admin ?? null;
    },
    enabled: lat !== null && lng !== null,
    staleTime: Infinity,
    retry: 0,
  });
}

export function ReportForm() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const draft = useMapStore((s) => s.draftLocation);
  const selection = useMapStore((s) => s.selection);
  const qc = useQueryClient();
  const topRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [hazard, setHazard] = useState<HazardId | null>(null);
  const [urgency, setUrgency] = useState<UrgencyId | null>(null);
  const [depth, setDepth] = useState<string>('');
  const [trend, setTrend] = useState<WaterTrend | null>(null);
  const [needs, setNeeds] = useState<NeedId[]>([]);
  const [moreNeeds, setMoreNeeds] = useState(false);
  const [people, setPeople] = useState('');
  const [vulnerable, setVulnerable] = useState(false);
  const [placeNote, setPlaceNote] = useState('');
  const [details, setDetails] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [observed, setObserved] = useState<Observed>({ minutes: 0 });
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [photoResult, setPhotoResult] = useState<{ sent: number; failed: number } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'report' | 'photos'>('idle');
  const [gpsState, setGpsState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  const place = usePlace(draft?.lat ?? null, draft?.lng ?? null);
  const admin = place.data?.status === 'ok' ? place.data.data : null;
  const outside = admin ? !admin.inStudyArea : false;
  const areaText = admin?.levels
    .filter((l) => l.level >= 2)
    .sort((a, b) => b.level - a.level)
    .map((l) => (l.level === 3 ? `ต.${l.nameTh}` : `อ.${l.nameTh}`))
    .join(' ');
  const water = hazard !== null && WATER_HAZARDS.includes(hazard);
  const hazardDef = HAZARDS.find((h) => h.id === hazard);
  const urgencyDef = URGENCIES.find((u) => u.id === urgency);
  // A field's error disappears as soon as the field is fixed.
  const fixed: Record<string, boolean> = { hazard: hazard !== null, urgency: urgency !== null, location: draft !== null && !outside };
  const err = (k: string) => (errors[k] && !fixed[k] ? t(`report.errors.${errors[k]}`) : null);

  // New step: back to its top, and move focus there for screen readers and keyboards.
  // Not on opening, so the emergency numbers above the steps stay in view.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    topRef.current?.scrollIntoView({ block: 'start' });
    topRef.current?.focus({ preventScroll: true });
  }, [step]);

  const locateMe = () => {
    if (!navigator.geolocation) return setGpsState('failed');
    setGpsState('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsState('idle');
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' as const, accuracyM: pos.coords.accuracy };
        useMapStore.getState().setDraftLocation(l);
        useMapStore.getState().flyTo({ center: [l.lng, l.lat], zoom: 15 });
      },
      () => setGpsState('failed'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  /** What is missing on a step, in the order it appears. */
  const missing = (s: Step): Record<string, string> => {
    const m: Record<string, string> = {};
    if (s === 1) {
      if (!hazard) m.hazard = 'hazard';
      if (!urgency) m.urgency = 'urgency';
    }
    if (s === 2) {
      if (!draft) m.location = 'location';
      else if (outside) m.location = 'outside';
    }
    return m;
  };

  const goTo = (target: Step) => {
    // Going forward checks every step on the way; going back never does.
    for (const s of STEPS.filter((x) => x < target && x >= step)) {
      const m = missing(s);
      if (Object.keys(m).length) {
        setErrors(m);
        if (s !== step) setStep(s);
        else document.getElementById(`report-${Object.keys(m)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    setErrors({});
    setStep(target);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return goTo((step + 1) as Step);
    for (const s of [1, 2] as Step[]) {
      const m = missing(s);
      if (Object.keys(m).length) {
        setErrors(m);
        setStep(s);
        return;
      }
    }
    setErrors({});
    setFormError(null);
    setSending(true);
    setPhase('report');
    try {
      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hazard,
          urgency,
          lat: draft!.lat,
          lng: draft!.lng,
          locationSource: draft!.source,
          gpsAccuracyM: draft!.accuracyM ?? null,
          observedAt: observedIso(observed),
          placeNote,
          waterDepthCm: water && depth !== '' ? Number(depth) : null,
          waterTrend: water ? trend : null,
          people: people === '' ? null : Number(people),
          vulnerable,
          needs,
          details,
          contactName,
          contactPhone,
          website,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { id?: string; editToken?: string; error?: string; fields?: Record<string, string> };
      if (r.status === 201 && body.id) {
        if (body.editToken) rememberMyReport(body.id, body.editToken);
        if (photos.length && body.editToken) {
          setPhase('photos');
          setPhotoResult(await uploadPhotos(body.id, photos, { editToken: body.editToken }));
        }
        setSentId(body.id);
        useMapStore.getState().setDraftLocation(null);
        expectOwnChange();
        qc.invalidateQueries({ queryKey: ['reports'] });
        window.dispatchEvent(new Event('n360-reports-changed'));
        return;
      }
      if (r.status === 422 && body.fields) {
        setErrors(body.fields);
        // Send the person to the first step with a problem.
        const k = Object.keys(body.fields)[0];
        if (k === 'hazard' || k === 'urgency') setStep(1);
        else if (k === 'location' || k === 'observedAt') setStep(2);
      }
      setFormError(t(`report.submitErrors.${body.error && ['rate_limited', 'outside_study_area', 'database_not_configured', 'invalid'].includes(body.error) ? body.error : 'failed'}`));
    } catch {
      setFormError(t('report.submitErrors.network'));
    } finally {
      setSending(false);
      setPhase('idle');
    }
  };

  if (sentId) {
    return (
      <SidePanel id="report-panel" title={t('report.sentTitle')}>
        <div className="rounded-xl border-2 border-ok/40 bg-ok/5 p-4">
          <p className="flex items-center gap-2 text-base font-semibold text-ok">
            <Icon name="check" /> {t('report.sent')}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">{t('report.sentNote')}</p>
          <p className="tabular mt-2 text-[15px]">
            {t('report.code')}: <span className="font-semibold">{sentId}</span>
          </p>
          {photoResult && (
            <p className={`mt-1 text-sm ${photoResult.failed ? 'text-warn' : 'text-fg-muted'}`}>
              {photoResult.failed ? t('photos.someFailed', { sent: photoResult.sent, failed: photoResult.failed }) : t('photos.allSent', { n: photoResult.sent })}
            </p>
          )}
        </div>
        <button type="button" onClick={() => useMapStore.getState().openReport(sentId)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-on-accent">
          <Icon name="list" /> {t('report.trackStatus')}
        </button>
        <p className="mt-5 mb-2 text-[15px] font-semibold">{t('report.stillDanger')}</p>
        <PrimaryCallButtons locale={locale} />
      </SidePanel>
    );
  }

  const stepTitle = [t('report.step1'), t('report.step2'), t('report.step3')];
  const commonNeeds = NEEDS.slice(0, 6);
  const shownNeeds = moreNeeds || needs.some((n) => !commonNeeds.some((c) => c.id === n)) ? NEEDS : commonNeeds;

  return (
    <SidePanel id="report-panel" title={t('report.title')}>
      {/* Life at risk: call first. One compact row, so the form starts on the first screen. */}
      <div className="rounded-xl bg-danger/5 p-2.5">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-danger">
          <Icon name="phone" size={15} /> {t('report.callFirst')}
        </p>
        <CompactCallButtons locale={locale} />
      </div>

      {/* Progress */}
      <div ref={topRef} tabIndex={-1} className="mt-4 scroll-mt-3 outline-none" aria-live="polite">
        <ol className="grid grid-cols-3 gap-1.5" aria-label={t('report.progress')}>
          {STEPS.map((s) => {
            const done = s < step;
            const current = s === step;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => goTo(s)}
                  aria-current={current ? 'step' : undefined}
                  className={`flex w-full flex-col items-start gap-1 text-left ${current ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle'}`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-full rounded-full ${current || done ? 'bg-accent' : 'bg-line'}`} />
                  <span className={`text-xs leading-tight ${current ? 'font-semibold' : ''}`}>
                    {done && <Icon name="check" size={11} className="mr-0.5 inline" />}
                    {s}. {stepTitle[s - 1]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-fg-subtle">{t('report.stepOf', { n: step, total: STEPS.length })}</p>
        <h3 className="font-display text-xl font-semibold">{stepTitle[step - 1]}</h3>
      </div>

      <form onSubmit={submit} noValidate className="mt-3">
        {step === 1 && (
          <>
            <Question id="report-hazard" title={t('report.hazard')} error={err('hazard')}>
              <div className="grid grid-cols-2 gap-2">
                {HAZARDS.map((h) => (
                  <Choice key={h.id} pressed={hazard === h.id} onClick={() => setHazard(h.id)}>
                    <Icon name={h.icon} size={20} className="shrink-0 text-accent" />
                    <span>{label(locale, h)}</span>
                  </Choice>
                ))}
              </div>
            </Question>

            <Question id="report-urgency" title={t('report.urgency')} error={err('urgency')}>
              <div className="grid gap-2">
                {URGENCIES.map((u) => (
                  <Choice key={u.id} pressed={urgency === u.id} onClick={() => setUrgency(u.id)} color={u.color} className="items-start py-3">
                    <span aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: u.color }} />
                    <span className="min-w-0">
                      <span className="block">{label(locale, u)}</span>
                      <span className="block text-[13px] font-normal text-fg-muted">{t(`report.urgencyHint.${u.id}`)}</span>
                    </span>
                  </Choice>
                ))}
              </div>
              {urgency === 'life' && (
                <div role="alert" className="mt-3 rounded-xl border-2 border-danger/40 bg-danger/5 p-3">
                  <p className="text-[15px] font-semibold text-danger">{t('report.lifeCallNow')}</p>
                  <p className="mt-0.5 mb-2 text-[13px] text-fg-muted">{t('report.notEmergencyNote')}</p>
                  <PrimaryCallButtons locale={locale} />
                </div>
              )}
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question id="report-location" title={t('report.location')} error={err('location')}>
              {draft ? (
                <div className={`flex items-start gap-2.5 rounded-xl border-2 p-3 ${outside ? 'border-danger' : 'border-ok/50 bg-ok/5'}`}>
                  <Icon name="pin" size={20} className={`mt-0.5 shrink-0 ${outside ? 'text-danger' : 'text-ok'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{areaText || (place.isPending ? t('report.locating') : t('report.pointChosen'))}</p>
                    <p className="tabular mt-0.5 text-[13px] text-fg-subtle">
                      {formatCoord(draft.lat, draft.lng)}
                      {draft.source === 'gps' && draft.accuracyM ? ` · ${t('report.gpsAccuracy', { m: Math.round(draft.accuracyM) })}` : ''}
                    </p>
                    {outside && <p className="mt-1 text-sm text-danger">{t('report.errors.outside')}</p>}
                  </div>
                </div>
              ) : (
                <p className="mb-2 text-[13px] text-fg-muted">{t('report.locationHint')}</p>
              )}
              <div className="mt-2 grid gap-2">
                <button type="button" onClick={locateMe} disabled={gpsState === 'busy'} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-[15px] font-semibold text-on-accent disabled:opacity-60">
                  <Icon name="locate" size={19} /> {gpsState === 'busy' ? t('report.gpsBusy') : draft ? t('report.useGpsAgain') : t('report.useGps')}
                </button>
                <button type="button" onClick={() => useMapStore.getState().setPicking(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-line px-3 text-[15px] font-medium hover:border-accent">
                  <Icon name="pin" size={19} /> {t('report.pickOnMap')}
                </button>
                {selection && (!draft || draft.lat !== selection.lat || draft.lng !== selection.lng) && (
                  <button type="button" onClick={() => useMapStore.getState().setDraftLocation({ lat: selection.lat, lng: selection.lng, source: 'map' })} className="min-h-12 rounded-xl border-2 border-dashed border-line px-3 text-[15px] text-fg-muted hover:border-accent">
                    {t('report.useSelected', { place: selection.label ?? formatCoord(selection.lat, selection.lng) })}
                  </button>
                )}
              </div>
              {gpsState === 'failed' && <p className="mt-2 text-sm text-danger">{t('report.gpsFailed')}</p>}
            </Question>

            <Question title={t('report.placeNoteTitle')} optional>
              <input value={placeNote} onChange={(e) => setPlaceNote(e.target.value)} maxLength={LIMITS.placeNote} className={inputClass} placeholder={t('report.placeNotePlaceholder')} aria-label={t('report.placeNoteTitle')} />
            </Question>

            <Question id="report-observedAt" title={t('report.observed')} hint={t('report.observedHint')} error={err('observedAt')}>
              <ObservedPicker value={observed} onChange={setObserved} />
            </Question>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-xl bg-surface-subtle p-3 text-[13px] leading-relaxed text-fg-muted">
              <p className="font-semibold text-fg">
                {hazardDef ? label(locale, hazardDef) : ''}
                {urgencyDef ? ` · ${label(locale, urgencyDef)}` : ''}
              </p>
              <p>{areaText || (draft ? formatCoord(draft.lat, draft.lng) : '')}</p>
              <p className="mt-1">{t('report.step3Hint')}</p>
            </div>

            {water && (
              <Question title={t('report.waterDepth')} hint={t('report.waterDepthHint')} error={err('waterDepthCm')} optional>
                <DepthPicker depth={depth} setDepth={setDepth} trend={trend} setTrend={setTrend} />
              </Question>
            )}

            <Question title={t('photos.title')} hint={t('photos.hint')} optional>
              <PhotoPicker photos={photos} setPhotos={setPhotos} />
            </Question>

            <Question title={t('report.needs')} hint={t('report.needsHint')} error={err('needs')} optional>
              <div className="flex flex-wrap gap-2">
                {shownNeeds.map((n) => (
                  <Choice key={n.id} pressed={needs.includes(n.id)} onClick={() => setNeeds(needs.includes(n.id) ? needs.filter((x) => x !== n.id) : [...needs, n.id])} className="min-h-11 py-1.5">
                    {label(locale, n)}
                  </Choice>
                ))}
                {shownNeeds.length < NEEDS.length && (
                  <button type="button" onClick={() => setMoreNeeds(true)} className="min-h-11 rounded-xl px-3 text-[15px] font-medium text-accent underline">
                    {t('report.moreNeeds', { n: NEEDS.length - shownNeeds.length })}
                  </button>
                )}
              </div>
            </Question>

            <Question title={t('report.people')} error={err('people')} optional>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[15px]">
                  {t('report.peopleCount')}
                  <input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputClass} tabular w-24`} />
                </label>
                <label className="flex min-h-12 items-center gap-2.5 text-[15px]">
                  <input type="checkbox" checked={vulnerable} onChange={(e) => setVulnerable(e.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--accent)]" />
                  {t('report.vulnerable')}
                </label>
              </div>
            </Question>

            <Question title={t('report.details')} error={err('details')} optional>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={LIMITS.details} rows={3} className={`${inputClass} py-2.5`} placeholder={t('report.detailsPlaceholder')} aria-label={t('report.details')} />
            </Question>

            <Question title={t('report.contact')} hint={t('report.contactHint')} optional>
              <div className="grid gap-2">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={LIMITS.contactName} autoComplete="name" className={inputClass} placeholder={t('report.contactName')} aria-label={t('report.contactName')} />
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} className={`${inputClass} tabular`} placeholder={t('report.contactPhone')} aria-label={t('report.contactPhone')} />
              </div>
              {err('contactPhone') && <p className="mt-2 text-sm text-danger">{err('contactPhone')}</p>}
            </Question>

            <p className="mt-5 flex items-start gap-2 text-[13px] leading-snug text-fg-muted">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" /> {t('report.publicNote')}
            </p>
          </>
        )}

        {/* Honeypot: hidden from people and assistive tech. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />

        {formError && (
          <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {formError}
          </p>
        )}

        {/* Always-visible actions at the bottom of the panel. */}
        <div className="sticky -bottom-8 z-10 -mx-3 -mb-8 mt-6 flex gap-2 border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step > 1 && (
            <button type="button" onClick={() => goTo((step - 1) as Step)} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border-2 border-line px-4 text-[15px] font-medium hover:border-line-strong">
              <Icon name="chevron" size={16} className="rotate-90" /> {t('report.back')}
            </button>
          )}
          {step < 3 ? (
            <button type="submit" className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-niello px-4 text-base font-semibold text-white">
              {t('report.next')} <Icon name="chevron" size={16} className="-rotate-90" />
            </button>
          ) : (
            <button type="submit" disabled={sending} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-base font-semibold text-white disabled:opacity-60">
              <Icon name="send" /> {phase === 'photos' ? t('photos.uploading') : sending ? t('report.sending') : t('report.send')}
            </button>
          )}
        </div>
      </form>
    </SidePanel>
  );
}
