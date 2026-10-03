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

// ---------------- Air4Thai (PCD)
await probe('air4thai http', 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php', {}, 600);
await probe('air4thai https', 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php', {}, 300);
await probe('air4thai.com forweb', 'http://air4thai.com/forweb/getAQI_JSON.php', {}, 300);
try {
  console.log('\n### air4thai TLS chain\n' + execSync('echo | openssl s_client -connect air4thai.pcd.go.th:443 -servername air4thai.pcd.go.th -showcerts 2>&1 | grep -E "^ *[0-9] s:|^ *i:|Verify return|verify error" | head -20', { encoding: 'utf8' }));
} catch (e) { console.log('openssl failed', e.message); }
await probe('pm25.gistda by province', 'https://pm25.gistda.or.th/rest/getPm25byProvince', {}, 500);
await probe('pm25.gistda by location', 'https://pm25.gistda.or.th/rest/getPM25byLocation?lat=8.43&lng=99.96', {}, 500);

// ---------------- GISTDA gateway: catalog and candidates
for (const p of ['/api/2.0/resources', '/api/2.0/resources/features', '/api/2.0/docs', '/api/2.0/openapi.json', '/api-docs', '/api/2.0/resources/features/flood',
  '/api/2.0/resources/features/flood-frequency', '/api/2.0/resources/features/flood/frequency', '/api/2.0/resources/features/flood/recurrent', '/api/2.0/resources/features/floodfreq',
  '/api/2.0/resources/features/flood/1year', '/api/2.0/resources/features/drought', '/api/2.0/resources/features/soil-moisture', '/api/2.0/resources/features/soilmoisture',
  '/api/2.0/resources/features/smap', '/api/2.0/resources/features/pm25', '/api/2.0/resources/features/ndvi', '/api/2.0/resources/maps', '/api/2.0/resources/tiles',
  '/api/2.0/resources/gi-service/v1.0/disasters', '/api/2.0/resources/gi-service/v1.0/disasters/flood-recurrence', '/api/2.0/resources/gi-service/v1.0/disasters/drought']) await gistda(p);
for (const u of ['https://gistdaportal.gistda.or.th/data/rest/services?f=json', 'https://gistdaportal.gistda.or.th/arcgis/rest/services?f=json', 'https://disaster.gistda.or.th/', 'https://drought.gistda.or.th/', 'https://flood.gistda.or.th/'])
  await probe(u, u, {}, 600);

// ---------------- DMCR mangroves, DWR / ONEP wetlands
for (const u of ['https://marinegiscenter.dmcr.go.th/arcgis/rest/services?f=json', 'https://marinegiscenter.dmcr.go.th/server/rest/services?f=json', 'https://marinegiscenter.dmcr.go.th/gis/rest/services?f=json',
  'https://gis.dwr.go.th/server/rest/services?f=json', 'https://gis.dwr.go.th/portal/sharing/rest/search?q=wetland&f=json&num=20', 'https://gis.dwr.go.th/portal/sharing/rest/search?q=%E0%B8%8A%E0%B8%B8%E0%B9%88%E0%B8%A1%E0%B8%99%E0%B9%89%E0%B8%B3&f=json&num=20',
  'https://gis.onep.go.th/arcgis/rest/services?f=json', 'https://gis.onep.go.th/server/rest/services?f=json'])
  await probe(u, u, {}, 1500);

// ---------------- Imagery: Planetary Computer Sentinel-2 L2A, GIBS, EOX
const since = new Date(Date.now() - 60 * 864e5).toISOString();
const s = await probe('PC STAC search', 'https://planetarycomputer.microsoft.com/api/stac/v1/search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: BBOX, datetime: `${since}/..`, query: { 'eo:cloud_cover': { lt: 40 } }, sortby: [{ field: 'datetime', direction: 'desc' }], limit: 50 }),
}, 200);
let ids = [];
if (s?.status === 200) {
  const fc = JSON.parse(s.text);
  ids = fc.features.map((f) => f.id);
  console.log(fc.features.map((f) => `${f.id} ${f.properties.datetime} cc=${f.properties['eo:cloud_cover']} tile=${f.properties['s2:mgrs_tile']}`).join('\n'));
}
if (ids.length) {
  const reg = await probe('PC mosaic register', 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: ['sentinel-2-l2a'], 'filter-lang': 'cql2-json', filter: { op: 'in', args: [{ property: 'id' }, ids.slice(0, 30)] }, sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }] }),
  }, 1500);
  if (reg?.status === 200) {
    const sid = JSON.parse(reg.text).searchid;
    for (const path of [`mosaic/${sid}/tiles/WebMercatorQuad/12/3182/1951@1x`, `mosaic/tiles/${sid}/WebMercatorQuad/12/3182/1951@1x`, `mosaic/${sid}/tiles/12/3182/1951`])
      await probe(`PC tile visual ${path.split('/').slice(0, 3).join('/')}`, `https://planetarycomputer.microsoft.com/api/data/v1/${path}?collection=sentinel-2-l2a&assets=visual&nodata=0&format=png`, {}, 200);
    await probe('PC tile NDVI', `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/${sid}/tiles/WebMercatorQuad/12/3182/1951@1x?collection=sentinel-2-l2a&expression=(B08_b1-B04_b1)/(B08_b1%2BB04_b1)&rescale=-1,1&colormap_name=rdylgn&nodata=0&format=png`, {}, 300);
    await probe('PC mosaic info', `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/${sid}/info`, {}, 600);
  }
}
const g = await probe('GIBS capabilities 3857', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities', {}, 100);
if (g?.status === 200) console.log([...new Set([...g.text.matchAll(/<ows:Identifier>([^<]*(HLS|NDVI|SMAP|Soil|Sentinel|Landsat)[^<]*)<\/ows:Identifier>/gi)].map((m) => m[1]))].join('\n'));
const e = await probe('EOX capabilities', 'https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml', {}, 100);
if (e?.status === 200) console.log([...new Set([...e.text.matchAll(/<ows:Identifier>([^<]*s2cloudless[^<]*)<\/ows:Identifier>/gi)].map((m) => m[1]))].join('\n'));
