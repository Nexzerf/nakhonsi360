'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMapStore, useT } from '@/lib/state/store';
import { useIsMobile } from '@/lib/hooks';
import type { BBox } from '@/lib/types';
import { LocationSearch } from '@/components/LocationSearch';
import { LayerButton, LayerControl } from '@/components/LayerControl';
import { LocationInspector } from '@/components/LocationInspector';
import { MapLegend } from '@/components/MapLegend';
import { StatusBar } from '@/components/StatusBar';
import { DataProvenanceDialog } from '@/components/DataProvenance';
import { MapErrorBoundary } from '@/components/MapErrorBoundary';
import { Icon } from '@/components/Icon';
import { ActionBar, TaskPanels } from '@/components/ActionBar';

// MapLibre needs the browser (WebGL); never render it on the server.
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

      {/* Top-left: logo + search. Top-right: layers + language. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3">
        <div className="pointer-events-auto w-full max-w-[26rem]">
          <LocationSearch />
        </div>
        <div className="panel pointer-events-auto ml-auto flex h-12 shrink-0 items-center overflow-hidden">
          <LayerButton />
          <span aria-hidden="true" className="h-6 w-px bg-line" />
          <button
            type="button"
            className="flex h-full min-w-12 items-center justify-center px-3 text-sm font-semibold text-fg-muted hover:bg-surface-subtle hover:text-fg"
            onClick={() => useMapStore.getState().setLocale(locale === 'th' ? 'en' : 'th')}
            aria-label={`${t('app.language')}: ${t('app.switchLanguage')}`}
            lang={locale === 'th' ? 'en' : 'th'}
          >
            {locale === 'th' ? 'EN' : 'ไทย'}
          </button>
        </div>
      </div>

      <NoExtentNotice show={!initialBounds} />

      <LayerControl />
      <LocationInspector />
      <TaskPanels />

      {/* Bottom: actions (centre), legend (left) and data status (right). Hidden behind the mobile sheets when they are open. */}
      {!(isMobile && (selection || panel)) && !picking && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:flex-row md:items-end md:justify-between">
          <div className="hidden md:block">{!panel && <MapLegend />}</div>
          <div className="order-first md:order-none md:absolute md:bottom-3 md:left-1/2 md:-translate-x-1/2">
            <ActionBar />
          </div>
          <div className="ml-auto">
            <StatusBar />
          </div>
        </div>
      )}

      <DataProvenanceDialog />
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
