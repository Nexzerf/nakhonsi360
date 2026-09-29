'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseCoordinates } from '@/lib/geo/coords';
import { formatCoord } from '@/lib/freshness/format';
import { placeName } from '@/lib/i18n';
import { useMapStore, useT } from '@/lib/state/store';
import type { GazetteerType, SearchHit, SearchResponse } from '@/lib/types';
import { Icon } from '@/components/Icon';

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
      s.select({ lat: o.lat, lng: o.lng });
    } else {
      const h = o.hit;
      const name = placeName(locale, h.nameTh, h.nameEn) ?? undefined;
      const hl = HIGHLIGHT[h.type];
      if (h.bbox) s.flyTo({ bbox: h.bbox });
      else s.flyTo({ center: [h.lng, h.lat] });
      s.select({ lat: h.lat, lng: h.lng, label: name, highlight: hl ? { layerId: hl.layerId, key: hl.key, value: h.refId } : undefined });
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
      <div className="panel flex items-center">
        <span className="pl-3 text-fg-subtle">
          <Icon name="search" />
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
          className="min-h-11 w-full min-w-0 bg-transparent px-2 text-base outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            className="icon-btn text-fg-subtle"
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
        <div id={listId} role="listbox" aria-label={t('search.label')} className="panel absolute inset-x-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto py-1">
          {coord && (
            <div
              id={`${listId}-0`}
              role="option"
              aria-selected={active === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(options[0]!)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 ${active === 0 ? 'bg-surface-subtle' : ''}`}
            >
              <Icon name="pin" size={18} className="text-accent" />
              <span className="tabular text-sm">{t('search.goToCoordinate', { coord: formatCoord(coord.lat, coord.lng) })}</span>
            </div>
          )}
          {!coord && isFetching && !data && <div className="skeleton mx-3 my-2 h-5" />}
          {!coord && data?.status === 'unavailable' && <p className="px-3 py-2 text-sm text-fg-muted">{t('search.unavailable')}</p>}
          {!coord && (isError || data?.status === 'error') && <p className="px-3 py-2 text-sm text-danger">{t('error.loadFailed')}</p>}
          {!coord && data?.status === 'ok' && data.hits.length === 0 && !isFetching && <p className="px-3 py-2 text-sm text-fg-muted">{t('search.noResults')}</p>}
          {!coord &&
            groups.map((g) => (
              <div key={g.type} role="group" aria-label={t(`search.types.${g.type}`)}>
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-fg-subtle">{t(`search.types.${g.type}`)}</div>
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
                      className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1 ${active === i ? 'bg-surface-subtle' : ''}`}
                    >
                      <span className="text-sm">{placeName(locale, h.nameTh, h.nameEn)}</span>
                      {h.adminPath && <span className="text-xs text-fg-subtle">{h.adminPath}</span>}
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
