/**
 * Nakhonsi360 mark: Phra Borommathat Chedi of Wat Phra Mahathat — the bell-
 * shaped stupa with its gold spire, the city's landmark — inside a ring that
 * closes into a location pin (the "360"). An original drawing; not the
 * provincial seal.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* ring closing into a pin */}
      <path d="M16 29.2l-3.2-4.2A11 11 0 1119.2 25z" fill="none" stroke="var(--fg, #1d1912)" strokeWidth="2" strokeLinejoin="round" />
      {/* gold spire (ปลียอด) */}
      <path d="M16 5.2l1.05 6.3h-2.1z" fill="var(--gold, #b8892e)" />
      {/* bell (องค์ระฆัง) */}
      <path d="M12.4 17.6c0-3.3 1.6-5.4 3.6-6.1 2 .7 3.6 2.8 3.6 6.1z" fill="var(--gold, #b8892e)" />
      {/* tiered base (ฐาน) */}
      <path d="M11.2 17.6h9.6M10.2 19.6h11.6M11.4 21.6h9.2" stroke="var(--fg, #1d1912)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
