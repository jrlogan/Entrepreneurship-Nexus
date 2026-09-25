import { describe, it, expect } from 'vitest';
import {
  viewerHasCapability,
  viewerHasAnyCapability,
  ViewerContext,
} from './policy';
import type { Organization, Interaction } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const restrictedOrg: Organization = {
  id: 'org_test_1',
  name: 'Test Startup',
  description: '',
  tax_status: 'for_profit',
  roles: [],
  org_type: 'startup',
  owner_characteristics: [],
  classification: { industry_tags: [] },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'restricted',
  authorized_eso_ids: [],
  version: 1,
  ecosystem_ids: ['eco_1'],
};

const openOrg: Organization = { ...restrictedOrg, id: 'org_open', operational_visibility: 'open' };

const adminViewer: ViewerContext = {
  personId: 'admin_1',
  orgId: 'org_admin',
  role: 'platform_admin',
  ecosystemId: 'eco_1',
};

const ecoManager: ViewerContext = {
  personId: 'mgr_1',
  orgId: 'org_mgr',
  role: 'ecosystem_manager',
  ecosystemId: 'eco_1',
};

const partnerViewer: ViewerContext = {
  personId: 'partner_1',
  orgId: 'org_partner',
  role: 'eso_admin',
  ecosystemId: 'eco_1',
};

const ownerViewer: ViewerContext = {
  personId: 'owner_1',
  orgId: 'org_test_1', // same as restrictedOrg.id
  role: 'entrepreneur',
  ecosystemId: 'eco_1',
};

const sharedInteraction: Interaction = {
  id: 'int_1',
  organization_id: 'org_test_1',
  ecosystem_id: 'eco_1',
  author_org_id: 'org_partner',
  date: '2024-01-01',
  type: 'meeting',
  visibility: 'network_shared',
  note_confidential: false,
  notes: 'Discussed growth plans.',
};

// ---------------------------------------------------------------------------
// viewerHasCapability
// ---------------------------------------------------------------------------
describe('viewerHasCapability', () => {
  it('uses pre-calculated capabilities on viewer when present', () => {
    const viewer: ViewerContext = { ...partnerViewer, capabilities: ['referral.create'] };
    expect(viewerHasCapability(viewer, 'referral.create')).toBe(true);
    expect(viewerHasCapability(viewer, 'system.manage_users')).toBe(false);
  });

  it('falls back to role-based lookup when viewer.capabilities is absent', () => {
    expect(viewerHasCapability(partnerViewer, 'interaction.create')).toBe(true);
    expect(viewerHasCapability(partnerViewer, 'system.manage_users')).toBe(false);
  });

  it('platform_admin has every capability via role lookup', () => {
    expect(viewerHasCapability(adminViewer, 'system.manage_users')).toBe(true);
    expect(viewerHasCapability(adminViewer, 'interaction.view_sensitive')).toBe(true);
    expect(viewerHasCapability(adminViewer, 'directory.read_private')).toBe(true);
  });

  it('empty capabilities array means no access (not a fallback to role)', () => {
    const viewer: ViewerContext = { ...adminViewer, capabilities: [] };
    expect(viewerHasCapability(viewer, 'system.manage_users')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// viewerHasAnyCapability
// ---------------------------------------------------------------------------
describe('viewerHasAnyCapability', () => {
  it('returns true when viewer has at least one matching capability', () => {
    expect(viewerHasAnyCapability(partnerViewer, ['metrics.verify', 'referral.create'])).toBe(true);
  });

  it('returns false when viewer has none of the listed capabilities', () => {
    expect(viewerHasAnyCapability(ownerViewer, ['system.manage_users', 'directory.update_all_orgs'])).toBe(false);
  });

  it('returns false for an empty capability list', () => {
    expect(viewerHasAnyCapability(adminViewer, [])).toBe(false);
  });
});





