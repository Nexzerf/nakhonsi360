/**
 * Import DOPA village points ("ข้อมูลที่ตั้งและสภาพทั่วไปของหมู่บ้าน") for
 * Nakhon Si Thammarat from the GD Catalog file (JSON, GeoJSON or CSV).
 *
 *   npm run import:villages -- --file data/static/dopa-villages-nst.json \
 *     [--url <resource url>] [--source-version <v>] [--source-date YYYY-MM-DD] \
 *     [--map id=VILLAGE_CODE --map nameTh=VILLAGE_NAME --map lat=LAT --map lng=LONG] [--dry-run]
 *
 * Requires the admin boundaries to be imported first: each village is
 * assigned to the subdistrict polygon containing it.
 *
 * Villages whose published coordinate is unusable (metres instead of degrees,
 * swapped axes, a point outside the province + 5 km) are not dropped:
 * - a correction (UTM 47N, or swapping the axes) is kept only if exactly one
 *   candidate lands inside the subdistrict the source names for the village;
 *   the method and uncertainty are stored and shown;
 * - otherwise the village goes to villages_unlocated with the reason and the
 *   published values. It is searchable by its DOPA subdistrict and never drawn.
 * Only records without an id or name, or with a duplicate id, are rejected.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectVillageFields, extractRecords, parseCsv, parseVillages, VILLAGE_FIELD_CANDIDATES, type UnusableLocation, type VillageField } from '@/lib/import/dopa';
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

  const { villages, unusable, rejections } = parseVillages(records, map);
  console.log(`Parsed ${villages.length} villages with a usable point; ${unusable.length} with an unusable coordinate (${summarize(unusable)}); rejected ${rejections.length} (${summarize(rejections)})`);
  if (villages.length === 0) throw new Error('No valid villages parsed; nothing to import.');

  const sql = connect();
  try {
    const [ext] = await sql<{ n: number }[]>`select count(*)::int as n from province_extent`;
    if (!ext?.n) throw new Error('Province extent missing: run import:admin first.');

    const sha = await sha256File(file);
    const raw = (v: { properties: Record<string, unknown> }, f: string | undefined) => (f && v.properties[f] != null ? String(v.properties[f]) : null);
    const unusableRow = (v: UnusableLocation) => ({
      id: v.id, name_th: v.nameTh, name_en: v.nameEn, moo: v.moo, admin_text: v.adminText, sub: v.subdistrictText, tcode: v.subdistrictCode, dist: v.districtText,
      reason: v.reason, lat_value: v.latValue, lon_value: v.lonValue, raw_lat: raw(v, map.lat), raw_lon: raw(v, map.lng), properties: v.properties,
    });
    await sql.begin(async (tx) => {
      // Stage, then keep only points inside the province + buffer.
      await tx`create temporary table stage_villages (like villages including defaults) on commit drop`;
      await tx`
        create temporary table stage_unusable (
          id text primary key, name_th text, name_en text, moo smallint, admin_text text, sub text, tcode text, dist text,
          reason text, lat_value float8, lon_value float8, raw_lat text, raw_lon text, properties jsonb, sub_pcode text
        ) on commit drop`;
      for (let i = 0; i < villages.length; i += 500) {
        const chunk = villages.slice(i, i + 500);
        await tx`
          insert into stage_villages (id, name_th, name_en, moo, source_admin_text, source_subdistrict, source_district, geom, properties)
          select v.id, v.name_th, v.name_en, v.moo, v.admin_text, v.sub, v.dist,
                 st_setsrid(st_makepoint(v.lng, v.lat), 4326), v.properties
            from jsonb_to_recordset(${tx.json(
              chunk.map((v) => ({ id: v.id, name_th: v.nameTh, name_en: v.nameEn, moo: v.moo, admin_text: v.adminText, sub: v.subdistrictText, dist: v.districtText, lng: v.lng, lat: v.lat, properties: v.properties })) as never,
            )}::jsonb) as v(id text, name_th text, name_en text, moo smallint, admin_text text, sub text, dist text, lng float8, lat float8, properties jsonb)`;
      }
      const outside = await tx<{ id: string }[]>`
        delete from stage_villages s
         where not exists (select 1 from province_extent pe where st_covers(pe.buffered, s.geom))
        returning s.id`;
      const outsideIds = new Set(outside.map((o) => o.id));
      const staged = [
        ...unusable.map(unusableRow),
        ...villages.filter((v) => outsideIds.has(v.id)).map((v) => unusableRow({ ...v, reason: 'outside_province' as never, latValue: v.lat, lonValue: v.lng })),
      ];
      if (staged.length) {
        await tx`
          insert into stage_unusable (id, name_th, name_en, moo, admin_text, sub, tcode, dist, reason, lat_value, lon_value, raw_lat, raw_lon, properties)
          select * from jsonb_to_recordset(${tx.json(staged as never)}::jsonb)
            as v(id text, name_th text, name_en text, moo smallint, admin_text text, sub text, tcode text, dist text,
                 reason text, lat_value float8, lon_value float8, raw_lat text, raw_lon text, properties jsonb)`;
      }
      await tx`update stage_unusable set sub_pcode = resolve_source_subdistrict(tcode, sub, dist)`;

      // A correction is accepted only when exactly one candidate lands inside the
      // subdistrict the source names for the village. Otherwise nothing is guessed.
      //  - metres: UTM zone 47N (the zone covering the province), both axis orders;
      //    WGS 84 is assumed and the shift to Indian 1975 is stored as the uncertainty.
      //  - swapped lat/lng: the swapped point, as published.
      const corrected = await tx<{ id: string; method: string }[]>`
        with cand as (
          select u.id, 'utm47n_wgs84'::text as method,
                 st_transform(st_setsrid(st_makepoint(o.e, o.n), 32647), 4326) as g,
                 ceil(st_distance(st_transform(st_setsrid(st_makepoint(o.e, o.n), 32647), 4326)::geography,
                                  st_transform(st_setsrid(st_makepoint(o.e, o.n), 24047), 4326)::geography) / 100) * 100 as unc
            from stage_unusable u
           cross join lateral (values (u.lon_value, u.lat_value), (u.lat_value, u.lon_value)) as o(e, n)
           where u.reason = 'projected_coordinates' and o.e between 100000 and 900000 and o.n between 0 and 2500000
          union all
          select u.id, 'axes_swapped', st_setsrid(st_makepoint(u.lat_value, u.lon_value), 4326), null
            from stage_unusable u
           where u.reason = 'swapped_lat_lng'
        ),
        hit as (
          select c.* from cand c
            join stage_unusable u on u.id = c.id
            join admin_areas s on s.pcode = u.sub_pcode
           where st_contains(s.geom, c.g)
        ),
        uniq as (select id from hit group by id having count(*) = 1),
        ins as (
          insert into stage_villages (id, name_th, name_en, moo, source_admin_text, source_subdistrict, source_district, geom, properties, location_method, location_uncertainty_m)
          select u.id, u.name_th, u.name_en, u.moo, u.admin_text, u.sub, u.dist, h.g, u.properties, h.method, h.unc
            from hit h join uniq using (id) join stage_unusable u on u.id = h.id
          returning id, location_method as method
        )
        select * from ins`;
      await tx`delete from stage_unusable where id in (select id from stage_villages)`;
      const [{ n: unlocated } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from stage_unusable`;
      const byReason = await tx<{ reason: string; n: number; no_sub: number }[]>`
        select reason, count(*)::int as n, count(*) filter (where sub_pcode is null)::int as no_sub from stage_unusable group by reason order by reason`;

      const imported = villages.length + unusable.length;
      const mapped = imported - unlocated;
      console.log(`Outside province + 5 km: ${outside.length}. Corrected and verified against the named subdistrict: ${corrected.length} (${summarize(corrected.map((c) => ({ reason: c.method })))}).`);
      console.log(`Kept without a usable location (not drawn on the map): ${unlocated}${byReason.length ? ` — ${byReason.map((r) => `${r.reason}=${r.n}${r.no_sub ? ` (${r.no_sub} without a matching subdistrict)` : ''}`).join(', ')}` : ''}.`);
      console.log(`Importing ${imported}: ${mapped} with a point, ${unlocated} without.`);
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
        correctedLocationCount: corrected.length,
        unlocatedCount: unlocated,
        rejections,
        notes: `fields=${JSON.stringify(map)}`,
      });
      await tx`delete from villages_unlocated`;
      await tx`delete from villages`;
      await tx`
        insert into villages (id, name_th, name_en, moo, source_admin_text, source_subdistrict, source_district, geom, properties, location_method, location_uncertainty_m, import_id)
        select id, name_th, name_en, moo, source_admin_text, source_subdistrict, source_district, geom, properties, location_method, location_uncertainty_m, ${importId} from stage_villages`;
      await tx`
        insert into villages_unlocated (id, name_th, name_en, moo, source_subdistrict, source_district, subdistrict_pcode, reason, source_lat, source_lon, properties, import_id)
        select id, name_th, name_en, moo, sub, dist, sub_pcode, reason, raw_lat, raw_lon, properties, ${importId} from stage_unusable`;
      const [{ n: assigned } = { n: 0 }] = await tx<{ n: number }[]>`select assign_village_subdistricts() as n`;
      await tx`select refresh_village_shared_locations()`;
      const [{ n: mismatch } = { n: 0 }] = await tx<{ n: number }[]>`
        select count(*)::int as n from villages v join admin_areas s on s.pcode = v.subdistrict_pcode
         where v.source_subdistrict is not null and replace(s.name_th, ' ', '') <> replace(v.source_subdistrict, ' ', '')`;
      console.log(`Villages whose point lies in a different subdistrict polygon than the one the source names (source names are shown): ${mismatch}`);
      const [{ n: shared } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from villages where shared_location_count > 1`;
      console.log(`Villages sharing an identical coordinate with another village (kept, flagged in the UI): ${shared}`);
      const [{ n: unassigned } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from villages where subdistrict_pcode is null`;
      const [{ n: gaz } = { n: 0 }] = await tx<{ n: number }[]>`select refresh_gazetteer() as n`;
      console.log(`Imported ${mapped} villages with a point (import id ${importId}); ${assigned - unassigned} inside a subdistrict polygon, ${unassigned} in the 5 km buffer only. Gazetteer: ${gaz}.`);
      console.log(`Counts for the registry: source file ${records.length} · imported ${imported} (with a point ${mapped}, of which corrected ${corrected.length}; without a usable location ${unlocated}) · rejected ${rejections.length}`);
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  } finally {
    await sql.end();
  }
});

class DryRun extends Error {}
