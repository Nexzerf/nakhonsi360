import { describe, expect, it } from 'vitest';
import { layerUsable } from '@/lib/hooks';
import { getLayer } from '@/lib/registry/layers';
import { SOURCES } from '@/lib/registry/sources';
import type { SourceStatus, SourcesResponse } from '@/lib/types';

function sources(statuses: Record<string, SourceStatus>): SourcesResponse {
  return {
    generatedAt: '2026-10-04T00:00:00Z',
    database: 'not_configured',
    sources: SOURCES.map((s) => ({ ...s, health: { id: s.id, status: statuses[s.id] ?? 'not_connected', lastImport: null, lastRun: null } })),
  };
}

describe('layerUsable', () => {
  it('counts the municipality cameras as usable: they load straight from the provider', () => {
    expect(layerUsable(getLayer('cctv')!, sources({ 'nst.cctv': 'external' }))).toBe(true);
  });

  it('counts agency tile layers as usable when their source is external', () => {
    expect(layerUsable(getLayer('flood-recurrent')!, sources({ 'gistda.flood-recurrent': 'external' }))).toBe(true);
  });

  it('keeps later-phase layers off while their source is not connected', () => {
    expect(layerUsable(getLayer('cctv')!, sources({}))).toBe(false);
  });
});
