/**
 * City CCTV list parsing against the real response saved in
 * data/samples/nst.cctv/sample.json.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCameraId, modeOf, parseCameras, streamUrl } from '@/lib/cctv/schema';

const sample = JSON.parse(readFileSync(path.resolve(__dirname, '../../data/samples/nst.cctv/sample.json'), 'utf8'));

describe('NST city CCTV (real sample)', () => {
  it('keeps every valid camera with its own name, group and status', () => {
    const { cameras, rejected } = parseCameras(sample.cameras, sample.status);
    expect(rejected).toBe(0);
    expect(cameras).toHaveLength(sample.cameras.length);
    const raw = sample.cameras[0];
    const c = cameras.find((x) => x.id === raw.id)!;
    expect(c).toMatchObject({ name: raw.name, group: raw.group, lat: raw.lat, lng: raw.lng });
    expect(c.status).toBe(sample.status[raw.id] ?? null);
  });

  it('derives the mode from the municipality id prefix, then the group name', () => {
    expect(modeOf('WL029', null)).toBe('water');
    expect(modeOf('TF004', null)).toBe('traffic');
    expect(modeOf('SC041', null)).toBe('school');
    expect(modeOf('SZ013', null)).toBe('safety');
    expect(modeOf('X1', '4.กล้องดูระดับน้ำ')).toBe('water');
    expect(modeOf('X1', null)).toBe('other');
  });

  it('rejects records without usable coordinates or ids, and duplicates', () => {
    const { cameras, rejected } = parseCameras(
      [
        { id: 'TF001', name: 'ok', lat: 8.4, lng: 99.9 },
        { id: 'TF001', name: 'duplicate', lat: 8.4, lng: 99.9 },
        { id: 'TF002', name: 'no coords' },
        { id: 'TF003', name: 'zero island', lat: 0, lng: 0 },
        { id: '../etc', name: 'bad id', lat: 8.4, lng: 99.9 },
        { id: 'TF004', name: '', lat: 8.4, lng: 99.9 },
      ],
      { TF001: 'online' },
    );
    expect(cameras.map((c) => c.id)).toEqual(['TF001']);
    expect(cameras[0]!.status).toBe('online');
    expect(rejected).toBe(5);
  });

  it('builds player URLs only for safe ids', () => {
    expect(streamUrl('TF004')).toBe('https://nstcctv.nakhoncity.org/cam/TF004_sub/');
    expect(streamUrl('TF004', true)).toBe('https://nstcctv.nakhoncity.org/cam/TF004/');
    expect(isCameraId('a/b')).toBe(false);
    expect(() => streamUrl('a/../b')).toThrow();
  });
});
