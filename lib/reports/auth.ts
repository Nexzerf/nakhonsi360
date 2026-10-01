import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Responder access for /admin/reports. One shared token (REPORTS_ADMIN_TOKEN,
 * at least 16 characters) is handed to responders; signing in stores an HMAC
 * of it in an httpOnly cookie, so rotating the token signs everyone out.
 */
export const ADMIN_COOKIE = 'n360_admin';
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12;

function adminToken(): string | null {
  const t = process.env.REPORTS_ADMIN_TOKEN;
  return t && t.length >= 16 ? t : null;
}

export function adminConfigured(): boolean {
  return adminToken() !== null;
}

const sha = (s: string) => createHash('sha256').update(s).digest();

function sessionValue(token: string): string {
  return createHmac('sha256', token).update('nakhonsi360-admin-session-v1').digest('hex');
}

export function checkAdminToken(candidate: unknown): string | null {
  const token = adminToken();
  if (!token || typeof candidate !== 'string') return null;
  return timingSafeEqual(sha(candidate), sha(token)) ? sessionValue(token) : null;
}

export function isAdmin(req: NextRequest): boolean {
  const token = adminToken();
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token || !cookie) return false;
  return timingSafeEqual(sha(cookie), sha(sessionValue(token)));
}

/** Writes must come from this site (the cookie is SameSite=Strict as well). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === req.nextUrl.origin;
}

/**
 * Hashed client IP for the per-hour limit. Salted with REPORT_HASH_SALT, or a
 * hash of DATABASE_URL (secret and stable) when that is not set.
 */
export function reporterHash(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  if (!ip) return null;
  const salt = process.env.REPORT_HASH_SALT || createHash('sha256').update(process.env.DATABASE_URL ?? '').digest('hex');
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32);
}
