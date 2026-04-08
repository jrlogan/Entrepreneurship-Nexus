/**
 * Integration tests for the invite flow:
 *   createInvite → getInviteSummary → acceptInvite
 *
 * Prerequisites: Firebase emulator must be running.
 *   npm run firebase:emulators
 *
 * Run with:
 *   npx tsx --test functions/src/invite.test.ts
 */

import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ---------------------------------------------------------------------------
// Config — matches firebase.json emulator ports
// ---------------------------------------------------------------------------
const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const FIRESTORE_HOST = '127.0.0.1:58080';
const AUTH_HOST = '127.0.0.1:9099';
const PROJECT_ID = 'entrepreneurship-nexus-local';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const post = async (path: string, body: object, bearerToken?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
};

/** Create a real Firebase Auth user in the emulator and return their ID token. */
const createTestUser = async (email: string, displayName?: string): Promise<{ uid: string; idToken: string }> => {
  const user = await auth.createUser({ email, displayName: displayName || email.split('@')[0] });
  // Mint a custom token and exchange it for an ID token via the emulator REST API
  const customToken = await auth.createCustomToken(user.uid);
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const data = await res.json() as { idToken: string };
  return { uid: user.uid, idToken: data.idToken };
};

/** Seed an admin user in Firestore so createInvite can verify permissions. */
const seedAdminPerson = async (uid: string, email: string) => {
  await db.collection('people').doc(uid).set({
    id: uid,
    auth_uid: uid,
    email,
    first_name: 'Admin',
    last_name: 'User',
    system_role: 'platform_admin',
    ecosystem_id: ECO_ID,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
};

const getInviteByEmail = async (email: string) => {
  const snap = await db.collection('invites').where('email', '==', email).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as Record<string, unknown>;
};

const ECO_ID = 'eco_new_haven';
const ORG_ID = 'org_makehaven';

// ---------------------------------------------------------------------------
// Seed emulator before tests
// ---------------------------------------------------------------------------
before(async () => {
  const { status, body } = await post('seedLocalReferenceData', {});
  assert.equal(status, 200, `Seed failed: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// getInviteSummary
// ---------------------------------------------------------------------------

describe('getInviteSummary', () => {
  it('returns 400 when token is missing', async () => {
    const { status, body } = await post('getInviteSummary', {});
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  it('returns 404 for unknown token', async () => {
    const { status, body } = await post('getInviteSummary', { token: 'totally-invalid-token-xyz' });
    assert.equal(status, 404);
  });

  it('returns 410 with reason=expired for an expired invite', async () => {
    // Write a fake expired invite directly to Firestore
    const inviteRef = db.collection('invites').doc();
    await inviteRef.set({
      id: inviteRef.id,
      email: `expired-invite-${Date.now()}@example.com`,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token_hash: 'deadbeef-expired-hash',
      token_suffix: 'xxxx',
      expires_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // expired yesterday
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    // Use the token suffix approach won't work for integration — use a direct DB approach
    // instead by writing a known plaintext token (backward-compat path still in findInviteByToken)
    const plainToken = `test-expired-${Date.now()}`;
    const inviteRef2 = db.collection('invites').doc();
    await inviteRef2.set({
      id: inviteRef2.id,
      email: `expired2-${Date.now()}@example.com`,
      invited_role: 'eso_staff',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: plainToken,
      expires_at: new Date(Date.now() - 1000).toISOString(), // just expired
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { status, body } = await post('getInviteSummary', { token: plainToken });
    assert.equal(status, 410, `Expected 410 but got ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.reason, 'expired', `Expected reason=expired, got: ${JSON.stringify(body)}`);
  });

  it('returns 410 with reason=already_accepted for a used invite', async () => {
    const plainToken = `test-accepted-${Date.now()}`;
    const inviteRef = db.collection('invites').doc();
    await inviteRef.set({
      id: inviteRef.id,
      email: `accepted-${Date.now()}@example.com`,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'accepted',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { status, body } = await post('getInviteSummary', { token: plainToken });
    assert.equal(status, 410);
    assert.equal(body.reason, 'already_accepted', `Expected reason=already_accepted, got: ${JSON.stringify(body)}`);
  });

  it('returns 410 with reason=revoked for a revoked invite', async () => {
    const plainToken = `test-revoked-${Date.now()}`;
    const inviteRef = db.collection('invites').doc();
    await inviteRef.set({
      id: inviteRef.id,
      email: `revoked-${Date.now()}@example.com`,
      invited_role: 'eso_coach',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'revoked',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { status, body } = await post('getInviteSummary', { token: plainToken });
    assert.equal(status, 410);
    assert.equal(body.reason, 'revoked');
  });

  it('returns full invite summary for a valid pending invite', async () => {
    const email = `valid-summary-${Date.now()}@example.com`;
    const plainToken = `test-valid-${Date.now()}`;
    const inviteRef = db.collection('invites').doc();
    await inviteRef.set({
      id: inviteRef.id,
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { status, body } = await post('getInviteSummary', { token: plainToken });
    assert.equal(status, 200);
    assert.equal(body.email, email);
    assert.equal(body.invited_role, 'eso_admin');
    assert.equal(body.organization_id, ORG_ID);
    assert.equal(body.ecosystem_id, ECO_ID);
  });
});

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

describe('acceptInvite', () => {
  it('returns 401 when called without auth token', async () => {
    const { status } = await post('acceptInvite', { token: 'sometoken' });
    assert.equal(status, 401);
  });

  it('returns 400 when invite token is missing', async () => {
    const { uid, idToken } = await createTestUser(`notoken-${Date.now()}@example.com`);
    void uid;
    const { status, body } = await post('acceptInvite', {}, idToken);
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  it('returns 404 for an unknown invite token', async () => {
    const { uid, idToken } = await createTestUser(`unknown-${Date.now()}@example.com`);
    await seedAdminPerson(uid, `unknown-${Date.now()}@example.com`);
    const { status } = await post('acceptInvite', { token: 'no-such-token' }, idToken);
    assert.equal(status, 404);
  });

  it('returns 403 when authenticated email does not match invite email', async () => {
    const inviteEmail = `invited-${Date.now()}@example.com`;
    const wrongEmail = `wronguser-${Date.now()}@example.com`;
    const plainToken = `mismatch-${Date.now()}`;

    await db.collection('invites').add({
      email: inviteEmail,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { idToken } = await createTestUser(wrongEmail);
    const { status, body } = await post('acceptInvite', { token: plainToken }, idToken);
    assert.equal(status, 403, `Expected 403 but got ${status}: ${JSON.stringify(body)}`);
    assert.match(String(body.error), /email/i);
  });

  it('returns 410 with reason=expired when accepting an expired invite', async () => {
    const email = `exp-accept-${Date.now()}@example.com`;
    const plainToken = `exp-accept-tok-${Date.now()}`;

    await db.collection('invites').add({
      email,
      invited_role: 'eso_staff',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: plainToken,
      expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { idToken } = await createTestUser(email);
    const { status, body } = await post('acceptInvite', { token: plainToken }, idToken);
    assert.equal(status, 410);
    assert.equal(body.reason, 'expired');
  });

  it('returns 410 with reason=already_accepted when accepting a used invite', async () => {
    const email = `already-acc-${Date.now()}@example.com`;
    const plainToken = `already-acc-tok-${Date.now()}`;

    await db.collection('invites').add({
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'accepted',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { idToken } = await createTestUser(email);
    const { status, body } = await post('acceptInvite', { token: plainToken }, idToken);
    assert.equal(status, 410);
    assert.equal(body.reason, 'already_accepted');
  });

  it('accepts a valid invite, sets person role and marks invite accepted', async () => {
    const email = `new-eso-${Date.now()}@example.com`;
    const plainToken = `accept-ok-${Date.now()}`;

    const inviteRef = db.collection('invites').doc();
    await inviteRef.set({
      id: inviteRef.id,
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: plainToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      invited_by_person_id: 'test-admin',
      created_at: new Date().toISOString(),
    });

    const { uid, idToken } = await createTestUser(email, 'New ESO User');

    // completeSelfSignup must run first so a person record exists
    const signupRes = await post('completeSelfSignup', {
      ecosystem_id: ECO_ID,
      first_name: 'New',
      last_name: 'User',
    }, idToken);
    assert.equal(signupRes.status, 200, `completeSelfSignup failed: ${JSON.stringify(signupRes.body)}`);

    const { status, body } = await post('acceptInvite', { token: plainToken }, idToken);
    assert.equal(status, 200, `acceptInvite failed: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);

    // Invite should be marked accepted
    const inviteDoc = await inviteRef.get();
    assert.equal(inviteDoc.data()?.status, 'accepted');

    // Person should have the invited role
    const personSnap = await db.collection('people').where('auth_uid', '==', uid).limit(1).get();
    assert.ok(!personSnap.empty, 'Person record should exist');
    assert.equal(personSnap.docs[0].data().system_role, 'eso_admin');

    // Membership should exist with correct role
    const membershipSnap = await db.collection('person_memberships')
      .where('person_id', '==', personSnap.docs[0].id)
      .where('ecosystem_id', '==', ECO_ID)
      .get();
    assert.ok(!membershipSnap.empty, 'Membership should exist');
    const membership = membershipSnap.docs.find(d => d.data().system_role === 'eso_admin');
    assert.ok(membership, 'Membership with eso_admin role should exist');
  });
});

// ---------------------------------------------------------------------------
// createInvite — duplicate check respects expiry
// ---------------------------------------------------------------------------

describe('createInvite duplicate check', () => {
  let adminToken: string;
  let adminUid: string;

  before(async () => {
    const result = await createTestUser(`inv-admin-${Date.now()}@example.com`);
    adminUid = result.uid;
    adminToken = result.idToken;
    await seedAdminPerson(adminUid, `inv-admin-${Date.now()}@example.com`);
  });

  it('blocks creating a duplicate invite when an active pending one exists', async () => {
    const email = `dup-block-${Date.now()}@example.com`;

    // Create first invite
    const first = await post('createInvite', {
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
    }, adminToken);
    assert.equal(first.status, 200, `First invite failed: ${JSON.stringify(first.body)}`);

    // Try to create a duplicate — should get 409
    const second = await post('createInvite', {
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
    }, adminToken);
    assert.equal(second.status, 409, `Expected 409 duplicate, got ${second.status}: ${JSON.stringify(second.body)}`);
    assert.ok(second.body.invite_id, 'Should return the existing invite_id');
  });

  it('allows re-inviting when the existing pending invite is expired', async () => {
    const email = `dup-expired-${Date.now()}@example.com`;

    // Directly write an expired pending invite
    const expiredRef = db.collection('invites').doc();
    await expiredRef.set({
      id: expiredRef.id,
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
      status: 'pending',
      token: `expired-dup-${Date.now()}`,
      expires_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // expired yesterday
      invited_by_person_id: adminUid,
      created_at: new Date().toISOString(),
    });

    // Now try to create a new invite for the same email — should succeed
    const fresh = await post('createInvite', {
      email,
      invited_role: 'eso_admin',
      organization_id: ORG_ID,
      ecosystem_id: ECO_ID,
    }, adminToken);
    assert.equal(fresh.status, 200, `Expected new invite to succeed, got ${fresh.status}: ${JSON.stringify(fresh.body)}`);

    // Old expired invite should now be marked expired
    const oldDoc = await expiredRef.get();
    assert.equal(oldDoc.data()?.status, 'expired', 'Old invite should be marked expired');
  });
});
