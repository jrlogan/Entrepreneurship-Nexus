/**
 * Firestore security rules tests.
 *
 * These run against the Firestore emulator and verify the server-side half of
 * the privacy model: that nobody can read around getNetworkView with the raw
 * SDK. What getNetworkView itself returns is tested in
 * functions/src/privacy/policy.test.ts.
 *
 * Requires the emulator:
 *   firebase emulators:start --only firestore
 * Run with:
 *   npm run test:rules
 * or boot the emulator automatically:
 *   npm run test:rules:emulated
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'nexus-rules-test';
const ECO_A = 'eco_a';
const ECO_B = 'eco_b';
const ORG_A = 'org_a';           // an ESO
const ORG_B = 'org_b';           // another ESO in the same network
const VENTURE = 'org_venture';   // a founder's venture, managed by ORG_A

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 58080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const person = (id: string, role: string, orgId: string, ecos: string[]) =>
      setDoc(doc(db, `people/${id}`), {
        id,
        system_role: role,
        organization_id: orgId,
        primary_organization_id: orgId,
        ecosystem_id: ecos[0],
        ecosystem_ids: ecos,
      });

    await person('staff_a', 'eso_staff', ORG_A, [ECO_A]);
    await person('staff_b', 'eso_staff', ORG_B, [ECO_A]);          // same network, different org
    await person('staff_c', 'eso_staff', 'org_c', [ECO_A]);         // an uninvolved third org
    await person('founder', 'entrepreneur', VENTURE, [ECO_A]);
    await person('manager', 'ecosystem_manager', 'org_network', [ECO_A]);
    await person('admin', 'platform_admin', 'org_network', [ECO_A]);
    // Legacy person doc written before ecosystem_ids denormalization existed.
    await setDoc(doc(db, 'people/legacy_a'), {
      id: 'legacy_a', system_role: 'eso_staff', organization_id: ORG_A, primary_organization_id: ORG_A, ecosystem_id: ECO_A,
    });

    await setDoc(doc(db, `organizations/${ORG_A}`), { id: ORG_A, name: 'Org A', roles: ['eso'], ecosystem_ids: [ECO_A], managed_by_ids: [] });
    await setDoc(doc(db, `organizations/${ORG_B}`), { id: ORG_B, name: 'Org B', roles: ['eso'], ecosystem_ids: [ECO_A], managed_by_ids: [] });
    await setDoc(doc(db, `organizations/${VENTURE}`), {
      id: VENTURE, name: 'Venture', roles: [], ecosystem_ids: [ECO_A], managed_by_ids: [ORG_A],
      external_refs: [{ source: 'a_crm', id: 'A-1', owner_org_id: ORG_A }],
    });

    await setDoc(doc(db, 'interactions/int_a'), {
      id: 'int_a', ecosystem_id: ECO_A, organization_id: VENTURE, author_org_id: ORG_A,
      visibility: 'network_shared', note_confidential: false, notes: 'Founder is worried about runway',
    });

    await setDoc(doc(db, 'referrals/ref_a_to_b'), {
      id: 'ref_a_to_b', ecosystem_id: ECO_A, referring_org_id: ORG_A, receiving_org_id: ORG_B,
      subject_person_id: 'founder', subject_org_id: VENTURE, status: 'pending', notes: 'Needs a patent attorney',
    });

    await setDoc(doc(db, 'participations/part_a'), {
      id: 'part_a', ecosystem_id: ECO_A, provider_org_id: ORG_A, recipient_person_id: 'founder',
      name: 'Accelerator Cohort 3', participation_type: 'program', status: 'active',
    });

    await setDoc(doc(db, 'network_profiles/founder'), {
      person_id: 'founder', ecosystem_ids: [ECO_A], directory_listed_ecosystems: [],
    });

    await setDoc(doc(db, 'consent_policies/pol_1'), {
      id: 'pol_1', resource_id: VENTURE, viewer_id: ORG_B, is_active: true, ecosystem_id: ECO_A,
    });

    await setDoc(doc(db, 'ecosystems/eco_a'), { id: ECO_A, name: 'Ecosystem A' });
  });
});

const authed = (uid: string) => testEnv.authenticatedContext(uid).firestore();

describe('interaction notes stay with the authoring organization', () => {
  it('the author organization can read its own interaction', async () => {
    await assertSucceeds(getDoc(doc(authed('staff_a'), 'interactions/int_a')));
  });

  it('the author can list its own interactions with an author filter', async () => {
    await assertSucceeds(getDocs(query(collection(authed('staff_a'), 'interactions'), where('author_org_id', '==', ORG_A))));
  });

  it('a partner in the same network cannot read it directly', async () => {
    await assertFails(getDoc(doc(authed('staff_b'), 'interactions/int_a')));
  });

  it('a network-wide list is refused — the old read path', async () => {
    await assertFails(getDocs(query(collection(authed('staff_b'), 'interactions'), where('ecosystem_id', '==', ECO_A))));
  });

  it('the entrepreneur cannot read staff notes about them directly', async () => {
    await assertFails(getDoc(doc(authed('founder'), 'interactions/int_a')));
  });

  it('network operators cannot read notes directly either', async () => {
    await assertFails(getDoc(doc(authed('manager'), 'interactions/int_a')));
    await assertFails(getDoc(doc(authed('admin'), 'interactions/int_a')));
  });

  it('works for legacy person docs without ecosystem_ids', async () => {
    await assertSucceeds(getDoc(doc(authed('legacy_a'), 'interactions/int_a')));
  });

  it('blocks unauthenticated reads', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'interactions/int_a')));
  });
});

describe('interaction write integrity', () => {
  it('blocks authoring an interaction attributed to another org', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'interactions/forged'), {
      id: 'forged', ecosystem_id: ECO_A, organization_id: VENTURE, author_org_id: ORG_B, notes: 'forged',
    }));
  });

  it("allows authoring an interaction attributed to the caller's own org", async () => {
    await assertSucceeds(setDoc(doc(authed('staff_a'), 'interactions/mine'), {
      id: 'mine', ecosystem_id: ECO_A, organization_id: VENTURE, author_org_id: ORG_A, notes: 'legitimate note',
    }));
  });

  it('blocks reassigning authorship on update', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'interactions/int_a'), {
      id: 'int_a', ecosystem_id: ECO_A, organization_id: VENTURE, author_org_id: ORG_B, notes: 'stolen',
    }));
  });
});

describe('referrals are readable by their two parties', () => {
  it('the referring and receiving organizations can read it', async () => {
    await assertSucceeds(getDoc(doc(authed('staff_a'), 'referrals/ref_a_to_b')));
    await assertSucceeds(getDoc(doc(authed('staff_b'), 'referrals/ref_a_to_b')));
  });

  it('each party can list its own side with a party filter', async () => {
    await assertSucceeds(getDocs(query(collection(authed('staff_b'), 'referrals'), where('receiving_org_id', '==', ORG_B))));
    await assertSucceeds(getDocs(query(collection(authed('staff_a'), 'referrals'), where('referring_org_id', '==', ORG_A))));
  });

  it('a network-wide referral list is refused', async () => {
    await assertFails(getDocs(query(collection(authed('staff_a'), 'referrals'), where('ecosystem_id', '==', ECO_A))));
  });

  it('a third party cannot read it directly', async () => {
    await assertFails(getDoc(doc(authed('staff_c'), 'referrals/ref_a_to_b')));
    await assertFails(getDoc(doc(authed('manager'), 'referrals/ref_a_to_b')));
  });

  it('allows creating a referral from your own org in your own network', async () => {
    await assertSucceeds(setDoc(doc(authed('staff_a'), 'referrals/ref_new'), {
      id: 'ref_new', ecosystem_id: ECO_A, referring_org_id: ORG_A, receiving_org_id: ORG_B, subject_org_id: VENTURE, status: 'pending',
    }));
  });

  it('blocks creating a referral into a network you are not in', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'referrals/ref_cross'), {
      id: 'ref_cross', ecosystem_id: ECO_B, referring_org_id: ORG_A, receiving_org_id: ORG_B, subject_org_id: VENTURE, status: 'pending',
    }));
  });
});

describe('participation is readable by the providing organization', () => {
  it('the provider can read and list its own', async () => {
    await assertSucceeds(getDoc(doc(authed('staff_a'), 'participations/part_a')));
    await assertSucceeds(getDocs(query(collection(authed('staff_a'), 'participations'), where('provider_org_id', '==', ORG_A))));
  });

  it('other partners cannot read the program details directly', async () => {
    await assertFails(getDoc(doc(authed('staff_b'), 'participations/part_a')));
  });

  it('a provider records participation for its own programs only', async () => {
    await assertSucceeds(setDoc(doc(authed('staff_a'), 'participations/part_new'), {
      id: 'part_new', ecosystem_id: ECO_A, provider_org_id: ORG_A, recipient_person_id: 'founder', participation_type: 'program', status: 'active',
    }));
    await assertFails(setDoc(doc(authed('staff_a'), 'participations/part_forged'), {
      id: 'part_forged', ecosystem_id: ECO_A, provider_org_id: ORG_B, recipient_person_id: 'founder', participation_type: 'program', status: 'active',
    }));
  });
});

describe('ventures and the directory', () => {
  it('support organizations are readable by any member', async () => {
    await assertSucceeds(getDoc(doc(authed('staff_b'), `organizations/${ORG_A}`)));
    await assertSucceeds(getDoc(doc(authed('founder'), `organizations/${ORG_B}`)));
  });

  it('a venture is readable by its founder and the ESO managing it', async () => {
    await assertSucceeds(getDoc(doc(authed('founder'), `organizations/${VENTURE}`)));
    await assertSucceeds(getDoc(doc(authed('staff_a'), `organizations/${VENTURE}`)));
  });

  it("a venture is not readable directly by an unrelated partner (it carries partners' IDs)", async () => {
    await assertFails(getDoc(doc(authed('staff_b'), `organizations/${VENTURE}`)));
  });

  it('a directory profile is private to its owner and operators', async () => {
    await assertSucceeds(getDoc(doc(authed('founder'), 'network_profiles/founder')));
    await assertSucceeds(getDoc(doc(authed('manager'), 'network_profiles/founder')));
    await assertFails(getDoc(doc(authed('staff_b'), 'network_profiles/founder')));
  });

  it('the founder can change their own directory listing', async () => {
    await assertSucceeds(setDoc(doc(authed('founder'), 'network_profiles/founder'), {
      person_id: 'founder', ecosystem_ids: [ECO_A], directory_listed_ecosystems: [ECO_A],
    }));
  });
});

describe('consent records are private to their parties', () => {
  it('the entrepreneur and the named partner can read the grant', async () => {
    await assertSucceeds(getDoc(doc(authed('founder'), 'consent_policies/pol_1')));
    await assertSucceeds(getDoc(doc(authed('staff_b'), 'consent_policies/pol_1')));
  });

  it('an uninvolved partner cannot see who shares with whom', async () => {
    await assertFails(getDoc(doc(authed('staff_a'), 'consent_policies/pol_1')));
  });

  it('only the entrepreneur side can grant', async () => {
    await assertSucceeds(setDoc(doc(authed('founder'), 'consent_policies/pol_new'), {
      id: 'pol_new', resource_id: VENTURE, viewer_id: ORG_A, is_active: true, ecosystem_id: ECO_A,
    }));
    await assertSucceeds(setDoc(doc(authed('founder'), 'consent_policies/pol_person'), {
      id: 'pol_person', resource_id: 'founder', viewer_id: ORG_A, is_active: true, ecosystem_id: ECO_A,
    }));
    // A partner cannot grant itself access to a venture.
    await assertFails(setDoc(doc(authed('staff_b'), 'consent_policies/pol_forged'), {
      id: 'pol_forged', resource_id: VENTURE, viewer_id: ORG_B, is_active: true, ecosystem_id: ECO_A,
    }));
  });
});

describe('privilege escalation', () => {
  it('blocks a user from promoting themselves to platform_admin', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'people/staff_a'), {
      id: 'staff_a', system_role: 'platform_admin', organization_id: ORG_A, ecosystem_id: ECO_A, ecosystem_ids: [ECO_A],
    }));
  });

  it('blocks a user from granting themselves another ecosystem', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'people/staff_a'), {
      id: 'staff_a', system_role: 'eso_staff', organization_id: ORG_A, ecosystem_id: ECO_A, ecosystem_ids: [ECO_A, ECO_B],
    }));
  });

  it('people records are readable only by their owner and operators', async () => {
    await assertSucceeds(getDoc(doc(authed('founder'), 'people/founder')));
    await assertFails(getDoc(doc(authed('staff_b'), 'people/founder')));
  });
});

describe('ecosystems collection', () => {
  it('is readable by an authenticated user (config + feature flags)', async () => {
    await assertSucceeds(getDoc(doc(authed('staff_a'), 'ecosystems/eco_a')));
  });

  it('is not writable by ordinary ESO staff', async () => {
    await assertFails(setDoc(doc(authed('staff_a'), 'ecosystems/eco_a'), { id: ECO_A, name: 'Hijacked' }));
  });

  it('is writable by a platform admin', async () => {
    await assertSucceeds(setDoc(doc(authed('admin'), 'ecosystems/eco_a'), { id: ECO_A, name: 'Renamed' }));
  });

  // The "Add Ecosystem" admin flow creates a brand-new document, which takes
  // the create branch rather than update — verify it is actually allowed.
  it('can be created fresh by a platform admin', async () => {
    await assertSucceeds(setDoc(doc(authed('admin'), 'ecosystems/eco_new'), {
      id: 'eco_new', name: 'Brand New Ecosystem', settings: { interaction_privacy_default: 'network_shared' },
    }));
  });
});
