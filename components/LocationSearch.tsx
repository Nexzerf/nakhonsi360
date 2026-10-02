'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseCoordinates } from '@/lib/geo/coords';
import { formatCoord } from '@/lib/freshness/format';
import { placeName } from '@/lib/i18n';
import { useMapStore, useT } from '@/lib/state/store';
import type { GazetteerType, SearchHit, SearchResponse } from '@/lib/types';
import { Icon } from '@/components/Icon';
import { LogoMark } from '@/components/Logo';
import type { IconId } from '@/lib/registry/layers';

const TYPE_ORDER: GazetteerType[] = ['district', 'subdistrict', 'village', 'water', 'road', 'place', 'station', 'province'];

/** Which vector layer and property highlights a search result. */
const HIGHLIGHT: Partial<Record<GazetteerType, { layerId: string; key: string }>> = {
  province: { layerId: 'admin-province', key: 'pcode' },
  district: { layerId: 'admin-district', key: 'pcode' },
  subdistrict: { layerId: 'admin-subdistrict', key: 'pcode' },
  village: { layerId: 'villages', key: 'id' },
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

type Option = { kind: 'coord'; lat: number; lng: number } | { kind: 'hit'; hit: SearchHit };

export function LocationSearch() {
  const t = useT();
  const locale = useMapStore((s) => s.locale);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 250);
  const coord = useMemo(() => parseCoordinates(text), [text]);

  const { data, isFetching, isError } = useQuery<SearchResponse>({
    queryKey: ['search', q],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      return r.json();
    },
    enabled: q.length >= 2 && !coord,
    staleTime: 5 * 60_000,
  });

  const groups = useMemo(() => {
    const hits = data?.hits ?? [];
    return TYPE_ORDER.map((type) => ({ type, hits: hits.filter((h) => h.type === type) })).filter((g) => g.hits.length);
  }, [data]);

  const options: Option[] = coord ? [{ kind: 'coord', lat: coord.lat, lng: coord.lng }] : groups.flatMap((g) => g.hits.map((hit) => ({ kind: 'hit' as const, hit })));

  useEffect(() => setActive(0), [q, coord]);

  const choose = (o: Option) => {
    const s = useMapStore.getState();
    if (o.kind === 'coord') {
      s.flyTo({ center: [o.lng, o.lat], zoom: 14 });
      s.select({ lat: o.lat, lng: o.lng, kind: 'point' });
    } else {
      const h = o.hit;
      const name = placeName(locale, h.nameTh, h.nameEn) ?? undefined;
      const hl = HIGHLIGHT[h.type];
      if (h.bbox) s.flyTo({ bbox: h.bbox });
      else s.flyTo({ center: [h.lng, h.lat] });
      s.select({ lat: h.lat, lng: h.lng, label: name, kind: h.type, highlight: hl ? { layerId: hl.layerId, key: hl.key, value: h.refId } : undefined });
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      const o = options[active];
      if (o) {
        e.preventDefault();
        choose(o);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && (coord || q.length >= 2);
  let index = -1;

  return (
    <div className="relative w-full">
      <label htmlFor="location-search" className="sr-only">
        {t('search.label')}
      </label>
      <div className="panel flex h-12 items-center overflow-hidden focus-within:border-accent focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
        <Link href="/about-data" className="flex h-full shrink-0 items-center gap-2 pr-3 pl-2.5 hover:bg-surface-subtle" title={t('app.tagline')}>
          <LogoMark size={26} />
          <span className="font-display hidden text-[16px] font-semibold tracking-tight text-fg sm:inline">{t('app.name')}</span>
          <span className="sr-only sm:hidden">{t('app.name')}</span>
        </Link>
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />
        <span className="pl-3 text-fg-subtle">
          <Icon name="search" size={18} />
        </span>
        <input
          ref={inputRef}
          id="location-search"
          type="search"
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          value={text}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="h-full w-full min-w-0 bg-transparent px-2 text-[15px] outline-none focus-visible:outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            className="icon-btn mr-0.5 shrink-0"
            aria-label={t('search.clear')}
            onClick={() => {
              setText('');
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {showList && (
        <div id={listId} role="listbox" aria-label={t('search.label')} className="panel rise scroll-thin absolute inset-x-0 top-full z-40 mt-1.5 max-h-[60vh] overflow-y-auto py-1.5">
          {coord && (
            <div
              id={`${listId}-0`}
              role="option"
              aria-selected={active === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(options[0]!)}
              className={`mx-1.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 ${active === 0 ? 'bg-surface-accent' : ''}`}
            >
              <ResultIcon name="pin" />
              <span className="flex flex-col">
                <span className="tabular text-sm font-medium">{formatCoord(coord.lat, coord.lng)}</span>
                <span className="text-xs text-fg-subtle">{t('search.coordinate')}</span>
              </span>
            </div>
          )}
          {!coord && isFetching && !data && (
            <div className="space-y-2 px-4 py-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          )}
          {!coord && data?.status === 'unavailable' && <EmptyLine icon="info" text={t('search.unavailable')} />}
          {!coord && (isError || data?.status === 'error') && <EmptyLine icon="alert" text={t('error.loadFailed')} danger />}
          {!coord && data?.status === 'ok' && data.hits.length === 0 && !isFetching && <EmptyLine icon="search" text={t('search.noResults')} />}
          {!coord &&
            groups.map((g) => (
              <div key={g.type} role="group" aria-label={t(`search.types.${g.type}`)} className="pb-1">
                <div className="eyebrow px-4 pt-2 pb-1">{t(`search.types.${g.type}`)}</div>
                {g.hits.map((h) => {
                  index++;
                  const i = index;
                  return (
                    <div
                      key={h.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={active === i}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose({ kind: 'hit', hit: h })}
                      className={`mx-1.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1 ${active === i ? 'bg-surface-accent' : ''}`}
                    >
                      <ResultIcon name={TYPE_ICON[h.type]} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{placeName(locale, h.nameTh, h.nameEn)}</span>
                        {h.adminPath && <span className="truncate text-xs text-fg-subtle">{h.adminPath}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const TYPE_ICON: Record<GazetteerType, IconId> = {
  province: 'province',
  district: 'district',
  subdistrict: 'subdistrict',
  village: 'village',
  water: 'water',
  road: 'road',
  place: 'village',
  station: 'station',
};

function ResultIcon({ name }: { name: IconId | 'pin' }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-fg-muted">
      <Icon name={name} size={16} />
    </span>
  );
}

function EmptyLine({ icon, text, danger }: { icon: 'info' | 'alert' | 'search'; text: string; danger?: boolean }) {
  return (
    <p className={`flex items-start gap-2 px-4 py-2.5 text-sm ${danger ? 'text-danger' : 'text-fg-muted'}`}>
      <Icon name={icon} size={16} className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}
