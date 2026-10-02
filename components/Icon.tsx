import type { IconId } from '@/lib/registry/layers';

type UiIcon = 'search' | 'layers' | 'close' | 'info' | 'plus' | 'minus' | 'locate' | 'compass' | 'copy' | 'chevron' | 'retry' | 'pin' | 'external' | 'check' | 'alert' | 'phone' | 'list' | 'send' | 'megaphone' | 'camera' | 'shield' | 'dashboard' | 'globe' | 'cube';

/** Simple stroked 24×24 icons. Decorative unless a label is given. */
const PATHS: Record<IconId | UiIcon, string> = {
  // layers
  province: 'M4 5l6-2 5 2 5-2v16l-5 2-5-2-6 2z',
  district: 'M4 5l6-2 5 2 5-2v16l-5 2-5-2-6 2zM10 3v16M15 5v16',
  subdistrict: 'M4 4h16v16H4zM4 12h16M12 4v16',
  village: 'M4 11l8-6 8 6M6 10v9h12v-9M10 19v-5h4v5',
  river: 'M3 7c3 0 3 3 6 3s3-3 6-3 3 3 6 3M3 14c3 0 3 3 6 3s3-3 6-3 3 3 6 3',
  stream: 'M4 19c4-2 2-6 6-8s4-6 8-8',
  canal: 'M3 8h18M3 16h18M7 8v8M17 8v8',
  reservoir: 'M3 17h18M5 17l3-8h8l3 8M9 13h6',
  water: 'M12 3c-4 5-6 8-6 11a6 6 0 0012 0c0-3-2-6-6-11z',
  station: 'M12 21v-9M8 12h8M12 12l-4-8h8z',
  road: 'M8 3L5 21M16 3l3 18M12 5v3M12 11v3M12 17v3',
  coastline: 'M3 18c2-1 3-4 6-4s4 2 6 1 3-6 6-7M3 21h18',
  rain: 'M7 14a5 5 0 119-4 4 4 0 01-1 8H8M9 20l-1 2M13 20l-1 2M17 20l-1 2',
  temperature: 'M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0z',
  wind: 'M3 8h11a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h8',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  air: 'M4 8h10a3 3 0 10-3-3M4 12h14M4 16h9a3 3 0 11-3 3',
  flood: 'M3 10l9-6 9 6M5 9v4M19 9v4M3 17c3 0 3-2 6-2s3 2 6 2 3-2 6-2',
  drought: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z',
  fire: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-3 2-4 2-7 2 1 3 3 3 5',
  landslide: 'M3 20L11 6l4 6 2-2 4 10zM6 16l2 1M9 18l2 1',
  earthquake: 'M2 12h4l2-5 3 10 3-12 2 7h6',
  erosion: 'M3 8c4 0 4 3 8 3s4-3 10-3M3 14h4l2 3h4l2-3h6M3 20h18',
  mangrove: 'M12 21v-8M12 13c-4 0-6-3-6-6 3 0 6 2 6 6zM12 13c4 0 6-3 6-6-3 0-6 2-6 6zM8 21l4-4 4 4',
  landuse: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  forest: 'M12 3l6 9h-4l4 6H6l4-6H6z',
  agriculture: 'M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 11c3 0 5-2 5-5-3 0-5 2-5 5z',
  wetland: 'M3 16c3 0 3-2 6-2s3 2 6 2 3-2 6-2M8 13V6M12 12V4M16 13V7',
  satellite: 'M4 14l6-6 6 6-6 6zM14 4l6 6M13 9l2-2M17 13l2 2M5 21l3-3',
  ndvi: 'M12 21c-5-3-8-7-8-12 5 0 8 3 8 8 0-5 3-8 8-8 0 5-3 9-8 12z',
  // ui
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  locate: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v4M12 18v4M2 12h4M18 12h4',
  compass: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15 9l-2 5-4 1 2-5z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  chevron: 'M6 9l6 6 6-6',
  retry: 'M4 12a8 8 0 0114-5l2 2M20 4v5h-5M20 12a8 8 0 01-14 5l-2-2M4 20v-5h5',
  pin: 'M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12zM12 7a3 3 0 100 6 3 3 0 000-6z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v6M12 16.5v.5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  megaphone: 'M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1zM16 8a5 5 0 010 8M19 5a9 9 0 010 14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
};

export function Icon({ name, size = 20, label, className }: { name: IconId | UiIcon; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
