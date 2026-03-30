/**
 * Integration tests for the referralEmailAction one-click email flow.
 *
 * Prerequisites: Firebase emulator must be running.
 *   firebase emulators:start --only firestore,functions
 *
 * Run with:
 *   npx tsx --test src/referralEmailAction.test.ts
 */

import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Config — matches firebase.json emulator ports
// ---------------------------------------------------------------------------
const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const FIRESTORE_HOST = '127.0.0.1:58080';
const PROJECT_ID = 'entrepreneurship-nexus-local';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const post = async (path: string, body: object) => {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
};

const get = async (path: string) => {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, { method: 'GET', redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, body: text };
};

const getDoc = async (collection: string, id: string) => {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
};

const queryFirst = async (collection: string, field: string, value: string) => {
  const snap = await db.collection(collection).where(field, '==', value).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
};

// Seed data IDs (matches seedLocalReferenceData)
const ECO_ID = 'eco_new_haven';
const ROUTE_ADDRESS = 'newhaven+introduction@inbound.example.org';

// ---------------------------------------------------------------------------
// Seed emulator before tests
// ---------------------------------------------------------------------------
before(async () => {
  const { status, body } = await post('seedLocalReferenceData', {});
  assert.equal(status, 200, `Seed failed: ${JSON.stringify(body)}`);

  await db.collection('organization_aliases').doc('alias_makehaven').set({
    id: 'alias_makehaven',
    organization_id: 'org_makehaven',
    domain: 'makehaven.org',
    created_at: new Date().toISOString(),
  });

  // Give MakeHaven an intake email so referral_new_intake notices (and tokens) are generated
  await db.collection('organizations').doc('org_makehaven').update({
    referral_intake_prefs: { intake_contact_email: 'intake@makehaven.org' },
  });
});

// ---------------------------------------------------------------------------
// Helper: create a referral via inbound email and return its ID + action tokens
// ---------------------------------------------------------------------------
async function createReferralAndGetTokens(uniqueId: string) {
  // Use timestamp to ensure unique IDs across emulator restarts and repeated runs
  const msgId = `action-test-${uniqueId}-${Date.now()}`;
  const { status, body } = await post('processInboundEmail', {
    provider: 'manual',
    provider_message_id: msgId,
    from_email: 'staff@makehaven.org',
    to_emails: [ROUTE_ADDRESS],
    cc_emails: [`testfounder${uniqueId}-${Date.now()}@example.com`],
    subject: 'Introduction: Test Founder',
    text_body: `Hi team,\n\nIntroducing Test Founder who is building a startup.\n\nBest,\nJordan`,
  });
  assert.equal(status, 200, `processInboundEmail failed: ${JSON.stringify(body)}`);
  assert.equal(body.auto_approved, true);

  const referralId = body.referral_id as string;
  assert.ok(referralId, 'Should return referral_id');

  // Find the action tokens written to Firestore for this referral
  const tokenSnap = await db.collection('referral_action_tokens')
    .where('referral_id', '==', referralId)
    .get();

  const tokens = tokenSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Array<{
    id: string; action: string; referral_id: string; ecosystem_id: string | null;
    expires_at: string; used_at: string | null;
  }>;

  return { referralId, tokens };
}

// ---------------------------------------------------------------------------
// 1. Tokens are created when a referral intake email is sent
// ---------------------------------------------------------------------------
describe('token generation on referral creation', () => {
  let referralId: string;
  let tokens: Awaited<ReturnType<typeof createReferralAndGetTokens>>['tokens'];

  before(async () => {
    ({ referralId, tokens } = await createReferralAndGetTokens('gen-001'));
  });

  it('creates exactly two tokens (accept and complete)', () => {
    assert.equal(tokens.length, 2, `Expected 2 tokens, got ${tokens.length}`);
  });

  it('one token is for accept, one for complete', () => {
    const actions = tokens.map(t => t.action).sort();
    assert.deepEqual(actions, ['accept', 'complete']);
  });

  it('tokens are linked to the referral', () => {
    for (const t of tokens) {
      assert.equal(t.referral_id, referralId);
    }
  });

  it('tokens are not yet used', () => {
    for (const t of tokens) {
      assert.equal(t.used_at, null);
    }
  });

  it('tokens expire 7 days from now', () => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    for (const t of tokens) {
      const expiry = new Date(t.expires_at).getTime();
      const diff = expiry - now;
      assert.ok(diff > sevenDaysMs - 60_000, 'Expiry should be ~7 days out');
      assert.ok(diff < sevenDaysMs + 60_000, 'Expiry should be ~7 days out');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Accept via one-click link
// ---------------------------------------------------------------------------
describe('one-click accept', () => {
  let referralId: string;
  let acceptToken: string;
  let completeToken: string;

  before(async () => {
    const result = await createReferralAndGetTokens('accept-001');
    referralId = result.referralId;
    acceptToken = result.tokens.find(t => t.action === 'accept')!.id;
    completeToken = result.tokens.find(t => t.action === 'complete')!.id;
  });

  it('returns 200 HTML on valid accept token', async () => {
    const { status, body } = await get(`referralEmailAction?token=${acceptToken}`);
    assert.equal(status, 200);
    assert.ok(body.includes('accepted') || body.includes('Referral accepted'), `Unexpected body: ${body.slice(0, 200)}`);
  });

  it('referral status is now accepted', async () => {
    const referral = await getDoc('referrals', referralId);
    assert.equal(referral!.status, 'accepted');
    assert.ok(referral!.accepted_at, 'Should have accepted_at timestamp');
  });

  it('accept token is marked as used', async () => {
    const tokenData = await getDoc('referral_action_tokens', acceptToken);
    assert.ok(tokenData!.used_at, 'Token should be marked as used');
  });

  it('using the same accept token again returns already-actioned page', async () => {
    const { status, body } = await get(`referralEmailAction?token=${acceptToken}`);
    assert.equal(status, 200);
    assert.ok(body.includes('Already') || body.includes('already'), `Expected already-actioned message, got: ${body.slice(0, 200)}`);
  });

  it('complete token still works after accept', async () => {
    const { status, body } = await get(`referralEmailAction?token=${completeToken}`);
    assert.equal(status, 200);
    assert.ok(body.includes('complete') || body.includes('Complete'), `Unexpected body: ${body.slice(0, 200)}`);
    const referral = await getDoc('referrals', referralId);
    assert.equal(referral!.status, 'completed');
  });
});

// ---------------------------------------------------------------------------
// 3. Complete via one-click link (without accepting first)
// ---------------------------------------------------------------------------
describe('one-click complete (direct from pending)', () => {
  let referralId: string;
  let completeToken: string;

  before(async () => {
    const result = await createReferralAndGetTokens('complete-001');
    referralId = result.referralId;
    completeToken = result.tokens.find(t => t.action === 'complete')!.id;
  });

  it('returns 200 HTML on valid complete token', async () => {
    const { status, body } = await get(`referralEmailAction?token=${completeToken}`);
    assert.equal(status, 200);
    assert.ok(body.includes('complete') || body.includes('Complete'), `Unexpected body: ${body.slice(0, 200)}`);
  });

  it('referral status is now completed', async () => {
    const referral = await getDoc('referrals', referralId);
    assert.equal(referral!.status, 'completed');
    assert.ok(referral!.closed_at, 'Should have closed_at timestamp');
    assert.equal(referral!.outcome, 'completed_via_email');
  });

  it('complete token is marked as used', async () => {
    const tokenData = await getDoc('referral_action_tokens', completeToken);
    assert.ok(tokenData!.used_at, 'Token should be marked as used');
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid / missing token
// ---------------------------------------------------------------------------
describe('invalid token handling', () => {
  it('returns 400 for a malformed token', async () => {
    const { status, body } = await get('referralEmailAction?token=notavalidtoken');
    assert.equal(status, 400);
    assert.ok(body.includes('Invalid') || body.includes('invalid'), `Expected invalid message`);
  });

  it('returns 404 for a well-formed but unknown token', async () => {
    const fakeToken = 'a'.repeat(64);
    const { status, body } = await get(`referralEmailAction?token=${fakeToken}`);
    assert.equal(status, 404);
    assert.ok(body.includes('not found') || body.includes('Link not found'), `Expected not-found message`);
  });

  it('returns 400 for a missing token param', async () => {
    const { status } = await get('referralEmailAction');
    assert.equal(status, 400);
  });
});

// ---------------------------------------------------------------------------
// 5. Expired token
// ---------------------------------------------------------------------------
describe('expired token handling', () => {
  it('returns 410 for an expired token', async () => {
    const expiredToken = 'b'.repeat(64);
    await db.collection('referral_action_tokens').doc(expiredToken).set({
      referral_id: 'fake-referral-id',
      action: 'accept',
      ecosystem_id: null,
      created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // expired yesterday
      used_at: null,
    });

    const { status, body } = await get(`referralEmailAction?token=${expiredToken}`);
    assert.equal(status, 410);
    assert.ok(body.includes('expired') || body.includes('Expired'), `Expected expired message`);
  });
});
