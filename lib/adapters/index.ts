/**
 * Registered ingest adapters. An adapter is added here only after a real
 * response from its source has been saved to data/samples/<sourceId>/ and its
 * parser is tested against that sample (tests/unit/adapters/*.test.ts).
 *
 * None are registered yet: the Phase 2 sources could not be reached from the
 * build environment (see DATA_SOURCES.md). Run `npm run fetch:live-samples`
 * from a machine with internet access to collect the samples.
 */
import type { IngestAdapter } from '@/lib/ingest/types';

export const ADAPTERS: Record<string, IngestAdapter> = {};

/** Live sources that still need a verified sample before an adapter can be written. */
export const PENDING_ADAPTERS = [
  'thaiwater.waterlevel',
  'thaiwater.rain24h',
  'tmd.weather',
  'tmd.warnings',
  'tmd.earthquake',
  'air4thai.aqi',
  'gistda.flood',
  'gistda.hotspots',
  'firms.hotspots',
] as const;
