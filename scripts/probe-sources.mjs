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


const J = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(45000) }); return r.ok ? await r.json() : { httpStatus: r.status }; } catch (e) { return { err: e.cause?.code ?? e.message }; } };
const env = encodeURIComponent(JSON.stringify({ xmin: BBOX[0], ymin: BBOX[1], xmax: BBOX[2], ymax: BBOX[3], spatialReference: { wkid: 4326 } }));
async function svcReport(base, svc, kind = 'FeatureServer') {
  const root = await J(`${base}/${encodeURIComponent(svc)}/${kind}?f=json`);
  console.log(`\n### ${svc} ${kind}: layers=${(root.layers ?? []).map((l) => `${l.id}:${l.name}`).join(', ')} ${root.err ?? root.httpStatus ?? ''} desc=${String(root.serviceDescription ?? '').replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
  for (const l of (root.layers ?? []).slice(0, 4)) {
    const u = `${base}/${encodeURIComponent(svc)}/${kind}/${l.id}`;
    const info = await J(`${u}?f=json`);
    const q = `${u}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
    const c = await J(`${q}&returnCountOnly=true&f=json`);
    const f = await J(`${q}&outFields=*&returnGeometry=false&resultRecordCount=2&f=json`);
    console.log(` [${l.id}] ${info.name} ${info.geometryType} max=${info.maxRecordCount} count=${c.count} edit=${info.editingInfo?.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : '-'}`);
    console.log('   fields:', (info.fields ?? []).map((x) => x.name + (x.alias && x.alias !== x.name ? `(${x.alias})` : '')).join(', ').slice(0, 600));
    for (const ft of f.features ?? []) console.log('   attrs:', JSON.stringify(ft.attributes).slice(0, 350));
    const d = await J(`${q}&outFields=*&returnGeometry=false&returnDistinctValues=true&f=json&outFields=${encodeURIComponent((info.fields ?? []).find((x) => /lu|class|type|code|des|name/i.test(x.name) && x.type === 'esriFieldTypeString')?.name ?? 'OBJECTID')}`);
    if (d.features) console.log('   distinct:', d.features.slice(0, 40).map((x) => Object.values(x.attributes)[0]).join(' | ').slice(0, 900));
  }
}
try {
  console.log('\n### air4thai cert\n' + execSync('echo | openssl s_client -connect air4thai.pcd.go.th:443 -servername air4thai.pcd.go.th 2>/dev/null | openssl x509 -noout -subject -issuer -ext subjectAltName -dates', { encoding: 'utf8' }));
} catch (e) { console.log('openssl failed', e.message); }
const H = 'https://gistdaportal.gistda.or.th/arcgis/rest/services/Hosted';
await svcReport(H, 'พื้นที่น้ำท่วมซ้ำซาก_ปี_2011_2022');
await svcReport(H, '14_แนวป่าชายเลนของทช');
await svcReport(H, 'Nakornsri_Landuse');
await svcReport('https://gistdaportal.gistda.or.th/data/rest/services', 'FL_Flood/FL_RepeatedFlooding_GISTDA_50k_Y2005_Y2016');
await svcReport(H, 'L09_LanduseSouth_GISTDA_25k');
