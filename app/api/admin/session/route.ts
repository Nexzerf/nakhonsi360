import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, adminConfigured, checkAdminToken, isAdmin, sameOrigin } from '@/lib/reports/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.json({ configured: adminConfigured(), signedIn: isAdmin(req) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Sign in with the responder token. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!adminConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const value = checkAdminToken(body?.token);
  // Slow down guessing.
  if (!value) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: 'wrong_token' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, value, { httpOnly: true, sameSite: 'strict', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: ADMIN_COOKIE_MAX_AGE });
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
