import test from 'node:test';
import assert from 'node:assert/strict';
import { 
    canViewOperationalDetails, 
    canViewInteractionContent,
    validateEcosystemScope 
} from './policy.ts';

// Mock data for tests
const mockOrg = {
    id: 'org_test_1',
    name: 'Test Org',
    operational_visibility: 'restricted',
    ecosystem_ids: ['eco_1']
};

const openOrg = {
    id: 'org_open',
    name: 'Open Org',
    operational_visibility: 'open',
    ecosystem_ids: ['eco_1']
};

const adminViewer = {
    personId: 'admin_1',
    orgId: 'org_admin',
    role: 'platform_admin',
    ecosystemId: 'eco_1'
};

const partnerViewer = {
    personId: 'partner_1',
    orgId: 'org_partner',
    role: 'eso_admin',
    ecosystemId: 'eco_1'
};

const ownerViewer = {
    personId: 'owner_1',
    orgId: 'org_test_1',
    role: 'entrepreneur',
    ecosystemId: 'eco_1'
};

test('Policy: canViewOperationalDetails', async (t) => {
    await t.test('Admin can view restricted org', () => {
        assert.equal(canViewOperationalDetails(adminViewer, mockOrg), true);
    });

    await t.test('Owner can view own restricted org', () => {
        assert.equal(canViewOperationalDetails(ownerViewer, mockOrg), true);
    });

    await t.test('Partner cannot view restricted org without consent', () => {
        assert.equal(canViewOperationalDetails(partnerViewer, mockOrg), false);
    });

    await t.test('Partner can view restricted org with consent', () => {
        assert.equal(canViewOperationalDetails(partnerViewer, mockOrg, true), true);
    });

    await t.test('Partner can view open org', () => {
        assert.equal(canViewOperationalDetails(partnerViewer, openOrg), true);
    });
});

test('Policy: canViewInteractionContent', async (t) => {
    const interaction = {
        id: 'int_1',
        author_org_id: 'org_partner',
        organization_id: 'org_test_1',
        visibility: 'network_shared',
        note_confidential: false
    };

    await t.test('Author can view own interaction', () => {
        assert.equal(canViewInteractionContent(partnerViewer, interaction, mockOrg), true);
    });

    await t.test('Admin can view any interaction', () => {
        assert.equal(canViewInteractionContent(adminViewer, interaction, mockOrg), true);
    });

    await t.test('Others cannot view confidential notes', () => {
        const confidentialInt = { ...interaction, note_confidential: true };
        assert.equal(canViewInteractionContent(ownerViewer, confidentialInt, mockOrg), false);
    });

    await t.test('ESO Private is hidden from other agencies', () => {
        const privateInt = { ...interaction, visibility: 'eso_private', author_org_id: 'org_other' };
        assert.equal(canViewInteractionContent(partnerViewer, privateInt, mockOrg), false);
    });
});

test('Policy: validateEcosystemScope', async (t) => {
    await t.test('Standard user is locked to their ecosystem', () => {
        assert.equal(validateEcosystemScope(partnerViewer, 'eco_other'), 'eco_1');
    });

    await t.test('Admin can switch ecosystems', () => {
        assert.equal(validateEcosystemScope(adminViewer, 'eco_other'), 'eco_other');
    });
});
