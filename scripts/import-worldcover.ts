/**
 * Import ESA WorldCover 2021 (v200, 10 m) land cover for the province.
 *
 *   npm run import:worldcover                       # reads the tiles straight from the public S3 bucket (COG, HTTP ranges)
 *   npm run import:worldcover -- --file <tif|vrt>   # or from a local copy of the tiles
 *
 * Requires the admin boundaries (import:admin). Uses GDAL command-line tools only:
 * 1. clip the tiles to the province + 5 km (gdalbuildvrt + gdal_translate);
 * 2. rasterize the subdistrict polygons on the same 10 m grid (gdal_rasterize);
 * 3. stream both rasters and add up each pixel's area (from its latitude on the
 *    WGS 84 ellipsoid) per subdistrict and class → landcover_stats;
 * 4. trace the mangrove pixels to polygons (gdal_contour -p on a 0/1 mask)
 *    → landcover_features, drawn as a map layer.
 * Nothing is resampled or smoothed: every 10 m pixel counts once.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '@/lib/import/ogr';
import { MAPPED_CLASSES, WORLDCOVER_CODES, WORLDCOVER_VERSION, WORLDCOVER_YEAR, pixelAreaM2, worldcoverTileUrl, worldcoverTiles } from '@/lib/import/worldcover';
import { connect, main, parseArgs, recordImport } from './_common';

/** Polygons smaller than this (2 pixels) are not drawn; their pixels still count in the statistics. */
const MIN_POLYGON_M2 = 200;

main(async () => {
  const args = parseArgs();
  const localFile = args.str('file');
  const keep = args.flag('keep-temp');
  const sql = connect();
  const dir = await mkdtemp(path.join(tmpdir(), 'n360-worldcover-'));
  try {
    const [ext] = await sql<{ w: number; s: number; e: number; n: number }[]>`
      select st_xmin(buffered) as w, st_ymin(buffered) as s, st_xmax(buffered) as e, st_ymax(buffered) as n from province_extent`;
    if (!ext) throw new Error('Province extent missing: run import:admin first.');
    const subs = await sql<{ pcode: string; geojson: string }[]>`
      select pcode, st_asgeojson(geom) as geojson from admin_areas where level = 3 order by pcode`;
    if (subs.length === 0 || subs.length > 254) throw new Error(`Expected 1–254 subdistricts, found ${subs.length}`);

    // 1. Clip.
    const tiles = worldcoverTiles([ext.w, ext.s, ext.e, ext.n]);
    const sources = localFile ? [localFile] : tiles.map((t) => `/vsicurl/${worldcoverTileUrl(t)}`);
    console.log(`Source: ${localFile ?? `ESA WorldCover ${WORLDCOVER_YEAR} ${WORLDCOVER_VERSION} tiles ${tiles.join(', ')}`}`);
    const vrt = path.join(dir, 'src.vrt');
    await run('gdalbuildvrt', ['-q', vrt, ...sources]);
    const classes = path.join(dir, 'classes.bin');
    await run('gdal_translate', ['-q', '-of', 'ENVI', '-projwin', String(ext.w), String(ext.n), String(ext.e), String(ext.s), vrt, classes]);
    const info = JSON.parse(await run('gdalinfo', ['-json', classes])) as { size: [number, number]; geoTransform: number[] };
    const [width, height] = info.size;
    const [x0, res, , y0, , negRes] = info.geoTransform as [number, number, number, number, number, number];
    if (Math.abs(res + negRes) > 1e-12) throw new Error('Expected square pixels');
    console.log(`Clipped: ${width} × ${height} pixels of ${res.toFixed(9)}°`);

    // 2. Subdistrict zones on the same grid (0 = outside every subdistrict).
    const zonesSrc = path.join(dir, 'zones.geojson');
    await writeFile(zonesSrc, JSON.stringify({
      type: 'FeatureCollection',
      features: subs.map((s, i) => ({ type: 'Feature', properties: { idx: i + 1 }, geometry: JSON.parse(s.geojson) })),
    }));
    const zones = path.join(dir, 'zones.bin');
    await run('gdal_rasterize', ['-q', '-a', 'idx', '-ot', 'Byte', '-init', '0', '-of', 'ENVI',
      '-te', String(x0), String(y0 + negRes * height), String(x0 + res * width), String(y0), '-ts', String(width), String(height), zonesSrc, zones]);

    // 3. Area per subdistrict and class; mangrove mask for tracing.
    const area = new Float64Array(256 * 256); // [zone * 256 + class] → m²
    const unknown = new Float64Array(256);
    const valid = new Uint8Array(256);
    for (const c of WORLDCOVER_CODES) valid[c] = 1;
    const mapped = MAPPED_CLASSES[0];
    const mask = path.join(dir, 'mask.bin');
    const maskOut = createWriteStream(mask);
    const sha = createHash('sha256');
    let row = 0;
    let col = 0;
    let pixels = 0;
    let inside = 0;
    const zoneIter = createReadStream(zones, { highWaterMark: 1 << 20 })[Symbol.asyncIterator]();
    let zbuf = Buffer.alloc(0);
    for await (const chunk of createReadStream(classes, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
      sha.update(chunk);
      while (zbuf.length < chunk.length) {
        const next = await zoneIter.next();
        if (next.done) throw new Error('Zone raster shorter than class raster');
        zbuf = Buffer.concat([zbuf, next.value as Buffer]);
      }
      const z = zbuf.subarray(0, chunk.length);
      zbuf = zbuf.subarray(chunk.length);
      const m = Buffer.alloc(chunk.length);
      let pxArea = pixelAreaM2(y0 + negRes * (row + 0.5), res);
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i]!;
        if (c === mapped) m[i] = 1;
        if (c !== 0) {
          pixels++;
          if (!valid[c]) unknown[c]!++;
          else if (z[i] !== 0) {
            inside++;
            area[z[i]! * 256 + c]! += pxArea;
          }
        }
        if (++col === width) {
          col = 0;
          row++;
          pxArea = pixelAreaM2(y0 + negRes * (row + 0.5), res);
        }
      }
      if (!maskOut.write(m)) await new Promise<void>((r) => maskOut.once('drain', () => r()));
    }
    await new Promise<void>((r, j) => maskOut.end((err?: Error | null) => (err ? j(err) : r())));
    if (row !== height) throw new Error(`Read ${row} rows, expected ${height}`);
    const unknownCodes = [...unknown].map((n, c) => [c, n] as const).filter(([, n]) => n > 0);
    if (unknownCodes.length) throw new Error(`Unknown class codes in the source: ${unknownCodes.map(([k, v]) => `${k}×${v}`).join(', ')}`);

    // 4. Trace the mask. The ENVI header of the class raster declares 0 as nodata; the mask must not.
    const hdr = (await readFile(classes.replace(/\.bin$/, '.hdr'), 'utf8')).split('\n').filter((l) => !/data ignore value/i.test(l)).join('\n');
    await writeFile(mask.replace(/\.bin$/, '.hdr'), hdr);
    const traced = path.join(dir, 'mangroves.geojson');
    await run('gdal_contour', ['-q', '-p', '-amin', 'emin', '-fl', '0.5', '-f', 'GeoJSON', mask, traced]);
    const fc = JSON.parse(await readFile(traced, 'utf8')) as { features: Array<{ properties: { emin: number }; geometry: unknown }> };
    const mangroveGeoms = fc.features.filter((f) => f.properties.emin >= 0.5).map((f) => JSON.stringify(f.geometry));

    const statsRows: Array<{ pcode: string; class_code: number; area_km2: number; share: number }> = [];
    let zonesWithData = 0;
    for (let zone = 1; zone <= subs.length; zone++) {
      const byClass = area.subarray(zone * 256, zone * 256 + 256);
      const total = byClass.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      zonesWithData++;
      byClass.forEach((m2, c) => {
        if (m2 > 0) statsRows.push({ pcode: subs[zone - 1]!.pcode, class_code: c, area_km2: m2 / 1e6, share: m2 / total });
      });
    }

    await sql.begin(async (tx) => {
      const importId = await recordImport(tx, {
        sourceId: 'esa.worldcover',
        sourceFile: localFile ? path.basename(localFile) : tiles.map((t) => path.basename(worldcoverTileUrl(t))).join(', '),
        sourceUrl: localFile ? undefined : worldcoverTileUrl(tiles[0]!),
        sourceSha256: sha.digest('hex'),
        sourceVersion: `${WORLDCOVER_VERSION} (${WORLDCOVER_YEAR})`,
        sourceDate: `${WORLDCOVER_YEAR}-12-31`,
        // Records = classified 10 m pixels in the clip; imported = those inside a subdistrict (the rest is sea or neighbouring provinces).
        sourceRecordCount: pixels,
        importedCount: inside,
        rejections: [],
        notes: `pixel area from latitude (WGS 84); clip ${width}x${height} px; source date = end of reference year ${WORLDCOVER_YEAR}`,
      });
      await tx`delete from landcover_stats where source_id = 'esa.worldcover'`;
      await tx`delete from landcover_features where source_id = 'esa.worldcover'`;
      await tx`
        insert into landcover_stats (source_id, pcode, class_code, area_km2, share, import_id)
        select 'esa.worldcover', r.pcode, r.class_code, r.area_km2, r.share, ${importId}
          from jsonb_to_recordset(${tx.json(statsRows as never)}::jsonb) as r(pcode text, class_code smallint, area_km2 float8, share float8)`;
      let polys = 0;
      for (let i = 0; i < mangroveGeoms.length; i++) {
        const r = await tx`
          insert into landcover_features (source_id, class_code, area_m2, geom, import_id)
          select 'esa.worldcover', ${MAPPED_CLASSES[0]}, st_area(d.geom::geography), d.geom, ${importId}
            from (select (st_dump(st_collectionextract(st_makevalid(st_intersection(
                    st_setsrid(st_geomfromgeojson(${mangroveGeoms[i]!}), 4326), pe.buffered)), 3))).geom as geom
                    from province_extent pe) d
           where st_area(d.geom::geography) >= ${MIN_POLYGON_M2}`;
        polys += r.count;
      }
      const [tot] = await tx<{ km2: number }[]>`select coalesce(sum(area_km2), 0) as km2 from landcover_stats where source_id = 'esa.worldcover' and class_code = 95`;
      console.log(`Subdistricts with statistics: ${zonesWithData} of ${subs.length}; classified pixels ${pixels.toLocaleString()} (inside subdistricts ${inside.toLocaleString()}).`);
      console.log(`Mangroves: ${tot!.km2.toFixed(2)} km² inside subdistricts; ${polys} polygons ≥ ${MIN_POLYGON_M2} m² traced for the map (import id ${importId}).`);
    });
  } finally {
    await sql.end();
    if (!keep) await rm(dir, { recursive: true, force: true });
    else console.log(`Temporary files kept in ${dir}`);
  }
});
