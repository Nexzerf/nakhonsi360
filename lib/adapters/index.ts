/**
 * Registered ingest adapters. An adapter is added here only after a real
 * response from its source has been saved to data/samples/<sourceId>/ and its
 * parser is tested against that sample (tests/unit/adapters/*.test.ts).
 *
 * Sources still pending are listed below with the reason in DATA_SOURCES.md.
 */
import type { IngestAdapter } from '@/lib/ingest/types';
import { thaiwaterRain24h, thaiwaterWaterlevel } from '@/lib/adapters/thaiwater';

export const ADAPTERS: Record<string, IngestAdapter> = {
  [thaiwaterWaterlevel.sourceId]: thaiwaterWaterlevel,
  [thaiwaterRain24h.sourceId]: thaiwaterRain24h,
};

/** Live sources that still need a verified sample before an adapter can be written. */
export const PENDING_ADAPTERS = [
  'tmd.weather',
  'tmd.warnings',
  'tmd.earthquake',
  'air4thai.aqi',
  'gistda.flood',
  'gistda.hotspots',
  'firms.hotspots',
] as const;
