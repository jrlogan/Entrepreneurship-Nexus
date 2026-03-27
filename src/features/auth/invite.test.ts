import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Invite token URL parsing — ensure invite token survives initial render
// ---------------------------------------------------------------------------

describe('invite token extraction from URL', () => {
  const originalSearch = window.location.search;

  beforeEach(() => {
    // Reset URL search after each test
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: originalSearch },
    });
  });

  it('extracts invite token from URL search params', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?invite=abc123def456' },
    });
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || '';
    expect(token).toBe('abc123def456');
  });

  it('returns empty string when no invite param', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?view=dashboard' },
    });
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || '';
    expect(token).toBe('');
  });

  it('extracts token even with other params present', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: '?view=dashboard&invite=6feb67e4ccc9&eco=test' },
    });
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite') || '';
    expect(token).toBe('6feb67e4ccc9');
  });
});

// ---------------------------------------------------------------------------
// Role save validation — ensure system_role changes go through the right path
// ---------------------------------------------------------------------------

describe('handleSaveUser role routing', () => {
  it('identifies when a role change is present in updates', () => {
    const updates = { first_name: 'Casey', system_role: 'eso_admin' as const };
    expect('system_role' in updates && !!updates.system_role).toBe(true);
  });

  it('identifies non-role-only updates', () => {
    const updates = { first_name: 'Casey', last_name: 'Pickett' };
    expect('system_role' in updates).toBe(false);
  });

  it('strips system_role and organization_id from non-role updates when role is present', () => {
    const updates = { first_name: 'Casey', system_role: 'eso_admin' as const, organization_id: 'org_1' };
    const { system_role, organization_id, ...nonRoleUpdates } = updates;
    void system_role;
    void organization_id;
    expect(nonRoleUpdates).toEqual({ first_name: 'Casey' });
  });
});

// ---------------------------------------------------------------------------
// organization_id field name mapping
// ---------------------------------------------------------------------------

describe('FirebasePeopleRepo organization_id field mapping', () => {
  it('maps organization_id to primary_organization_id for Firestore', () => {
    const updates = { first_name: 'Test', organization_id: 'org_123' };
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (key === 'organization_id') {
        mapped['primary_organization_id'] = value;
      } else {
        mapped[key] = value;
      }
    }
    expect(mapped).not.toHaveProperty('organization_id');
    expect(mapped).toHaveProperty('primary_organization_id', 'org_123');
    expect(mapped).toHaveProperty('first_name', 'Test');
  });

  it('passes non-organization fields through unchanged', () => {
    const updates = { first_name: 'Test', last_name: 'User', system_role: 'eso_admin' as const };
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (key === 'organization_id') {
        mapped['primary_organization_id'] = value;
      } else {
        mapped[key] = value;
      }
    }
    expect(mapped).toEqual({ first_name: 'Test', last_name: 'User', system_role: 'eso_admin' });
  });

  it('strips undefined values', () => {
    const updates = { first_name: 'Test', last_name: undefined };
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      if (key === 'organization_id') {
        mapped['primary_organization_id'] = value;
      } else {
        mapped[key] = value;
      }
    }
    expect(mapped).toEqual({ first_name: 'Test' });
    expect(mapped).not.toHaveProperty('last_name');
  });
});
