import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_INDUSTRY_TAGS,
  isLinkedToVenture,
  mergeIndustryTags,
  newFounderAffiliations,
  parseFounderRef,
  parseOrgType,
  sanitizeIndustryTags,
  sanitizeStage,
} from './partnerOrgFields';
import { normalizeDomain, storableDomain } from './federationDedup';
import { providerRefBuilder } from './oidcRefs';
import { buildNetworkView, type NetworkData, type Viewer } from './privacy/policy';

describe('partner venture fields', () => {
  it('sanitizes industry tags: strings only, trimmed, capped, de-duplicated', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag ${i}`);
    assert.deepEqual(sanitizeIndustryTags(['  Woodworking ', 'woodworking', 7, '', 'x'.repeat(60), null]), ['Woodworking', 'x'.repeat(40)]);
    assert.equal(sanitizeIndustryTags(many).length, MAX_INDUSTRY_TAGS);
    assert.deepEqual(sanitizeIndustryTags('SaaS'), []);
  });

  it('merges tags keeping existing ones first', () => {
    assert.deepEqual(mergeIndustryTags(['SaaS'], ['saas', 'Hardware']), ['SaaS', 'Hardware']);
    assert.deepEqual(mergeIndustryTags(undefined, ['A']), ['A']);
  });

  it('trims stage to 40 characters and accepts only known org types', () => {
    assert.equal(sanitizeStage('  early   revenue '), 'early revenue');
    assert.equal(sanitizeStage('y'.repeat(50)).length, 40);
    assert.equal(sanitizeStage(5), '');
    assert.equal(parseOrgType('Startup'), 'startup');
    assert.equal(parseOrgType('unicorn'), undefined);
    // MakeHaven's Drupal bridge sends every member business as member_business.
    assert.equal(parseOrgType('member_business'), 'small_business');
    assert.equal(parseOrgType(' Member_Business '), 'small_business');
    assert.equal(parseOrgType('toString'), undefined);
  });

  it('parses founder_ref, defaulting the source', () => {
    assert.deepEqual(parseFounderRef({ id: 42 }, 'makehaven_civicrm'), { source: 'makehaven_civicrm', id: '42' });
    assert.deepEqual(parseFounderRef({ id: '7', source: 'crm' }, 'x'), { source: 'crm', id: '7' });
    assert.equal(parseFounderRef({ source: 'crm' }, 'x'), null);
    assert.equal(parseFounderRef('42', 'x'), null);
  });
});

describe('founder affiliations', () => {
  const now = '2026-10-01T00:00:00.000Z';
  it('adds one active founder affiliation per new venture, in the OIDC shape', () => {
    assert.deepEqual(newFounderAffiliations([], ['v1', 'v1'], 'eco', now), [
      { organization_id: 'v1', relationship_type: 'founder', status: 'active', ecosystem_ids: ['eco'], joined_at: now },
    ]);
  });
  it('leaves an existing affiliation alone, even an ended one', () => {
    const existing = [{ organization_id: 'v1', status: 'inactive' }];
    assert.deepEqual(newFounderAffiliations(existing, ['v1'], 'eco', now), []);
    assert.equal(isLinkedToVenture({ organization_affiliations: existing }, 'v1'), false);
    assert.equal(isLinkedToVenture({ organization_id: 'v1' }, 'v1'), true);
  });
  it('a founder linked this way lists the venture for a directory viewer', () => {
    const [aff] = newFounderAffiliations([], ['venture'], 'eco', now);
    const viewer: Viewer = { personId: 'viewer', orgId: 'eso_b', role: 'eso_staff', ecosystemId: 'eco', orgHasSigned: true };
    const data: NetworkData = {
      people: [{ id: 'founder', first_name: 'F', last_name: 'L', system_role: 'entrepreneur', organization_id: '', organization_affiliations: [aff] }],
      organizations: [
        { id: 'eso_b', name: 'B', roles: ['eso'] },
        { id: 'venture', name: 'Venture', roles: [], logo_url: 'https://example.com/l.png', classification: { industry_tags: ['Woodworking'] } },
      ],
      interactions: [], participations: [], referrals: [], consentGrants: [],
      directoryListedPersonIds: ['founder'],
    };
    const view = buildNetworkView(viewer, data);
    const venture = view.organizations.find((o) => o.id === 'venture');
    assert.ok(venture, 'venture should be listed through its listed founder');
    assert.equal(venture._visibility, 'directory');
    assert.equal(venture.logo_url, 'https://example.com/l.png');
  });
});

describe('org domains', () => {
  it('normalizes scheme, www, port and path', () => {
    assert.equal(normalizeDomain('https://www.Example.com:8443/shop?x=1'), 'example.com');
  });
  it('never stores a shared platform host or a non-hostname', () => {
    assert.equal(storableDomain('https://acme-widgets.com/about'), 'acme-widgets.com');
    assert.equal(storableDomain('https://www.etsy.com/shop/AcmeWidgets'), '');
    assert.equal(storableDomain('instagram.com/acme'), '');
    assert.equal(storableDomain('javascript:alert(1)'), '');
    assert.equal(storableDomain(''), '');
  });
});

describe('SSO provider refs', () => {
  const provider = { organization_id: 'org_mh', ref_sources: { civi_contact_id: 'makehaven_civicrm', venture_id: 'makehaven_civicrm' } };
  const refFor = providerRefBuilder(provider, 'oidc_org_mh');
  it('a mapped key is the provider organization\'s own ref: owner-scoped', () => {
    assert.deepEqual(refFor('civi_contact_id', '12'), { source: 'makehaven_civicrm', id: '12', owner_org_id: 'org_mh' });
    assert.deepEqual(refFor('venture_id', '99'), { source: 'makehaven_civicrm', id: '99', owner_org_id: 'org_mh' });
  });
  it('an unmapped key stays provider-namespaced and global', () => {
    assert.deepEqual(refFor('drupal_uid', '5'), { source: 'oidc_org_mh:drupal_uid', id: '5' });
    assert.deepEqual(providerRefBuilder({ organization_id: 'org_mh' }, 'p')('venture_id', '1'), { source: 'p:venture_id', id: '1' });
  });
});
