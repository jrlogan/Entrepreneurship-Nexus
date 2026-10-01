"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const partnerOrgFields_1 = require("./partnerOrgFields");
const federationDedup_1 = require("./federationDedup");
const oidcRefs_1 = require("./oidcRefs");
const policy_1 = require("./privacy/policy");
(0, node_test_1.describe)('partner venture fields', () => {
    (0, node_test_1.it)('sanitizes industry tags: strings only, trimmed, capped, de-duplicated', () => {
        const many = Array.from({ length: 30 }, (_, i) => `tag ${i}`);
        strict_1.default.deepEqual((0, partnerOrgFields_1.sanitizeIndustryTags)(['  Woodworking ', 'woodworking', 7, '', 'x'.repeat(60), null]), ['Woodworking', 'x'.repeat(40)]);
        strict_1.default.equal((0, partnerOrgFields_1.sanitizeIndustryTags)(many).length, partnerOrgFields_1.MAX_INDUSTRY_TAGS);
        strict_1.default.deepEqual((0, partnerOrgFields_1.sanitizeIndustryTags)('SaaS'), []);
    });
    (0, node_test_1.it)('merges tags keeping existing ones first', () => {
        strict_1.default.deepEqual((0, partnerOrgFields_1.mergeIndustryTags)(['SaaS'], ['saas', 'Hardware']), ['SaaS', 'Hardware']);
        strict_1.default.deepEqual((0, partnerOrgFields_1.mergeIndustryTags)(undefined, ['A']), ['A']);
    });
    (0, node_test_1.it)('trims stage to 40 characters and accepts only known org types', () => {
        strict_1.default.equal((0, partnerOrgFields_1.sanitizeStage)('  early   revenue '), 'early revenue');
        strict_1.default.equal((0, partnerOrgFields_1.sanitizeStage)('y'.repeat(50)).length, 40);
        strict_1.default.equal((0, partnerOrgFields_1.sanitizeStage)(5), '');
        strict_1.default.equal((0, partnerOrgFields_1.parseOrgType)('Startup'), 'startup');
        strict_1.default.equal((0, partnerOrgFields_1.parseOrgType)('unicorn'), undefined);
    });
    (0, node_test_1.it)('parses founder_ref, defaulting the source', () => {
        strict_1.default.deepEqual((0, partnerOrgFields_1.parseFounderRef)({ id: 42 }, 'makehaven_civicrm'), { source: 'makehaven_civicrm', id: '42' });
        strict_1.default.deepEqual((0, partnerOrgFields_1.parseFounderRef)({ id: '7', source: 'crm' }, 'x'), { source: 'crm', id: '7' });
        strict_1.default.equal((0, partnerOrgFields_1.parseFounderRef)({ source: 'crm' }, 'x'), null);
        strict_1.default.equal((0, partnerOrgFields_1.parseFounderRef)('42', 'x'), null);
    });
});
(0, node_test_1.describe)('founder affiliations', () => {
    const now = '2026-10-01T00:00:00.000Z';
    (0, node_test_1.it)('adds one active founder affiliation per new venture, in the OIDC shape', () => {
        strict_1.default.deepEqual((0, partnerOrgFields_1.newFounderAffiliations)([], ['v1', 'v1'], 'eco', now), [
            { organization_id: 'v1', relationship_type: 'founder', status: 'active', ecosystem_ids: ['eco'], joined_at: now },
        ]);
    });
    (0, node_test_1.it)('leaves an existing affiliation alone, even an ended one', () => {
        const existing = [{ organization_id: 'v1', status: 'inactive' }];
        strict_1.default.deepEqual((0, partnerOrgFields_1.newFounderAffiliations)(existing, ['v1'], 'eco', now), []);
        strict_1.default.equal((0, partnerOrgFields_1.isLinkedToVenture)({ organization_affiliations: existing }, 'v1'), false);
        strict_1.default.equal((0, partnerOrgFields_1.isLinkedToVenture)({ organization_id: 'v1' }, 'v1'), true);
    });
    (0, node_test_1.it)('a founder linked this way lists the venture for a directory viewer', () => {
        const [aff] = (0, partnerOrgFields_1.newFounderAffiliations)([], ['venture'], 'eco', now);
        const viewer = { personId: 'viewer', orgId: 'eso_b', role: 'eso_staff', ecosystemId: 'eco', orgHasSigned: true };
        const data = {
            people: [{ id: 'founder', first_name: 'F', last_name: 'L', system_role: 'entrepreneur', organization_id: '', organization_affiliations: [aff] }],
            organizations: [
                { id: 'eso_b', name: 'B', roles: ['eso'] },
                { id: 'venture', name: 'Venture', roles: [], logo_url: 'https://example.com/l.png', classification: { industry_tags: ['Woodworking'] } },
            ],
            interactions: [], participations: [], referrals: [], consentGrants: [],
            directoryListedPersonIds: ['founder'],
        };
        const view = (0, policy_1.buildNetworkView)(viewer, data);
        const venture = view.organizations.find((o) => o.id === 'venture');
        strict_1.default.ok(venture, 'venture should be listed through its listed founder');
        strict_1.default.equal(venture._visibility, 'directory');
        strict_1.default.equal(venture.logo_url, 'https://example.com/l.png');
    });
});
(0, node_test_1.describe)('org domains', () => {
    (0, node_test_1.it)('normalizes scheme, www, port and path', () => {
        strict_1.default.equal((0, federationDedup_1.normalizeDomain)('https://www.Example.com:8443/shop?x=1'), 'example.com');
    });
    (0, node_test_1.it)('never stores a shared platform host or a non-hostname', () => {
        strict_1.default.equal((0, federationDedup_1.storableDomain)('https://acme-widgets.com/about'), 'acme-widgets.com');
        strict_1.default.equal((0, federationDedup_1.storableDomain)('https://www.etsy.com/shop/AcmeWidgets'), '');
        strict_1.default.equal((0, federationDedup_1.storableDomain)('instagram.com/acme'), '');
        strict_1.default.equal((0, federationDedup_1.storableDomain)('javascript:alert(1)'), '');
        strict_1.default.equal((0, federationDedup_1.storableDomain)(''), '');
    });
});
(0, node_test_1.describe)('SSO provider refs', () => {
    const provider = { organization_id: 'org_mh', ref_sources: { civi_contact_id: 'makehaven_civicrm', venture_id: 'makehaven_civicrm' } };
    const refFor = (0, oidcRefs_1.providerRefBuilder)(provider, 'oidc_org_mh');
    (0, node_test_1.it)('a mapped key is the provider organization\'s own ref: owner-scoped', () => {
        strict_1.default.deepEqual(refFor('civi_contact_id', '12'), { source: 'makehaven_civicrm', id: '12', owner_org_id: 'org_mh' });
        strict_1.default.deepEqual(refFor('venture_id', '99'), { source: 'makehaven_civicrm', id: '99', owner_org_id: 'org_mh' });
    });
    (0, node_test_1.it)('an unmapped key stays provider-namespaced and global', () => {
        strict_1.default.deepEqual(refFor('drupal_uid', '5'), { source: 'oidc_org_mh:drupal_uid', id: '5' });
        strict_1.default.deepEqual((0, oidcRefs_1.providerRefBuilder)({ organization_id: 'org_mh' }, 'p')('venture_id', '1'), { source: 'p:venture_id', id: '1' });
    });
});
