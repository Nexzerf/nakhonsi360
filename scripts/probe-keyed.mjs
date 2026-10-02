// Temporary: fetch real responses from keyed sources using repository secrets,
// and print their shape (never the key) so adapters can be written against them.
const BBOX = '98.9,7.5,100.7,9.7'; // province extent + margin (w,s,e,n)
const firms = process.env.FIRMS_MAP_KEY || '';
const gistda = process.env.GISTDA_API_KEY || '';
console.log(`FIRMS_MAP_KEY set: ${firms ? 'yes' : 'no'}, GISTDA_API_KEY set: ${gistda ? 'yes' : 'no'}`);

const redact = (s) => {
  let out = String(s);
  for (const k of [firms, gistda]) if (k) out = out.split(k).join('[KEY]');
  return out;
};
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'links').map(([k, x]) => [k, strip(x)]));
  return v;
};
async function get(label, url, headers = {}) {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    console.log(`\n=== ${label}: HTTP ${r.status} ${r.headers.get('content-type')} ${text.length} bytes`);
    return { status: r.status, text };
  } catch (e) {
    console.log(`\n=== ${label}: FAILED ${redact(e.message)} ${e.cause ? redact(e.cause.code ?? e.cause.message) : ''}`);
    return { status: 0, text: '' };
  }
}
function showJson(text) {
  try {
    const j = JSON.parse(text);
    const feats = Array.isArray(j?.features) ? j.features : null;
    console.log('top-level keys:', Object.keys(j ?? {}).join(', '));
    for (const k of ['numberMatched', 'numberReturned', 'totalFeatures', 'count', 'timeStamp']) if (k in (j ?? {})) console.log(`${k}:`, JSON.stringify(j[k]));
    if (feats) {
      console.log('features:', feats.length);
      for (const f of feats.slice(0, 2)) console.log(redact(JSON.stringify(strip({ ...f, geometry: f.geometry ? { type: f.geometry.type, coords_preview: JSON.stringify(f.geometry.coordinates).slice(0, 160) } : null }), null, 1)).slice(0, 2500));
    } else console.log(redact(JSON.stringify(strip(j), null, 1)).slice(0, 2500));
  } catch {
    console.log(redact(text.slice(0, 1500)));
  }
}

if (firms) {
  const st = await get('FIRMS mapkey status', `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${firms}`);
  console.log(redact(st.text.slice(0, 400)));
  for (const src of ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT']) {
    const r = await get(`FIRMS ${src} 3 days`, `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firms}/${src}/${BBOX}/3`);
    const lines = r.text.trim().split('\n');
    console.log(`rows: ${lines.length - 1}`);
    console.log(redact(lines.slice(0, 6).join('\n')));
  }
}
if (gistda) {
  const H = { 'API-Key': gistda, Accept: 'application/json' };
  for (const p of ['flood/1day', 'flood/3days', 'flood/7days', 'flood/30days', 'viirs/1day', 'viirs/3days', 'hotspot/1day', 'modis/1day']) {
    const r = await get(`GISTDA features/${p} pv_idn=80`, `https://api-gateway.gistda.or.th/api/2.0/resources/features/${p}?pv_idn=80&limit=5&offset=0`, H);
    showJson(r.text);
  }
}
