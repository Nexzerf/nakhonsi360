'use client';

import { THAILAND_ENVELOPE } from '@/lib/geo/bbox';
import { placeName } from '@/lib/i18n';
import { useMapStore, useT } from '@/lib/state/store';
import type { AdminLevel, BBox } from '@/lib/types';

const PREFIX_TH: Record<number, string> = { 1: '', 2: 'อ.', 3: 'ต.' };

/** ประเทศไทย › นครศรีธรรมราช › อ.… › ต.… › บ้าน… — each level zooms the map to it. */
export function GeoBreadcrumb({ levels, village }: { levels: AdminLevel[]; village?: { name: string; lng: number; lat: number } }) {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const go = (bbox: BBox) => useMapStore.getState().flyTo({ bbox });
  const items: Array<{ label: string; bbox: BBox }> = [
    { label: t('breadcrumb.thailand'), bbox: THAILAND_ENVELOPE },
    ...levels.map((l) => ({
      label: locale === 'th' || !l.nameEn ? `${PREFIX_TH[l.level]}${l.nameTh}` : placeName(locale, l.nameTh, l.nameEn)!,
      bbox: l.bbox,
    })),
  ];
  if (village) items.push({ label: village.name, bbox: [village.lng, village.lat, village.lng, village.lat] });

  return (
    <nav aria-label={t('breadcrumb.label')}>
      <ol className="flex flex-wrap items-center gap-x-1 text-sm text-fg-muted">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            <button type="button" onClick={() => go(it.bbox)} className="min-h-8 rounded px-0.5 text-left hover:text-fg hover:underline" aria-current={i === items.length - 1 ? 'location' : undefined}>
              {it.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
