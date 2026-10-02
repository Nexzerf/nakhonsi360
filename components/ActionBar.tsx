'use client';

import Link from 'next/link';
import { useMapStore, useT } from '@/lib/state/store';
import { EmergencyDirectory } from '@/components/EmergencyDirectory';
import { ReportForm } from '@/components/ReportForm';
import { ReportsPanel } from '@/components/ReportsPanel';
import { CctvPanel } from '@/components/CctvPanel';
import { SidePanel } from '@/components/SidePanel';
import { Icon } from '@/components/Icon';

export function TaskPanels() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const panel = useMapStore((s) => s.panel);
  const picking = useMapStore((s) => s.picking);
  return (
    <>
      {panel === 'report' && <ReportForm />}
      {panel === 'reports' && <ReportsPanel />}
      {panel === 'cctv' && <CctvPanel />}
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
