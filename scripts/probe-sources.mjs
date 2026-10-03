// Temporary: probe candidate sources for the layers that are not connected yet.
// Prints status, type, size and a short, key-redacted excerpt of each response.
import { execSync } from 'node:child_process';

const KEY = process.env.GISTDA_API_KEY ?? '';
const redact = (s) => (KEY ? s.split(KEY).join('***') : s).replace(/(api[-_]?key|token|sig|se|sp|sv|sr)=[^&"\s]+/gi, '$1=***');
const BBOX = [99.3, 7.7, 100.4, 9.4];

async function probe(label, url, opts = {}, show = 400) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45_000), ...opts, headers: { 'User-Agent': 'Nakhonsi360 probe', ...(opts.headers ?? {}) } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') ?? '';
    let body = /json|text|xml|html/.test(ct) || buf.length < 4000 ? buf.toString('utf8') : `<${buf.length} bytes binary>`;
    body = redact(body).replace(/\s+/g, ' ');
    console.log(`\n### ${label}\n${r.status} ${ct} ${buf.length}B ${Date.now() - t}ms ${redact(r.url) !== redact(url) ? '→ ' + redact(r.url) : ''}\n${body.slice(0, show)}`);
    return { status: r.status, text: buf.toString('utf8'), buf, ct };
  } catch (e) {
    console.log(`\n### ${label}\nERROR ${e.cause?.code ?? ''} ${e.message}`);
    return null;
  }
}
const gistda = (p) => probe(`GISTDA ${p}`, `https://api-gateway.gistda.or.th${p}`, { headers: { 'API-Key': KEY } }, 300);


const list = async (label, url, filter = () => true) => {
  const r = await probe(label, url, {}, 0);
  if (r?.status !== 200) return null;
  try {
    const d = JSON.parse(r.text);
    if (d.folders) console.log('folders:', d.folders.join(', '));
    if (d.services) console.log(d.services.filter(filter).map((x) => `${x.name} ${x.type}`).join('\n'));
    if (d.layers) console.log(d.layers.map((l) => `${l.id} ${l.name} ${l.geometryType ?? ''}`).join('\n'));
    if (d.results) console.log(d.results.map((x) => `${x.title} | ${x.type} | ${x.url} | ${x.snippet ?? ''} | ext ${JSON.stringify(x.extent)}`).join('\n'));
    for (const k of ['copyrightText', 'serviceDescription', 'description', 'currentVersion']) if (d[k]) console.log(k + ':', String(d[k]).slice(0, 300));
    return d;
  } catch { console.log(r.text.slice(0, 500)); return null; }
};

// ---------------- Air4Thai over http (no redirect)
const a = await probe('air4thai http no-redirect', 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php', { redirect: 'manual' }, 300);
console.log('location:', a ? '' : '-');
await probe('air4thai http region', 'http://air4thai.pcd.go.th/forappV2/getAQI_JSON.php', { redirect: 'manual' }, 300);

// ---------------- GISTDA PM2.5
for (const p of ['/rest/getPm25byProvince', '/rest/getPm25byAmphoe?pv_idn=80', '/rest/getPm25byTambon?pv_idn=80', '/rest/getPm25AmphoebyProvince?pv_idn=80', '/rest/getPM25byAmphoe?pv_idn=80', '/rest/getPm25byAmphoe/80', '/rest/pred/getPm25byAmphoe?pv_idn=80', '/rest/getPm25byStation', '/rest/getPm25Raster', '/rest']) {
  const r = await probe(`pm25.gistda ${p}`, `https://pm25.gistda.or.th${p}`, {}, 250);
  if (r?.status === 200 && p.includes('Province')) {
    const d = JSON.parse(r.text); console.log(JSON.stringify(d.data.find((x) => x.pv_idn === 80)));
  }
}

// ---------------- GISTDA portal (flood frequency, drought, DMCR)
const gp = 'https://gistdaportal.gistda.or.th/data/rest/services';
await list('gistdaportal data root', `${gp}?f=json`);
for (const f of ['FL_Flood', 'GFlood', 'dmcr_gidgroup', 'GWater', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'DR_Drought', 'GMOS']) await list(`gistdaportal ${f}`, `${gp}/${f}?f=json`);
const ga = 'https://gistdaportal.gistda.or.th/arcgis/rest/services';
for (const f of ['GWater', 'Hosted', 'TMS', 'app']) await list(`gistdaportal arcgis ${f}`, `${ga}/${f}?f=json`);

// ---------------- DWR wetlands
const dwr = await list('DWR portal wetland', 'https://gis.dwr.go.th/portal/sharing/rest/search?q=wetland&f=json&num=50');
await list('DWR arcgis root', 'https://gis.dwr.go.th/arcgis/rest/services?f=json');
for (const x of dwr?.results ?? []) if (/MapServer|FeatureServer/.test(x.url ?? '')) await list(`DWR ${x.title}`, `${x.url}?f=json`);
await list('DWR portal mangrove', 'https://gis.dwr.go.th/portal/sharing/rest/search?q=mangrove&f=json&num=20');

// ---------------- Planetary Computer: best scene per MGRS tile, then a covered tile
const since = new Date(Date.now() - 120 * 864e5).toISOString();
const s = await probe('PC STAC search', 'https://planetarycomputer.microsoft.com/api/stac/v1/search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: BBOX, datetime: `${since}/..`, query: { 'eo:cloud_cover': { lt: 60 } }, sortby: [{ field: 'datetime', direction: 'desc' }], limit: 200 }),
}, 0);
const best = new Map();
if (s?.status === 200) {
  for (const f of JSON.parse(s.text).features) {
    const t = f.properties['s2:mgrs_tile']; const cc = f.properties['eo:cloud_cover'];
    if (!best.has(t) || cc < best.get(t).cc) best.set(t, { id: f.id, cc, dt: f.properties.datetime, bbox: f.bbox });
  }
  console.log([...best].map(([t, v]) => `${t} ${v.dt} cc=${v.cc.toFixed(1)} ${v.id} bbox=${v.bbox.map((n) => n.toFixed(2))}`).join('\n'));
}
if (best.size) {
  const ids = [...best.values()].map((v) => v.id);
  const reg = await probe('PC register', 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: ['sentinel-2-l2a'], 'filter-lang': 'cql2-json', filter: { op: 'in', args: [{ property: 'id' }, ids] }, sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }] }),
  }, 200);
  const sid = JSON.parse(reg.text).searchid;
  const tile = (z, lng, lat) => { const x = Math.floor(((lng + 180) / 360) * 2 ** z); const r = (lat * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); return `${z}/${x}/${y}`; };
  for (const [z, lng, lat] of [[12, 99.96, 8.43], [10, 99.9, 8.4], [14, 100.0, 8.45]]) {
    await probe(`PC visual ${z}`, `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/${sid}/tiles/WebMercatorQuad/${tile(z, lng, lat)}@1x?collection=sentinel-2-l2a&assets=visual&nodata=0&format=png`, {}, 120);
    await probe(`PC ndvi ${z}`, `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/${sid}/tiles/WebMercatorQuad/${tile(z, lng, lat)}@1x?collection=sentinel-2-l2a&expression=(B08-B04)/(B08%2BB04)&asset_as_band=true&rescale=-0.2,0.9&colormap_name=rdylgn&format=png`, {}, 200);
  }
  await probe('PC tilejson', `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/${sid}/WebMercatorQuad/tilejson.json?collection=sentinel-2-l2a&assets=visual`, {}, 800);
}

// ---------------- GIBS layers: matrix sets, time defaults and a tile
const g = await probe('GIBS caps', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities', {}, 0);
if (g?.status === 200) for (const id of ['HLS_S30_Nadir_BRDF_Adjusted_Reflectance', 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', 'VIIRS_SNPP_NDVI_8Day', 'MODIS_Terra_L3_NDVI_16Day', 'SMAP_L4_Analyzed_Surface_Soil_Moisture', 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture']) {
  const i = g.text.indexOf(`<ows:Identifier>${id}</ows:Identifier>`); const blk = g.text.slice(i, i + 4000);
  const tms = /<TileMatrixSet>([^<]+)</.exec(blk)?.[1]; const def = /<Default>([^<]+)</.exec(blk)?.[1]; const fmt = /<Format>([^<]+)</.exec(blk)?.[1]; const res = /template="([^"]+)"/.exec(blk)?.[1];
  const vals = [...blk.matchAll(/<Value>([^<]+)</g)].map((m) => m[1]); 
  console.log(`\n### GIBS ${id}: tms=${tms} default=${def} fmt=${fmt}\n  template=${res}\n  time values: ${vals.slice(-3).join(' | ')}`);
  if (res && tms) {
    const lvl = Number(/Level(\d+)/.exec(tms)?.[1] ?? 9); const z = Math.min(lvl, 9);
    const x = Math.floor(((99.96 + 180) / 360) * 2 ** z); const r = (8.43 * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
    await probe(`GIBS tile ${id} z${z}`, res.replace('{Time}', 'default').replace('{TileMatrixSet}', tms).replace('{TileMatrix}', z).replace('{TileRow}', y).replace('{TileCol}', x), {}, 80);
  }
}
await probe('EOX tile 2025 z13', 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/GoogleMapsCompatible/13/3904/6368.jpg', {}, 80);
