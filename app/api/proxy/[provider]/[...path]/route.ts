import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Server-side proxy that attaches API keys for keyed providers (GISTDA WMS,
 * Copernicus, …) so keys never reach the browser. Each provider must be
 * explicitly allow-listed here with its upstream base URL and key handling.
 * Phase 1 uses no keyed providers, so the list is empty.
 */
const PROVIDERS: Record<string, never> = {};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string; path: string[] }> }) {
  const { provider } = await ctx.params;
  if (!(provider in PROVIDERS)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
