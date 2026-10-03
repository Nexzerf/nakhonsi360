/** Imagery layer builders, against responses recorded on 2026-10-03 (see lib/import/imagery.ts). */
import { describe, expect, it } from 'vitest';
import { bestScenes, gibsDefaultDate, sentinelTileUrls, smapTileUrl } from '@/lib/import/imagery';
import { parseFloodFrequency, floodFrequencyUrl } from '@/lib/inspect/floodFrequency';

const f = (id: string, grid: string, datetime: string, cloud: number) => ({ id, properties: { 's2:mgrs_tile': grid, datetime, 'eo:cloud_cover': cloud } });

describe('Sentinel-2 mosaic', () => {
  it('keeps the least cloudy scene per grid tile (newer one on a tie)', () => {
    const s = bestScenes([
      f('a', '47PPK', '2026-09-09T03:42:01Z', 32.9),
      f('b', '47PPK', '2026-08-13T03:35:29Z', 6.0),
      f('c', '47NNJ', '2026-09-07T03:35:31Z', 39.4),
      f('d', '47NNJ', '2026-07-31T03:42:01Z', 25.9),
      f('e', '47PNL', '2026-06-24T03:35:29Z', 13.3),
      f('g', '47PNL', '2026-08-01T03:35:29Z', 13.3),
      { id: 'bad', properties: { datetime: '2026-09-01T00:00:00Z' } },
    ]);
    expect(s.map((x) => [x.grid, x.id])).toEqual([
      ['47NNJ', 'd'],
      ['47PNL', 'g'],
      ['47PPK', 'b'],
    ]);
  });

  it('builds sharp (2×) true-colour and NDVI tiles from the same mosaic', () => {
    const u = sentinelTileUrls('0c5657cc1c50ffea17e0b8ed5b77c853');
    expect(u.visual).toBe('https://planetarycomputer.microsoft.com/api/data/v1/mosaic/0c5657cc1c50ffea17e0b8ed5b77c853/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?collection=sentinel-2-l2a&assets=visual&nodata=0&format=webp');
    expect(decodeURIComponent(u.ndvi)).toContain('expression=(B08-B04)/(B08+B04)');
  });
});

describe('SMAP soil moisture (GIBS)', () => {
  it('reads the newest day from capabilities and puts it in the tile URL', () => {
    const caps = '<Layer><ows:Identifier>SMAP_L4_Analyzed_Surface_Soil_Moisture</ows:Identifier><Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-09-29</Default></Dimension></Layer>';
    expect(gibsDefaultDate(caps, 'SMAP_L4_Analyzed_Surface_Soil_Moisture')).toBe('2026-09-29');
    expect(gibsDefaultDate(caps, 'OTHER')).toBeNull();
    expect(smapTileUrl('2026-09-29')).toContain('/default/2026-09-29/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png');
  });
});

describe('GISTDA recurrent flooding at a point', () => {
  it('reads Freq and the flooded years from GISTDA’s attributes (real response, 2026-10-03)', () => {
    const real = { features: [{ attributes: { Freq: 1, Y_2011: 1, Y_2020: 0, PV_TN: 'จ.นครศรีธรรมราช' } }] };
    expect(parseFloodFrequency(real)).toEqual({ years: 1, flooded: [2011] });
  });

  it('distinguishes "no flooding mapped here" from "service unavailable"', () => {
    expect(parseFloodFrequency({ features: [] })).toEqual({ years: 0, flooded: [] });
    expect(parseFloodFrequency({ error: { code: 500 } })).toBeNull();
  });

  it('asks only for the point, in WGS84', () => {
    expect(floodFrequencyUrl(100.2, 8.3)).toContain('geometry=100.2%2C8.3');
    expect(floodFrequencyUrl(100.2, 8.3)).toContain('inSR=4326');
  });
});
