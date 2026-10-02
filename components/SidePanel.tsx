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
export function SidePanel({ id, title, onBack, onClose, children }: { id: string; title: string; onBack?: () => void; onClose?: () => void; children: React.ReactNode }) {
  const t = useT();
  const isMobile = useIsMobile();
  const picking = useMapStore((s) => s.picking);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useMapStore.getState().picking) (onCloseRef.current ?? (() => useMapStore.getState().openPanel(null)))();
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
          ? 'panel anim-slide-up fixed inset-x-2 top-[68px] bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+100px)] z-40 flex flex-col overflow-hidden'
          : 'panel anim-slide-right absolute top-[76px] right-3 bottom-[72px] z-20 flex w-[400px] max-w-[calc(100vw-24px)] flex-col overflow-hidden'
      }
    >
      <div aria-hidden="true" className="thai-band" />
      <header className="flex items-center gap-1 border-b border-line py-1.5 pr-1.5 pl-2">
        {onBack && (
          <button type="button" onClick={onBack} className="icon-btn shrink-0" aria-label={t('panel.back')}>
            <Icon name="chevron" className="rotate-90" />
          </button>
        )}
        <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={`font-display flex-1 text-lg font-semibold ${onBack ? '' : 'pl-2'}`}>
          {title}
        </h2>
        <button type="button" onClick={onClose ?? (() => useMapStore.getState().openPanel(null))} className="icon-btn shrink-0" aria-label={t('panel.close')}>
          <Icon name="close" />
        </button>
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain p-3 pb-8">{children}</div>
    </aside>
  );
}
