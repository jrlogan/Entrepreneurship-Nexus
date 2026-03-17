import { describe, it, expect } from 'vitest';
import { detectDuplicates, calculatePipelineProgress } from './logic';
import type { Organization } from './organizations/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeOrg = (overrides: Partial<Organization> & { id: string; name: string }): Organization => ({
  description: '',
  tax_status: 'for_profit',
  roles: ['startup'],
  owner_characteristics: [],
  classification: { industry_tags: [] },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  support_offerings: [],
  version: 1,
  ecosystem_ids: ['eco_test'],
  api_keys: [],
  webhooks: [],
  tags: [],
  external_ids: {},
  ...overrides,
});

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------
describe('detectDuplicates', () => {
  it('returns empty array for zero organizations', () => {
    expect(detectDuplicates([])).toEqual([]);
  });

  it('returns empty array for a single organization', () => {
    expect(detectDuplicates([makeOrg({ id: 'a', name: 'Acme' })])).toEqual([]);
  });

  it('returns empty array for clearly different organizations', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'Acme Corp' }),
      makeOrg({ id: 'b', name: 'BlueSky Ventures' }),
      makeOrg({ id: 'c', name: 'Harbor Tech' }),
    ];
    expect(detectDuplicates(orgs)).toEqual([]);
  });

  it('detects identical names as duplicates', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven' }),
      makeOrg({ id: 'b', name: 'MakeHaven' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
    expect(results[0].confidence_score).toBeGreaterThanOrEqual(80);
    expect(results[0].match_reason.some(r => r.includes('Name'))).toBe(true);
  });

  it('detects very similar names (typo / punctuation difference)', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven Inc' }),
      makeOrg({ id: 'b', name: 'MakeHaven, Inc.' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
  });

  it('detects name inclusion (one name is a substring of the other)', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'Connecticut Innovations' }),
      makeOrg({ id: 'b', name: 'Connecticut Innovations Center' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
    expect(results[0].match_reason.some(r => r.toLowerCase().includes('name'))).toBe(true);
  });

  it('detects identical website URL as high confidence', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'Company A', url: 'https://example.com' }),
      makeOrg({ id: 'b', name: 'Company B', url: 'https://example.com' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
    expect(results[0].confidence_score).toBeGreaterThanOrEqual(90);
    expect(results[0].match_reason).toContain('Identical Website URL');
  });

  it('does not flag different website URLs', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'Acme Corp', url: 'https://alpha.com' }),
      makeOrg({ id: 'b', name: 'BlueSky Ventures', url: 'https://beta.com' }),
    ];
    expect(detectDuplicates(orgs)).toEqual([]);
  });

  it('skips archived organizations', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven' }),
      makeOrg({ id: 'b', name: 'MakeHaven', status: 'archived' }),
    ];
    expect(detectDuplicates(orgs)).toEqual([]);
  });

  it('does not produce a duplicate pair more than once', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven' }),
      makeOrg({ id: 'b', name: 'MakeHaven' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
  });

  it('caps confidence score at 100', () => {
    // Same name AND same URL — would score > 100 uncapped
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven', url: 'https://makehaven.org' }),
      makeOrg({ id: 'b', name: 'MakeHaven', url: 'https://makehaven.org' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results[0].confidence_score).toBeLessThanOrEqual(100);
  });

  it('finds multiple duplicate pairs independently', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven' }),
      makeOrg({ id: 'b', name: 'MakeHaven' }),
      makeOrg({ id: 'c', name: 'Yale Ventures' }),
      makeOrg({ id: 'd', name: 'Yale Ventures' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(2);
  });

  it('does not cross-match unrelated pairs in a larger list', () => {
    const orgs = [
      makeOrg({ id: 'a', name: 'MakeHaven' }),
      makeOrg({ id: 'b', name: 'MakeHaven' }),
      makeOrg({ id: 'c', name: 'Harbor Tech' }),
      makeOrg({ id: 'd', name: 'BlueSky Ventures' }),
    ];
    const results = detectDuplicates(orgs);
    expect(results).toHaveLength(1);
    const ids = [results[0].primary_id, results[0].duplicate_id].sort();
    expect(ids).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// calculatePipelineProgress
// ---------------------------------------------------------------------------
describe('calculatePipelineProgress', () => {
  const pipeline = {
    id: 'p1',
    name: 'Test',
    ecosystem_id: 'eco_test',
    stages: [
      { id: 's1', name: 'Intake', order: 0 },
      { id: 's2', name: 'Active', order: 1 },
      { id: 's3', name: 'Complete', order: 2 },
    ],
  } as any;

  it('returns 0 for first stage', () => {
    expect(calculatePipelineProgress({ current_stage_index: 0 } as any, pipeline)).toBe(0);
  });

  it('returns 100 for last stage', () => {
    expect(calculatePipelineProgress({ current_stage_index: 2 } as any, pipeline)).toBe(100);
  });

  it('returns 50 for middle stage', () => {
    expect(calculatePipelineProgress({ current_stage_index: 1 } as any, pipeline)).toBe(50);
  });

  it('returns 100 for a single-stage pipeline', () => {
    const single = { ...pipeline, stages: [pipeline.stages[0]] };
    expect(calculatePipelineProgress({ current_stage_index: 0 } as any, single)).toBe(100);
  });

  it('returns 0 for empty pipeline', () => {
    expect(calculatePipelineProgress({ current_stage_index: 0 } as any, { ...pipeline, stages: [] })).toBe(0);
  });

  it('clamps out-of-bounds index to last stage', () => {
    expect(calculatePipelineProgress({ current_stage_index: 99 } as any, pipeline)).toBe(100);
  });
});
