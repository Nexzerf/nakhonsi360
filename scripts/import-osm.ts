/**
 * Import rivers, streams, canals, drains, water bodies, reservoirs, roads,
 * coastline and named places from an OpenStreetMap extract (Geofabrik
 * thailand-latest.osm.pbf), clipped to the province + 5 km buffer.
 *
 *   npm run import:osm -- --file data/static/thailand-latest.osm.pbf \
 *     [--url <download url>] [--source-version <replication timestamp>] [--source-date YYYY-MM-DD] [--dry-run]
 *
 * Requires the admin boundaries first (the clip polygon comes from province_extent).
 */
import path from 'node:path';
import { streamFeatures } from '@/lib/import/ogr';
import { classifyOsm, osmIdentity, osmTags, type OsmLayer } from '@/lib/import/osm';
import { cleanName } from '@/lib/import/text';
import type { BBox } from '@/lib/types';
import { assertIsoDate, connect, main, parseArgs, recordImport, sha256File } from './_common';

const OSM_ARGS = ['--config', 'OSM_CONFIG_FILE', path.join(process.cwd(), 'scripts', 'osmconf.ini'), '--config', 'OSM_MAX_TMPFILE_SIZE', '1024'];

main(async () => {
  const args = parseArgs();
  const file = args.str('file');
  if (!file) throw new Error('--file is required (.osm.pbf or .osm)');
  const sourceDate = assertIsoDate(args.str('source-date'));
  const dryRun = args.flag('dry-run');

  const sql = connect();
  try {
    const [ext] = await sql<{ b: number[] }[]>`
      select array[st_xmin(buffered_bbox), st_ymin(buffered_bbox), st_xmax(buffered_bbox), st_ymax(buffered_bbox)] as b
        from province_extent limit 1`;
    if (!ext) throw new Error('Province extent missing: run import:admin first.');
    const spat = ext.b.map(Number) as BBox;
    console.log(`Clipping to buffered province bbox ${spat.join(', ')}`);

    const sha = await sha256File(file);
    await sql.begin(async (tx) => {
      await tx`
        create temporary table stage_osm (
          osm_type text, osm_id bigint, kind text, subkind text, name_th text, name_en text, tags jsonb, geom geometry
        ) on commit drop`;

      const counts: Record<string, number> = {};
      let batch: Array<Record<string, unknown>> = [];
      const flush = async () => {
        if (!batch.length) return;
        await tx`
          insert into stage_osm (osm_type, osm_id, kind, subkind, name_th, name_en, tags, geom)
          select r.osm_type, r.osm_id, r.kind, r.subkind, r.name_th, r.name_en, r.tags,
                 st_setsrid(st_geomfromgeojson(r.geometry), 4326)
            from jsonb_to_recordset(${tx.json(batch as never)}::jsonb)
              as r(osm_type text, osm_id bigint, kind text, subkind text, name_th text, name_en text, tags jsonb, geometry text)`;
        batch = [];
      };

      for (const layer of ['lines', 'multipolygons', 'points'] as OsmLayer[]) {
        console.log(`Reading ${layer} …`);
        for await (const f of streamFeatures(file, layer, { spat, extraArgs: OSM_ARGS })) {
          if (!f.geometry) continue;
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const tags = osmTags(props);
          const cls = classifyOsm(layer, tags);
          if (!cls) continue;
          const id = osmIdentity(layer, props);
          if (!id) continue;
          counts[cls.kind] = (counts[cls.kind] ?? 0) + 1;
          batch.push({
            osm_type: id.osmType,
            osm_id: id.osmId,
            kind: cls.kind,
            subkind: cls.subkind,
            // Thai name: name:th, else `name` if it is written in Thai. English only from name:en.
            name_th: cleanName(tags['name:th']) ?? (tags.name && /[฀-๿]/.test(tags.name) ? cleanName(tags.name) : null),
            name_en: cleanName(tags['name:en']) ?? (tags.name && !/[฀-๿]/.test(tags.name) ? cleanName(tags.name) : null),
            tags,
            geometry: JSON.stringify(f.geometry),
          });
          if (batch.length >= 1000) await flush();
        }
        await flush();
      }
      console.log(`Candidates inside bbox: ${JSON.stringify(counts)}`);

      // Clip to the buffered polygon (not just its bbox) and keep the geometry dimension.
      await tx`
        update stage_osm s
           set geom = case
             when st_dimension(s.geom) = 0 then s.geom
             else st_collectionextract(st_intersection(st_makevalid(s.geom), pe.buffered), case st_dimension(s.geom) when 1 then 2 else 3 end)
           end
          from province_extent pe`;
      await tx`
        delete from stage_osm s
         using province_extent pe
         where st_isempty(s.geom) or not st_intersects(s.geom, pe.buffered)`;
      const [{ n: sourceCount } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from stage_osm`;
      // A way can be split across overlapping staging rows only if duplicated in the extract; keep one.
      const dup = await tx<{ n: number }[]>`
        select count(*)::int as n from (select 1 from stage_osm group by osm_type, osm_id, kind having count(*) > 1) d`;
      console.log(`Features intersecting province + 5 km: ${sourceCount} (duplicate ids: ${dup[0]?.n ?? 0})`);
      if (dryRun) throw new DryRun();

      const importId = await recordImport(tx, {
        sourceId: 'osm.geofabrik',
        sourceFile: path.basename(file),
        sourceUrl: args.str('url'),
        sourceSha256: sha,
        sourceVersion: args.str('source-version'),
        sourceDate,
        sourceRecordCount: sourceCount,
        importedCount: sourceCount - (dup[0]?.n ?? 0),
        rejections: [],
        notes: 'source_record_count = OSM features of the imported kinds intersecting the province + 5 km buffer',
      });
      await tx`delete from osm_features`;
      await tx`
        insert into osm_features (osm_type, osm_id, kind, subkind, name_th, name_en, tags, geom, import_id)
        select distinct on (osm_type, osm_id, kind) osm_type, osm_id, kind, subkind, name_th, name_en, tags, geom, ${importId}
          from stage_osm
         order by osm_type, osm_id, kind`;
      const [{ n: gaz } = { n: 0 }] = await tx<{ n: number }[]>`select refresh_gazetteer() as n`;
      const byKind = await tx<{ kind: string; n: number }[]>`select kind, count(*)::int as n from osm_features group by kind order by kind`;
      console.log(`Imported (import id ${importId}): ${byKind.map((r) => `${r.kind}=${r.n}`).join(', ')}. Gazetteer: ${gaz}.`);
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
    console.log('Dry run: rolled back.');
  } finally {
    await sql.end();
  }
});

class DryRun extends Error {}
