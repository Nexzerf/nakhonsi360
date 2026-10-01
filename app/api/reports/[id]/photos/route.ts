import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout } from '@/lib/db/client';
import { addPhoto, type PhotoInput } from '@/lib/reports/db';
import { LIMITS } from '@/lib/reports/schema';
import { reporterHash, sameOrigin } from '@/lib/reports/hash';

export const dynamic = 'force-dynamic';

/** Image type from the file's first bytes; the declared type is not trusted. */
function sniff(b: Buffer): PhotoInput['mime'] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const num = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  if (typeof v !== 'string' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/**
 * Attach one photo (multipart: photo, plus editToken for the report itself or
 * updateId + photoToken for an update). The browser has already resized it
 * and stripped its metadata; it sends what the file said (capture time,
 * coordinates) as separate fields, and only a distance from the pin is kept.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{10}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sql = getDb();
  if (!sql) return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  if (Number(req.headers.get('content-length') ?? 0) > LIMITS.photoMaxBytes + 64_000) return NextResponse.json({ error: 'too_large' }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const file = form.get('photo');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  if (file.size > LIMITS.photoMaxBytes) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return NextResponse.json({ error: 'not_an_image' }, { status: 415 });

  const token = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : null;
  };
  const updateIdRaw = form.get('updateId');
  const updateId = typeof updateIdRaw === 'string' && /^\d{1,18}$/.test(updateIdRaw) ? updateIdRaw : null;
  const editToken = token('editToken');
  const photoToken = token('photoToken');
  const target = updateId && photoToken ? { updateId, photoToken } : editToken ? { editToken } : null;
  if (!target) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const takenRaw = form.get('exifTakenAt');
  const taken = typeof takenRaw === 'string' && takenRaw ? new Date(takenRaw) : null;
  const exifTakenAt = taken && !Number.isNaN(taken.getTime()) && taken.getTime() < Date.now() + 86_400_000 ? taken.toISOString() : null;
  const lat = num(form.get('exifLat'), -90, 90);
  const lng = num(form.get('exifLng'), -180, 180);

  try {
    const r = await withTimeout(
      addPhoto(
        sql,
        id,
        target,
        {
          mime,
          bytes,
          width: num(form.get('width'), 1, 8000),
          height: num(form.get('height'), 1, 8000),
          exifTakenAt,
          exifLat: lat !== null && lng !== null ? lat : null,
          exifLng: lat !== null && lng !== null ? lng : null,
        },
        reporterHash(req),
      ),
      10_000,
    );
    if (!r.ok) {
      const status = { not_found: 404, forbidden: 403, too_many: 409, rate_limited: 429 }[r.reason];
      return NextResponse.json({ error: r.reason }, { status });
    }
    return NextResponse.json({ id: r.id }, { status: 201 });
  } catch (err) {
    console.error('[api/reports/:id/photos]', err);
    return NextResponse.json({ error: 'failed' }, { status: 502 });
  }
}
