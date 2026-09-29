'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useMapStore, useT } from '@/lib/state/store';
import { useIsMobile } from '@/lib/hooks';
import type { BBox } from '@/lib/types';
import { LogoMark } from '@/components/Logo';
import { LocationSearch } from '@/components/LocationSearch';
import { LayerButton, LayerControl } from '@/components/LayerControl';
import { LocationInspector } from '@/components/LocationInspector';
import { MapLegend } from '@/components/MapLegend';
import { StatusBar } from '@/components/StatusBar';
import { DataProvenanceDialog } from '@/components/DataProvenance';
import { MapErrorBoundary } from '@/components/MapErrorBoundary';

// MapLibre needs the browser (WebGL); never render it on the server.
const EnvironmentalMap = dynamic(() => import('@/components/EnvironmentalMap').then((m) => m.EnvironmentalMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-surface-subtle" />,
});

export function MapApp({ initialBounds }: { initialBounds: BBox | null }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const selection = useMapStore((s) => s.selection);
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
        <div className="pointer-events-auto flex w-full max-w-md items-start gap-2">
          <div className="panel hidden h-11 shrink-0 items-center gap-2 px-2 sm:flex" title={t('app.tagline')}>
            <LogoMark size={28} />
            <span className="text-sm font-semibold">{t('app.name')}</span>
          </div>
          <LocationSearch />
        </div>
        <div className="pointer-events-auto ml-auto flex shrink-0 items-start gap-2">
          <LayerButton />
          <button
            type="button"
            className="panel icon-btn px-3 text-sm font-medium"
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

      {/* Bottom: legend (left) and data status (right). Hidden behind the mobile sheet when it is open. */}
      {!(isMobile && selection) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="hidden sm:block">
            <MapLegend />
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
  if (!show) return null;
  return (
    <p role="status" className="panel absolute top-16 left-1/2 z-20 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 px-3 py-2 text-center text-sm text-fg-muted">
      {t('empty.noExtent')}
    </p>
  );
}
