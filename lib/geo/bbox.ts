import type { BBox } from '@/lib/types';

/**
 * Generous envelope around Thailand used only to reject grossly wrong
 * coordinates during validation. It is NOT the province extent — that is
 * derived from the official TH80 polygon at import time (province_extent).
 */
export const THAILAND_ENVELOPE: BBox = [97.0, 5.3, 106.0, 20.8];

export function bboxContains(b: BBox, lng: number, lat: number): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

export function isValidBBox(b: unknown): b is BBox {
  return (
    Array.isArray(b) &&
    b.length === 4 &&
    b.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (b[0] as number) <= (b[2] as number) &&
    (b[1] as number) <= (b[3] as number)
  );
}
