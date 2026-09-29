import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `postgres` is only ever used from route handlers; keep it out of client bundles.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
