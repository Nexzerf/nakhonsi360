/**
 * Import DOPA village points ("ข้อมูลที่ตั้งและสภาพทั่วไปของหมู่บ้าน") for
 * Nakhon Si Thammarat from the GD Catalog file (JSON, GeoJSON or CSV).
 *
 *   npm run import:villages -- --file data/static/dopa-villages-nst.json \
 *     [--url <resource url>] [--source-version <v>] [--source-date YYYY-MM-DD] \
 *     [--map id=VILLAGE_CODE --map nameTh=VILLAGE_NAME --map lat=LAT --map lng=LONG] [--dry-run]
 *
 * Requires the admin boundaries to be imported first: each village is
 * assigned to the subdistrict polygon containing it, and points outside the
 * province + 5 km buffer are rejected (and reported), never moved.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectVillageFields, extractRecords, parseCsv, parseVillages, VILLAGE_FIELD_CANDIDATES, type VillageField } from '@/lib/import/dopa';
import { assertIsoDate, connect, main, parseArgs, recordImport, sha256File, summarize } from './_common';

main(async () => {
  const args = parseArgs();
  const file = args.str('file');
  if (!file) throw new Error('--file is required (DOPA villages JSON, GeoJSON or CSV)');
  const sourceDate = assertIsoDate(args.str('source-date'));
  const dryRun = args.flag('dry-run');
  for (const k of Object.keys(args.mapPairs)) {
    if (!(k in VILLAGE_FIELD_CANDIDATES)) throw new Error(`Unknown --map key ${k} (use ${Object.keys(VILLAGE_FIELD_CANDIDATES).join('|')})`);
  }

  const text = await readFile(file, 'utf8');
  const records = /\.csv$/i.test(file) ? parseCsv(text) : extractRecords(JSON.parse(text.replace(/^﻿/, '')));
  const keys = [...new Set(records.flatMap((r) => Object.keys(r.properties)))];
  const map = detectVillageFields(keys, args.mapPairs as Partial<Record<VillageField, string>>);
  const hasGeometry = records.some((r) => r.point);
  console.log(`Records in source file: ${records.length}`);
  console.log(`Detected fields: ${JSON.stringify(map)}${hasGeometry ? ' (+ GeoJSON point geometry)' : ''}`);

  const missing = (['id', 'nameTh'] as const).filter((f) => !map[f]);
  if (!hasGeometry && (!map.lat || !map.lng)) missing.push(...((['lat', 'lng'] as const).filter((f) => !map[f]) as never[]));
  if (missing.length) {
    throw new Error(`Could not detect field(s): ${missing.join(', ')}.\nAvailable keys: ${keys.join(', ')}\nPass e.g. --map ${missing[0]}=<KEY>.`);
  }

  const { villages, rejections } = parseVillages(records, map);
  console.log(`Parsed ${villages.length} villages; rejected ${rejections.length} (${summarize(rejections)})`);
  if (villages.length === 0) throw new Error('No valid villages parsed; nothing to import.');

  const sql = connect();
  try {
    const [ext] = await sql<{ n: number }[]>`select count(*)::int as n from province_extent`;
    if (!ext?.n) throw new Error('Province extent missing: run import:admin first.');

    const sha = await sha256File(file);
    await sql.begin(async (tx) => {
      // Stage, then keep only points inside the province + buffer.
      await tx`create temporary table stage_villages (like villages including defaults) on commit drop`;
      for (let i = 0; i < villages.length; i += 500) {
        const chunk = villages.slice(i, i + 500);
        await tx`
          insert into stage_villages (id, name_th, name_en, moo, source_admin_text, geom, properties)
          select v.id, v.name_th, v.name_en, v.moo, v.admin_text,
                 st_setsrid(st_makepoint(v.lng, v.lat), 4326), v.properties
            from jsonb_to_recordset(${tx.json(
              chunk.map((v) => ({ id: v.id, name_th: v.nameTh, name_en: v.nameEn, moo: v.moo, admin_text: v.adminText, lng: v.lng, lat: v.lat, properties: v.properties })) as never,
            )}::jsonb) as v(id text, name_th text, name_en text, moo smallint, admin_text text, lng float8, lat float8, properties jsonb)`;
      }
      const outside = await tx<{ id: string }[]>`
        delete from stage_villages s
         where not exists (select 1 from province_extent pe where st_covers(pe.buffered, s.geom))
        returning s.id`;
      for (const o of outside) rejections.push({ index: -1, id: o.id, reason: 'outside_province' as never });

      const imported = villages.length - outside.length;
      console.log(`Outside province + 5 km: ${outside.length}. Importing ${imported}.`);
      if (dryRun) {
        console.log('Dry run: rolling back.');
        throw new DryRun();
      }
      const importId = await recordImport(tx, {
        sourceId: 'dopa.villages',
        sourceFile: path.basename(file),
        sourceUrl: args.str('url'),
        sourceSha256: sha,
        sourceVersion: args.str('source-version'),
        sourceDate,
        sourceRecordCount: records.length,
        importedCount: imported,
        rejections,
        notes: `fields=${JSON.stringify(map)}`,
      });
      await tx`delete from villages`;
      await tx`
        insert into villages (id, name_th, name_en, moo, source_admin_text, geom, properties, import_id)
        select id, name_th, name_en, moo, source_admin_text, geom, properties, ${importId} from stage_villages`;
      const [{ n: assigned } = { n: 0 }] = await tx<{ n: number }[]>`select assign_village_subdistricts() as n`;
      const [{ n: unassigned } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from villages where subdistrict_pcode is null`;
      const [{ n: gaz } = { n: 0 }] = await tx<{ n: number }[]>`select refresh_gazetteer() as n`;
      console.log(`Imported ${imported} villages (import id ${importId}); ${assigned - unassigned} inside a subdistrict polygon, ${unassigned} in the 5 km buffer only. Gazetteer: ${gaz}.`);
      console.log(`Counts for the registry: source file ${records.length} · imported ${imported} · rejected ${rejections.length}`);
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  } finally {
    await sql.end();
  }
});

class DryRun extends Error {}
