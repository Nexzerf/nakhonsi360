import type { LegendSymbol } from '@/lib/registry/layers';

/** Small SVG sample of how a layer is drawn: line, fill (with optional pattern) or circle. */
export function LegendSwatch({ symbol, size = 24 }: { symbol: LegendSymbol; size?: number }) {
  const id = `p-${symbol.type}-${'color' in symbol ? symbol.color.replace('#', '') : ''}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="shrink-0">
      {symbol.type === 'line' && (
        <path d="M2 16c5-8 9 2 20-6" fill="none" stroke={symbol.color} strokeWidth={Math.max(1.5, symbol.width)} strokeDasharray={symbol.dash?.map((d) => d * 1.5).join(' ')} strokeLinecap="round" />
      )}
      {symbol.type === 'fill' && (
        <>
          {symbol.pattern && (
            <defs>
              <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
                {symbol.pattern === 'hatch' ? <path d="M0 4L4 0" stroke={symbol.outline} strokeWidth="1" /> : <circle cx="2" cy="2" r="0.8" fill={symbol.outline} />}
              </pattern>
            </defs>
          )}
          <rect x="3" y="5" width="18" height="14" rx="2" fill={symbol.color} stroke={symbol.outline} strokeWidth="1.25" />
          {symbol.pattern && <rect x="3" y="5" width="18" height="14" rx="2" fill={`url(#${id})`} />}
        </>
      )}
      {symbol.type === 'circle' && <circle cx="12" cy="12" r={symbol.radius + 1.5} fill={symbol.color} stroke={symbol.stroke} strokeWidth="1.5" />}
    </svg>
  );
}
