import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Hashed client IP, used only for per-hour limits and one-flag-per-person.
 * Salted with REPORT_HASH_SALT, or a hash of DATABASE_URL (secret and stable)
 * when that is not set. The raw IP is never stored.
 */
export function reporterHash(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  if (!ip) return null;
  const salt = process.env.REPORT_HASH_SALT || createHash('sha256').update(process.env.DATABASE_URL ?? '').digest('hex');
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32);
}

/** Browser writes must come from this site. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return origin === null || origin === req.nextUrl.origin;
}
