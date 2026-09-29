import type { DataSource, Freshness, Quality } from '@/lib/types';

const MS_PER_MIN = 60_000;
const MS_PER_YEAR = 365.25 * 24 * 60 * MS_PER_MIN;

function ageYears(observedAt: Date, now: Date): number {
  return (now.getTime() - observedAt.getTime()) / MS_PER_YEAR;
}

/**
 * Freshness of a value from its observation time and the source's update interval.
 * Satellite-derived products are never LIVE: they are capped at RECENT.
 */
export function classifyFreshness(observedAt: Date, src: Pick<DataSource, 'expectedUpdateMinutes' | 'kind'>, now = new Date()): Freshness {
  if (src.expectedUpdateMinutes === null) return ageYears(observedAt, now) > 5 ? 'ARCHIVED' : 'HISTORICAL';
  const ageMin = (now.getTime() - observedAt.getTime()) / MS_PER_MIN;
  if (ageMin <= src.expectedUpdateMinutes * 2) return src.kind === 'satellite_derived' ? 'RECENT' : 'LIVE';
  if (ageMin <= 7 * 24 * 60) return 'RECENT';
  return 'HISTORICAL';
}

/**
 * Quality badge.
 * - CURRENT: within the expected update interval
 * - DELAYED: older than the expected interval (live sources only)
 * - OFFICIAL_HISTORICAL: static/reference datasets
 * - NO_OBSERVATION: no observation time available
 */
export function classifyQuality(observedAt: Date | null, src: Pick<DataSource, 'expectedUpdateMinutes'>, now = new Date()): Quality {
  if (!observedAt) return 'NO_OBSERVATION';
  if (src.expectedUpdateMinutes === null) return 'OFFICIAL_HISTORICAL';
  const ageMin = (now.getTime() - observedAt.getTime()) / MS_PER_MIN;
  return ageMin <= src.expectedUpdateMinutes ? 'CURRENT' : 'DELAYED';
}
