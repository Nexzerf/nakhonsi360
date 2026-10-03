// Temporary: probe round 7 — Air4Thai through AIA chasing (full verification), CORS of tile hosts, GISTDA flood-frequency tiles.
import tls from 'node:tls';
import https from 'node:https';
import { X509Certificate } from 'node:crypto';

async function chase(host) {
  const peer = await new Promise((res, rej) => {
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(true); s.end(); res(c); });
    s.on('error', rej);
  });
  const extra = [];
  let url = peer.infoAccess?.['CA Issuers - URI']?.[0];
  for (let i = 0; i < 3 && url; i++) {
    const der = Buffer.from(await (await fetch(url)).arrayBuffer());
    const c = new X509Certificate(der);
    extra.push(c.toString());
    console.log(` chased ${url} → ${c.subject.replace(/\n/g, ', ')} | issuer ${c.issuer.replace(/\n/g, ', ')}`);
    if (tls.rootCertificates.some((r) => new X509Certificate(r).subject === c.issuer)) { console.log(' issuer is a trusted root'); break; }
    url = c.infoAccess?.match(/CA Issuers - URI:(\S+)/)?.[1];
  }
  return extra;
}
const extra = await chase('air4thai.pcd.go.th');
const body = await new Promise((res, rej) => https.get('https://air4thai.pcd.go.th/services/getNewAQI_JSON.php', { ca: [...tls.rootCertificates, ...extra], headers: { 'User-Agent': 'Nakhonsi360 probe' } }, (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ status: r.statusCode, b })); }).on('error', (e) => res({ status: 'ERR ' + e.code, b: '' })));
console.log('\n### air4thai verified fetch:', body.status, body.b.length, 'bytes, fetchedAt', new Date().toISOString());
try {
  const d = JSON.parse(body.b);
  const st = d.stations ?? [];
  console.log('stations:', st.length, 'keys:', Object.keys(st[0] ?? {}).join(','));
  const nst = st.filter((x) => Number(x.lat) > 7.6 && Number(x.lat) < 9.5 && Number(x.long) > 99.2 && Number(x.long) < 100.5);
  console.log('### AIR4THAI NEAR STATIONS ' + nst.length + '\n' + JSON.stringify(nst));
} catch (e) { console.log('parse', e.message, body.b.slice(0, 300)); }

const tileOf = (z, lng, lat) => { const x = Math.floor(((lng + 180) / 360) * 2 ** z); const r = (lat * Math.PI) / 180; const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); return [z, x, y]; };
const ff = 'https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood/flood_freq11_20/MapServer';
const info = await (await fetch(`${ff}?f=json`)).json();
console.log('\n### flood_freq11_20 sr', JSON.stringify(info.spatialReference), 'tileInfo sr', JSON.stringify(info.tileInfo?.spatialReference), 'lods', info.tileInfo?.lods?.[0]?.level, '-', info.tileInfo?.lods?.at(-1)?.level, 'format', info.tileInfo?.format, 'size', info.tileInfo?.rows, 'origin', JSON.stringify(info.tileInfo?.origin), 'extent', JSON.stringify(info.fullExtent));
const [z, x, y] = tileOf(11, 100.1, 8.2);
for (const [label, u] of [
  ['GISTDA flood freq tile', `${ff}/tile/${z}/${y}/${x}`],
  ['GISTDA flood freq export', `${ff}/export?bbox=${encodeURIComponent('11120000,880000,11160000,920000')}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`],
  ['LDD LU', `https://eis.ldd.go.th/arcgis/rest/services/LDD_LU_WM_CACHE/MapServer/tile/${z}/${y}/${x}`],
  ['GIBS SMAP', `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Surface_Soil_Moisture/default/2026-09-29/GoogleMapsCompatible_Level6/6/${tileOf(6, 99.96, 8.43)[2]}/${tileOf(6, 99.96, 8.43)[1]}.png`],
  ['PC tile', `https://planetarycomputer.microsoft.com/api/data/v1/mosaic/0c5657cc1c50ffea17e0b8ed5b77c853/tiles/WebMercatorQuad/${z}/${x}/${y}@2x?collection=sentinel-2-l2a&assets=visual&nodata=0&format=png`],
  ['GISTDA landuse25k query point', `https://gistdaportal.gistda.or.th/arcgis/rest/services/Hosted/L09_LanduseSouth_GISTDA_25k/FeatureServer/0/query?geometry=99.96,8.43&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=lul1_t,lul2_t,name_t,source_dat,scale&returnGeometry=false&f=json`],
  ['GISTDA flood freq query point', `${ff}/0/query?geometry=100.2,8.3&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Freq,Y_2011,Y_2020,PV_TN&returnGeometry=false&f=json`],
]) {
  try {
    const r = await fetch(u, { headers: { Origin: 'https://nakhonsi360.vercel.app' } });
    const b = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') ?? '';
    console.log(`\n### ${label}: ${r.status} ${ct} ${b.length}B acao=${r.headers.get('access-control-allow-origin')} cache=${r.headers.get('cache-control')}${/json|text/.test(ct) ? '\n' + b.toString().slice(0, 500) : ''}`);
  } catch (e) { console.log(`### ${label}: ERROR ${e.cause?.code ?? e.message}`); }
}
