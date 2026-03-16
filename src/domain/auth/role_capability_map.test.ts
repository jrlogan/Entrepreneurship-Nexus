import { describe, it, expect } from 'vitest';
import { CAPABILITIES, CAPABILITY_GROUPS } from './capabilities';
import type { Capability } from './capabilities';
import { ROLE_CAPABILITY_MAP } from './role_capability_map';

const ALL_CAPS = Object.values(CAPABILITIES) as Capability[];
const ALL_ROLES = Object.keys(ROLE_CAPABILITY_MAP) as Array<keyof typeof ROLE_CAPABILITY_MAP>;

// ---------------------------------------------------------------------------
// CAPABILITIES registry
// ---------------------------------------------------------------------------
describe('CAPABILITIES registry', () => {
  it('every key equals its own value (const-identity pattern)', () => {
    for (const [key, value] of Object.entries(CAPABILITIES)) {
      expect(key).toBe(value);
    }
  });

  it('CAPABILITY_GROUPS only reference defined capabilities', () => {
    for (const caps of Object.values(CAPABILITY_GROUPS)) {
      for (const cap of caps) {
        expect(ALL_CAPS).toContain(cap);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ROLE_CAPABILITY_MAP – structural invariants
// ---------------------------------------------------------------------------
describe('ROLE_CAPABILITY_MAP structural invariants', () => {
  it('all roles include directory.read_public (COMMON_BASE)', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_CAPABILITY_MAP[role]).toContain('directory.read_public');
    }
  });

  it('no role lists a capability outside the registry', () => {
    for (const role of ALL_ROLES) {
      for (const cap of ROLE_CAPABILITY_MAP[role]) {
        expect(ALL_CAPS).toContain(cap);
      }
    }
  });

  it('no role has duplicate capabilities', () => {
    for (const role of ALL_ROLES) {
      const caps = ROLE_CAPABILITY_MAP[role];
      expect(caps.length).toBe(new Set(caps).size);
    }
  });
});

// ---------------------------------------------------------------------------
// platform_admin – superuser guarantee
// ---------------------------------------------------------------------------
describe('platform_admin', () => {
  it('has every capability defined in the registry', () => {
    for (const cap of ALL_CAPS) {
      expect(ROLE_CAPABILITY_MAP['platform_admin']).toContain(cap);
    }
  });
});

// ---------------------------------------------------------------------------
// ecosystem_manager
// ---------------------------------------------------------------------------
describe('ecosystem_manager', () => {
  it('has directory.read_private (admin override for restricted orgs)', () => {
    expect(ROLE_CAPABILITY_MAP['ecosystem_manager']).toContain('directory.read_private');
  });

  it('does NOT have system.view_api_keys (that belongs to eso_admin)', () => {
    expect(ROLE_CAPABILITY_MAP['ecosystem_manager']).not.toContain('system.view_api_keys');
  });

  it('has interaction.view_sensitive', () => {
    expect(ROLE_CAPABILITY_MAP['ecosystem_manager']).toContain('interaction.view_sensitive');
  });
});

// ---------------------------------------------------------------------------
// eso_admin / eso_staff containment
// ---------------------------------------------------------------------------
describe('eso_staff vs eso_admin', () => {
  it('every eso_staff capability is also held by eso_admin', () => {
    const adminCaps = ROLE_CAPABILITY_MAP['eso_admin'];
    for (const cap of ROLE_CAPABILITY_MAP['eso_staff']) {
      expect(adminCaps).toContain(cap);
    }
  });

  it('eso_admin has system.view_api_keys; eso_staff does not', () => {
    expect(ROLE_CAPABILITY_MAP['eso_admin']).toContain('system.view_api_keys');
    expect(ROLE_CAPABILITY_MAP['eso_staff']).not.toContain('system.view_api_keys');
  });
});

// ---------------------------------------------------------------------------
// eso_coach – limited scope
// ---------------------------------------------------------------------------
describe('eso_coach', () => {
  it('cannot manage incoming referrals', () => {
    expect(ROLE_CAPABILITY_MAP['eso_coach']).not.toContain('referral.manage_incoming');
  });

  it('cannot verify metrics', () => {
    expect(ROLE_CAPABILITY_MAP['eso_coach']).not.toContain('metrics.verify');
  });

  it('cannot update managed orgs', () => {
    expect(ROLE_CAPABILITY_MAP['eso_coach']).not.toContain('directory.update_managed_org');
  });

  it('cannot view the metrics dashboard', () => {
    expect(ROLE_CAPABILITY_MAP['eso_coach']).not.toContain('metrics.view_dashboard');
  });
});

// ---------------------------------------------------------------------------
// entrepreneur – minimum footprint
// ---------------------------------------------------------------------------
describe('entrepreneur', () => {
  const dangerous: Capability[] = [
    'system.manage_users',
    'system.configure_ecosystem',
    'system.manage_taxonomy',
    'directory.read_private',
    'directory.update_all_orgs',
    'directory.update_managed_org',
    'interaction.view_sensitive',
    'interaction.view_team',
    'metrics.verify',
    'referral.manage_incoming',
  ];

  it.each(dangerous)('does NOT have %s', (cap) => {
    expect(ROLE_CAPABILITY_MAP['entrepreneur']).not.toContain(cap);
  });

  it('CAN submit own metrics', () => {
    expect(ROLE_CAPABILITY_MAP['entrepreneur']).toContain('metrics.submit_own');
  });

  it('CAN create interactions (log own notes)', () => {
    expect(ROLE_CAPABILITY_MAP['entrepreneur']).toContain('interaction.create');
  });
});
