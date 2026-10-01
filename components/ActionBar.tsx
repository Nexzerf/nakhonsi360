'use client';

import Link from 'next/link';
import { OPEN_STATUSES } from '@/lib/reports/schema';
import { useReports } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import { EmergencyDirectory } from '@/components/EmergencyDirectory';
import { ReportForm } from '@/components/ReportForm';
import { ReportsPanel } from '@/components/ReportsPanel';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

/** The three everyday actions: report, see live reports, call for help. */
export function ActionBar() {
  const t = useT();
  const panel = useMapStore((s) => s.panel);
  const q = useReports();
  const open = (q.data?.reports ?? []).filter((r) => (OPEN_STATUSES as string[]).includes(r.status)).length;
  const btn = 'flex min-h-12 items-center gap-2 px-3.5 text-sm font-semibold';
  return (
    <div className="panel pointer-events-auto flex overflow-hidden" role="group" aria-label={t('actions.label')}>
      <button type="button" className={`${btn} bg-danger text-white hover:brightness-110`} onClick={() => useMapStore.getState().openPanel(panel === 'report' ? null : 'report')} aria-pressed={panel === 'report'}>
        <Icon name="megaphone" size={19} /> {t('actions.report')}
      </button>
      <button type="button" className={`${btn} ${panel === 'reports' ? 'bg-surface-accent text-accent' : 'text-fg hover:bg-surface-subtle'}`} onClick={() => useMapStore.getState().openPanel(panel === 'reports' ? null : 'reports')} aria-pressed={panel === 'reports'}>
        <Icon name="list" size={19} />
        <span className="hidden sm:inline">{t('actions.reports')}</span>
        <span className="sr-only sm:hidden">{t('actions.reports')}</span>
        {open > 0 && <span className="tabular rounded-full bg-danger px-1.5 text-xs leading-5 text-white">{open}</span>}
      </button>
      <button type="button" className={`${btn} ${panel === 'emergency' ? 'bg-surface-accent text-accent' : 'text-fg hover:bg-surface-subtle'}`} onClick={() => useMapStore.getState().openPanel(panel === 'emergency' ? null : 'emergency')} aria-pressed={panel === 'emergency'}>
        <Icon name="phone" size={19} />
        <span className="hidden sm:inline">{t('actions.emergency')}</span>
        <span className="sr-only sm:hidden">{t('actions.emergency')}</span>
      </button>
    </div>
  );
}

export function TaskPanels() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const panel = useMapStore((s) => s.panel);
  const picking = useMapStore((s) => s.picking);
  return (
    <>
      {panel === 'report' && <ReportForm />}
      {panel === 'reports' && <ReportsPanel />}
      {panel === 'emergency' && (
        <SidePanel id="emergency-panel" title={t('emergency.title')}>
          <EmergencyDirectory locale={locale} />
          <Link href="/emergency" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-accent underline">
            {t('emergency.openPage')} <Icon name="external" size={15} />
          </Link>
        </SidePanel>
      )}
      {picking && (
        <div role="status" className="panel rise fixed inset-x-3 top-[72px] z-40 mx-auto flex max-w-md items-center gap-2 py-2 pr-1.5 pl-3">
          <Icon name="pin" className="shrink-0 text-danger" />
          <p className="flex-1 text-sm font-medium">{t('report.pickBanner')}</p>
          <button type="button" className="min-h-11 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-subtle" onClick={() => useMapStore.getState().setPicking(false)}>
            {t('report.pickCancel')}
          </button>
        </div>
      )}
    </>
  );
}
