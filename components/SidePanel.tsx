'use client';

import { useEffect, useRef } from 'react';
import { useIsMobile } from '@/lib/hooks';
import { useMapStore, useT } from '@/lib/state/store';
import { Icon } from '@/components/Icon';

/**
 * Task panel: left column on desktop, full-height sheet on mobile. Hidden
 * (not unmounted) while the user picks a location on the map, so a
 * half-filled form is kept.
 */
export function SidePanel({ id, title, onBack, children }: { id: string; title: string; onBack?: () => void; children: React.ReactNode }) {
  const t = useT();
  const isMobile = useIsMobile();
  const picking = useMapStore((s) => s.picking);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useMapStore.getState().picking) useMapStore.getState().openPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside
      id={id}
      aria-labelledby={`${id}-title`}
      hidden={picking}
      className={
        isMobile
          ? 'panel rise fixed inset-x-0 top-[68px] bottom-0 z-40 flex flex-col overflow-hidden rounded-b-none'
          : 'panel rise absolute top-[72px] bottom-16 left-3 z-20 flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden'
      }
    >
      <header className="flex items-center gap-1 border-b border-line py-1.5 pr-1.5 pl-2">
        {onBack && (
          <button type="button" onClick={onBack} className="icon-btn shrink-0" aria-label={t('panel.back')}>
            <Icon name="chevron" className="rotate-90" />
          </button>
        )}
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={`flex-1 text-lg font-semibold tracking-tight ${onBack ? '' : 'pl-2'}`}>
          {title}
        </h2>
        <button type="button" onClick={() => useMapStore.getState().openPanel(null)} className="icon-btn shrink-0" aria-label={t('panel.close')}>
          <Icon name="close" />
        </button>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain p-3 pb-8">{children}</div>
    </aside>
  );
}
