/**
 * Nakhonsi360 mark: a map contour and a river line inside a ring that closes
 * into a location pin — the "360".
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* ring that ends in a pin at the bottom */}
      <path d="M16 29l-3.2-4.2A11 11 0 1119.2 24.8z" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round" />
      {/* contour lines */}
      <path d="M9.5 13.5c2-2.6 4.6-3.4 7.4-2.6 2 .6 3.4.3 5.2-1" fill="none" stroke="#6b7280" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.2 17.2c1.8-1.4 3.6-1.6 5.5-.9 2 .7 3.6.5 5.6-.9" fill="none" stroke="#6b7280" strokeWidth="1.2" strokeLinecap="round" />
      {/* river */}
      <path d="M12 8.5c2.4 2.3 1 4.7 3.2 6.7 2 1.8 1 4.6 2.8 6.6" fill="none" stroke="#0891b2" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
