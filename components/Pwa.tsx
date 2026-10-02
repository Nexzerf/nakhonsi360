'use client';

import { useEffect, useState } from 'react';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Register the service worker (production only) and open panels from app shortcuts (?panel=…). */
export function PwaSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('[pwa] service worker not registered', err));
    }
    const p = new URLSearchParams(window.location.search).get('panel');
    if (p === 'report' || p === 'reports' || p === 'emergency') useMapStore.getState().openPanel(p);
  }, []);
  return null;
}

/** Offline banner: live data cannot update until the connection returns. */
export function OfflineNotice() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <p role="status" className="panel anim-fade-down pointer-events-auto flex items-center gap-2 px-3 py-2 text-sm font-bold text-warn">
      <Icon name="alert" size={16} /> {t('pwa.offline')}
    </p>
  );
}

/** "Install app" button, shown only when the browser offers installation. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!prompt) return null;
  return (
    <button
      type="button"
      className="panel lift anim-fade-down pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-bold"
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice.catch(() => undefined);
        setPrompt(null);
      }}
      aria-label={t('pwa.install')}
      title={t('pwa.installHint')}
    >
      <Icon name="plus" size={16} />
      {!compact && t('pwa.install')}
    </button>
  );
}
