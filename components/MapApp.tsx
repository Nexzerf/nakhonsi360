'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMapStore, useT } from '@/lib/state/store';
import { useIsMobile } from '@/lib/hooks';
import type { BBox } from '@/lib/types';
import { LocationSearch } from '@/components/LocationSearch';
import { LayerControl } from '@/components/LayerControl';
import { LocationInspector } from '@/components/LocationInspector';
import { MapLegend } from '@/components/MapLegend';
import { StatusBar } from '@/components/StatusBar';
import { DataProvenanceDialog } from '@/components/DataProvenance';
import { MapErrorBoundary } from '@/components/MapErrorBoundary';
import { Icon } from '@/components/Icon';
import { MobileTabBar, ModeSwitch, ReportButton, TopNav } from '@/components/Chrome';
import { KpiChips, OverviewCards } from '@/components/Overview';
import { SidePanel } from '@/components/SidePanel';
import { InstallButton, OfflineNotice, PwaSetup } from '@/components/Pwa';

// MapLibre needs the browser (WebGL); never render it on the server.
// Report form, report list and emergency numbers: off the startup path, but
// fetched as soon as the browser is idle so opening the report form is instant.
const loadTaskPanels = () => import('@/components/ActionBar');
const TaskPanels = dynamic(() => loadTaskPanels().then((m) => m.TaskPanels), { ssr: false });

const EnvironmentalMap = dynamic(() => import('@/components/EnvironmentalMap').then((m) => m.EnvironmentalMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-surface-subtle" />,
});

export function MapApp({ initialBounds }: { initialBounds: BBox | null }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const selection = useMapStore((s) => s.selection);
  const panel = useMapStore((s) => s.panel);
  const picking = useMapStore((s) => s.picking);
  const isMobile = useIsMobile();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const preload = () => void loadTaskPanels();
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 2000);
    return () => clearTimeout(id);
  }, []);

  const overviewOpen = useMapStore((s) => s.overviewOpen);
  const layerPanelOpen = useMapStore((s) => s.layerPanelOpen);

  // Wide screens start with the overview column open (after mount, so SSR and client agree).
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) useMapStore.getState().setOverviewOpen(true);
  }, []);

  const langButton = (
    <button
      type="button"
      className="panel pointer-events-auto flex h-11 min-w-11 shrink-0 items-center justify-center px-3 text-sm font-bold text-fg-muted hover:text-fg"
      onClick={() => useMapStore.getState().setLocale(locale === 'th' ? 'en' : 'th')}
      aria-label={`${t('app.language')}: ${t('app.switchLanguage')}`}
      lang={locale === 'th' ? 'en' : 'th'}
    >
      {locale === 'th' ? 'EN' : 'ไทย'}
    </button>
  );

  return (
    <main className="fixed inset-0 overflow-hidden">
      <a href="#inspector" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('app.skipToInspector')}
      </a>
      <h1 className="sr-only">
        {t('app.name')} — {t('app.tagline')}
      </h1>
      <p className="sr-only">{t('controls.keyboardHint')}</p>

      <MapErrorBoundary fallback={<div className="absolute inset-0 flex items-center justify-center bg-surface-subtle text-fg-muted">{t('error.mapCrashed')}</div>}>
        <EnvironmentalMap initialBounds={initialBounds} />
      </MapErrorBoundary>

      {isMobile ? (
        <>
          {/* Mobile: search + live numbers on top, tab bar at the bottom, panels as sheets. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 space-y-2 p-3">
            <div className="flex items-start gap-2">
              <div className="pointer-events-auto min-w-0 flex-1">
                <LocationSearch />
              </div>
              <InstallButton compact />
              {langButton}
            </div>
            <OfflineNotice />
            {!panel && !selection && !layerPanelOpen && !overviewOpen && <KpiChips />}
          </div>
          {!panel && !selection && !layerPanelOpen && !overviewOpen && !picking && (
            <div className="anim-fade-up pointer-events-none absolute inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 flex justify-center">
              <ModeSwitch />
            </div>
          )}
          {overviewOpen && !panel && !layerPanelOpen && (
            <SidePanel id="overview-panel" title={t('overview.title')} onClose={() => useMapStore.getState().setOverviewOpen(false)}>
              <OverviewCards />
              <div className="mt-3 space-y-2.5">
                <MapLegend />
                <StatusBar />
              </div>
            </SidePanel>
          )}
          {!picking && <MobileTabBar />}
        </>
      ) : (
        <>
          {/* Desktop: search (left), navigation (centre), report action + language (right). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3">
            <div className="anim-fade-down pointer-events-auto w-full max-w-[22rem] space-y-2 lg:max-w-[26rem]">
              <LocationSearch />
              <OfflineNotice />
            </div>
            <div className="anim-fade-down absolute top-3 left-1/2 -translate-x-1/2 [animation-delay:80ms]">
              <TopNav />
            </div>
            <div className="anim-fade-down ml-auto flex items-center gap-2 [animation-delay:140ms]">
              <InstallButton />
              <ReportButton />
              {langButton}
            </div>
          </div>
          {overviewOpen && (
            <aside className="anim-slide-left scroll-thin pointer-events-auto absolute top-[76px] bottom-3 left-3 z-20 w-[320px] overflow-y-auto overscroll-contain pb-16" aria-label={t('overview.title')}>
              <OverviewCards />
              <div className="mt-2.5">
                <MapLegend />
              </div>
            </aside>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3">
            <div className="hidden md:block">{!overviewOpen && <MapLegend />}</div>
            <div className="anim-fade-up absolute bottom-3 left-1/2 -translate-x-1/2 [animation-delay:200ms]">{!picking && <ModeSwitch />}</div>
            <div className="ml-auto">
              <StatusBar />
            </div>
          </div>
        </>
      )}

      <NoExtentNotice show={!initialBounds} />

      <LayerControl />
      {!panel && !layerPanelOpen && <LocationInspector />}
      {(panel || picking) && <TaskPanels />}

      <DataProvenanceDialog />
      <PwaSetup />
    </main>
  );
}

function NoExtentNotice({ show }: { show: boolean }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  if (!show || dismissed) return null;
  return (
    <div role="status" className="panel rise absolute top-[72px] left-3 z-20 flex w-[min(26rem,calc(100vw-1.5rem))] items-start gap-2.5 py-2.5 pr-1 pl-3">
      <span className="mt-0.5 text-warn">
        <Icon name="info" size={18} />
      </span>
      <p className="flex-1 py-0.5 text-sm text-fg-muted">{t('empty.noExtent')}</p>
      <button type="button" className="icon-btn -my-2 shrink-0" onClick={() => setDismissed(true)} aria-label={t('layers.close')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
