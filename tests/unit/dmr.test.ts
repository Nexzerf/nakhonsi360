/** DMR hazard layer field mapping against real responses (data/samples/dmr/sample.json). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DMR_DATASETS, envelopeParam, featureId, layerUrl, pickProps } from '@/lib/import/dmr';
import { shorelineColor } from '@/lib/registry/layers';

const sample = JSON.parse(readFileSync(path.resolve(__dirname, '../../data/samples/dmr/sample.json'), 'utf8'));
const ds = (name: string) => DMR_DATASETS.find((d) => d.dataset === name)!;

describe('Department of Mineral Resources layers (real samples)', () => {
  it('every dataset maps fields that exist in the service response', () => {
    for (const d of DMR_DATASETS) {
      const feats = sample[d.service] as { properties: Record<string, unknown> }[];
      expect(feats?.length, d.service).toBeGreaterThan(0);
      for (const field of Object.values(d.fields)) expect(Object.keys(feats[0]!.properties), `${d.dataset}.${field}`).toContain(field);
      expect(featureId(d, feats[0]!.properties)).not.toBeNull();
    }
  });

  it('keeps the agency values as published', () => {
    const v = sample['HAZARD/VILLLAGE_RISK'][0].properties;
    expect(pickProps(ds('landslide-villages'), v)).toMatchObject({ name_th: v.VILLAGE, moo: v.MOO, risk: v.RISK_DESC, year_be: v.YEAR_MAP });
    const s = sample['HAZARD/LANDSLIDE_SUSCEPTIBILITY'][0].properties;
    expect(pickProps(ds('landslide-susceptibility'), s)).toMatchObject({ level: s.Level_T, grade: s.gridcode });
    expect(featureId(ds('landslide-villages'), v)).toBe(String(v.VRISK_ID));
  });

  it('turns blank strings into null and leaves other values alone', () => {
    expect(pickProps(ds('landslide-safe'), { PLACE: '  วัดเขาปูน ', VILLAGE: ' ', MOO: '8', YEAR_MAP: 2557 })).toMatchObject({ name_th: 'วัดเขาปูน', village: null, moo: '8', year_be: 2557, tambon: null });
  });

  it('builds the ArcGIS query inputs', () => {
    expect(layerUrl(ds('shoreline-change'))).toBe('https://gisportal.dmr.go.th/arcgis/rest/services/ENVI/COASTAL_CHANGE/MapServer/0');
    expect(JSON.parse(envelopeParam([99, 7.5, 100.5, 9.5]))).toEqual({ xmin: 99, ymin: 7.5, xmax: 100.5, ymax: 9.5, spatialReference: { wkid: 4326 } });
  });

  it('colours shoreline status by the published Thai wording', () => {
    expect(shorelineColor('ชายฝั่งกัดเซาะรุนแรง')).toBe('#b91c1c');
    expect(shorelineColor('พื้นที่กัดเซาะปานกลาง')).toBe('#f97316');
    expect(shorelineColor('ชายฝั่งสะสมตัว')).toBe('#2563eb');
    expect(shorelineColor('ชายฝั่งคงสภาพ')).toBe('#64748b');
    expect(shorelineColor(null)).toBe('#9ca3af');
  });
});
