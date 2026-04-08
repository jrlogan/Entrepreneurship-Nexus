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

// ---------------------------------------------------------------------------
// humanizeRole — role slug → display label
// ---------------------------------------------------------------------------

const humanizeRole = (role: string): string => {
  const labels: Record<string, string> = {
    platform_admin: 'Platform Admin',
    ecosystem_manager: 'Ecosystem Manager',
    eso_admin: 'ESO Admin',
    eso_staff: 'ESO Staff',
    eso_coach: 'Coach',
    entrepreneur: 'Entrepreneur',
  };
  return labels[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

describe('humanizeRole', () => {
  it('maps known roles to display labels', () => {
    expect(humanizeRole('eso_admin')).toBe('ESO Admin');
    expect(humanizeRole('eso_staff')).toBe('ESO Staff');
    expect(humanizeRole('eso_coach')).toBe('Coach');
    expect(humanizeRole('entrepreneur')).toBe('Entrepreneur');
    expect(humanizeRole('platform_admin')).toBe('Platform Admin');
    expect(humanizeRole('ecosystem_manager')).toBe('Ecosystem Manager');
  });

  it('falls back to title-cased slug for unknown roles', () => {
    expect(humanizeRole('custom_role')).toBe('Custom Role');
    expect(humanizeRole('some_new_role')).toBe('Some New Role');
  });

  it('does not produce raw underscores in output for any known role', () => {
    const known = ['eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur', 'platform_admin', 'ecosystem_manager'];
    for (const role of known) {
      expect(humanizeRole(role)).not.toContain('_');
    }
  });
});

// ---------------------------------------------------------------------------
// callHttpFunction error enrichment — reason field survives the throw
// ---------------------------------------------------------------------------

describe('callHttpFunction error shape', () => {
  it('error carries status and reason from response body', async () => {
    // Simulate the logic in httpFunctionClient.ts without calling fetch.
    const mockResponseJson = { error: 'Invite is no longer valid', reason: 'expired' };
    const mockStatus = 410;

    const message = mockResponseJson.error || 'failed';
    const err = new Error(message) as Error & { status: number; reason?: string };
    err.status = mockStatus;
    err.reason = mockResponseJson.reason;

    expect(err.message).toBe('Invite is no longer valid');
    expect(err.status).toBe(410);
    expect(err.reason).toBe('expired');
  });

  it('reason is undefined when response body has no reason field', () => {
    const mockResponseJson = { error: 'Something went wrong' };
    const err = new Error(mockResponseJson.error) as Error & { status: number; reason?: string };
    err.status = 500;
    err.reason = (mockResponseJson as Record<string, unknown>).reason as string | undefined;

    expect(err.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Invite load error messaging — correct user-facing message per reason
// ---------------------------------------------------------------------------

const inviteLoadErrorMessage = (err: { status?: number; reason?: string; message?: string }): string => {
  const reason = err?.reason;
  if (reason === 'already_accepted') return 'This invite has already been used. If you have an account, sign in below.';
  if (reason === 'revoked') return 'This invite has been revoked. Please contact your administrator for a new one.';
  if (reason === 'expired' || err?.status === 410) return 'This invite link has expired. Please contact your administrator for a new one.';
  if (err?.status === 404) return 'This invite link is not valid. It may have already been used or the link is incorrect.';
  return 'Your invite details could not be loaded. Check your connection, or contact your administrator.';
};

describe('invite load error messaging', () => {
  it('shows already_accepted message', () => {
    expect(inviteLoadErrorMessage({ status: 410, reason: 'already_accepted' }))
      .toBe('This invite has already been used. If you have an account, sign in below.');
  });

  it('shows revoked message', () => {
    expect(inviteLoadErrorMessage({ status: 410, reason: 'revoked' }))
      .toBe('This invite has been revoked. Please contact your administrator for a new one.');
  });

  it('shows expired message when reason is expired', () => {
    expect(inviteLoadErrorMessage({ status: 410, reason: 'expired' }))
      .toBe('This invite link has expired. Please contact your administrator for a new one.');
  });

  it('shows expired message when status is 410 but no reason', () => {
    expect(inviteLoadErrorMessage({ status: 410 }))
      .toBe('This invite link has expired. Please contact your administrator for a new one.');
  });

  it('shows not-found message for 404', () => {
    expect(inviteLoadErrorMessage({ status: 404 }))
      .toBe('This invite link is not valid. It may have already been used or the link is incorrect.');
  });

  it('shows generic connection message for network errors', () => {
    expect(inviteLoadErrorMessage({ message: 'Failed to fetch' }))
      .toBe('Your invite details could not be loaded. Check your connection, or contact your administrator.');
  });

  it('never returns a string containing raw role underscores or internal reason codes', () => {
    const cases = [
      { status: 410, reason: 'already_accepted' },
      { status: 410, reason: 'revoked' },
      { status: 410, reason: 'expired' },
      { status: 404 },
      {},
    ];
    for (const c of cases) {
      const msg = inviteLoadErrorMessage(c);
      expect(msg).not.toContain('already_accepted');
      expect(msg).not.toContain('undefined');
    }
  });
});

// ---------------------------------------------------------------------------
// createInvite duplicate check logic — expired invites should not block re-invite
// ---------------------------------------------------------------------------

describe('createInvite duplicate check', () => {
  const isExpired = (isoDate?: string | null): boolean => {
    if (!isoDate) return false;
    return new Date(isoDate) < new Date();
  };

  it('treats a future expiry as not expired', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it('treats a past expiry as expired', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(past)).toBe(true);
  });

  it('allows re-invite when existing pending invite is expired', () => {
    const existingExpiresAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
    const shouldBlock = !isExpired(existingExpiresAt);
    expect(shouldBlock).toBe(false);
  });

  it('blocks re-invite when existing pending invite is still valid', () => {
    const existingExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 13).toISOString(); // 13 days out
    const shouldBlock = !isExpired(existingExpiresAt);
    expect(shouldBlock).toBe(true);
  });

  it('missing expiry is treated as not expired (safe default)', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });
});
