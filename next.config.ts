import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const pmtilesOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_PMTILES_BASE_URL ? new URL(process.env.NEXT_PUBLIC_PMTILES_BASE_URL).origin : '';
  } catch {
    return '';
  }
})();

/** Hosts the browser talks to directly: basemaps, satellite imagery, the CCTV player. */
const MAP_HOSTS = ['https://tiles.openfreemap.org', 'https://*.tile.opentopomap.org', 'https://server.arcgisonline.com', pmtilesOrigin].filter(Boolean).join(' ');

const CSP = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; nonces would make every page dynamic (no CDN cache).
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAP_HOSTS}`,
  "font-src 'self' data:",
  `connect-src 'self' ${MAP_HOSTS}${dev ? ' ws:' : ''}`,
  // MapLibre's tile worker (public/vendor) and blob workers.
  "worker-src 'self' blob:",
  'frame-src https://nstcctv.nakhoncity.org',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `postgres` is only ever used from route handlers; keep it out of client bundles.
  serverExternalPackages: ['postgres'],
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // MapLibre's worker: versioned path, never changes.
        source: '/vendor/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // The service worker must never be served stale, or updates would not reach installed apps.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
