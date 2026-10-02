'use client';

/**
 * Prepare a photo in the browser before upload:
 * 1. read what the file says (capture time, GPS) — kept only to show how
 *    the photo relates to the report, never stored as coordinates;
 * 2. resize to at most 1600 px and re-encode as JPEG, which drops all
 *    metadata (camera, exact location) and keeps uploads small on weak
 *    mobile connections.
 */
import { LIMITS } from '@/lib/reports/schema';

export const MAX_EDGE = 1600;

export interface PreparedPhoto {
  key: string;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  /** From the file's EXIF; null when absent (common for photos sent through chat apps). */
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
}

async function readExif(file: File): Promise<{ takenAt: string | null; lat: number | null; lng: number | null }> {
  // Loaded on first use: most visitors never attach a photo.
  const { default: exifr } = await import('exifr');
  let takenAt: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const t = (await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])) as { DateTimeOriginal?: Date; CreateDate?: Date } | undefined;
    const d = t?.DateTimeOriginal ?? t?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) takenAt = d.toISOString();
  } catch {
    // no EXIF
  }
  try {
    const g = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | undefined;
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) {
      lat = g.latitude!;
      lng = g.longitude!;
    }
  } catch {
    // no GPS
  }
  return { takenAt, lat, lng };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: fall back to an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image');
  const [exif, img] = await Promise.all([readExif(file), decode(file)]);
  const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0, width, height);
  if ('close' in img) img.close();
  let quality = 0.82;
  let blob: Blob | null = null;
  // Step quality down until it fits (rarely needed at 1600 px).
  for (; quality >= 0.5; quality -= 0.12) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= LIMITS.photoMaxBytes) break;
  }
  if (!blob || blob.size > LIMITS.photoMaxBytes) throw new Error('too_large');
  return {
    key: `${file.name}-${file.size}-${file.lastModified}`,
    blob,
    previewUrl: URL.createObjectURL(blob),
    width,
    height,
    takenAt: exif.takenAt,
    lat: exif.lat,
    lng: exif.lng,
  };
}

/** Upload prepared photos one by one (weak connections cope better than with one big request). */
export async function uploadPhotos(
  reportId: string,
  photos: PreparedPhoto[],
  auth: { editToken: string } | { updateId: string; photoToken: string },
  onProgress?: (done: number) => void,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const p of photos) {
    const form = new FormData();
    form.append('photo', p.blob, 'photo.jpg');
    form.append('width', String(p.width));
    form.append('height', String(p.height));
    if (p.takenAt) form.append('exifTakenAt', p.takenAt);
    if (p.lat !== null && p.lng !== null) {
      form.append('exifLat', String(p.lat));
      form.append('exifLng', String(p.lng));
    }
    if ('editToken' in auth) form.append('editToken', auth.editToken);
    else {
      form.append('updateId', auth.updateId);
      form.append('photoToken', auth.photoToken);
    }
    try {
      const r = await fetch(`/api/reports/${reportId}/photos`, { method: 'POST', body: form });
      if (r.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
    onProgress?.(sent + failed);
  }
  return { sent, failed };
}
