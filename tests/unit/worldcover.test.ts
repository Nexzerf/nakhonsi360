import { describe, expect, it } from 'vitest';
import { WORLDCOVER_CLASSES, pixelAreaM2, worldcoverTileUrl, worldcoverTiles } from '@/lib/import/worldcover';

describe('ESA WorldCover helpers', () => {
  it('finds the two 3° tiles that cover the province + 5 km', () => {
    // Bbox of province_extent (TH80 + 5 km) from the real COD-AB import.
    expect(worldcoverTiles([99.18899890348249, 7.792817018585533, 100.38191460162172, 9.371316856786684])).toEqual(['N06E099', 'N09E099']);
    expect(worldcoverTileUrl('N06E099')).toBe('https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N06E099_Map.tif');
  });

  it('names tiles south/west of 0 with S/W and zero padding', () => {
    expect(worldcoverTiles([-1, -1, 1, 1])).toEqual(['S03W003', 'S03E000', 'N00W003', 'N00E000']);
  });

  it('gives the area of a 10 m (1/12000°) pixel from its latitude on the WGS 84 ellipsoid', () => {
    const res = 1 / 12000;
    // Reference values: PostGIS geodesic st_area of the same pixel as geography.
    expect(pixelAreaM2(0, res)).toBeCloseTo(85.47967, 4);
    expect(pixelAreaM2(8.5, res)).toBeCloseTo(84.56548, 4);
    expect(pixelAreaM2(60, res)).toBeCloseTo(43.17226, 4);
  });

  it('has the 11 classes of the PUM legend, each with Thai and English names', () => {
    expect(WORLDCOVER_CLASSES.map((c) => c.code)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]);
    for (const c of WORLDCOVER_CLASSES) {
      expect(c.th).toMatch(/[ก-๙]/);
      expect(c.en.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Plantations are tree cover in WorldCover; the label must say so for this province.
    expect(WORLDCOVER_CLASSES[0]!.th).toContain('ยางพารา');
  });
});
