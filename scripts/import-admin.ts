/**
 * Import Nakhon Si Thammarat province / district / subdistrict boundaries
 * from the OCHA COD-AB Thailand file (GeoPackage, Shapefile folder/zip, or
 * GeoJSON) downloaded from https://data.humdata.org/dataset/cod-ab-tha.
 *
 *   npm run import:admin -- --file data/static/cod-ab-tha.gpkg \
 *     [--url <resource url>] [--source-version <HDX last_modified>] [--source-date YYYY-MM-DD] \
 *     [--province TH80] [--map level3.nameTh=ADM3_TH] [--dry-run]
 *
 * After import it recomputes the province extent (+5 km buffer), re-assigns
 * villages to subdistricts, and rebuilds the search gazetteer.
 */
import path from 'node:path';
import type * as GeoJSON from 'geojson';
import { listLayers, streamFeatures } from '@/lib/import/ogr';
import { detectCodabFields, type CodabFieldMap } from '@/lib/import/codab';
import { cleanName, hasLatin, hasThai, shareMatching } from '@/lib/import/text';
import { assertIsoDate, connect, main, parseArgs, recordImport, sha256File, summarize } from './_common';

interface AdminRow {
  level: 1 | 2 | 3;
  pcode: string;
  nameTh: string;
  nameEn: string | null;
  parentPcode: string | null;
  geometry: GeoJSON.Geometry;
}

main(async () => {
  const args = parseArgs();
  const file = args.str('file');
  if (!file) throw new Error('--file is required (COD-AB GeoPackage, Shapefile or GeoJSON)');
  const province = args.str('province') ?? 'TH80';
  const sourceDate = assertIsoDate(args.str('source-date'));
  const dryRun = args.flag('dry-run');

  // Field overrides, e.g. --map level3.nameTh=ADM3_TH
  const overrides: Record<number, Partial<Omit<CodabFieldMap, 'level'>>> = { 1: {}, 2: {}, 3: {} };
  for (const [k, v] of Object.entries(args.mapPairs)) {
    const m = /^level([123])\.(pcode|nameTh|nameEn|parentPcode|adm1Pcode)$/.exec(k);
    if (!m) throw new Error(`Unknown --map key ${k} (use levelN.pcode|nameTh|nameEn|parentPcode|adm1Pcode)`);
    (overrides[Number(m[1])] as Record<string, string>)[m[2]!] = v;
  }

  console.log(`Reading layers from ${file} …`);
  const layers = await listLayers(file);
  const chosen = new Map<number, { layer: string; fields: CodabFieldMap }>();
  const problems: string[] = [];
  for (const l of layers) {
    const guess = detectCodabFields(l.fields);
    if (!guess) continue;
    const det = detectCodabFields(l.fields, overrides[guess.level]);
    if (!det) continue;
    if ('missing' in det) {
      problems.push(`layer "${l.name}" looks like ADM${det.level} but is missing ${det.missing.join(', ')}. Fields: ${l.fields.join(', ')}`);
      continue;
    }
    if (l.geometryType && !/polygon/i.test(l.geometryType)) continue;
    if (chosen.has(det.level)) throw new Error(`Two layers look like ADM${det.level}: "${chosen.get(det.level)!.layer}" and "${l.name}". Pass a file with one layer per level.`);
    chosen.set(det.level, { layer: l.name, fields: det });
  }
  for (const lvl of [1, 2, 3]) {
    if (!chosen.has(lvl)) {
      throw new Error(
        `No ADM${lvl} polygon layer found.\n` +
          (problems.length ? problems.join('\n') + '\n' : '') +
          `Layers: ${layers.map((l) => `${l.name} [${l.fields.join(', ')}]`).join('; ')}\n` +
          `Use --map level${lvl}.nameTh=<FIELD> to name fields explicitly.`,
      );
    }
  }

  const rows: AdminRow[] = [];
  const validOn = new Set<string>();
  const rejections: Array<{ level: number; pcode?: string; reason: string }> = [];
  let sourceRecordCount = 0;

  for (const lvl of [1, 2, 3] as const) {
    const { layer, fields } = chosen.get(lvl)!;
    console.log(`ADM${lvl}: layer "${layer}" · pcode=${fields.pcode} th=${fields.nameTh} en=${fields.nameEn ?? '—'} parent=${fields.parentPcode ?? '—'}`);
    const where = lvl === 1 ? `"${fields.pcode}" = '${province}'` : fields.adm1Pcode ? `"${fields.adm1Pcode}" = '${province}'` : undefined;
    const levelRows: AdminRow[] = [];
    for await (const f of streamFeatures(file, layer, { where })) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const pcode = typeof p[fields.pcode] === 'string' ? (p[fields.pcode] as string).trim() : '';
      // Without an ADM1 field, filter by pcode prefix (TH80 → TH80xx…).
      if (!where && !pcode.startsWith(province)) continue;
      sourceRecordCount++;
      // COD-AB carries the boundary version date per feature (e.g. "2022/01/22").
      const vo = typeof p.valid_on === 'string' ? /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(p.valid_on) : null;
      if (vo) validOn.add(`${vo[1]}-${vo[2]}-${vo[3]}`);
      const nameTh = cleanName(p[fields.nameTh]);
      if (!pcode) {
        rejections.push({ level: lvl, reason: 'missing_pcode' });
        continue;
      }
      if (!nameTh) {
        rejections.push({ level: lvl, pcode, reason: 'missing_name_th' });
        continue;
      }
      if (!f.geometry || !/Polygon$/.test(f.geometry.type)) {
        rejections.push({ level: lvl, pcode, reason: 'not_a_polygon' });
        continue;
      }
      levelRows.push({
        level: lvl,
        pcode,
        nameTh,
        nameEn: fields.nameEn ? cleanName(p[fields.nameEn]) : null,
        parentPcode: fields.parentPcode ? cleanName(p[fields.parentPcode]) : null,
        geometry: f.geometry,
      });
    }
    // Guard against picking the wrong column: Thai names must contain Thai script.
    const thaiShare = shareMatching(levelRows.map((r) => r.nameTh), hasThai);
    if (levelRows.length && thaiShare < 0.95) {
      throw new Error(`ADM${lvl} field "${fields.nameTh}" does not look like Thai names (${Math.round(thaiShare * 100)}% contain Thai). Pass --map level${lvl}.nameTh=<FIELD>.`);
    }
    if (fields.nameEn && levelRows.length && shareMatching(levelRows.map((r) => r.nameEn), hasLatin) < 0.95) {
      console.warn(`  warning: ADM${lvl} English field "${fields.nameEn}" does not look like Latin text; English names will be dropped.`);
      levelRows.forEach((r) => (r.nameEn = null));
    }
    console.log(`  ${levelRows.length} features for ${province}`);
    rows.push(...levelRows);
  }

  const counts = [1, 2, 3].map((l) => rows.filter((r) => r.level === l).length);
  if (counts[0] !== 1) throw new Error(`Expected exactly one province polygon with pcode ${province}, found ${counts[0]}`);

  const pcodes = new Set(rows.map((r) => r.pcode));
  for (const r of rows) {
    if (r.parentPcode && !pcodes.has(r.parentPcode)) {
      rejections.push({ level: r.level, pcode: r.pcode, reason: `parent_not_found:${r.parentPcode}` });
      r.parentPcode = null;
    }
  }

  // For /vsizip/archive.zip[/inner] hash the archive itself.
  // --source-date wins; otherwise the latest valid_on stated in the file; otherwise unknown (null).
  const effectiveDate = sourceDate ?? ([...validOn].sort().at(-1) || undefined);
  console.log(`Data date: ${effectiveDate ?? 'not stated by the source'}${!sourceDate && validOn.size ? ' (from valid_on)' : ''}`);

  const sha = await sha256File(file.replace(/^\/vsizip\//, '').replace(/(\.zip).*$/i, '$1'));
  console.log(`\nSource features for ${province}: ${sourceRecordCount} · to import: ${rows.length} (province ${counts[0]}, districts ${counts[1]}, subdistricts ${counts[2]})`);
  console.log(`Rejections/warnings: ${summarize(rejections)}`);
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }

  const sql = connect();
  try {
    await sql.begin(async (tx) => {
      const importId = await recordImport(tx, {
        sourceId: 'hdx.cod-ab-tha',
        sourceFile: path.basename(file),
        sourceUrl: args.str('url'),
        sourceSha256: sha,
        sourceVersion: args.str('source-version'),
        sourceDate: effectiveDate,
        sourceRecordCount,
        importedCount: rows.length,
        rejections,
        notes: `province=${province}; layers: ${[...chosen].map(([l, c]) => `ADM${l}=${c.layer}`).join(', ')}`,
      });
      await tx`update villages set subdistrict_pcode = null`;
      await tx`delete from province_extent`;
      await tx`delete from admin_areas`;
      for (const r of rows.sort((a, b) => a.level - b.level)) {
        await tx`
          insert into admin_areas (pcode, level, name_th, name_en, parent_pcode, area_km2, geom, import_id)
          select ${r.pcode}, ${r.level}, ${r.nameTh}, ${r.nameEn}, ${r.parentPcode},
                 st_area(g::geography) / 1e6, g, ${importId}
            from (select st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(${JSON.stringify(r.geometry)}), 4326)), 3)) as g) s`;
      }
      await tx`select refresh_province_extent(${province}, 5000)`;
      const [{ n: assigned } = { n: 0 }] = await tx<{ n: number }[]>`select assign_village_subdistricts() as n`;
      const [{ n: gaz } = { n: 0 }] = await tx<{ n: number }[]>`select refresh_gazetteer() as n`;
      console.log(`Imported (import id ${importId}). Villages re-assigned: ${assigned}. Gazetteer entries: ${gaz}.`);
    });
    const [ext] = await sql<{ b: string }[]>`select st_astext(buffered_bbox) as b from province_extent where pcode = ${province}`;
    console.log(`Province extent (+5 km): ${ext?.b}`);
  } finally {
    await sql.end();
  }
});
