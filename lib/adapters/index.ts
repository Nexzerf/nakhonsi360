/**
 * Registered ingest adapters. An adapter is added here only after a real
 * response from its source has been saved to data/samples/<sourceId>/ and its
 * parser is tested against that sample (tests/unit/adapters/*.test.ts).
 *
 * Sources still pending are listed below with the reason in DATA_SOURCES.md.
 */
import type { IngestAdapter } from '@/lib/ingest/types';
import { thaiwaterRain24h, thaiwaterWaterlevel } from '@/lib/adapters/thaiwater';
import { usgsEarthquakes } from '@/lib/adapters/usgs';
import { firmsHotspots } from '@/lib/adapters/firms';
import { gistdaFlood } from '@/lib/adapters/gistda';
import { tmdWarnings, tmdWeather } from '@/lib/adapters/tmd';
import { gistdaPm25 } from '@/lib/adapters/gistdaPm25';
import { air4thaiAqi } from '@/lib/adapters/air4thai';

export const ADAPTERS: Record<string, IngestAdapter> = {
  [thaiwaterWaterlevel.sourceId]: thaiwaterWaterlevel,
  [thaiwaterRain24h.sourceId]: thaiwaterRain24h,
  [usgsEarthquakes.sourceId]: usgsEarthquakes,
  [firmsHotspots.sourceId]: firmsHotspots,
  [gistdaFlood.sourceId]: gistdaFlood,
  [tmdWeather.sourceId]: tmdWeather,
  [tmdWarnings.sourceId]: tmdWarnings,
  [gistdaPm25.sourceId]: gistdaPm25,
  [air4thaiAqi.sourceId]: air4thaiAqi,
};

/** Live sources that still need a verified sample before an adapter can be written. */
export const PENDING_ADAPTERS = [
  'tmd.earthquake',
  // Verified 2026-10-03 but not used: the same VIIRS detections as firms.hotspots (would draw every point twice).
  'gistda.hotspots',
] as const;
