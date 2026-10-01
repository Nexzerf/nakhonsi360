import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { listAdminReports } from '@/lib/reports/db';
import { isAdmin } from '@/lib/reports/auth';

export const dynamic = 'force-dynamic';

/** Responders only: open reports plus recent ones, with contact details. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  try {
    const reports = await withTimeout(listAdminReports(sql, 72), 8000);
    return NextResponse.json({ generatedAt: new Date().toISOString(), reports }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (err) {
    console.error('[api/admin/reports]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
