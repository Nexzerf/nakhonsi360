/**
 * USGS earthquake adapter, tested against the real response saved in data/samples.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseUsgs, usgsEarthquakes, usgsQueryUrl, USGS_MIN_MAGNITUDE, USGS_RADIUS_KM } from '@/lib/adapters/usgs';
import { validateBatch } from '@/lib/ingest/runner';
import { summarizeEarthquakes } from '@/lib/inspect/hazards';

const raw = JSON.parse(readFileSync(path.resolve(__dirname, '../../../data/samples/usgs.earthquakes/query.geojson'), 'utf8'));
const FETCHED = '2026-10-01T17:29:16.000Z';
type Feature = { id: string; properties: Record<string, unknown>; geometry: { coordinates: number[] } };

describe('USGS earthquakes (real sample)', () => {
  const batch = usgsEarthquakes.parse(raw, FETCHED);

  it('reads every event in the response', () => {
    expect(raw.metadata.count).toBe(raw.features.length);
    expect(batch.hazards).toHaveLength(raw.features.length);
    expect(batch.rejections).toEqual([]);
    expect(batch.stations).toEqual([]);
    expect(batch.observations).toEqual([]);
  });

  it('keeps the source record exactly: us7000tgrk', () => {
    const src = raw.features.find((f: Feature) => f.id === 'us7000tgrk') as Feature;
    const h = batch.hazards.find((x) => x.featureKey === 'us7000tgrk')!;
    expect(h.kind).toBe('earthquake');
    expect(h.properties?.mag).toBe(src.properties.mag);
    expect(h.properties?.mag_type).toBe(src.properties.magType);
    expect(h.properties?.place).toBe(src.properties.place);
    expect(h.properties?.status).toBe(src.properties.status);
    expect(h.properties?.url).toBe(src.properties.url);
    // Epoch ms are UTC: no timezone is inferred.
    expect(h.observedAt).toBe(new Date(src.properties.time as number).toISOString());
    // 2-D geometry; depth kept as a property.
    expect(h.geometry).toEqual({ type: 'Point', coordinates: src.geometry.coordinates.slice(0, 2) });
    expect(h.properties?.depth_km).toBe(src.geometry.coordinates[2]);
  });

  it('declares the response complete from the requested start time', () => {
    expect(batch.hazardWindows).toEqual([{ kind: 'earthquake', since: '2026-09-01T17:00:00.000Z' }]);
  });

  it('respects the requested magnitude and radius', () => {
    const q = new URL(raw.metadata.url).searchParams;
    expect(Number(q.get('minmagnitude'))).toBe(USGS_MIN_MAGNITUDE);
    expect(Number(q.get('maxradiuskm'))).toBe(USGS_RADIUS_KM);
    for (const h of batch.hazards) expect(h.properties?.mag as number).toBeGreaterThanOrEqual(USGS_MIN_MAGNITUDE);
  });

  it('passes validation', () => {
    const v = validateBatch(batch, new Date(FETCHED));
    expect(v.hazards).toHaveLength(batch.hazards.length);
    expect(v.hazardWindows).toEqual(batch.hazardWindows);
  });

  it('rejects records it cannot place or size, without dropping the rest', () => {
    const [good] = raw.features as Feature[];
    const bad = (patch: (f: Feature) => void) => {
      const f = structuredClone(good!);
      patch(f);
      return f;
    };
    const mixed = {
      ...raw,
      features: [
        good,
        bad((f) => (f.properties.mag = null)),
        bad((f) => (f.properties.type = 'quarry blast')),
        bad((f) => (f.geometry.coordinates = [200, 10, 5])),
        bad((f) => ((f as { id: unknown }).id = null)),
      ],
    };
    const b = parseUsgs(mixed);
    expect(b.hazards).toHaveLength(1);
    expect(b.rejections.map((r) => r.reason)).toEqual(['no_magnitude', 'not_earthquake', 'bad_coordinates', 'missing_id']);
  });

  it('refuses something that is not a FeatureCollection', () => {
    expect(() => parseUsgs({ error: 'bad request' })).toThrow();
  });
});

describe('USGS query', () => {
  it('asks around the centre of the province extent for the last 30 days', () => {
    const url = new URL(usgsQueryUrl([99.188998, 7.792817, 100.381914, 9.371316], new Date('2026-10-01T17:29:16Z')));
    expect(url.origin + url.pathname).toBe('https://earthquake.usgs.gov/fdsnws/event/1/query');
    expect(url.searchParams.get('latitude')).toBe('8.58');
    expect(url.searchParams.get('longitude')).toBe('99.79');
    expect(url.searchParams.get('starttime')).toBe('2026-09-01T17:00:00');
    expect(url.searchParams.get('eventtype')).toBe('earthquake');
  });
});

describe('hazards card summary', () => {
  it('lists the newest events and the nearest one, as published', () => {
    const rows = (raw.features as Feature[]).map((f, i) => ({
      source_id: 'usgs.earthquakes',
      feature_key: f.id,
      lng: f.geometry.coordinates[0]!,
      lat: f.geometry.coordinates[1]!,
      observed_at: new Date(f.properties.time as number),
      fetched_at: new Date(FETCHED),
      properties: { mag: f.properties.mag, place: f.properties.place, status: f.properties.status },
      distance_m: 1_000_000 + i,
    }));
    rows[10]!.distance_m = 5;
    const s = summarizeEarthquakes(rows, 5);
    expect(s.total).toBe(rows.length);
    expect(s.recent.map((e) => e.id)).toEqual(rows.slice(0, 5).map((r) => r.feature_key));
    expect(s.nearest?.id).toBe(rows[10]!.feature_key);
    expect(s.recent[0]!.place).toBe(raw.features[0].properties.place);
  });
});
