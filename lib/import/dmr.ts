/**
 * Department of Mineral Resources (กรมทรัพยากรธรณี) map services used for
 * hazard and coastal layers. Published on GD Catalog under Creative Commons
 * Attribution; queried from gisportal.dmr.go.th (ArcGIS REST) with the
 * province extent and clipped to the province + 5 km at import.
 *
 * Verified 2026-10-03: feature counts in the province extent and field
 * names below come from the live services (data/samples/dmr/).
 */

export const DMR_REST = 'https://gisportal.dmr.go.th/arcgis/rest/services';

export interface DmrDataset {
  /** Key in hazard_zones.dataset and in the tile layer table. */
  dataset: string;
  sourceId: 'dmr.landslide' | 'dmr.shoreline';
  /** Folder/Service of the MapServer (layer 0 is used). */
  service: string;
  /** Agency field holding a stable id (falls back to OBJECTID). */
  idField: string;
  /** Our property name → agency field. Values are copied as published. */
  fields: Record<string, string>;
  geometry: 'polygon' | 'point' | 'line';
}

export const DMR_DATASETS: readonly DmrDataset[] = [
  {
    dataset: 'landslide-susceptibility',
    sourceId: 'dmr.landslide',
    service: 'HAZARD/LANDSLIDE_SUSCEPTIBILITY',
    idField: 'OBJECTID',
    fields: { level: 'Level_T', level_en: 'Level_E', grade: 'gridcode', desc: 'Desc_T', desc_en: 'Desc_E' },
    geometry: 'polygon',
  },
  {
    dataset: 'landslide-villages',
    sourceId: 'dmr.landslide',
    service: 'HAZARD/VILLLAGE_RISK',
    idField: 'VRISK_ID',
    fields: { name_th: 'VILLAGE', moo: 'MOO', tambon: 'TAMBON', district: 'DISTRICT', province: 'PROVINCE', risk: 'RISK_DESC', risk_class: 'RISK_CLASS', year_be: 'YEAR_MAP' },
    geometry: 'point',
  },
  {
    dataset: 'landslide-safe',
    sourceId: 'dmr.landslide',
    service: 'HAZARD/SAFE_LANDSLIDE_AREA',
    idField: 'SAFE_ID',
    fields: { name_th: 'PLACE', village: 'VILLAGE', moo: 'MOO', tambon: 'TAMBON', district: 'DISTRICT', province: 'PROVINCE', year_be: 'YEAR_MAP' },
    geometry: 'point',
  },
  {
    dataset: 'flash-flood',
    sourceId: 'dmr.landslide',
    service: 'HAZARD/DEBRIS_FLOOD',
    idField: 'OBJECTID',
    fields: { basin: 'F25BASIN_T', subbasin: 'SUBBASIN_T', type: 'LS_HA_TYPE' },
    geometry: 'polygon',
  },
  {
    dataset: 'shoreline-change',
    sourceId: 'dmr.shoreline',
    service: 'ENVI/COASTAL_CHANGE',
    idField: 'OBJECTID',
    fields: { status: 'STATUS_T', status_en: 'STATUS_E', beach: 'BEACH_NAME', length_m: 'LENGTH_m', year: 'YEAR_COMPI', compared: 'COMPARE_Y', tambon: 'TAMBON', district: 'DISTRICT', province: 'PROVINCE' },
    geometry: 'line',
  },
  {
    dataset: 'coastal-area-change',
    sourceId: 'dmr.shoreline',
    service: 'ENVI/AREA_CHANGE',
    idField: 'OBJECTID',
    fields: { status: 'STATUS_T', status_en: 'STATUS_E', beach: 'BEACH_NAME', area_sqm: 'AREA_sqm', year: 'YEAR_COMPI', tambon: 'TAMBON', district: 'DISTRICT', province: 'PROVINCE' },
    geometry: 'polygon',
  },
];

export function layerUrl(d: DmrDataset): string {
  return `${DMR_REST}/${d.service}/MapServer/0`;
}

/** ArcGIS envelope for a [w, s, e, n] box in WGS84. */
export function envelopeParam(b: readonly [number, number, number, number]): string {
  return JSON.stringify({ xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } });
}

/** Rename the agency fields we keep; blank strings become null, everything else is copied as published. */
export function pickProps(d: DmrDataset, attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [ours, theirs] of Object.entries(d.fields)) {
    const v = attrs[theirs];
    out[ours] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : (v ?? null);
  }
  return out;
}

export function featureId(d: DmrDataset, attrs: Record<string, unknown>): string | null {
  const v = attrs[d.idField] ?? attrs.OBJECTID;
  return v === null || v === undefined || v === '' ? null : String(v);
}
