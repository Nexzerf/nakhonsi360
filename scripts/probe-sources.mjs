// Temporary: probe round 8 — GISTDA land use 1:25k as an image service, its legend, and tile export.
const H = 'https://gistdaportal.gistda.or.th/arcgis/rest/services/Hosted/L09_LanduseSouth_GISTDA_25k';
for (const u of [`${H}/MapServer?f=json`, `${H}/FeatureServer/0?f=json`]) {
  const r = await fetch(u); const t = await r.text();
  let d = {}; try { d = JSON.parse(t); } catch { /* */ }
  console.log(`\n### ${u.split('/Hosted/')[1]} ${r.status} tiled=${!!d.tileInfo} caps=${d.capabilities} layers=${(d.layers ?? []).map((l) => l.name).join(',')} err=${JSON.stringify(d.error ?? '')}`);
  const rend = d.drawingInfo?.renderer;
  if (rend) console.log('renderer', rend.type, 'field', rend.field1, '\nclasses:', (rend.uniqueValueInfos ?? []).map((u) => `${u.value}=${u.label} rgb(${u.symbol?.color})`).join(' | ').slice(0, 2500));
}
const x = 11127000, y = 928000;
for (const [label, u] of [
  ['MapServer export', `${H}/MapServer/export?bbox=${x},${y},${x + 4000},${y + 4000}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`],
  ['FeatureServer query lul1 distinct', `${H}/FeatureServer/0/query?where=1%3D1&geometry=99.3,7.7,100.4,9.4&geometryType=esriGeometryEnvelope&inSR=4326&outFields=lul1_code,lul1_e,lul2_code,lul2_e&returnDistinctValues=true&returnGeometry=false&f=json`],
]) {
  const r = await fetch(u, { headers: { Origin: 'https://nakhonsi360.vercel.app' } });
  const b = Buffer.from(await r.arrayBuffer());
  console.log(`\n### ${label}: ${r.status} ${r.headers.get('content-type')} ${b.length}B acao=${r.headers.get('access-control-allow-origin')}\n${/json|text/.test(r.headers.get('content-type') ?? '') ? b.toString().slice(0, 2500) : ''}`);
}
