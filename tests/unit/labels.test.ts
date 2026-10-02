import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { localizeBasemap, readableTextSize, satelliteStyle } from '@/lib/map/style';

/** Evaluate a ['interpolate', ['linear'], ['zoom'], z, v, …] size at zoom z (linear). */
function sizeAt(expr: unknown, z: number): number {
  const e = expr as unknown[];
  const stops: [number, number][] = [];
  for (let i = 3; i + 1 < e.length; i += 2) stops.push([e[i] as number, e[i + 1] as number]);
  if (z <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, v0] = stops[i - 1]!;
    const [z1, v1] = stops[i]!;
    if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1]![1];
}

describe('basemap labels stay readable when zooming in', () => {
  it('turns a fixed size into one that grows with zoom', () => {
    const s = readableTextSize(10);
    expect(sizeAt(s, 16)).toBeGreaterThan(sizeAt(s, 10));
    expect(sizeAt(s, 17)).toBeGreaterThanOrEqual(15);
  });

  it('keeps a stock interpolation growing past its last stop (village names: 10→12 px by z11)', () => {
    const village = ['interpolate', ['exponential', 1.2], ['zoom'], 7, 10, 11, 12];
    const s = readableTextSize(village) as unknown[];
    expect(s[1]).toEqual(['exponential', 1.2]);
    expect(s[s.length - 2]).toBe(17);
    expect(s[s.length - 1]).toBeGreaterThanOrEqual(15);
    expect(s[4]).toBeGreaterThan(10);
  });

  it('applies to every text layer of a style, and leaves our overlays alone', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'label_village', type: 'symbol', source: 'x', layout: { 'text-field': '{name}', 'text-size': 10 } },
        { id: 'n360-villages-label', type: 'symbol', source: 'y', layout: { 'text-field': '{name}', 'text-size': 12 } },
      ],
    } as unknown as StyleSpecification;
    const out = localizeBasemap(style, 'th').layers as { layout: Record<string, unknown> }[];
    expect(Array.isArray(out[0]!.layout['text-size'])).toBe(true);
    expect(out[0]!.layout['text-field']).toEqual(['coalesce', ['get', 'name:th'], ['get', 'name']]);
    expect(out[1]!.layout['text-size']).toBe(12);
  });
});

describe('satellite view', () => {
  it('uses high-resolution imagery and borrows only text labels from the vector basemap', () => {
    const labels = {
      version: 8,
      glyphs: 'https://example.org/{fontstack}/{range}.pbf',
      sources: { openmaptiles: { type: 'vector', url: 'https://example.org/planet' } },
      layers: [
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
        { id: 'label_town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': '{name}' } },
        { id: 'highway-shield-non-us', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: { 'icon-image': 'x', 'text-field': '{ref}' } },
      ],
    } as unknown as StyleSpecification;
    const s = satelliteStyle(labels);
    const raster = Object.values(s.sources).find((x) => x.type === 'raster') as { tiles: string[]; maxzoom: number };
    expect(raster.tiles[0]).toContain('World_Imagery');
    expect(raster.maxzoom).toBeGreaterThanOrEqual(18);
    expect(s.layers.map((l) => l.id)).toEqual(['background', 'esri-imagery', 'label_town']);
    expect(s.glyphs).toBe(labels.glyphs);
    expect(satelliteStyle().layers.map((l) => l.id)).toEqual(['background', 'esri-imagery']);
  });
});
