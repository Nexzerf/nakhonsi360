/**
 * Import Department of Mineral Resources hazard and coastal layers
 * (landslide susceptibility, villages at risk, temporary safe points,
 * flash-flood/debris-flow areas, shoreline and coastal area change).
 *
 *   DATABASE_URL=… npm run import:dmr                 # all datasets
 *   DATABASE_URL=… npm run import:dmr -- --only landslide-safe,shoreline-change
 *
 * Needs the province boundary first (npm run import:admin): features are
 * requested for the province extent and kept only where they touch the
 * province + 5 km. Every dropped feature is counted with its reason.
 */
import { createHash } from 'node:crypto';
import { connect, main, parseArgs, recordImport, summarize } from './_common';
import { DMR_DATASETS, envelopeParam, featureId, layerUrl, pickProps, type DmrDataset } from '@/lib/import/dmr';

const UA = 'Nakhonsi360/0.1 (environmental map of Nakhon Si Thammarat; https://github.com/nexzerf/nakhonsi360)';
/** Features per request (large polygons make big pages). */
const CHUNK = 100;
/** Vertex thinning requested from the service, in degrees (~1 m). */
const MAX_OFFSET_DEG = 0.00001;

/** POST an ArcGIS REST request; the service sometimes answers with an HTML error page, so retry a few times. */
async function getJson<T>(url: string, params: Record<string, string>, attempts = 4): Promise<T> {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((res) => setTimeout(res, 3000 * 2 ** (i - 1)));
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await r.text();
      if (!r.ok) {
        last = `HTTP ${r.status}`;
        continue;
      }
      let body: T & { error?: { message?: string } };
      try {
        body = JSON.parse(text);
      } catch {
        last = `not JSON: ${text.replace(/\s+/g, ' ').slice(0, 80)}`;
        continue;
      }
      if (body && typeof body === 'object' && 'error' in body && body.error) throw new Error(`${url} → ${body.error.message ?? 'ArcGIS error'}`);
      return body;
    } catch (err) {
      if (err instanceof Error && err.message.includes('ArcGIS error')) throw err;
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`${url} → failed after ${attempts} attempts (${last})`);
}

interface ArcFeature {
  id?: number | string;
  properties: Record<string, unknown> | null;
  geometry: GeoJSON.Geometry | null;
}

async function fetchDataset(d: DmrDataset, bbox: [number, number, number, number]) {
  const url = layerUrl(d);
  const info = await getJson<{ editingInfo?: { lastEditDate?: number }; name?: string }>(url, { f: 'json' });
  const area = { geometry: envelopeParam(bbox), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', where: '1=1' };
  const ids = await getJson<{ objectIds: number[] | null }>(`${url}/query`, { ...area, returnIdsOnly: 'true', f: 'json' });
  const all = [...(ids.objectIds ?? [])].sort((a, b) => a - b);
  const features: ArcFeature[] = [];
  for (let i = 0; i < all.length; i += CHUNK) {
    const page = await getJson<{ features: ArcFeature[] }>(`${url}/query`, {
      objectIds: all.slice(i, i + CHUNK).join(','),
      outFields: '*',
      outSR: '4326',
      // Coordinates to 6 decimals (~0.1 m) and vertices thinned to ~1 m by the
      // service: full precision made some pages tens of MB and the service failed.
      geometryPrecision: '6',
      ...(d.geometry === 'point' ? {} : { maxAllowableOffset: String(MAX_OFFSET_DEG) }),
      f: 'geojson',
    });
    features.push(...page.features);
  }
  const lastEdit = info.editingInfo?.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString() : null;
  return { url, features, requested: all.length, lastEdit, layerName: info.name ?? d.service };
}

const GEOM_KIND: Record<DmrDataset['geometry'], number> = { point: 1, line: 2, polygon: 3 };

main(async () => {
  const args = parseArgs();
  const only = args.str('only')?.split(',').map((s) => s.trim());
  const datasets = DMR_DATASETS.filter((d) => !only || only.includes(d.dataset));
  if (only && datasets.length !== only.length) throw new Error(`Unknown dataset in --only. Known: ${DMR_DATASETS.map((d) => d.dataset).join(', ')}`);

  const sql = connect();
  try {
    const [pe] = await sql<{ bbox: number[] }[]>`
      select array[st_xmin(buffered_bbox), st_ymin(buffered_bbox), st_xmax(buffered_bbox), st_ymax(buffered_bbox)] as bbox
        from province_extent where pcode = 'TH80'`;
    if (!pe) throw new Error('Province extent missing: run npm run import:admin first.');
    const bbox = pe.bbox.map(Number) as [number, number, number, number];

    for (const d of datasets) {
      console.log(`\n=== ${d.dataset} (${d.service}) ===`);
      const { url, features, requested, lastEdit, layerName } = await fetchDataset(d, bbox);
      console.log(`Layer "${layerName}" · last edited ${lastEdit ?? 'not stated'} · ${requested} features in the province extent, ${features.length} received`);
      const sha = createHash('sha256').update(JSON.stringify(features)).digest('hex');

      const rejections: Array<{ id: string | null; reason: string }> = [];
      const rows: { id: string; props: Record<string, unknown>; geom: string }[] = [];
      const seen = new Set<string>();
      for (const f of features) {
        const attrs = f.properties ?? {};
        const id = featureId(d, attrs);
        if (!id) rejections.push({ id: null, reason: 'missing_id' });
        else if (seen.has(id)) rejections.push({ id, reason: 'duplicate_id' });
        else if (!f.geometry) rejections.push({ id, reason: 'missing_geometry' });
        else {
          seen.add(id);
          rows.push({ id, props: pickProps(d, attrs), geom: JSON.stringify(f.geometry) });
        }
      }

      await sql.begin(async (tx) => {
        await tx`create temp table stage (feature_id text primary key, props jsonb, geom geometry) on commit drop`;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          await tx`
            insert into stage (feature_id, props, geom)
            select r->>'id', r->'props',
                   st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(r->>'geom'), 4326)), ${GEOM_KIND[d.geometry]})
              from jsonb_array_elements(${tx.json(chunk as never)}::jsonb) r`;
        }
        const empty = await tx<{ feature_id: string }[]>`select feature_id from stage where geom is null or st_isempty(geom)`;
        for (const r of empty) rejections.push({ id: r.feature_id, reason: 'invalid_geometry' });
        const outside = await tx<{ feature_id: string }[]>`
          select s.feature_id from stage s, province_extent pe
           where pe.pcode = 'TH80' and not st_isempty(s.geom) and not st_intersects(s.geom, pe.buffered)`;
        for (const r of outside) rejections.push({ id: r.feature_id, reason: 'outside_province' });
        await tx`delete from stage where geom is null or st_isempty(geom) or not st_intersects(geom, (select buffered from province_extent where pcode = 'TH80'))`;
        const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from stage`;

        const importId = await recordImport(tx, {
          sourceId: d.sourceId,
          sourceFile: `${d.service} (${d.dataset})`,
          sourceUrl: url,
          sourceSha256: sha,
          sourceVersion: lastEdit ? `last edited ${lastEdit}` : undefined,
          sourceRecordCount: features.length,
          importedCount: n,
          rejections,
          notes: `dataset=${d.dataset}; requested for the province extent, kept within the province + 5 km; coordinates to 6 decimals${d.geometry === 'point' ? '' : ', vertices thinned to ~1 m by the service'}`,
        });
        await tx`delete from hazard_zones where dataset = ${d.dataset}`;
        await tx`
          insert into hazard_zones (dataset, feature_id, source_id, props, geom, import_id)
          select ${d.dataset}, feature_id, ${d.sourceId}, props, geom, ${importId} from stage`;
        console.log(`Imported ${n} (import id ${importId}); rejected ${rejections.length}: ${summarize(rejections)}`);
      });
    }
  } finally {
    await sql.end();
  }
});
