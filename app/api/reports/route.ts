import { NextResponse, type NextRequest } from 'next/server';
import type * as GeoJSON from 'geojson';
import { getDb, withTimeout } from '@/lib/db/client';
import { insertReport, listPublicReports } from '@/lib/reports/db';
import { HAZARDS, validateReport } from '@/lib/reports/schema';
import { reporterHash, sameOrigin } from '@/lib/reports/hash';

export const dynamic = 'force-dynamic';

const MAX_BODY = 16_000;

/**
 * Public list of citizen reports (no contact details).
 *   ?hours=72&open=1&hazard=flood            JSON list
 *   ?format=geojson                            map layer
 */
export async function GET(req: NextRequest) {
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database not configured' }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const hours = Math.min(Math.max(Number(p.get('hours')) || 72, 1), 24 * 30);
  const hazardParam = p.get('hazard');
  const hazard = hazardParam && HAZARDS.some((h) => h.id === hazardParam) ? hazardParam : null;
  try {
    const reports = await withTimeout(listPublicReports(sql, { hours, openOnly: p.get('open') === '1', hazard }), 6000);
    const headers = { 'Cache-Control': 'no-store' };
    if (p.get('format') === 'geojson') {
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: reports.map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { id: r.id, hazard: r.hazard, urgency: r.urgency, status: r.status, created_at: r.createdAt },
        })),
      };
      return NextResponse.json(fc, { headers });
    }
    return NextResponse.json({ generatedAt: new Date().toISOString(), hours, reports }, { headers });
  } catch (err) {
    console.error('[api/reports] list', err);
    return NextResponse.json({ error: 'list failed' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  // Honeypot: a field hidden from people; bots fill it in. Pretend success.
  if (body && typeof body === 'object' && (body as { website?: unknown }).website) {
    return NextResponse.json({ id: null }, { status: 202 });
  }
  const v = validateReport(body);
  if (!v.ok) return NextResponse.json({ error: 'invalid', fields: v.errors }, { status: 422 });
  try {
    const r = await withTimeout(insertReport(sql, v.value, reporterHash(req)), 8000);
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === 'rate_limited' ? 429 : 422 });
    // The edit token lets this browser post updates marked "from the reporter".
    return NextResponse.json({ id: r.id, editToken: r.editToken }, { status: 201 });
  } catch (err) {
    console.error('[api/reports] insert', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 502 });
  }
}
