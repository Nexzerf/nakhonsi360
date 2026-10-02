'use client';

import { OPEN_STATUSES } from '@/lib/reports/schema';
import { useReports } from '@/lib/reports/client';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

type NavId = 'overview' | 'reports' | 'layers' | 'emergency' | 'cctv';

function useNav() {
  const panel = useMapStore((s) => s.panel);
  const layers = useMapStore((s) => s.layerPanelOpen);
  const overview = useMapStore((s) => s.overviewOpen);
  const active = (id: NavId) => (id === 'overview' ? overview : id === 'layers' ? layers : panel === id);
  const toggle = (id: NavId) => {
    const s = useMapStore.getState();
    if (id === 'overview') return s.setOverviewOpen(!s.overviewOpen);
    if (id === 'layers') return s.setLayerPanelOpen(!s.layerPanelOpen);
    s.openPanel(s.panel === id ? null : id);
  };
  return { active, toggle };
}

function useOpenCount() {
  const q = useReports();
  return (q.data?.reports ?? []).filter((r) => (OPEN_STATUSES as string[]).includes(r.status)).length;
}

const NAV: { id: NavId; icon: 'dashboard' | 'list' | 'layers' | 'phone' | 'cctv'; key: string }[] = [
  { id: 'overview', icon: 'dashboard', key: 'nav.overview' },
  { id: 'reports', icon: 'list', key: 'nav.reports' },
  { id: 'layers', icon: 'layers', key: 'nav.layers' },
  { id: 'emergency', icon: 'phone', key: 'nav.emergency' },
  { id: 'cctv', icon: 'cctv', key: 'nav.cctv' },
];

/** Desktop: icon navigation in the top centre (dark when active). */
export function TopNav() {
  const t = useT();
  const { active, toggle } = useNav();
  const open = useOpenCount();
  return (
    <nav className="seg pointer-events-auto" aria-label={t('nav.label')}>
      {NAV.map((n) => (
        <button key={n.id} type="button" aria-pressed={active(n.id)} onClick={() => toggle(n.id)} title={t(n.key)} aria-controls={n.id === 'layers' ? 'layer-panel' : undefined}>
          <Icon name={n.icon} size={18} />
          <span className="hidden xl:inline">{t(n.key)}</span>
          {n.id === 'reports' && open > 0 && <span className="tabular rounded-full bg-danger px-1.5 text-[11px] leading-5 text-white">{open}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Desktop: the main call to action, top right. */
export function ReportButton() {
  const t = useT();
  const panel = useMapStore((s) => s.panel);
  return (
    <button type="button" className="btn-dark pointer-events-auto" aria-pressed={panel === 'report'} onClick={() => useMapStore.getState().openPanel(panel === 'report' ? null : 'report')}>
      <Icon name="plus" size={18} /> {t('actions.report')}
    </button>
  );
}

/** Bottom centre: map / satellite / 3D, like the reference "Globe · Map · Routes" switch. */
export function ModeSwitch() {
  const t = useT();
  const basemap = useMapStore((s) => s.basemap);
  const view3d = useMapStore((s) => s.view3d);
  const mode = view3d ? '3d' : basemap === 'satellite' ? 'satellite' : 'map';
  const set = (m: 'map' | 'satellite' | '3d') => {
    const s = useMapStore.getState();
    if (m === '3d') {
      if (s.basemap === 'satellite') s.setBasemap('light');
      return s.setView3d(true);
    }
    s.setView3d(false);
    s.setBasemap(m === 'satellite' ? 'satellite' : s.basemap === 'satellite' ? 'light' : s.basemap);
  };
  return (
    <div className="seg pointer-events-auto" role="group" aria-label={t('mode.label')}>
      <button type="button" aria-pressed={mode === 'map'} onClick={() => set('map')}>
        <Icon name="province" size={16} /> {t('mode.map')}
      </button>
      <button type="button" aria-pressed={mode === 'satellite'} onClick={() => set('satellite')}>
        <Icon name="globe" size={16} /> {t('mode.satellite')}
      </button>
      <button type="button" aria-pressed={mode === '3d'} onClick={() => set('3d')} title={t('controls.view3dNote')}>
        <Icon name="cube" size={16} /> 3D
      </button>
    </div>
  );
}

/** Mobile: bottom tab bar with the report action raised in the middle. */
export function MobileTabBar() {
  const t = useT();
  const { active, toggle } = useNav();
  const panel = useMapStore((s) => s.panel);
  const open = useOpenCount();
  const tab = (n: (typeof NAV)[number]) => (
    <button key={n.id} type="button" aria-pressed={active(n.id)} onClick={() => toggle(n.id)} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${active(n.id) ? 'text-fg' : 'text-fg-subtle'}`}>
      <span className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200 ${active(n.id) ? 'bg-niello text-white' : ''}`}>
        <Icon name={n.icon} size={19} />
      </span>
      {t(n.key)}
      {n.id === 'reports' && open > 0 && <span className="tabular absolute top-1 right-[18%] rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white">{open}</span>}
    </button>
  );
  return (
    <nav className="panel anim-slide-up pointer-events-auto fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 flex items-center px-1" aria-label={t('nav.label')}>
      {tab(NAV[0]!)}
      {tab(NAV[1]!)}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          aria-pressed={panel === 'report'}
          onClick={() => useMapStore.getState().openPanel(panel === 'report' ? null : 'report')}
          className="anim-pop -mt-7 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-danger text-white shadow-[var(--float-shadow)] ring-4 ring-[var(--glass-strong)] transition-transform active:scale-95"
          aria-label={t('actions.report')}
        >
          <Icon name="megaphone" size={22} />
        </button>
      </div>
      {tab(NAV[3]!)}
      {tab(NAV[2]!)}
    </nav>
  );
}
