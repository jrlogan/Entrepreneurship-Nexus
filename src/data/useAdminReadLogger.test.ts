import { describe, it, expect } from 'vitest';
import {
  buildDedupKey,
  isAdminRole,
  shouldLogAdminRead,
} from './useAdminReadLogger';

// ---------------------------------------------------------------------------
// isAdminRole
// ---------------------------------------------------------------------------
describe('isAdminRole', () => {
  it('recognizes platform_admin and ecosystem_manager', () => {
    expect(isAdminRole('platform_admin')).toBe(true);
    expect(isAdminRole('ecosystem_manager')).toBe(true);
  });

  it('rejects ESO and entrepreneur roles', () => {
    expect(isAdminRole('eso_admin')).toBe(false);
    expect(isAdminRole('eso_staff')).toBe(false);
    expect(isAdminRole('eso_coach')).toBe(false);
    expect(isAdminRole('entrepreneur')).toBe(false);
  });

  it('rejects empty / unknown role strings', () => {
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole('not_a_role')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldLogAdminRead
// ---------------------------------------------------------------------------
describe('shouldLogAdminRead', () => {
  it('returns false when active=false even for admins', () => {
    expect(shouldLogAdminRead({ active: false, role: 'platform_admin', resourceId: 'org_1' })).toBe(false);
  });

  it('returns false for non-admin roles even when active', () => {
    expect(shouldLogAdminRead({ active: true, role: 'eso_admin', resourceId: 'org_1' })).toBe(false);
    expect(shouldLogAdminRead({ active: true, role: 'entrepreneur', resourceId: 'org_1' })).toBe(false);
  });

  it('returns false when resourceId is empty', () => {
    expect(shouldLogAdminRead({ active: true, role: 'platform_admin', resourceId: '' })).toBe(false);
  });

  it('returns true for an admin viewing a real resource with active=true', () => {
    expect(shouldLogAdminRead({ active: true, role: 'platform_admin', resourceId: 'org_1' })).toBe(true);
    expect(shouldLogAdminRead({ active: true, role: 'ecosystem_manager', resourceId: 'int_42' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildDedupKey
// ---------------------------------------------------------------------------
describe('buildDedupKey', () => {
  it('is deterministic for the same inputs', () => {
    const a = buildDedupKey('p_1', 'org_detail', 'org_42');
    const b = buildDedupKey('p_1', 'org_detail', 'org_42');
    expect(a).toBe(b);
  });

  it('differs by actor', () => {
    expect(buildDedupKey('p_1', 'org_detail', 'org_42'))
      .not.toBe(buildDedupKey('p_2', 'org_detail', 'org_42'));
  });

  it('differs by surface (same actor + resource on different views)', () => {
    expect(buildDedupKey('p_1', 'org_detail', 'org_42'))
      .not.toBe(buildDedupKey('p_1', 'interaction_detail', 'org_42'));
  });

  it('differs by resourceId', () => {
    expect(buildDedupKey('p_1', 'org_detail', 'org_42'))
      .not.toBe(buildDedupKey('p_1', 'org_detail', 'org_43'));
  });
});
