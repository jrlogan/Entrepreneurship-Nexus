/**
 * Firestore security rules tests.
 *
 * These run against the Firestore emulator and are the only place the
 * *server-side* access model is actually verified — everything in
 * src/domain/access is client-side and can be bypassed with the raw SDK.
 *
 * Requires the emulator:
 *   firebase emulators:start --only firestore
 * Run with:
 *   npm run test:rules
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
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'nexus-rules-test';
const ECO_A = 'eco_a';
const ECO_B = 'eco_b';
const ORG_A = 'org_a';
const ORG_B = 'org_b';

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
  // Seed people + records with the security rules bypassed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Staff member of org A, member of ecosystem A only.
    await setDoc(doc(db, 'people/staff_a'), {
      id: 'staff_a',
      system_role: 'eso_staff',
      organization_id: ORG_A,
      primary_organization_id: ORG_A,
      ecosystem_id: ECO_A,
      ecosystem_ids: [ECO_A],
    });

    // Staff member of org B, member of ecosystem B only.
    await setDoc(doc(db, 'people/staff_b'), {
      id: 'staff_b',
      system_role: 'eso_staff',
      organization_id: ORG_B,
      primary_organization_id: ORG_B,
      ecosystem_id: ECO_B,
      ecosystem_ids: [ECO_B],
    });

    // Person who belongs to BOTH ecosystems (multi-ecosystem membership).
    await setDoc(doc(db, 'people/staff_both'), {
      id: 'staff_both',
      system_role: 'eso_staff',
      organization_id: ORG_A,
      primary_organization_id: ORG_A,
      ecosystem_id: ECO_A,
      ecosystem_ids: [ECO_A, ECO_B],
    });

    // Legacy person doc written before ecosystem_ids denormalization existed.
    await setDoc(doc(db, 'people/legacy_a'), {
      id: 'legacy_a',
      system_role: 'eso_staff',
      organization_id: ORG_A,
      primary_organization_id: ORG_A,
      ecosystem_id: ECO_A,
    });

    await setDoc(doc(db, 'people/admin'), {
      id: 'admin',
      system_role: 'platform_admin',
      organization_id: ORG_A,
      primary_organization_id: ORG_A,
      ecosystem_id: ECO_A,
      ecosystem_ids: [ECO_A],
    });

    // Confidential case note living in ecosystem B, authored by org B.
    await setDoc(doc(db, 'interactions/int_b'), {
      id: 'int_b',
      ecosystem_id: ECO_B,
      organization_id: ORG_B,
      author_org_id: ORG_B,
      visibility: 'eso_private',
      note_confidential: true,
      notes: 'highly sensitive coaching note',
    });

    await setDoc(doc(db, 'interactions/int_a'), {
      id: 'int_a',
      ecosystem_id: ECO_A,
      organization_id: ORG_A,
      author_org_id: ORG_A,
      visibility: 'network_shared',
      note_confidential: false,
      notes: 'ordinary note',
    });

    await setDoc(doc(db, 'referrals/ref_b'), {
      id: 'ref_b',
      ecosystem_id: ECO_B,
      referring_org_id: ORG_B,
      receiving_org_id: ORG_B,
      subject_org_id: ORG_B,
      status: 'pending',
    });

    await setDoc(doc(db, 'initiatives/init_b'), {
      id: 'init_b',
      ecosystem_id: ECO_B,
      organization_id: ORG_B,
      name: 'Project B',
    });

    await setDoc(doc(db, 'ecosystems/eco_a'), { id: ECO_A, name: 'Ecosystem A' });
  });
});

const authed = (uid: string) => testEnv.authenticatedContext(uid).firestore();

describe('cross-ecosystem isolation', () => {
  it('blocks reading an interaction from another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(getDoc(doc(db, 'interactions/int_b')));
  });

  it('blocks listing interactions scoped to another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(
      getDocs(query(collection(db, 'interactions'), where('ecosystem_id', '==', ECO_B)))
    );
  });

  it('allows listing interactions in the caller\'s own ecosystem', async () => {
    const db = authed('staff_a');
    await assertSucceeds(
      getDocs(query(collection(db, 'interactions'), where('ecosystem_id', '==', ECO_A)))
    );
  });

  it('blocks an unfiltered interactions list (would span ecosystems)', async () => {
    const db = authed('staff_a');
    await assertFails(getDocs(collection(db, 'interactions')));
  });

  it('blocks reading a referral from another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(getDoc(doc(db, 'referrals/ref_b')));
  });

  it('blocks reading an initiative from another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(getDoc(doc(db, 'initiatives/init_b')));
  });

  it('allows a multi-ecosystem member to read in both ecosystems', async () => {
    const db = authed('staff_both');
    await assertSucceeds(getDoc(doc(db, 'interactions/int_a')));
    await assertSucceeds(getDoc(doc(db, 'interactions/int_b')));
  });

  it('allows a platform admin to read across ecosystems', async () => {
    const db = authed('admin');
    await assertSucceeds(getDoc(doc(db, 'interactions/int_b')));
  });

  it('supports legacy person docs without ecosystem_ids', async () => {
    const db = authed('legacy_a');
    await assertSucceeds(getDoc(doc(db, 'interactions/int_a')));
    await assertFails(getDoc(doc(db, 'interactions/int_b')));
  });

  it('blocks unauthenticated reads entirely', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'interactions/int_a')));
  });
});

describe('interaction write integrity', () => {
  it('blocks authoring an interaction attributed to another org', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'interactions/forged'), {
      id: 'forged',
      ecosystem_id: ECO_A,
      organization_id: ORG_A,
      author_org_id: ORG_B, // not the caller's org
      notes: 'forged attribution',
    }));
  });

  it('allows authoring an interaction attributed to the caller\'s own org', async () => {
    const db = authed('staff_a');
    await assertSucceeds(setDoc(doc(db, 'interactions/mine'), {
      id: 'mine',
      ecosystem_id: ECO_A,
      organization_id: ORG_A,
      author_org_id: ORG_A,
      notes: 'legitimate note',
    }));
  });

  it('blocks reassigning authorship on update', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'interactions/int_a'), {
      id: 'int_a',
      ecosystem_id: ECO_A,
      organization_id: ORG_A,
      author_org_id: ORG_B,
      notes: 'stolen',
    }));
  });
});

describe('privilege escalation', () => {
  it('blocks a user from promoting themselves to platform_admin', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'people/staff_a'), {
      id: 'staff_a',
      system_role: 'platform_admin',
      organization_id: ORG_A,
      ecosystem_id: ECO_A,
      ecosystem_ids: [ECO_A],
    }));
  });

  it('blocks a user from granting themselves another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'people/staff_a'), {
      id: 'staff_a',
      system_role: 'eso_staff',
      organization_id: ORG_A,
      ecosystem_id: ECO_A,
      ecosystem_ids: [ECO_A, ECO_B],
    }));
  });
});

describe('ecosystems collection', () => {
  it('is readable by an authenticated user (config + feature flags)', async () => {
    const db = authed('staff_a');
    await assertSucceeds(getDoc(doc(db, 'ecosystems/eco_a')));
  });

  it('is not writable by ordinary ESO staff', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'ecosystems/eco_a'), { id: ECO_A, name: 'Hijacked' }));
  });

  it('is writable by a platform admin', async () => {
    const db = authed('admin');
    await assertSucceeds(setDoc(doc(db, 'ecosystems/eco_a'), { id: ECO_A, name: 'Renamed' }));
  });

  // The "Add Ecosystem" admin flow creates a brand-new document, which takes
  // the create branch rather than update — verify it is actually allowed.
  it('can be created fresh by a platform admin', async () => {
    const db = authed('admin');
    await assertSucceeds(setDoc(doc(db, 'ecosystems/eco_new'), {
      id: 'eco_new',
      name: 'Brand New Ecosystem',
      settings: { interaction_privacy_default: 'network_shared' },
    }));
  });
});

// The create rules gained an inCallerEcosystem() gate; make sure ordinary
// in-ecosystem creation still works and is not collateral damage.
describe('in-ecosystem writes still work', () => {
  it('allows creating a referral in the caller\'s own ecosystem', async () => {
    const db = authed('staff_a');
    await assertSucceeds(setDoc(doc(db, 'referrals/ref_new'), {
      id: 'ref_new',
      ecosystem_id: ECO_A,
      referring_org_id: ORG_A,
      receiving_org_id: ORG_B,
      subject_org_id: ORG_A,
      status: 'pending',
    }));
  });

  it('blocks creating a referral into another ecosystem', async () => {
    const db = authed('staff_a');
    await assertFails(setDoc(doc(db, 'referrals/ref_cross'), {
      id: 'ref_cross',
      ecosystem_id: ECO_B,
      referring_org_id: ORG_A,
      receiving_org_id: ORG_B,
      subject_org_id: ORG_A,
      status: 'pending',
    }));
  });

  it('allows creating an initiative in the caller\'s own ecosystem', async () => {
    const db = authed('staff_a');
    await assertSucceeds(setDoc(doc(db, 'initiatives/init_new'), {
      id: 'init_new',
      ecosystem_id: ECO_A,
      organization_id: ORG_A,
      name: 'New Project',
    }));
  });
});
