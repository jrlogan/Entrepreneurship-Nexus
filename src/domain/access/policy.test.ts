import { describe, it, expect } from 'vitest';
import {
  viewerHasCapability,
  viewerHasAnyCapability,
  canViewOperationalDetails,
  canViewInteractionContent,
  validateEcosystemScope,
  explainOrgAccess,
  explainInteractionAccess,
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
  roles: ['startup'],
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

// ---------------------------------------------------------------------------
// canViewOperationalDetails
// ---------------------------------------------------------------------------
describe('canViewOperationalDetails', () => {
  it('platform_admin can always view restricted orgs', () => {
    expect(canViewOperationalDetails(adminViewer, restrictedOrg)).toBe(true);
  });

  it('ecosystem_manager can always view restricted orgs', () => {
    expect(canViewOperationalDetails(ecoManager, restrictedOrg)).toBe(true);
  });

  it('owner (same orgId) can view their own restricted org', () => {
    expect(canViewOperationalDetails(ownerViewer, restrictedOrg)).toBe(true);
  });

  it('partner cannot view restricted org without consent', () => {
    expect(canViewOperationalDetails(partnerViewer, restrictedOrg)).toBe(false);
  });

  it('partner can view restricted org when hasConsent=true', () => {
    expect(canViewOperationalDetails(partnerViewer, restrictedOrg, true)).toBe(true);
  });

  it('any authenticated viewer can view an open org', () => {
    expect(canViewOperationalDetails(partnerViewer, openOrg)).toBe(true);
    expect(canViewOperationalDetails(ownerViewer, openOrg)).toBe(true);
  });

  it('viewer with directory.read_private capability bypasses restriction', () => {
    const capViewer: ViewerContext = { ...partnerViewer, capabilities: ['directory.read_private'] };
    expect(canViewOperationalDetails(capViewer, restrictedOrg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// explainOrgAccess
// ---------------------------------------------------------------------------
describe('explainOrgAccess', () => {
  it('returns detailed + Admin Privilege for platform_admin', () => {
    const result = explainOrgAccess(adminViewer, restrictedOrg);
    expect(result.level).toBe('detailed');
    expect(result.reason).toBe('Admin Privilege');
  });

  it('returns detailed + Admin Privilege for ecosystem_manager', () => {
    const result = explainOrgAccess(ecoManager, restrictedOrg);
    expect(result.level).toBe('detailed');
    expect(result.reason).toBe('Admin Privilege');
  });

  it('returns detailed + Owner for org member', () => {
    const result = explainOrgAccess(ownerViewer, restrictedOrg);
    expect(result.level).toBe('detailed');
    expect(result.reason).toBe('Owner');
  });

  it('returns detailed + Consent Granted when hasConsent=true', () => {
    const result = explainOrgAccess(partnerViewer, restrictedOrg, true);
    expect(result.level).toBe('detailed');
    expect(result.reason).toBe('Consent Granted');
  });

  it('returns basic + Restricted reason when no access', () => {
    const result = explainOrgAccess(partnerViewer, restrictedOrg);
    expect(result.level).toBe('basic');
    expect(result.reason).toMatch(/restricted/i);
  });

  it('returns detailed + Public Data for open org viewed by partner', () => {
    const result = explainOrgAccess(partnerViewer, openOrg);
    expect(result.level).toBe('detailed');
    expect(result.reason).toBe('Public Data');
  });
});

// ---------------------------------------------------------------------------
// canViewInteractionContent
// ---------------------------------------------------------------------------
describe('canViewInteractionContent', () => {
  it('author org can view their own interaction', () => {
    expect(canViewInteractionContent(partnerViewer, sharedInteraction, restrictedOrg)).toBe(true);
  });

  it('platform_admin can view any interaction, including confidential', () => {
    const confidential: Interaction = { ...sharedInteraction, note_confidential: true };
    expect(canViewInteractionContent(adminViewer, confidential, restrictedOrg)).toBe(true);
  });

  it('confidential note is hidden from non-author, non-admin', () => {
    const confidential: Interaction = { ...sharedInteraction, note_confidential: true, author_org_id: 'org_other' };
    expect(canViewInteractionContent(ownerViewer, confidential, restrictedOrg)).toBe(false);
    expect(canViewInteractionContent(partnerViewer, confidential, restrictedOrg)).toBe(false);
  });

  it('eso_private interaction is hidden from non-author agencies', () => {
    const privateInt: Interaction = { ...sharedInteraction, visibility: 'eso_private', author_org_id: 'org_other' };
    expect(canViewInteractionContent(partnerViewer, privateInt, restrictedOrg)).toBe(false);
  });

  it('ecosystem_manager can view eso_private interactions', () => {
    const privateInt: Interaction = { ...sharedInteraction, visibility: 'eso_private', author_org_id: 'org_other' };
    expect(canViewInteractionContent(ecoManager, privateInt, restrictedOrg)).toBe(true);
  });

  it('non-author partner can see non-confidential interaction on open org', () => {
    const nonAuthorInt: Interaction = { ...sharedInteraction, author_org_id: 'org_other' };
    expect(canViewInteractionContent(partnerViewer, nonAuthorInt, openOrg)).toBe(true);
  });

  it('non-author partner cannot see non-confidential interaction on restricted org without consent', () => {
    const nonAuthorInt: Interaction = { ...sharedInteraction, author_org_id: 'org_other' };
    expect(canViewInteractionContent(partnerViewer, nonAuthorInt, restrictedOrg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEcosystemScope
// ---------------------------------------------------------------------------
describe('validateEcosystemScope', () => {
  it('standard user is locked to their own ecosystem', () => {
    expect(validateEcosystemScope(partnerViewer, 'eco_other')).toBe('eco_1');
  });

  it('platform_admin can switch to any ecosystem', () => {
    expect(validateEcosystemScope(adminViewer, 'eco_other')).toBe('eco_other');
  });

  it('returns own ecosystemId when requestedId is undefined', () => {
    expect(validateEcosystemScope(partnerViewer, undefined)).toBe('eco_1');
  });

  it('returns own ecosystemId when requestedId matches', () => {
    expect(validateEcosystemScope(partnerViewer, 'eco_1')).toBe('eco_1');
  });

  it('cross-ecosystem attempt by standard user is silently scoped back', () => {
    // The key security guarantee: attacker cannot escape their ecosystem
    const result = validateEcosystemScope(ownerViewer, 'eco_attacker');
    expect(result).toBe(ownerViewer.ecosystemId);
    expect(result).not.toBe('eco_attacker');
  });
});

// ---------------------------------------------------------------------------
// explainInteractionAccess
// ---------------------------------------------------------------------------
describe('explainInteractionAccess', () => {
  it('returns visible=true + Author for the authoring org', () => {
    const result = explainInteractionAccess(partnerViewer, sharedInteraction, restrictedOrg);
    expect(result.visible).toBe(true);
    expect(result.reason).toBe('Author');
  });

  it('returns visible=true + Platform Admin for admin on non-own interaction', () => {
    const nonAuthorInt: Interaction = { ...sharedInteraction, author_org_id: 'org_other' };
    const result = explainInteractionAccess(adminViewer, nonAuthorInt, restrictedOrg);
    expect(result.visible).toBe(true);
    expect(result.reason).toBe('Platform Admin');
  });

  it('returns visible=false + Confidential Note reason', () => {
    const confidential: Interaction = { ...sharedInteraction, note_confidential: true, author_org_id: 'org_other' };
    const result = explainInteractionAccess(ownerViewer, confidential, restrictedOrg);
    expect(result.visible).toBe(false);
    expect(result.reason).toMatch(/confidential/i);
  });

  it('returns visible=false + Private to Agency for eso_private interaction', () => {
    const privateInt: Interaction = { ...sharedInteraction, visibility: 'eso_private', author_org_id: 'org_other' };
    const result = explainInteractionAccess(partnerViewer, privateInt, restrictedOrg);
    expect(result.visible).toBe(false);
    expect(result.reason).toMatch(/private/i);
  });
});
