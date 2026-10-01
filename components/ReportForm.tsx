'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatCoord } from '@/lib/freshness/format';
import { HAZARDS, LIMITS, NEEDS, URGENCIES, WATER_HAZARDS, type HazardId, type NeedId, type UrgencyId, type WaterTrend } from '@/lib/reports/schema';
import { rememberMyReport } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import type { AdminCard, CardResult, InspectResponse } from '@/lib/types';
import { PrimaryCallButtons } from '@/components/EmergencyDirectory';
import { DepthPicker, ObservedPicker, PhotoPicker, Toggle, observedIso, type Observed } from '@/components/ReportFields';
import { uploadPhotos, type PreparedPhoto } from '@/lib/reports/photo';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

const label = (locale: string, x: { th: string; en: string }) => (locale === 'en' ? x.en : x.th);

function Section({ title, hint, children, error }: { title: string; hint?: string; children: React.ReactNode; error?: string | null }) {
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-1.5 text-sm font-semibold">{title}</legend>
      {hint && <p className="-mt-1 mb-1.5 text-xs text-fg-subtle">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

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

  const [hazard, setHazard] = useState<HazardId | null>(null);
  const [urgency, setUrgency] = useState<UrgencyId | null>(null);
  const [depth, setDepth] = useState<string>('');
  const [trend, setTrend] = useState<WaterTrend | null>(null);
  const [needs, setNeeds] = useState<NeedId[]>([]);
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
  // A field's error disappears as soon as the field is fixed.
  const fixed: Record<string, boolean> = { hazard: hazard !== null, urgency: urgency !== null, location: draft !== null && !outside };
  const err = (k: string) => (errors[k] && !fixed[k] ? t(`report.errors.${errors[k]}`) : null);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!hazard) local.hazard = 'hazard';
    if (!urgency) local.urgency = 'urgency';
    if (!draft) local.location = 'location';
    else if (outside) local.location = 'outside';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) {
      document.getElementById(`report-${Object.keys(local)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
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
        qc.invalidateQueries({ queryKey: ['reports'] });
        window.dispatchEvent(new Event('n360-reports-changed'));
        return;
      }
      if (r.status === 422 && body.fields) setErrors(body.fields);
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
        <div className="rounded-lg border border-ok/40 bg-ok/5 p-3">
          <p className="flex items-center gap-2 font-semibold text-ok">
            <Icon name="check" /> {t('report.sent')}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{t('report.sentNote')}</p>
          <p className="tabular mt-2 text-sm">
            {t('report.code')}: <span className="font-semibold">{sentId}</span>
          </p>
          {photoResult && (
            <p className={`mt-1 text-sm ${photoResult.failed ? 'text-warn' : 'text-fg-muted'}`}>
              {photoResult.failed ? t('photos.someFailed', { sent: photoResult.sent, failed: photoResult.failed }) : t('photos.allSent', { n: photoResult.sent })}
            </p>
          )}
        </div>
        <button type="button" onClick={() => useMapStore.getState().openReport(sentId)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent">
          <Icon name="list" /> {t('report.trackStatus')}
        </button>
        <p className="mt-4 mb-2 text-sm font-semibold">{t('report.stillDanger')}</p>
        <PrimaryCallButtons locale={locale} />
      </SidePanel>
    );
  }

  return (
    <SidePanel id="report-panel" title={t('report.title')}>
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
        <p className="text-sm font-semibold text-danger">{t('report.notEmergencyLine')}</p>
        <p className="mt-0.5 mb-2 text-xs text-fg-muted">{t('report.notEmergencyNote')}</p>
        <PrimaryCallButtons locale={locale} />
      </div>

      <form onSubmit={submit} noValidate className="mt-4">
        <div id="report-hazard">
          <Section title={`1. ${t('report.hazard')}`} error={err('hazard')}>
            <div className="grid grid-cols-2 gap-1.5">
              {HAZARDS.map((h) => (
                <Toggle key={h.id} pressed={hazard === h.id} onClick={() => setHazard(h.id)}>
                  <Icon name={h.icon} size={18} />
                  <span className="leading-tight">{label(locale, h)}</span>
                </Toggle>
              ))}
            </div>
          </Section>
        </div>

        <div id="report-urgency">
          <Section title={`2. ${t('report.urgency')}`} error={err('urgency')}>
            <div className="grid gap-1.5">
              {URGENCIES.map((u) => (
                <Toggle key={u.id} pressed={urgency === u.id} onClick={() => setUrgency(u.id)} color={u.color}>
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: u.color }} />
                  {label(locale, u)}
                </Toggle>
              ))}
            </div>
          </Section>
        </div>

        <div id="report-location">
          <Section title={`3. ${t('report.location')}`} error={err('location')}>
            {draft ? (
              <div className={`rounded-lg border p-2.5 ${outside ? 'border-danger' : 'border-line'}`}>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon name="pin" size={16} className="text-accent" />
                  {areaText || (place.isPending ? t('report.locating') : t('report.pointChosen'))}
                </p>
                <p className="tabular mt-0.5 text-xs text-fg-subtle">
                  {formatCoord(draft.lat, draft.lng)}
                  {draft.source === 'gps' && draft.accuracyM ? ` · ${t('report.gpsAccuracy', { m: Math.round(draft.accuracyM) })}` : ''}
                </p>
                {outside && <p className="mt-1 text-xs text-danger">{t('report.errors.outside')}</p>}
              </div>
            ) : (
              <p className="text-xs text-fg-subtle">{t('report.locationHint')}</p>
            )}
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={locateMe} disabled={gpsState === 'busy'} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-sm font-medium hover:border-accent disabled:opacity-60">
                <Icon name="locate" size={17} /> {gpsState === 'busy' ? t('report.gpsBusy') : t('report.useGps')}
              </button>
              <button type="button" onClick={() => useMapStore.getState().setPicking(true)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line px-2 text-sm font-medium hover:border-accent">
                <Icon name="pin" size={17} /> {t('report.pickOnMap')}
              </button>
            </div>
            {selection && (!draft || draft.lat !== selection.lat || draft.lng !== selection.lng) && (
              <button type="button" onClick={() => useMapStore.getState().setDraftLocation({ lat: selection.lat, lng: selection.lng, source: 'map' })} className="mt-1.5 min-h-11 w-full rounded-lg border border-dashed border-line px-2 text-sm text-fg-muted hover:border-accent">
                {t('report.useSelected', { place: selection.label ?? formatCoord(selection.lat, selection.lng) })}
              </button>
            )}
            {gpsState === 'failed' && <p className="mt-1 text-xs text-danger">{t('report.gpsFailed')}</p>}
            <label className="mt-2 block text-xs text-fg-muted">
              {t('report.placeNote')}
              <input value={placeNote} onChange={(e) => setPlaceNote(e.target.value)} maxLength={LIMITS.placeNote} className="mt-1 block min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg" placeholder={t('report.placeNotePlaceholder')} />
            </label>
          </Section>
        </div>

        <div id="report-observedAt">
          <Section title={`4. ${t('report.observed')}`} hint={t('report.observedHint')} error={err('observedAt')}>
            <ObservedPicker value={observed} onChange={setObserved} />
          </Section>
        </div>

        {water && (
          <Section title={t('report.waterDepth')} hint={t('report.waterDepthHint')} error={err('waterDepthCm')}>
            <DepthPicker depth={depth} setDepth={setDepth} trend={trend} setTrend={setTrend} />
          </Section>
        )}

        <Section title={t('photos.title')} hint={t('photos.hint')}>
          <PhotoPicker photos={photos} setPhotos={setPhotos} />
        </Section>

        <Section title={t('report.needs')} hint={t('report.needsHint')} error={err('needs')}>
          <div className="flex flex-wrap gap-1.5">
            {NEEDS.map((n) => (
              <Toggle key={n.id} pressed={needs.includes(n.id)} onClick={() => setNeeds(needs.includes(n.id) ? needs.filter((x) => x !== n.id) : [...needs, n.id])}>
                {label(locale, n)}
              </Toggle>
            ))}
          </div>
        </Section>

        <Section title={t('report.people')} error={err('people')}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              {t('report.peopleCount')}
              <input inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 6))} className="tabular min-h-11 w-24 rounded-md border border-line bg-surface px-3 text-sm text-fg" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={vulnerable} onChange={(e) => setVulnerable(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
              {t('report.vulnerable')}
            </label>
          </div>
        </Section>

        <Section title={t('report.details')} error={err('details')}>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={LIMITS.details} rows={3} className="block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm" placeholder={t('report.detailsPlaceholder')} />
        </Section>

        <Section title={t('report.contact')} hint={t('report.contactHint')}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={LIMITS.contactName} autoComplete="name" className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm" placeholder={t('report.contactName')} aria-label={t('report.contactName')} />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} className="tabular min-h-11 rounded-md border border-line bg-surface px-3 text-sm" placeholder={t('report.contactPhone')} aria-label={t('report.contactPhone')} />
          </div>
          {err('contactPhone') && <p className="mt-1 text-xs text-danger">{err('contactPhone')}</p>}
        </Section>

        {/* Honeypot: hidden from people and assistive tech. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />

        <p className="mt-4 text-xs text-fg-subtle">{t('report.publicNote')}</p>
        {formError && (
          <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        <button type="submit" disabled={sending} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 font-semibold text-white disabled:opacity-60">
          <Icon name="send" /> {phase === 'photos' ? t('photos.uploading') : sending ? t('report.sending') : t('report.send')}
        </button>
      </form>
    </SidePanel>
  );
}
