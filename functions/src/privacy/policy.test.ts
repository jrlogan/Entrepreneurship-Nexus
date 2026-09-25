import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetworkView, computeWorksWith, type NetworkData, type Viewer } from './policy';

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

const baseData = (): NetworkData => ({
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

const staff = (orgId: string, personId: string): Viewer => ({ personId, orgId, role: 'eso_staff', ecosystemId: ECO });
const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);

describe('computeWorksWith', () => {
  it('links an org to the people and ventures it has recorded something about', () => {
    const keys = computeWorksWith('org_mh', baseData());
    assert.ok(keys.has('p:person_grace'));
    assert.ok(keys.has('o:org_grace_co'));
    assert.ok(!keys.has('p:person_sam'));
  });

  it('counts the receiving org of a live referral, not of a declined one', () => {
    const data = baseData();
    assert.ok(computeWorksWith('org_ef', data).has('p:person_grace'));
    data.referrals[0].status = 'rejected';
    // EF also pushed Grace from its own system in the base scenario; remove
    // that so the referral is the only link.
    data.people[0].external_refs = data.people[0].external_refs!.filter((ref) => ref.owner_org_id !== 'org_ef');
    assert.ok(!computeWorksWith('org_ef', data).has('p:person_grace'));
  });

  it('gives an unrelated org no relationship', () => {
    const keys = computeWorksWith('org_ipf', baseData());
    assert.equal(keys.size, 0);
  });
});

describe('notes are never shared', () => {
  it('the authoring org sees its own notes in full', () => {
    const view = buildNetworkView(staff('org_mh', 'staff_mh'), baseData());
    const i = find(view.interactions, 'int_mh_shared')!;
    assert.equal(i._access, 'full');
    assert.equal(i.notes, 'Discussed cash runway — confidential');
  });

  it('a partner working with the founder sees the fact, not the notes', () => {
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), baseData());
    const i = find(view.interactions, 'int_mh_shared')!;
    assert.equal(i._access, 'fact');
    assert.equal(i.notes, '');
    assert.equal(i.type, 'meeting');
    assert.equal(i.author_org_id, 'org_mh');
    assert.equal(i.attendees, undefined);
    assert.equal(i.recorded_by, undefined);
  });

  it('consent unlocks details but still never notes', () => {
    const data = baseData();
    data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: true, ecosystem_id: ECO });
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    const i = find(view.interactions, 'int_mh_shared')!;
    assert.equal(i._access, 'detail');
    assert.equal(i.notes, '');
    assert.equal(i.attendees, undefined);
  });

  it('the entrepreneur sees activity about themselves, without staff notes', () => {
    const view = buildNetworkView({ personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur', ecosystemId: ECO }, baseData());
    const i = find(view.interactions, 'int_mh_shared')!;
    assert.equal(i._access, 'detail');
    assert.equal(i.notes, '');
  });

  it('network operators see facts, never notes', () => {
    const view = buildNetworkView({ personId: 'admin', orgId: null, role: 'ecosystem_manager', ecosystemId: ECO }, baseData());
    assert.equal(find(view.interactions, 'int_mh_shared')!.notes, '');
    assert.equal(find(view.referrals, 'ref_mh_to_ef')!.notes, '');
  });
});

describe('the fact of activity is a per-event choice', () => {
  it('an interaction the author kept private is invisible to everyone else', () => {
    for (const viewer of [
      staff('org_ef', 'staff_ef'),
      { personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur' as const, ecosystemId: ECO },
      { personId: 'admin', orgId: null, role: 'platform_admin' as const, ecosystemId: ECO },
    ]) {
      const view = buildNetworkView(viewer, baseData());
      assert.equal(find(view.interactions, 'int_mh_private'), undefined, viewer.role);
    }
  });
});

describe('orgs that do not work with the founder see nothing about them', () => {
  it('hides the founder, their venture and every record', () => {
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), baseData());
    assert.equal(find(view.people, 'person_grace'), undefined);
    assert.equal(find(view.organizations, 'org_grace_co'), undefined);
    assert.equal(view.interactions.length, 0);
    assert.equal(view.participations.length, 0);
    assert.equal(view.referrals.length, 0);
  });

  it('still sees support organizations — they are public within the network', () => {
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), baseData());
    assert.ok(find(view.organizations, 'org_mh'));
    assert.ok(find(view.organizations, 'org_ef'));
  });
});

describe('directory listing is consent-gated', () => {
  it('a founder who opted in is visible to partners who do not work with them — as a directory card', () => {
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), baseData());
    const sam = find(view.people, 'person_sam')!;
    assert.equal(sam._visibility, 'directory');
    assert.equal(sam.first_name, 'Sam');
    assert.equal(sam.email, undefined, 'the directory carries no contact details');
    assert.equal(sam.external_refs?.length, 0);
    assert.equal(find(view.organizations, 'org_sam_co')?._visibility, 'directory');
  });

  it('a founder who did not opt in is not listed', () => {
    const data = baseData();
    data.directoryListedPersonIds = [];
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), data);
    assert.equal(find(view.people, 'person_sam'), undefined);
    assert.equal(find(view.organizations, 'org_sam_co'), undefined);
  });
});

describe('record details need consent', () => {
  it('without consent a partner sees that a program exists, not its name', () => {
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), baseData());
    const p = find(view.participations, 'part_mh')!;
    assert.equal(p._access, 'fact');
    assert.equal(p.name, '');
    assert.equal(p.description, undefined);
    assert.equal(p.participation_type, 'program');
    assert.equal(p.status, 'active');
  });

  it('with consent a partner sees the program name', () => {
    const data = baseData();
    data.consentGrants.push({ resource_id: 'org_grace_co', viewer_id: 'org_ef', is_active: true, ecosystem_id: ECO });
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(view.participations, 'part_mh')!.name, 'Hardware Accelerator Cohort 3');
  });

  it('consent granted in another network does not apply here', () => {
    const data = baseData();
    data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: true, ecosystem_id: 'eco_other' });
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(view.participations, 'part_mh')!._access, 'fact');
  });

  it('a founder who opened this network shares details with every partner they work with', () => {
    const data = baseData();
    data.organizations.find((o) => o.id === 'org_grace_co')!.operational_visibility_by_ecosystem = { [ECO]: 'open' };
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(view.participations, 'part_mh')!._access, 'detail');
    // ...but not with partners who do not work with them.
    assert.equal(buildNetworkView(staff('org_ipf', 'staff_ipf'), data).participations.length, 0);
  });

  it('a founder who chose detail sharing on the consent page shares with partners they work with', () => {
    const data = baseData();
    data.detailSharingPersonIds = ['person_grace'];
    assert.equal(find(buildNetworkView(staff('org_ef', 'staff_ef'), data).participations, 'part_mh')!._access, 'detail');
  });

  it('the legacy org-wide "open" default is not treated as consent', () => {
    const data = baseData();
    data.organizations.find((o) => o.id === 'org_grace_co')!.operational_visibility = 'open';
    assert.equal(find(buildNetworkView(staff('org_ef', 'staff_ef'), data).participations, 'part_mh')!._access, 'fact');
  });

  it('revoked consent no longer applies', () => {
    const data = baseData();
    data.consentGrants.push({ resource_id: 'person_grace', viewer_id: 'org_ef', is_active: false, ecosystem_id: ECO });
    const view = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(view.participations, 'part_mh')!._access, 'fact');
  });
});

describe('referrals', () => {
  it('both parties see the intro and response notes', () => {
    for (const [org, person] of [['org_mh', 'staff_mh'], ['org_ef', 'staff_ef']]) {
      const r = find(buildNetworkView(staff(org, person), baseData()).referrals, 'ref_mh_to_ef')!;
      assert.equal(r._access, 'full');
      assert.equal(r.notes, 'Grace needs a patent attorney');
    }
  });

  it('a third org working with the founder sees only that a referral happened', () => {
    const data = baseData();
    data.participations.push({ id: 'part_ipf', provider_org_id: 'org_ipf', recipient_person_id: 'person_grace', ecosystem_id: ECO, name: 'IP clinic', status: 'active' });
    const r = find(buildNetworkView(staff('org_ipf', 'staff_ipf'), data).referrals, 'ref_mh_to_ef')!;
    assert.equal(r._access, 'fact');
    assert.equal(r.notes, '');
    assert.equal(r.response_notes, undefined);
    assert.equal(r.outcome, undefined);
    assert.equal(r.owner_id, undefined);
    assert.equal(r.status, 'accepted');
  });
});

describe("other organizations' internal IDs are never shared", () => {
  it('each org sees only its own external_refs on a person', () => {
    const mh = find(buildNetworkView(staff('org_mh', 'staff_mh'), baseData()).people, 'person_grace')!;
    assert.deepEqual(mh.external_refs, [{ source: 'mh_crm', id: 'MH-1', owner_org_id: 'org_mh' }]);
    const ef = find(buildNetworkView(staff('org_ef', 'staff_ef'), baseData()).people, 'person_grace')!;
    assert.deepEqual(ef.external_refs, [{ source: 'ef_tracker', id: 'EF-9', owner_org_id: 'org_ef' }]);
  });

  it('and on organizations', () => {
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), baseData());
    assert.deepEqual(find(view.organizations, 'org_mh')!.external_refs, []);
    const efView = buildNetworkView(staff('org_ef', 'staff_ef'), baseData());
    assert.deepEqual(find(efView.organizations, 'org_mh')!.external_refs, [{ source: 'ef_tracker', id: 'EF-ORG-2', owner_org_id: 'org_ef' }]);
  });

  it('operators do not see partners\' IDs either', () => {
    const view = buildNetworkView({ personId: 'admin', orgId: null, role: 'platform_admin', ecosystemId: ECO }, baseData());
    assert.deepEqual(find(view.people, 'person_grace')!.external_refs, []);
  });
});

describe('organizations that have not signed the agreements', () => {
  it('see their own records but nothing of their partners\'', () => {
    const viewer = { ...staff('org_ef', 'staff_ef'), orgHasSigned: false };
    const view = buildNetworkView(viewer, baseData());
    // EF is a party to the referral, so it still sees its own record in full...
    assert.equal(find(view.referrals, 'ref_mh_to_ef')!._access, 'full');
    // ...but not MakeHaven's activity, participation, or the directory.
    assert.equal(view.interactions.length, 0);
    assert.equal(view.participations.length, 0);
    assert.equal(find(view.people, 'person_sam'), undefined);
  });
});

describe('leaving the network', () => {
  it('a withdrawn founder is invisible across organizations, but each keeps its own records', () => {
    const data = baseData();
    data.withdrawnPersonIds = ['person_grace'];
    data.directoryListedPersonIds = ['person_grace', 'person_sam'];
    // Foundation received a referral about Grace and works with her, but sees
    // nothing MakeHaven recorded — not even the fact of the meeting.
    const ef = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(ef.interactions, 'int_mh_shared'), undefined);
    assert.equal(find(ef.participations, 'part_mh'), undefined);
    assert.equal(find(ef.referrals, 'ref_mh_to_ef')!._access, 'full', 'its own referral is still its own record');
    // MakeHaven keeps its own records with her in full.
    const mh = buildNetworkView(staff('org_mh', 'staff_mh'), data);
    assert.equal(find(mh.interactions, 'int_mh_shared')!._access, 'full');
    assert.equal(find(mh.participations, 'part_mh')!._access, 'full');
    // Not listed, whatever the directory flag says; Sam still is.
    const ipf = buildNetworkView(staff('org_ipf', 'staff_ipf'), data);
    assert.equal(find(ipf.people, 'person_grace'), undefined);
    assert.ok(find(ipf.people, 'person_sam'));
    // Operators see no facts about her either.
    const ops = buildNetworkView({ personId: 'admin', orgId: null, role: 'ecosystem_manager', ecosystemId: ECO }, data);
    assert.equal(find(ops.interactions, 'int_mh_shared'), undefined);
    // She still sees her own history.
    const grace = buildNetworkView({ personId: 'person_grace', orgId: 'org_grace_co', role: 'entrepreneur', ecosystemId: ECO }, data);
    assert.ok(find(grace.interactions, 'int_mh_shared'));
  });
});

describe('email only once an organization needs it', () => {
  it('an organization working with the founder sees their email', () => {
    const view = buildNetworkView(staff('org_mh', 'staff_mh'), baseData());
    assert.equal(find(view.people, 'person_grace')!.email, 'grace@example.com');
  });

  it('the receiver of a referral it has not yet accepted sees the person, not their email', () => {
    const data = baseData();
    data.referrals[0].status = 'pending';
    data.people[0].external_refs = data.people[0].external_refs!.filter((ref) => ref.owner_org_id !== 'org_ef');
    const pending = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    const grace = find(pending.people, 'person_grace')!;
    assert.equal(grace._visibility, 'works_with');
    assert.equal(grace.email, undefined);
    assert.ok(find(pending.referrals, 'ref_mh_to_ef'), 'the referral itself, with its intro note, is theirs to read');

    data.referrals[0].status = 'accepted';
    const accepted = buildNetworkView(staff('org_ef', 'staff_ef'), data);
    assert.equal(find(accepted.people, 'person_grace')!.email, 'grace@example.com');
  });

  it('the directory carries no contact details', () => {
    const view = buildNetworkView(staff('org_ipf', 'staff_ipf'), baseData());
    const sam = find(view.people, 'person_sam')!;
    assert.equal(sam._visibility, 'directory');
    assert.equal(sam.first_name, 'Sam');
    assert.equal(sam.email, undefined);
    const samCo = find(view.organizations, 'org_sam_co')!;
    assert.equal(samCo._visibility, 'directory');
    assert.equal(samCo.email, undefined);
  });
});

describe('who is in the network', () => {
  it('marks support organizations as signed members or not, for founders to see', () => {
    const data = { ...baseData(), signedOrgIds: ['org_mh', 'org_ef'] };
    const view = buildNetworkView({ personId: 'person_grace', orgId: null, role: 'entrepreneur', ecosystemId: ECO }, data);
    assert.equal(find(view.organizations, 'org_mh')!._compact_signed, true);
    assert.equal(find(view.organizations, 'org_ipf')!._compact_signed, false);
    assert.equal(find(view.organizations, 'org_grace_co')!._compact_signed, undefined, 'ventures are not members');
  });

  it('says nothing when the caller did not load signatures', () => {
    const view = buildNetworkView(staff('org_mh', 'staff_mh'), baseData());
    assert.equal(find(view.organizations, 'org_ef')!._compact_signed, undefined);
  });
});

describe('referral partners get referrals and nothing else', () => {
  // IP Factory becomes a referral partner (say, a law firm) that MakeHaven
  // refers Grace to. Sam is listed in the directory; Grace is not.
  const partnerData = (status: string): NetworkData => {
    const data = baseData();
    data.organizations.find((o) => o.id === 'org_ipf')!.membership_tier = 'referral_partner';
    data.referrals.push({
      id: 'ref_mh_to_ipf', referring_org_id: 'org_mh', receiving_org_id: 'org_ipf', subject_person_id: 'person_grace',
      subject_org_id: 'org_grace_co', status, date: '2026-09-10', ecosystem_id: ECO, notes: 'Needs a patent attorney',
    });
    return data;
  };
  const partner: Viewer = { personId: 'staff_ipf', orgId: 'org_ipf', role: 'eso_staff', ecosystemId: ECO, orgTier: 'referral_partner' };

  it('sees the referral and the person once accepted — with email — but no other organization\'s records', () => {
    const view = buildNetworkView(partner, partnerData('accepted'));
    assert.equal(find(view.referrals, 'ref_mh_to_ipf')!._access, 'full');
    const grace = find(view.people, 'person_grace')!;
    assert.equal(grace._visibility, 'works_with');
    assert.equal(grace.email, 'grace@example.com');
    assert.equal(find(view.organizations, 'org_grace_co')!._visibility, 'works_with');
    // MakeHaven's meeting and program with Grace: a member would see the fact; a referral partner sees nothing.
    assert.equal(find(view.interactions, 'int_mh_shared'), undefined);
    assert.equal(find(view.participations, 'part_mh'), undefined);
    assert.equal(find(view.referrals, 'ref_mh_to_ef'), undefined);
  });

  it('before accepting, sees the referral but not the person\'s contact details', () => {
    const view = buildNetworkView(partner, partnerData('pending'));
    assert.ok(find(view.referrals, 'ref_mh_to_ipf'));
    assert.equal(find(view.people, 'person_grace'), undefined);
  });

  it('never sees the directory', () => {
    const view = buildNetworkView(partner, partnerData('accepted'));
    assert.equal(find(view.people, 'person_sam'), undefined);
    assert.equal(find(view.organizations, 'org_sam_co'), undefined);
  });

  it('pushing or claiming a person gains it nothing', () => {
    const data = partnerData('accepted');
    data.people[1].created_by_org_id = 'org_ipf'; // Sam, "pushed" by the partner
    const view = buildNetworkView(partner, data);
    assert.equal(find(view.people, 'person_sam'), undefined);
  });

  it('members and founders can tell a referral partner from a member', () => {
    const data = { ...partnerData('accepted'), signedOrgIds: ['org_mh', 'org_ef', 'org_ipf'] };
    const view = buildNetworkView({ personId: 'person_grace', orgId: null, role: 'entrepreneur', ecosystemId: ECO }, data);
    assert.equal(find(view.organizations, 'org_ipf')!._membership_tier, 'referral_partner');
    assert.equal(find(view.organizations, 'org_mh')!._membership_tier, 'member');
  });
});

describe('founder <-> venture linkage', () => {
  it('working with the venture means working with its founder', () => {
    const data = baseData();
    data.participations = [];
    data.referrals = [];
    // Only an interaction with the venture org.
    const view = buildNetworkView(staff('org_mh', 'staff_mh'), data);
    assert.equal(find(view.people, 'person_grace')?._visibility, 'works_with');
  });
});
