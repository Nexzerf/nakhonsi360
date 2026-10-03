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


const J = async (label, url, opts) => { const r = await probe(label, url, opts, 0); try { return r?.status === 200 ? JSON.parse(r.text) : null; } catch { console.log('not json:', r.text.slice(0, 200)); return null; } };
const env = encodeURIComponent(JSON.stringify({ xmin: BBOX[0], ymin: BBOX[1], xmax: BBOX[2], ymax: BBOX[3], spatialReference: { wkid: 4326 } }));
async function layerReport(label, layerUrl) {
  const info = await J(`${label} info`, `${layerUrl}?f=json`);
  if (!info) return;
  console.log(`name=${info.name} geom=${info.geometryType} maxRecords=${info.maxRecordCount} editDate=${info.editingInfo?.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString() : '-'}`);
  console.log('fields:', (info.fields ?? []).map((f) => `${f.name}(${f.alias})`).join(', ').slice(0, 900));
  console.log('desc:', String(info.description ?? '').replace(/<[^>]+>/g, ' ').slice(0, 300), '| copyright:', info.copyrightText ?? '');
  const q = `${layerUrl}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
  const c = await J(`${label} count`, `${q}&returnCountOnly=true&f=json`);
  console.log('count in province bbox:', c?.count);
  const f = await J(`${label} sample`, `${q}&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`);
  for (const ft of f?.features ?? []) console.log(' attrs:', JSON.stringify(ft.attributes).slice(0, 500));
}

// ---------------- Air4Thai certificate names
try {
  console.log('\n### air4thai cert\n' + execSync('echo | openssl s_client -connect air4thai.pcd.go.th:443 -servername air4thai.pcd.go.th 2>/dev/null | openssl x509 -noout -subject -issuer -ext subjectAltName -dates', { encoding: 'utf8' }));
} catch (e) { console.log('openssl failed', e.message); }

// ---------------- GISTDA recurrent flood + drought + DMCR folder
const H = 'https://gistdaportal.gistda.or.th/arcgis/rest/services/Hosted';
for (const svc of ['พื้นที่น้ำท่วมซ้ำซาก_ปี_2011_2022', 'สรุปพื้นที่แล้ง', 'พื้นที่เฝ้าระวังน้ำท่วม']) {
  const root = await J(`svc ${svc}`, `${H}/${encodeURIComponent(svc)}/FeatureServer?f=json`);
  console.log('layers:', (root?.layers ?? []).map((l) => `${l.id}:${l.name}`).join(', '), '| desc:', String(root?.serviceDescription ?? '').slice(0, 200));
  for (const l of (root?.layers ?? []).slice(0, 3)) await layerReport(`${svc}/${l.id}`, `${H}/${encodeURIComponent(svc)}/FeatureServer/${l.id}`);
}
const D = 'https://gistdaportal.gistda.or.th/data/rest/services';
for (const f of ['dmcr_gidgroup', 'FL_Flood', 'GFlood']) {
  const d = await J(`folder ${f}`, `${D}/${f}?f=json`);
  console.log((d?.services ?? []).map((x) => `${x.name} ${x.type}`).join('\n'));
}
const all = await J('Hosted list', `${H}?f=json`);
console.log('hosted matching:', (all?.services ?? []).map((x) => x.name).filter((n) => /mangrove|ป่าชายเลน|ชายเลน|wetland|ชุ่มน้ำ|soil|ความชื้น|landuse|การใช้ที่ดิน/i.test(n)).join(' | '));

// ---------------- DWR wetlands
const W = 'https://gis.dwr.go.th/arcgis/rest/services';
for (const svc of ['พื้นที่ชุ่มน้ำระดับนานาชาติ', 'พื้นที่ชุ่มน้ำท้องถิ่น', 'Ramsar_Wetland_Revise_1Oct2020_by_ONEP']) {
  const root = await J(`DWR ${svc}`, `${W}/${encodeURIComponent(svc)}/MapServer?f=json`);
  console.log('layers:', (root?.layers ?? []).map((l) => `${l.id}:${l.name}`).join(', '), '| caps:', root?.capabilities, '| copyright:', root?.copyrightText);
  for (const l of (root?.layers ?? []).slice(0, 3)) await layerReport(`DWR ${svc}/${l.id}`, `${W}/${encodeURIComponent(svc)}/MapServer/${l.id}`);
}

// ---------------- Mangroves: OSM (Overpass) and ESA WorldCover on Planetary Computer
const ov = await probe('overpass mangrove', 'https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: `[out:json][timeout:60];(way["wetland"="mangrove"](${BBOX[1]},${BBOX[0]},${BBOX[3]},${BBOX[2]});relation["wetland"="mangrove"](${BBOX[1]},${BBOX[0]},${BBOX[3]},${BBOX[2]}););out count;` }) }, 400);
const wc = await J('PC worldcover collection', 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/esa-worldcover');
console.log('worldcover:', wc?.title, wc?.extent?.temporal?.interval, JSON.stringify(wc?.summaries?.['esa_worldcover:product_version'] ?? ''), 'license:', wc?.license);
const ws = await J('PC worldcover search', 'https://planetarycomputer.microsoft.com/api/stac/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['esa-worldcover'], bbox: BBOX, limit: 10 }) });
for (const f of ws?.features ?? []) console.log(' item', f.id, f.properties.datetime ?? f.properties.start_datetime, Object.keys(f.assets).join(','));
const item = ws?.features?.[0];
if (item) {
  const t = 'WebMercatorQuad/12/3184/1950';
  await probe('PC worldcover tile classmap', `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/${t}@1x?collection=esa-worldcover&item=${item.id}&assets=map&colormap_name=esa-worldcover&format=png`, {}, 100);
  await probe('PC worldcover mangrove-only', `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/${t}@1x?collection=esa-worldcover&item=${item.id}&expression=(map==95)&asset_as_band=true&colormap=${encodeURIComponent(JSON.stringify({ 0: [0, 0, 0, 0], 1: [0, 128, 96, 255] }))}&format=png`, {}, 300);
  await probe('PC worldcover legend', 'https://planetarycomputer.microsoft.com/api/data/v1/legend/classmap/esa-worldcover', {}, 1200);
}
