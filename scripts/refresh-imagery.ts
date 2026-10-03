/**
 * Refresh the changing raster layers (Sentinel-2 true colour and NDVI, SMAP
 * soil moisture). Cheap: a handful of requests. Runs from the ingest
 * workflow; skips layers refreshed within --min-hours (default 12).
 *
 *   DATABASE_URL=… npm run refresh:imagery [-- --force]
 */
import { createHash } from 'node:crypto';
import { connect, main, parseArgs, recordImport } from './_common';
import { buildSentinelMosaic, latestSmapDate, smapTileUrl, SMAP_LAYER, PC_STAC } from '@/lib/import/imagery';

main(async () => {
  const args = parseArgs();
  const force = args.flag('force');
  const minHours = Number(args.str('min-hours') ?? 12);
  const sql = connect();
  try {
    const fresh = async (layer: string) => {
      if (force) return false;
      const [r] = await sql<{ age_h: number }[]>`select extract(epoch from now() - refreshed_at) / 3600 as age_h from raster_layers where layer_id = ${layer}`;
      return r !== undefined && Number(r.age_h) < minHours;
    };

    // ------------------------------------------------------------ Sentinel-2
    if (await fresh('sentinel2')) console.log('Sentinel-2: refreshed recently, skipped');
    else {
      const [pe] = await sql<{ bbox: number[] }[]>`
        select array[st_xmin(bbox), st_ymin(bbox), st_xmax(bbox), st_ymax(bbox)] as bbox from province_extent where pcode = 'TH80'`;
      if (!pe) throw new Error('Province extent missing: run npm run import:admin first.');
      const bbox = pe.bbox.map(Number) as [number, number, number, number];
      const m = await buildSentinelMosaic(fetch, bbox);
      const dates = m.scenes.map((s) => s.datetime).sort();
      const details = { searchId: m.searchId, scenes: m.scenes };
      await sql.begin(async (tx) => {
        for (const [layer, url] of [['sentinel2', m.urls.visual], ['ndvi', m.urls.ndvi]] as const) {
          await tx`
            insert into raster_layers (layer_id, source_id, tile_url, minzoom, maxzoom, tile_size, data_from, data_to, details, refreshed_at)
            values (${layer}, 'copernicus.sentinel2', ${url}, 8, 16, 256, ${dates[0]!}, ${dates.at(-1)!}, ${tx.json(details as never)}, now())
            on conflict (layer_id) do update set tile_url = excluded.tile_url, minzoom = excluded.minzoom, maxzoom = excluded.maxzoom,
              tile_size = excluded.tile_size, data_from = excluded.data_from, data_to = excluded.data_to, details = excluded.details, refreshed_at = now()`;
        }
        await recordImport(tx, {
          sourceId: 'copernicus.sentinel2',
          sourceFile: `Planetary Computer mosaic ${m.searchId}`,
          sourceUrl: PC_STAC,
          sourceSha256: createHash('sha256').update(JSON.stringify(m.scenes)).digest('hex'),
          sourceVersion: m.scenes.map((s) => `${s.grid} ${s.datetime.slice(0, 10)} (${s.cloud.toFixed(0)}% cloud)`).join('; '),
          sourceDate: dates.at(-1)!.slice(0, 10),
          sourceRecordCount: m.scenes.length,
          importedCount: m.scenes.length,
          rejections: [],
          notes: 'least cloudy Sentinel-2 L2A scene of the last 120 days per grid tile over the province',
        });
      });
      console.log(`Sentinel-2: ${m.scenes.length} scenes ${dates[0]!.slice(0, 10)} … ${dates.at(-1)!.slice(0, 10)} (mosaic ${m.searchId})`);
    }

    // ------------------------------------------------------------ SMAP soil moisture
    if (await fresh('soil-moisture')) console.log('SMAP: refreshed recently, skipped');
    else {
      const date = await latestSmapDate(fetch);
      await sql.begin(async (tx) => {
        await tx`
          insert into raster_layers (layer_id, source_id, tile_url, minzoom, maxzoom, tile_size, data_from, data_to, details, refreshed_at)
          values ('soil-moisture', 'gistda.soilmoisture', ${smapTileUrl(date)}, 0, 6, 256, ${date}, ${date}, ${tx.json({ layer: SMAP_LAYER, date } as never)}, now())
          on conflict (layer_id) do update set tile_url = excluded.tile_url, maxzoom = excluded.maxzoom, data_from = excluded.data_from,
            data_to = excluded.data_to, details = excluded.details, refreshed_at = now()`;
        await recordImport(tx, {
          sourceId: 'gistda.soilmoisture',
          sourceFile: `${SMAP_LAYER} ${date}`,
          sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/',
          sourceSha256: createHash('sha256').update(`${SMAP_LAYER}|${date}`).digest('hex'),
          sourceVersion: `GIBS default day ${date}`,
          sourceDate: date,
          sourceRecordCount: 1,
          importedCount: 1,
          rejections: [],
          notes: 'newest day of SMAP L4 analysed surface soil moisture offered by NASA GIBS',
        });
      });
      console.log(`SMAP: ${date}`);
    }
  } finally {
    await sql.end();
  }
});
