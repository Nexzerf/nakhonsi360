import Link from 'next/link';
import { EmergencyDirectory } from '@/components/EmergencyDirectory';
import { translate } from '@/lib/i18n';
import type { Locale } from '@/lib/freshness/format';

export const metadata = {
  title: 'เบอร์ฉุกเฉิน นครศรีธรรมราช — Nakhonsi360',
  description: 'เบอร์โทรฉุกเฉินและสายด่วนหน่วยงาน จังหวัดนครศรีธรรมราชและทั่วประเทศ พร้อมแหล่งที่มา',
};

/** Plain page (no map, no JavaScript needed) so it loads on weak connections and can be shared. */
export default async function EmergencyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale: Locale = (await searchParams).lang === 'en' ? 'en' : 'th';
  const t = (k: string) => translate(locale, k);
  return (
    <main className="mx-auto min-h-full max-w-2xl bg-surface px-4 py-5 text-fg" lang={locale}>
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="inline-flex min-h-11 items-center text-accent underline">
          ← {t('emergency.backToMap')}
        </Link>
        <Link href={locale === 'en' ? '/emergency' : '/emergency?lang=en'} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-fg-muted">
          {locale === 'en' ? 'ไทย' : 'EN'}
        </Link>
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{t('emergency.title')}</h1>
      <p className="mt-1 mb-4 text-sm text-fg-muted">{t('emergency.pageIntro')}</p>
      <EmergencyDirectory locale={locale} />
    </main>
  );
}
