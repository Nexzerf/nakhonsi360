'use client';

import { Component, type ReactNode } from 'react';
import { useT } from '@/lib/state/store';

const RELOADED_KEY = 'n360-map-chunk-reload';

/**
 * A page opened before a new deploy asks for map code that is no longer on
 * the server. Reloading once fetches the current version.
 */
function isStaleCode(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === 'ChunkLoadError' || /Loading chunk|dynamically imported module|Importing a module script failed/i.test(e?.message ?? '');
}

/** The map code loaded: a later stale-code error may reload again. */
export function mapStarted() {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // nothing to clear
  }
}

/** Shown instead of the map when it cannot start; one tap to try again. */
export function MapCrashed() {
  const t = useT();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-subtle p-6 text-center text-fg-muted">
      <p>{t('error.mapCrashed')}</p>
      <button type="button" onClick={() => window.location.reload()} className="btn-dark pointer-events-auto">
        {t('error.reload')}
      </button>
    </div>
  );
}

/** Keeps the rest of the UI (search, inspector) alive if the map throws. */
export class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[map] crashed', error);
    if (!isStaleCode(error)) return;
    try {
      if (sessionStorage.getItem(RELOADED_KEY)) return;
      sessionStorage.setItem(RELOADED_KEY, '1');
    } catch {
      return; // no storage: leave it to the reload button rather than risk a loop
    }
    window.location.reload();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
