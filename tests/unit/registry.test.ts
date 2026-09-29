import { describe, expect, it } from 'vitest';
import th from '@/lib/i18n/th.json';
import en from '@/lib/i18n/en.json';
import { leafKeys, placeName, translate } from '@/lib/i18n';
import { SOURCES, findSource } from '@/lib/registry/sources';
import { LAYERS, DEFAULT_LAYER_IDS, MAX_VISIBLE_OVERLAYS, BASEMAPS } from '@/lib/registry/layers';

describe('i18n', () => {
  it('has the same keys in Thai and English', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(th).sort());
  });
  it('substitutes placeholders', () => {
    expect(translate('th', 'empty.noFeatureInRadius', { radius: '30 กม.' })).toBe('ไม่พบภายในรัศมี 30 กม.');
  });
  it('never machine-translates place names', () => {
    expect(placeName('en', 'ท่าศาลา', null)).toBe('ท่าศาลา');
    expect(placeName('en', 'ท่าศาลา', 'Tha Sala')).toBe('Tha Sala');
    expect(placeName('th', 'ท่าศาลา', 'Tha Sala')).toBe('ท่าศาลา');
  });
});

describe('source registry', () => {
  it('has unique ids and complete provenance fields', () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCES) {
      expect(s.organization, s.id).not.toBe('');
      expect(s.attribution, s.id).not.toBe('');
      expect(s.license, s.id).not.toBe('');
      expect(s.endpoint, s.id).toMatch(/^https?:\/\//);
    }
  });
  it('marks a source verified only with a verification date', () => {
    for (const s of SOURCES) expect(s.verified, s.id).toBe(s.verifiedAt !== null);
  });
  it('never puts keys in endpoints', () => {
    for (const s of SOURCES) expect(s.endpoint, s.id).not.toMatch(/key=|token=|ukey|MAP_KEY=/i);
  });
  it('credits TMD by name', () => {
    for (const s of SOURCES.filter((x) => x.id.startsWith('tmd.'))) expect(s.attribution).toContain('กรมอุตุนิยมวิทยา');
  });
});

describe('layer registry', () => {
  it('references known sources only', () => {
    for (const l of LAYERS) for (const id of l.sourceIds) expect(findSource(id), `${l.id} → ${id}`).toBeDefined();
    for (const b of BASEMAPS) expect(findSource(b.sourceId)).toBeDefined();
  });
  it('starts with no more than the overlay limit', () => {
    expect(DEFAULT_LAYER_IDS.length).toBeLessThanOrEqual(MAX_VISIBLE_OVERLAYS);
  });
  it('follows the zoom rules: villages from 12, subdistricts from 10', () => {
    expect(LAYERS.find((l) => l.id === 'villages')?.minzoom).toBe(12);
    expect(LAYERS.find((l) => l.id === 'admin-subdistrict')?.minzoom).toBe(10);
  });
});
