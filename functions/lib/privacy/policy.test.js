"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const policy_1 = require("./policy");
/**
 * Scenario used throughout:
 *
 *   Grace (person_grace) founds Grace Robotics (org_grace_co).
 *   MakeHaven (org_mh) runs a program she's in and logged a meeting with her venture.
 *   Foundation (org_ef) received a referral about her from MakeHaven.
 *   IP Factory (org_ipf) has never worked with her.
 *   Sam (person_sam) is an unrelated founder who opted into the directory.
 */
const ECO = 'eco_test';
const baseData = () => ({
    people: [
        {
            id: 'person_grace', first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com',
            system_role: 'entrepreneur', organization_id: 'org_grace_co',
            external_refs: [
                { source: 'mh_crm', id: 'MH-1', owner_org_id: 'org_mh' },
                { source: 'ef_tracker', id: 'EF-9', owner_org_id: 'org_ef' },
            ],
        },
        { id: 'person_sam', first_name: 'Sam', last_name: 'Solo', email: 'sam@example.com', system_role: 'entrepreneur', organization_id: 'org_sam_co' },
        {
            id: 'staff_mh', first_name: 'Mia', last_name: 'Staff', email: 'mia@mh.org', system_role: 'eso_staff', organization_id: 'org_mh',
            organization_affiliations: [{ organization_id: 'org_mh', relationship_type: 'employee', status: 'active' }],
        },
        { id: 'staff_ef', first_name: 'Eli', last_name: 'Staff', email: 'eli@ef.org', system_role: 'eso_staff', organization_id: 'org_ef' },
        { id: 'staff_ipf', first_name: 'Ivy', last_name: 'Staff', email: 'ivy@ipf.org', system_role: 'eso_staff', organization_id: 'org_ipf' },
    ],
    organizations: [
        { id: 'org_mh', name: 'MakeHaven', roles: ['eso'], external_refs: [{ source: 'ef_tracker', id: 'EF-ORG-2', owner_org_id: 'org_ef' }] },
        { id: 'org_ef', name: 'Foundation', roles: ['eso', 'funder'] },
        { id: 'org_ipf', name: 'IP Factory', roles: ['eso'] },
        { id: 'org_grace_co', name: 'Grace Robotics', roles: [], external_refs: [{ source: 'mh_crm', id: 'MH-ORG-7', owner_org_id: 'org_mh' }] },
        { id: 'org_sam_co', name: 'Solo Ventures', roles: [] },
    ],
    interactions: [
        {
            id: 'int_mh_shared', organization_id: 'org_grace_co', author_org_id: 'org_mh', ecosystem_id: ECO,
            type: 'meeting', date: '2026-09-01', visibility: 'network_shared', note_confidential: false,
            notes: 'Discussed cash runway — confidential', attendees: ['Grace'], recorded_by: 'Mia',
        },
        {
            id: 'int_mh_private', organization_id: 'org_grace_co', author_org_id: 'org_mh', ecosystem_id: ECO,
            type: 'call', date: '2026-09-02', visibility: 'eso_private', note_confidential: true, notes: 'Private call',
        },
    ],
    participations: [
        {
            id: 'part_mh', provider_org_id: 'org_mh', recipient_person_id: 'person_grace', ecosystem_id: ECO,
            name: 'Hardware Accelerator Cohort 3', participation_type: 'program', status: 'active', start_date: '2026-06-01',
            description: 'Internal cohort description',
        },
    ],
    referrals: [
        {
            id: 'ref_mh_to_ef', referring_org_id: 'org_mh', receiving_org_id: 'org_ef', subject_person_id: 'person_grace',
            subject_org_id: 'org_grace_co', status: 'accepted', date: '2026-09-03', ecosystem_id: ECO,
            notes: 'Grace needs a patent attorney', response_notes: 'We have one', outcome: 'service_delivered', owner_id: 'staff_ef',
        },
    ],
    consentGrants: [],
    directoryListedPersonIds: ['person_sam'],
});
const staff = (orgId, personId) => ({ personId, orgId, role: 'eso_staff', ecosystemId: ECO });
const find = (list, id) => list.find((x) => x.id === id);
(0, node_test_1.describe)('computeWorksWith', () => {
    (0, node_test_1.it)('links an org to the people and ventures it has recorded something about', () => {
        const keys = (0, policy_1.computeWorksWith)('org_mh', baseData());
        strict_1.default.ok(keys.has('p:person_grace'));
        strict_1.default.ok(keys.has('o:org_grace_co'));
        strict_1.default.ok(!keys.has('p:person_sam'));
    });
    (0, node_test_1.it)('counts the receiving org of a live referral, not of a declined one', () => {
        const data = baseData();
        strict_1.default.ok((0, policy_1.computeWorksWith)('org_ef', data).has('p:person_grace'));
        data.referrals[0].status = 'rejected';
        // EF also pushed Grace from its own system in the base scenario; remove
        // that so the referral is the only link.
        data.people[0].external_refs = data.people[0].external_refs.filter((ref) => ref.owner_org_id !== 'org_ef');
        strict_1.default.ok(!(0, policy_1.computeWorksWith)('org_ef', data).has('p:person_grace'));
    });
    (0, node_test_1.it)('gives an unrelated org no relationship', () => {
        const keys = (0, policy_1.computeWorksWith)('org_ipf', baseData());
        strict_1.default.equal(keys.size, 0);
    });
});
(0, node_test_1.describe)('notes are never shared', () => {
    (0, node_test_1.it)('the authoring org sees its own notes in full', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), baseData());
        const i = find(view.interactions, 'int_mh_shared');
        strict_1.default.equal(i._access, 'full');
        strict_1.default.equal(i.notes, 'Discussed cash runway — confidential');
    });
    (0, node_test_1.it)('a partner working with the founder sees the fact, not the notes', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), baseData());
        const i = find(view.interactions, 'int_mh_shared');
        strict_1.default.equal(i._access, 'fact');
        strict_1.default.equal(i.notes, '');
        strict_1.default.equal(i.type, 'meeting');
        strict_1.default.equal(i.author_org_id, 'org_mh');
        strict_1.default.equal(i.attendees, undefined);
        strict_1.default.equal(i.recorded_by, undefined);
    });
    (0, node_test_1.it)('consent unlocks details but still never notes', () => {
        const data = baseData();
        data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: true, ecosystem_id: ECO });
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        const i = find(view.interactions, 'int_mh_shared');
        strict_1.default.equal(i._access, 'detail');
        strict_1.default.equal(i.notes, '');
        strict_1.default.equal(i.attendees, undefined);
    });
    (0, node_test_1.it)('the entrepreneur sees activity about themselves, without staff notes', () => {
        const view = (0, policy_1.buildNetworkView)({ personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur', ecosystemId: ECO }, baseData());
        const i = find(view.interactions, 'int_mh_shared');
        strict_1.default.equal(i._access, 'detail');
        strict_1.default.equal(i.notes, '');
    });
    (0, node_test_1.it)('network operators see facts, never notes', () => {
        const view = (0, policy_1.buildNetworkView)({ personId: 'admin', orgId: null, role: 'ecosystem_manager', ecosystemId: ECO }, baseData());
        strict_1.default.equal(find(view.interactions, 'int_mh_shared').notes, '');
        strict_1.default.equal(find(view.referrals, 'ref_mh_to_ef').notes, '');
    });
});
(0, node_test_1.describe)('the fact of activity is a per-event choice', () => {
    (0, node_test_1.it)('an interaction the author kept private is invisible to everyone else', () => {
        for (const viewer of [
            staff('org_ef', 'staff_ef'),
            { personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur', ecosystemId: ECO },
            { personId: 'admin', orgId: null, role: 'platform_admin', ecosystemId: ECO },
        ]) {
            const view = (0, policy_1.buildNetworkView)(viewer, baseData());
            strict_1.default.equal(find(view.interactions, 'int_mh_private'), undefined, viewer.role);
        }
    });
});
(0, node_test_1.describe)('orgs that do not work with the founder see nothing about them', () => {
    (0, node_test_1.it)('hides the founder, their venture and every record', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), baseData());
        strict_1.default.equal(find(view.people, 'person_grace'), undefined);
        strict_1.default.equal(find(view.organizations, 'org_grace_co'), undefined);
        strict_1.default.equal(view.interactions.length, 0);
        strict_1.default.equal(view.participations.length, 0);
        strict_1.default.equal(view.referrals.length, 0);
    });
    (0, node_test_1.it)('still sees support organizations — they are public within the network', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), baseData());
        strict_1.default.ok(find(view.organizations, 'org_mh'));
        strict_1.default.ok(find(view.organizations, 'org_ef'));
    });
});
(0, node_test_1.describe)('directory listing is consent-gated', () => {
    (0, node_test_1.it)('a founder who opted in is visible to partners who do not work with them — as a directory card', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), baseData());
        const sam = find(view.people, 'person_sam');
        strict_1.default.equal(sam._visibility, 'directory');
        strict_1.default.equal(sam.first_name, 'Sam');
        strict_1.default.equal(sam.email, undefined, 'the directory carries no contact details');
        strict_1.default.equal(sam.external_refs?.length, 0);
        strict_1.default.equal(find(view.organizations, 'org_sam_co')?._visibility, 'directory');
    });
    (0, node_test_1.it)('a founder who did not opt in is not listed', () => {
        const data = baseData();
        data.directoryListedPersonIds = [];
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), data);
        strict_1.default.equal(find(view.people, 'person_sam'), undefined);
        strict_1.default.equal(find(view.organizations, 'org_sam_co'), undefined);
    });
});
(0, node_test_1.describe)('record details need consent', () => {
    (0, node_test_1.it)('without consent a partner sees that a program exists, not its name', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), baseData());
        const p = find(view.participations, 'part_mh');
        strict_1.default.equal(p._access, 'fact');
        strict_1.default.equal(p.name, '');
        strict_1.default.equal(p.description, undefined);
        strict_1.default.equal(p.participation_type, 'program');
        strict_1.default.equal(p.status, 'active');
    });
    (0, node_test_1.it)('with consent a partner sees the program name', () => {
        const data = baseData();
        data.consentGrants.push({ resource_id: 'org_grace_co', viewer_id: 'org_ef', is_active: true, ecosystem_id: ECO });
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(view.participations, 'part_mh').name, 'Hardware Accelerator Cohort 3');
    });
    (0, node_test_1.it)('consent granted in another network does not apply here', () => {
        const data = baseData();
        data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: true, ecosystem_id: 'eco_other' });
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(view.participations, 'part_mh')._access, 'fact');
    });
    (0, node_test_1.it)('a founder who opened this network shares details with every partner they work with', () => {
        const data = baseData();
        data.organizations.find((o) => o.id === 'org_grace_co').operational_visibility_by_ecosystem = { [ECO]: 'open' };
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(view.participations, 'part_mh')._access, 'detail');
        // ...but not with partners who do not work with them.
        strict_1.default.equal((0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), data).participations.length, 0);
    });
    (0, node_test_1.it)('a founder who chose detail sharing on the consent page shares with partners they work with', () => {
        const data = baseData();
        data.detailSharingPersonIds = ['person_grace'];
        strict_1.default.equal(find((0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data).participations, 'part_mh')._access, 'detail');
    });
    (0, node_test_1.it)('the legacy org-wide "open" default is not treated as consent', () => {
        const data = baseData();
        data.organizations.find((o) => o.id === 'org_grace_co').operational_visibility = 'open';
        strict_1.default.equal(find((0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data).participations, 'part_mh')._access, 'fact');
    });
    (0, node_test_1.it)('revoked consent no longer applies', () => {
        const data = baseData();
        data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: false, ecosystem_id: ECO });
        const view = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(view.participations, 'part_mh')._access, 'fact');
    });
});
(0, node_test_1.describe)('referrals', () => {
    (0, node_test_1.it)('both parties see the intro and response notes', () => {
        for (const [org, person] of [['org_mh', 'staff_mh'], ['org_ef', 'staff_ef']]) {
            const r = find((0, policy_1.buildNetworkView)(staff(org, person), baseData()).referrals, 'ref_mh_to_ef');
            strict_1.default.equal(r._access, 'full');
            strict_1.default.equal(r.notes, 'Grace needs a patent attorney');
        }
    });
    (0, node_test_1.it)('a third org working with the founder sees only that a referral happened', () => {
        const data = baseData();
        data.participations.push({ id: 'part_ipf', provider_org_id: 'org_ipf', recipient_person_id: 'person_grace', ecosystem_id: ECO, name: 'IP clinic', status: 'active' });
        const r = find((0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), data).referrals, 'ref_mh_to_ef');
        strict_1.default.equal(r._access, 'fact');
        strict_1.default.equal(r.notes, '');
        strict_1.default.equal(r.response_notes, undefined);
        strict_1.default.equal(r.outcome, undefined);
        strict_1.default.equal(r.owner_id, undefined);
        strict_1.default.equal(r.status, 'accepted');
    });
});
(0, node_test_1.describe)("other organizations' internal IDs are never shared", () => {
    (0, node_test_1.it)('each org sees only its own external_refs on a person', () => {
        const mh = find((0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), baseData()).people, 'person_grace');
        strict_1.default.deepEqual(mh.external_refs, [{ source: 'mh_crm', id: 'MH-1', owner_org_id: 'org_mh' }]);
        const ef = find((0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), baseData()).people, 'person_grace');
        strict_1.default.deepEqual(ef.external_refs, [{ source: 'ef_tracker', id: 'EF-9', owner_org_id: 'org_ef' }]);
    });
    (0, node_test_1.it)('and on organizations', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), baseData());
        strict_1.default.deepEqual(find(view.organizations, 'org_mh').external_refs, []);
        const efView = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), baseData());
        strict_1.default.deepEqual(find(efView.organizations, 'org_mh').external_refs, [{ source: 'ef_tracker', id: 'EF-ORG-2', owner_org_id: 'org_ef' }]);
    });
    (0, node_test_1.it)('operators do not see partners\' IDs either', () => {
        const view = (0, policy_1.buildNetworkView)({ personId: 'admin', orgId: null, role: 'platform_admin', ecosystemId: ECO }, baseData());
        strict_1.default.deepEqual(find(view.people, 'person_grace').external_refs, []);
    });
});
(0, node_test_1.describe)('organizations that have not signed the agreements', () => {
    (0, node_test_1.it)('see their own records but nothing of their partners\'', () => {
        const viewer = { ...staff('org_ef', 'staff_ef'), orgHasSigned: false };
        const view = (0, policy_1.buildNetworkView)(viewer, baseData());
        // EF is a party to the referral, so it still sees its own record in full...
        strict_1.default.equal(find(view.referrals, 'ref_mh_to_ef')._access, 'full');
        // ...but not MakeHaven's activity, participation, or the directory.
        strict_1.default.equal(view.interactions.length, 0);
        strict_1.default.equal(view.participations.length, 0);
        strict_1.default.equal(find(view.people, 'person_sam'), undefined);
    });
});
(0, node_test_1.describe)('leaving the network', () => {
    (0, node_test_1.it)('a withdrawn founder is invisible across organizations, but each keeps its own records', () => {
        const data = baseData();
        data.withdrawnPersonIds = ['person_grace'];
        data.directoryListedPersonIds = ['person_grace', 'person_sam'];
        // Foundation received a referral about Grace and works with her, but sees
        // nothing MakeHaven recorded — not even the fact of the meeting.
        const ef = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(ef.interactions, 'int_mh_shared'), undefined);
        strict_1.default.equal(find(ef.participations, 'part_mh'), undefined);
        strict_1.default.equal(find(ef.referrals, 'ref_mh_to_ef')._access, 'full', 'its own referral is still its own record');
        // MakeHaven keeps its own records with her in full.
        const mh = (0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), data);
        strict_1.default.equal(find(mh.interactions, 'int_mh_shared')._access, 'full');
        strict_1.default.equal(find(mh.participations, 'part_mh')._access, 'full');
        // Not listed, whatever the directory flag says; Sam still is.
        const ipf = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), data);
        strict_1.default.equal(find(ipf.people, 'person_grace'), undefined);
        strict_1.default.ok(find(ipf.people, 'person_sam'));
        // Operators see no facts about her either.
        const ops = (0, policy_1.buildNetworkView)({ personId: 'admin', orgId: null, role: 'ecosystem_manager', ecosystemId: ECO }, data);
        strict_1.default.equal(find(ops.interactions, 'int_mh_shared'), undefined);
        // She still sees her own history.
        const grace = (0, policy_1.buildNetworkView)({ personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur', ecosystemId: ECO }, data);
        strict_1.default.ok(find(grace.interactions, 'int_mh_shared'));
    });
});
(0, node_test_1.describe)('email only once an organization needs it', () => {
    (0, node_test_1.it)('an organization working with the founder sees their email', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), baseData());
        strict_1.default.equal(find(view.people, 'person_grace').email, 'grace@example.com');
    });
    (0, node_test_1.it)('the receiver of a referral it has not yet accepted sees the person, not their email', () => {
        const data = baseData();
        data.referrals[0].status = 'pending';
        data.people[0].external_refs = data.people[0].external_refs.filter((ref) => ref.owner_org_id !== 'org_ef');
        const pending = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        const grace = find(pending.people, 'person_grace');
        strict_1.default.equal(grace._visibility, 'works_with');
        strict_1.default.equal(grace.email, undefined);
        strict_1.default.ok(find(pending.referrals, 'ref_mh_to_ef'), 'the referral itself, with its intro note, is theirs to read');
        data.referrals[0].status = 'accepted';
        const accepted = (0, policy_1.buildNetworkView)(staff('org_ef', 'staff_ef'), data);
        strict_1.default.equal(find(accepted.people, 'person_grace').email, 'grace@example.com');
    });
    (0, node_test_1.it)('the directory carries no contact details', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_ipf', 'staff_ipf'), baseData());
        const sam = find(view.people, 'person_sam');
        strict_1.default.equal(sam._visibility, 'directory');
        strict_1.default.equal(sam.first_name, 'Sam');
        strict_1.default.equal(sam.email, undefined);
        const samCo = find(view.organizations, 'org_sam_co');
        strict_1.default.equal(samCo._visibility, 'directory');
        strict_1.default.equal(samCo.email, undefined);
    });
});
(0, node_test_1.describe)('who is in the network', () => {
    (0, node_test_1.it)('marks support organizations as signed members or not, for founders to see', () => {
        const data = { ...baseData(), signedOrgIds: ['org_mh', 'org_ef'] };
        const view = (0, policy_1.buildNetworkView)({ personId: 'person_grace', orgId: null, role: 'entrepreneur', ecosystemId: ECO }, data);
        strict_1.default.equal(find(view.organizations, 'org_mh')._compact_signed, true);
        strict_1.default.equal(find(view.organizations, 'org_ipf')._compact_signed, false);
        strict_1.default.equal(find(view.organizations, 'org_grace_co')._compact_signed, undefined, 'ventures are not members');
    });
    (0, node_test_1.it)('says nothing when the caller did not load signatures', () => {
        const view = (0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), baseData());
        strict_1.default.equal(find(view.organizations, 'org_ef')._compact_signed, undefined);
    });
});
(0, node_test_1.describe)('founder <-> venture linkage', () => {
    (0, node_test_1.it)('working with the venture means working with its founder', () => {
        const data = baseData();
        data.participations = [];
        data.referrals = [];
        // Only an interaction with the venture org.
        const view = (0, policy_1.buildNetworkView)(staff('org_mh', 'staff_mh'), data);
        strict_1.default.equal(find(view.people, 'person_grace')?._visibility, 'works_with');
    });
});
