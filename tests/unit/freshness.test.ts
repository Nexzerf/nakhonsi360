import { describe, expect, it } from 'vitest';
import { classifyFreshness, classifyQuality } from '@/lib/freshness/classify';
import { formatDate, formatDistance, formatRelative } from '@/lib/freshness/format';

const now = new Date('2026-09-29T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('classifyFreshness', () => {
  const station = { expectedUpdateMinutes: 60, kind: 'station_observation' as const };
  const satellite = { expectedUpdateMinutes: 180, kind: 'satellite_derived' as const };
  const reference = { expectedUpdateMinutes: null, kind: 'reference' as const };

  it('is LIVE within twice the expected interval', () => {
    expect(classifyFreshness(minutesAgo(119), station, now)).toBe('LIVE');
    expect(classifyFreshness(minutesAgo(121), station, now)).toBe('RECENT');
  });

  it('is HISTORICAL after 7 days', () => {
    expect(classifyFreshness(minutesAgo(7 * 24 * 60 + 1), station, now)).toBe('HISTORICAL');
  });

  it('never labels satellite products LIVE', () => {
    expect(classifyFreshness(minutesAgo(1), satellite, now)).toBe('RECENT');
  });

  it('classifies static datasets by age', () => {
    expect(classifyFreshness(new Date('2022-01-21'), reference, now)).toBe('HISTORICAL');
    expect(classifyFreshness(new Date('2019-01-01'), reference, now)).toBe('ARCHIVED');
  });
});

describe('classifyQuality', () => {
  it('marks missing observation time', () => {
    expect(classifyQuality(null, { expectedUpdateMinutes: 60 }, now)).toBe('NO_OBSERVATION');
  });
  it('distinguishes current and delayed', () => {
    expect(classifyQuality(minutesAgo(30), { expectedUpdateMinutes: 60 }, now)).toBe('CURRENT');
    expect(classifyQuality(minutesAgo(90), { expectedUpdateMinutes: 60 }, now)).toBe('DELAYED');
  });
  it('marks reference data as official historical', () => {
    expect(classifyQuality(new Date('2022-01-21'), { expectedUpdateMinutes: null }, now)).toBe('OFFICIAL_HISTORICAL');
  });
});

describe('formatting', () => {
  it('uses Buddhist Era years in Thai', () => {
    expect(formatDate(new Date('2026-09-28T03:00:00Z'), 'th')).toContain('2569');
    expect(formatDate(new Date('2026-09-28T03:00:00Z'), 'en')).toContain('2026');
  });
  it('formats relative time in Thai', () => {
    expect(formatRelative(minutesAgo(4), 'th', now)).toBe('4 นาทีที่ผ่านมา');
  });
  it('formats distances with explicit units', () => {
    expect(formatDistance(3240, 'th')).toBe('3.2 กม.');
    expect(formatDistance(846, 'th')).toBe('850 ม.');
    expect(formatDistance(15_400, 'en')).toBe('15 km');
  });
});
