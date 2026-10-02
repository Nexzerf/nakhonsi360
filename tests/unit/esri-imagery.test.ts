/**
 * Esri imagery loader helpers. Tile numbers and tilemap blocks are the real
 * ones returned by the World Imagery service on 2026-10-02 (GitHub runner).
 */
import { describe, expect, it } from 'vitest';
import { ancestorCrop, blockOrigin, esriTileUrl, parseProtocolUrl, tileInTilemap, tilemapUrl, type Tilemap } from '@/lib/map/esriImagery';

describe('Esri World Imagery loader', () => {
  it('finds the tilemap block for a z19 tile (city: 407725, 249821)', () => {
    expect(blockOrigin(407725, 249821)).toEqual([407712, 249792]);
    expect(tilemapUrl(19, 407712, 249792)).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/19/249792/407712/32/32');
    expect(esriTileUrl(19, 407725, 249821)).toBe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/19/249821/407725');
  });

  it('reads availability from the tilemap the way the service lays it out (row-major from left/top)', () => {
    const city: Tilemap = { location: { left: 407712, top: 249792, width: 32, height: 32 }, data: Array(1024).fill(1) };
    const huaSai: Tilemap = { location: { left: 408192, top: 250368, width: 32, height: 32 }, data: Array(1024).fill(0) };
    expect(tileInTilemap(city, 407725, 249821)).toBe(true);
    expect(tileInTilemap(huaSai, 408218, 250394)).toBe(false);
    const one: Tilemap = { location: { left: 0, top: 0, width: 32, height: 32 }, data: Array(1024).fill(0) };
    one.data[29 * 32 + 13] = 1; // (x 13, y 29) → index 941, as in the service's response
    expect(tileInTilemap(one, 13, 29)).toBe(true);
    expect(tileInTilemap(one, 29, 13)).toBe(false);
    expect(tileInTilemap(one, 40, 0)).toBe(false);
  });

  it('enlarges the right quarter of the z18 tile when z19 is missing', () => {
    expect(ancestorCrop(19, 408218, 250394, 18)).toEqual({ x: 204109, y: 125197, sx: 0, sy: 0, size: 128 });
    expect(ancestorCrop(19, 408219, 250395, 18)).toEqual({ x: 204109, y: 125197, sx: 128, sy: 128, size: 128 });
    expect(ancestorCrop(20, 3, 1, 18)).toEqual({ x: 0, y: 0, sx: 192, sy: 64, size: 64 });
  });

  it('accepts only its own tile URLs', () => {
    expect(parseProtocolUrl('esri-imagery://19/407725/249821')).toEqual({ z: 19, x: 407725, y: 249821 });
    expect(parseProtocolUrl('esri-imagery://19/1/2/../3')).toBeNull();
    expect(parseProtocolUrl('https://example.org/19/1/2')).toBeNull();
  });
});
