import { describe, expect, it } from 'vitest';
import { parseCoordinates } from '@/lib/geo/coords';

describe('parseCoordinates', () => {
  it('reads lat,lng', () => {
    expect(parseCoordinates('8.4304, 99.9631')).toEqual({ lat: 8.4304, lng: 99.9631, order: 'lat,lng' });
  });

  it('detects lng,lat by range', () => {
    expect(parseCoordinates('99.9631, 8.4304')).toEqual({ lat: 8.4304, lng: 99.9631, order: 'lng,lat' });
  });

  it('accepts space or semicolon separators', () => {
    expect(parseCoordinates('8.43 99.96')?.lng).toBe(99.96);
    expect(parseCoordinates('8.43;99.96')?.lat).toBe(8.43);
  });

  it('reads DMS with hemispheres', () => {
    const p = parseCoordinates(`8°25'49.4"N 99°57'47.2"E`);
    expect(p?.order).toBe('dms');
    expect(p?.lat).toBeCloseTo(8.43039, 4);
    expect(p?.lng).toBeCloseTo(99.96311, 4);
  });

  it('reads DMS given longitude first', () => {
    const p = parseCoordinates(`99°57'47"E, 8°25'49"N`);
    expect(p?.lat).toBeCloseTo(8.4303, 3);
    expect(p?.lng).toBeCloseTo(99.9631, 3);
  });

  it('reads degrees and decimal minutes', () => {
    const p = parseCoordinates(`N 8°25.8' E 99°57.8'`);
    expect(p?.lat).toBeCloseTo(8.43, 2);
    expect(p?.lng).toBeCloseTo(99.9633, 3);
  });

  it('rejects place names and invalid values', () => {
    expect(parseCoordinates('ท่าศาลา')).toBeNull();
    expect(parseCoordinates('บ้าน 12')).toBeNull();
    expect(parseCoordinates('200, 300')).toBeNull();
    expect(parseCoordinates(`8°75'N 99°10'E`)).toBeNull();
  });
});
