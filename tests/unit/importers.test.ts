import { describe, expect, it } from 'vitest';
import { detectCodabFields } from '@/lib/import/codab';
import { detectVillageFields, extractRecords, parseCsv, parseMoo, parseVillages } from '@/lib/import/dopa';
import { classifyOsm, osmIdentity, osmTags } from '@/lib/import/osm';

describe('COD-AB field detection', () => {
  it('detects the older ADMn_TH/ADMn_EN schema', () => {
    expect(detectCodabFields(['ADM3_EN', 'ADM3_TH', 'ADM3_PCODE', 'ADM2_PCODE', 'ADM1_PCODE', 'Shape_Area'])).toEqual({
      level: 3,
      pcode: 'ADM3_PCODE',
      nameTh: 'ADM3_TH',
      nameEn: 'ADM3_EN',
      parentPcode: 'ADM2_PCODE',
      adm1Pcode: 'ADM1_PCODE',
    });
  });
  it('detects the newer lower-case schema', () => {
    const d = detectCodabFields(['adm2_name', 'adm2_name1', 'adm2_pcode', 'adm1_pcode']);
    expect(d).toMatchObject({ level: 2, nameTh: 'adm2_name1', nameEn: 'adm2_name', parentPcode: 'adm1_pcode' });
  });
  it('reports missing Thai name fields instead of guessing', () => {
    expect(detectCodabFields(['ADM2_PCODE', 'ADM2_EN'])).toEqual({ level: 2, missing: ['nameTh'] });
  });
  it('skips ADM4 layers', () => {
    expect(detectCodabFields(['ADM4_PCODE', 'ADM3_PCODE', 'ADM4_TH'])).toBeNull();
  });
  it('accepts explicit overrides', () => {
    expect(detectCodabFields(['ADM1_PCODE', 'NAME_T'], { nameTh: 'NAME_T' })).toMatchObject({ level: 1, nameTh: 'NAME_T' });
  });
});

describe('DOPA village parsing', () => {
  it('detects Thai and English field names', () => {
    expect(detectVillageFields(['รหัสหมู่บ้าน', 'ชื่อหมู่บ้าน', 'หมู่ที่', 'ละติจูด', 'ลองจิจูด'])).toEqual({
      id: 'รหัสหมู่บ้าน',
      nameTh: 'ชื่อหมู่บ้าน',
      moo: 'หมู่ที่',
      lat: 'ละติจูด',
      lng: 'ลองจิจูด',
    });
    expect(detectVillageFields(['VILL_CODE', 'VILL_NAME', 'LAT', 'LONG'])).toMatchObject({ id: 'VILL_CODE', nameTh: 'VILL_NAME', lat: 'LAT', lng: 'LONG' });
  });

  it('reads arrays, wrapped lists and GeoJSON', () => {
    expect(extractRecords([{ a: 1 }])).toHaveLength(1);
    expect(extractRecords({ result: { records: [{ a: 1 }, { a: 2 }] } })).toHaveLength(2);
    const g = extractRecords({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { n: 'x' }, geometry: { type: 'Point', coordinates: [99.9, 8.4] } }] });
    expect(g[0]?.point).toEqual([99.9, 8.4]);
    expect(() => extractRecords({ nothing: true })).toThrow();
  });

  it('parses CSV with quotes, commas and a BOM', () => {
    const rows = parseCsv('﻿code,name,lat,lng\r\n1,"บ้าน ""ใหม่"", ใต้",8.4,99.9\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.properties).toEqual({ code: '1', name: 'บ้าน "ใหม่", ใต้', lat: '8.4', lng: '99.9' });
  });

  it('parses moo numbers including Thai digits', () => {
    expect(parseMoo('หมู่ที่ ๑๒')).toBe(12);
    expect(parseMoo('3')).toBe(3);
    expect(parseMoo('')).toBeNull();
  });

  it('keeps official names exactly (only whitespace is normalised)', () => {
    const { villages } = parseVillages(
      [{ index: 0, properties: { id: '1', name: '  บ้านควน  ใหม่ ', lat: '8.4', lng: '99.9' }, point: null }],
      { id: 'id', nameTh: 'name', lat: 'lat', lng: 'lng' },
    );
    expect(villages[0]?.nameTh).toBe('บ้านควน ใหม่');
  });
});

describe('OSM classification', () => {
  it('classifies waterways, roads and coastline', () => {
    expect(classifyOsm('lines', { waterway: 'river' })).toEqual({ kind: 'river', subkind: 'river' });
    expect(classifyOsm('lines', { waterway: 'ditch' })).toEqual({ kind: 'drain', subkind: 'ditch' });
    expect(classifyOsm('lines', { highway: 'trunk' })?.kind).toBe('road_major');
    expect(classifyOsm('lines', { highway: 'residential' })?.kind).toBe('road_minor');
    expect(classifyOsm('lines', { highway: 'footway' })).toBeNull();
    expect(classifyOsm('lines', { natural: 'coastline' })?.kind).toBe('coastline');
  });
  it('separates reservoirs from other water', () => {
    expect(classifyOsm('multipolygons', { natural: 'water', water: 'reservoir' })?.kind).toBe('reservoir');
    expect(classifyOsm('multipolygons', { landuse: 'reservoir' })?.kind).toBe('reservoir');
    expect(classifyOsm('multipolygons', { natural: 'water', water: 'pond' })).toEqual({ kind: 'water', subkind: 'pond' });
  });
  it('merges other_tags JSON and restores laundered name keys', () => {
    const tags = osmTags({ name: 'คลอง', name_en: 'Khlong', other_tags: '{"name:th":"คลองท่าดี","intermittent":"yes"}' });
    expect(tags['name:en']).toBe('Khlong');
    expect(tags['name:th']).toBe('คลองท่าดี');
    expect(tags.intermittent).toBe('yes');
  });
  it('derives OSM type from GDAL ids', () => {
    expect(osmIdentity('multipolygons', { osm_id: null, osm_way_id: '42' })).toEqual({ osmType: 'way', osmId: 42 });
    expect(osmIdentity('multipolygons', { osm_id: '7', osm_way_id: null })).toEqual({ osmType: 'relation', osmId: 7 });
  });
});
