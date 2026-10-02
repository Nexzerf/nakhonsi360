import { EMERGENCY_CONTACTS, PRIMARY_EMERGENCY_IDS, telHref, type EmergencyContact } from '@/lib/registry/emergency';
import { formatDate, type Locale } from '@/lib/freshness/format';
import { translate } from '@/lib/i18n';
import { Icon } from '@/components/Icon';

/** Big tap-to-call buttons for life-threatening situations. */
export function PrimaryCallButtons({ locale }: { locale: Locale }) {
  const contacts = PRIMARY_EMERGENCY_IDS.map((id) => EMERGENCY_CONTACTS.find((c) => c.id === id)!);
  return (
    <div className="grid grid-cols-2 gap-2">
      {contacts.map((c) => (
        <a
          key={c.id}
          href={telHref(c.number)}
          className="lift flex min-h-14 items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-danger hover:bg-danger/10"
          aria-label={`${translate(locale, 'emergency.call')} ${c.number} ${locale === 'en' ? c.nameEn : c.nameTh}`}
        >
          <Icon name="phone" size={18} className="shrink-0" />
          <span className="min-w-0">
            <span className="tabular block text-lg leading-tight font-semibold">{c.number}</span>
            <span className="line-clamp-2 block text-xs leading-snug text-fg-muted">{locale === 'en' ? c.nameEn : c.nameTh}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function ContactRow({ c, locale }: { c: EmergencyContact; locale: Locale }) {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{locale === 'en' ? c.nameEn : c.nameTh}</p>
        <p className="text-xs text-fg-muted">{locale === 'en' ? c.forEn : c.forTh}</p>
        <details className="mt-0.5 text-[11px] text-fg-subtle">
          <summary className="cursor-pointer">
            {c.hours24 ? `${t('emergency.hours24')} · ` : ''}
            {t('emergency.checked', { date: formatDate(new Date(c.checkedAt), locale) })}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          {!c.confirmedByAgency && <p className="mt-1">{t('emergency.notConfirmed')}</p>}
        </details>
      </div>
      <a
        href={telHref(c.number)}
        className="tabular flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold text-accent hover:border-accent"
        aria-label={`${t('emergency.call')} ${c.number} ${locale === 'en' ? c.nameEn : c.nameTh}`}
      >
        <Icon name="phone" size={15} />
        {c.number}
      </a>
    </li>
  );
}

/** Full directory: province first, then national numbers by category. */
export function EmergencyDirectory({ locale }: { locale: Locale }) {
  const t = (k: string) => translate(locale, k);
  const province = EMERGENCY_CONTACTS.filter((c) => c.scope === 'province');
  const national = EMERGENCY_CONTACTS.filter((c) => c.scope === 'national' && !(PRIMARY_EMERGENCY_IDS as readonly string[]).includes(c.id));
  return (
    <div className="space-y-4">
      <section aria-labelledby="em-primary">
        <h3 id="em-primary" className="mb-2 text-sm font-semibold">{t('emergency.lifeThreatening')}</h3>
        <PrimaryCallButtons locale={locale} />
      </section>
      <section aria-labelledby="em-province">
        <h3 id="em-province" className="text-sm font-semibold">{t('emergency.province')}</h3>
        <ul className="divide-y divide-line">
          {province.map((c) => (
            <ContactRow key={c.id} c={c} locale={locale} />
          ))}
        </ul>
        <p className="mt-1 text-xs text-fg-subtle">{t('emergency.provinceNote')}</p>
      </section>
      <section aria-labelledby="em-national">
        <h3 id="em-national" className="text-sm font-semibold">{t('emergency.national')}</h3>
        <ul className="divide-y divide-line">
          {national.map((c) => (
            <ContactRow key={c.id} c={c} locale={locale} />
          ))}
        </ul>
      </section>
      <p className="text-xs text-fg-subtle">{t('emergency.footer')}</p>
    </div>
  );
}
