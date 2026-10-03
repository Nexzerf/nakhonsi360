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

async function mapReport(url) {
  const root = await J(`${url}?f=json`);
  console.log(`\n### ${url.split('/services/')[1]}: layers=${(root.layers ?? []).map((l) => `${l.id}:${l.name}`).join(', ')} caps=${root.capabilities} tiled=${!!root.tileInfo} ${root.err ?? root.httpStatus ?? ''}`);
  console.log('  desc:', String(root.serviceDescription ?? root.description ?? '').replace(/<[^>]+>/g, ' ').slice(0, 300), '| copyright:', root.copyrightText ?? '');
  for (const l of (root.layers ?? []).slice(0, 3)) {
    const info = await J(`${url}/${l.id}?f=json`);
    const q = `${url}/${l.id}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
    const c = await J(`${q}&returnCountOnly=true&f=json`);
    const f = await J(`${q}&outFields=*&returnGeometry=false&resultRecordCount=2&f=json`);
    console.log(`  [${l.id}] ${info.name} ${info.geometryType ?? info.type} count=${c.count ?? JSON.stringify(c).slice(0, 80)} drawingInfo=${JSON.stringify(info.drawingInfo?.renderer?.type ?? '')}`);
    console.log('   fields:', (info.fields ?? []).map((x) => x.name).join(', ').slice(0, 400));
    for (const ft of f.features ?? []) console.log('   attrs:', JSON.stringify(ft.attributes).slice(0, 300));
    if (info.drawingInfo?.renderer?.uniqueValueInfos) console.log('   classes:', info.drawingInfo.renderer.uniqueValueInfos.map((u) => `${u.value}=${u.label} rgb(${u.symbol?.color})`).join(' | ').slice(0, 800));
  }
}
const D = 'https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood';
await mapReport(`${D}/FL_RepeatedFlooding_GISTDA_50k_Y2005_Y2016/MapServer`);
await mapReport(`${D}/flood_freq11_20/MapServer`);

// PM2.5 per district (full, for the sample)
const pm = await fetch('https://pm25.gistda.or.th/rest/getPm25byAmphoe?pv_idn=80');
console.log('\n### PM25 AMPHOE FULL ' + pm.status + ' fetchedAt=' + new Date().toISOString() + '\n' + (await pm.text()));

// Air4Thai with AIA chasing: read the server certificate, download its issuer, then verify normally.
import tls from 'node:tls';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';
const peer = await new Promise((res, rej) => {
  const s = tls.connect({ host: 'air4thai.pcd.go.th', port: 443, servername: 'air4thai.pcd.go.th', rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(true); s.end(); res(c); });
  s.on('error', rej);
});
console.log('\n### air4thai peer', peer.subject?.CN, 'issuer', peer.issuer?.CN, 'infoAccess', JSON.stringify(peer.infoAccess));
const caUrl = peer.infoAccess?.['CA Issuers - URI']?.[0];
if (caUrl) {
  const der = Buffer.from(await (await fetch(caUrl)).arrayBuffer());
  const inter = new X509Certificate(der);
  console.log('intermediate', inter.subject, '| issuer', inter.issuer, '| validTo', inter.validTo, '| AIA', inter.infoAccess);
  const ca = [...tls.rootCertificates, inter.toString()];
  const body = await new Promise((res, rej) => https.get('https://air4thai.pcd.go.th/services/getNewAQI_JSON.php', { ca, headers: { 'User-Agent': 'Nakhonsi360 probe' } }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, b })); }).on('error', rej));
  console.log('air4thai verified fetch:', body.status, body.b.length, 'bytes');
  try {
    const d = JSON.parse(body.b);
    const st = d.stations ?? [];
    console.log('stations:', st.length, 'keys:', Object.keys(st[0] ?? {}).join(','));
    const nst = st.filter((x) => Number(x.lat) > 7.7 && Number(x.lat) < 9.4 && Number(x.long) > 99.3 && Number(x.long) < 100.4);
    console.log('### AIR4THAI NST STATIONS\n' + JSON.stringify(nst));
  } catch (e) { console.log('parse', e.message, body.b.slice(0, 300)); }
}

// CORS and tiles for browser-loaded rasters
const tileOf = (z, lng, lat) => { const x = Math.floor(((lng + 180) / 360) * 2 ** z); const r = (lat * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); return [z, x, y]; };
const [z, x, y] = tileOf(12, 99.96, 8.43);
for (const [label, u] of [
  ['LDD LU', `https://eis.ldd.go.th/arcgis/rest/services/LDD_LU_WM_CACHE/MapServer/tile/${z}/${y}/${x}`],
  ['GIBS SMAP', `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Surface_Soil_Moisture/default/2026-09-29/GoogleMapsCompatible_Level6/6/${tileOf(6, 99.96, 8.43)[2]}/${tileOf(6, 99.96, 8.43)[1]}.png`],
  ['PC tile', `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/0c5657cc1c50ffea17e0b8ed5b77c853/tiles/WebMercatorQuad/${z}/${x}/${y}@2x?collection=sentinel-2-l2a&assets=visual&nodata=0&format=png`],
]) {
  try {
    const r = await fetch(u, { headers: { Origin: 'https://nakhonsi360.vercel.app' } });
    const b = await r.arrayBuffer();
    console.log(`\n### CORS ${label}: ${r.status} ${r.headers.get('content-type')} ${b.byteLength}B acao=${r.headers.get('access-control-allow-origin')} cache=${r.headers.get('cache-control')}`);
  } catch (e) { console.log(`### CORS ${label}: ERROR ${e.message}`); }
}
