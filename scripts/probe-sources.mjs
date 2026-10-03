// Temporary: probe round 9 — two GeoJSON features (attributes as published) from each new ArcGIS dataset, for data/samples/dmr/sample.json.
const BBOX = { xmin: 99.3, ymin: 7.7, xmax: 100.4, ymax: 9.4, spatialReference: { wkid: 4326 } };
const sets = {
  'DWR/Ramsar_Wetland_Revise_1Oct2020_by_ONEP': 'https://gis.dwr.go.th/arcgis/rest/services/Ramsar_Wetland_Revise_1Oct2020_by_ONEP/MapServer/0',
  'DWR/พื้นที่ชุ่มน้ำท้องถิ่น': `https://gis.dwr.go.th/arcgis/rest/services/${encodeURIComponent('พื้นที่ชุ่มน้ำท้องถิ่น')}/MapServer/0`,
  'GISTDA/14_แนวป่าชายเลนของทช': `https://gistdaportal.gistda.or.th/arcgis/rest/services/Hosted/${encodeURIComponent('14_แนวป่าชายเลนของทช')}/FeatureServer/0`,
};
const out = {};
for (const [k, url] of Object.entries(sets)) {
  const ids = await (await fetch(`${url}/query?where=1%3D1&geometry=${encodeURIComponent(JSON.stringify(BBOX))}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnIdsOnly=true&f=json`)).json();
  const pick = (ids.objectIds ?? []).sort((a, b) => a - b).slice(0, 2);
  const r = await fetch(`${url}/query?objectIds=${pick.join(',')}&outFields=*&outSR=4326&geometryPrecision=6&returnGeometry=false&f=geojson`);
  const fc = await r.json();
  out[k] = fc.features;
  console.log(`### ${k}: ids=${(ids.objectIds ?? []).length} geojson=${r.status} features=${fc.features?.length}`);
}
console.log('### SAMPLE JSON\n' + JSON.stringify(out));
