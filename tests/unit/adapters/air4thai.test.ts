/** Air4Thai station air quality against the real sample in data/samples/. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { air4thaiTime, parseAir4thai } from '@/lib/adapters/air4thai';
import { validateObservation } from '@/lib/validation/observation';

const root = path.resolve(__dirname, '../../../data/samples');
const near = JSON.parse(readFileSync(path.join(root, 'air4thai.aqi/near_stations.json'), 'utf8'));
const FETCHED = '2026-10-03T18:38:59.138Z';

describe('Air4Thai (real sample)', () => {
  const b = parseAir4thai({ stations: near }, FETCHED);

  it('reads the Nakhon Si Thammarat station with PCD’s own level, in Thai time', () => {
    expect(b.rejections).toEqual([]);
    const pm = b.observations.find((o) => o.stationId === '89t' && o.variable === 'pm25')!;
    expect(pm).toMatchObject({ value: 12.4, unit: 'µg/m³', officialLevel: 1, officialStatus: 'คุณภาพอากาศดีมาก' });
    expect(pm.observedAt).toBe('2026-10-03T14:00:00.000Z');
    const aqi = b.observations.find((o) => o.stationId === '89t' && o.variable === 'aqi')!;
    expect(aqi).toMatchObject({ value: 21, unit: 'AQI', officialLevel: 1 });
  });

  it('treats -1 as not measured, never as a value', () => {
    expect(b.observations.some((o) => o.stationId === '42t' && o.variable === 'pm10')).toBe(false);
    expect(b.observations.every((o) => o.value >= 0)).toBe(true);
    expect(b.observations.every((o) => validateObservation(o, new Date(FETCHED)).ok)).toBe(true);
  });

  it('parses date + time as Thai time', () => {
    expect(air4thaiTime('2026-10-04', '01:00')).toBe('2026-10-03T18:00:00.000Z');
    expect(air4thaiTime('2026-10-04', '')).toBeNull();
  });
});
