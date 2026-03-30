"use strict";
/**
 * Integration tests for the referralEmailAction one-click email flow.
 *
 * Prerequisites: Firebase emulator must be running.
 *   firebase emulators:start --only firestore,functions
 *
 * Run with:
 *   npx tsx --test src/referralEmailAction.test.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// ---------------------------------------------------------------------------
// Config — matches firebase.json emulator ports
// ---------------------------------------------------------------------------
const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const FIRESTORE_HOST = '127.0.0.1:58080';
const PROJECT_ID = 'entrepreneurship-nexus-local';
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)({ projectId: PROJECT_ID });
}
const db = (0, firestore_1.getFirestore)();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const post = async (path, body) => {
    const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, body: json };
};
const get = async (path) => {
    const res = await fetch(`${FUNCTIONS_BASE}/${path}`, { method: 'GET', redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, body: text };
};
const getDoc = async (collection, id) => {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? snap.data() : null;
};
const queryFirst = async (collection, field, value) => {
    const snap = await db.collection(collection).where(field, '==', value).limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
};
// Seed data IDs (matches seedLocalReferenceData)
const ECO_ID = 'eco_new_haven';
const ROUTE_ADDRESS = 'newhaven+introduction@inbound.example.org';
// ---------------------------------------------------------------------------
// Seed emulator before tests
// ---------------------------------------------------------------------------
(0, node_test_1.before)(async () => {
    const { status, body } = await post('seedLocalReferenceData', {});
    assert.equal(status, 200, `Seed failed: ${JSON.stringify(body)}`);
    await db.collection('organization_aliases').doc('alias_makehaven').set({
        id: 'alias_makehaven',
        organization_id: 'org_makehaven',
        domain: 'makehaven.org',
        created_at: new Date().toISOString(),
    });
});
// ---------------------------------------------------------------------------
// Helper: create a referral via inbound email and return its ID + action tokens
// ---------------------------------------------------------------------------
async function createReferralAndGetTokens(uniqueId) {
    const { status, body } = await post('processInboundEmail', {
        provider: 'manual',
        provider_message_id: `action-test-${uniqueId}`,
        from_email: 'staff@makehaven.org',
        to_emails: [ROUTE_ADDRESS],
        cc_emails: [`testfounder${uniqueId}@example.com`],
        subject: 'Introduction: Test Founder',
        text_body: `Hi team,\n\nIntroducing Test Founder who is building a startup.\n\nBest,\nJordan`,
    });
    assert.equal(status, 200, `processInboundEmail failed: ${JSON.stringify(body)}`);
    assert.equal(body.auto_approved, true);
    const referralId = body.referral_id;
    assert.ok(referralId, 'Should return referral_id');
    // Find the action tokens written to Firestore for this referral
    const tokenSnap = await db.collection('referral_action_tokens')
        .where('referral_id', '==', referralId)
        .get();
    const tokens = tokenSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { referralId, tokens };
}
// ---------------------------------------------------------------------------
// 1. Tokens are created when a referral intake email is sent
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('token generation on referral creation', () => {
    let referralId;
    let tokens;
    (0, node_test_1.before)(async () => {
        ({ referralId, tokens } = await createReferralAndGetTokens('gen-001'));
    });
    (0, node_test_1.it)('creates exactly two tokens (accept and complete)', () => {
        assert.equal(tokens.length, 2, `Expected 2 tokens, got ${tokens.length}`);
    });
    (0, node_test_1.it)('one token is for accept, one for complete', () => {
        const actions = tokens.map(t => t.action).sort();
        assert.deepEqual(actions, ['accept', 'complete']);
    });
    (0, node_test_1.it)('tokens are linked to the referral', () => {
        for (const t of tokens) {
            assert.equal(t.referral_id, referralId);
        }
    });
    (0, node_test_1.it)('tokens are not yet used', () => {
        for (const t of tokens) {
            assert.equal(t.used_at, null);
        }
    });
    (0, node_test_1.it)('tokens expire 7 days from now', () => {
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
(0, node_test_1.describe)('one-click accept', () => {
    let referralId;
    let acceptToken;
    let completeToken;
    (0, node_test_1.before)(async () => {
        const result = await createReferralAndGetTokens('accept-001');
        referralId = result.referralId;
        acceptToken = result.tokens.find(t => t.action === 'accept').id;
        completeToken = result.tokens.find(t => t.action === 'complete').id;
    });
    (0, node_test_1.it)('returns 200 HTML on valid accept token', async () => {
        const { status, body } = await get(`referralEmailAction?token=${acceptToken}`);
        assert.equal(status, 200);
        assert.ok(body.includes('accepted') || body.includes('Referral accepted'), `Unexpected body: ${body.slice(0, 200)}`);
    });
    (0, node_test_1.it)('referral status is now accepted', async () => {
        const referral = await getDoc('referrals', referralId);
        assert.equal(referral.status, 'accepted');
        assert.ok(referral.accepted_at, 'Should have accepted_at timestamp');
    });
    (0, node_test_1.it)('accept token is marked as used', async () => {
        const tokenData = await getDoc('referral_action_tokens', acceptToken);
        assert.ok(tokenData.used_at, 'Token should be marked as used');
    });
    (0, node_test_1.it)('using the same accept token again returns already-actioned page', async () => {
        const { status, body } = await get(`referralEmailAction?token=${acceptToken}`);
        assert.equal(status, 200);
        assert.ok(body.includes('Already') || body.includes('already'), `Expected already-actioned message, got: ${body.slice(0, 200)}`);
    });
    (0, node_test_1.it)('complete token still works after accept', async () => {
        const { status, body } = await get(`referralEmailAction?token=${completeToken}`);
        assert.equal(status, 200);
        assert.ok(body.includes('complete') || body.includes('Complete'), `Unexpected body: ${body.slice(0, 200)}`);
        const referral = await getDoc('referrals', referralId);
        assert.equal(referral.status, 'completed');
    });
});
// ---------------------------------------------------------------------------
// 3. Complete via one-click link (without accepting first)
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('one-click complete (direct from pending)', () => {
    let referralId;
    let completeToken;
    (0, node_test_1.before)(async () => {
        const result = await createReferralAndGetTokens('complete-001');
        referralId = result.referralId;
        completeToken = result.tokens.find(t => t.action === 'complete').id;
    });
    (0, node_test_1.it)('returns 200 HTML on valid complete token', async () => {
        const { status, body } = await get(`referralEmailAction?token=${completeToken}`);
        assert.equal(status, 200);
        assert.ok(body.includes('complete') || body.includes('Complete'), `Unexpected body: ${body.slice(0, 200)}`);
    });
    (0, node_test_1.it)('referral status is now completed', async () => {
        const referral = await getDoc('referrals', referralId);
        assert.equal(referral.status, 'completed');
        assert.ok(referral.closed_at, 'Should have closed_at timestamp');
        assert.equal(referral.outcome, 'completed_via_email');
    });
    (0, node_test_1.it)('complete token is marked as used', async () => {
        const tokenData = await getDoc('referral_action_tokens', completeToken);
        assert.ok(tokenData.used_at, 'Token should be marked as used');
    });
});
// ---------------------------------------------------------------------------
// 4. Invalid / missing token
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('invalid token handling', () => {
    (0, node_test_1.it)('returns 400 for a malformed token', async () => {
        const { status, body } = await get('referralEmailAction?token=notavalidtoken');
        assert.equal(status, 400);
        assert.ok(body.includes('Invalid') || body.includes('invalid'), `Expected invalid message`);
    });
    (0, node_test_1.it)('returns 404 for a well-formed but unknown token', async () => {
        const fakeToken = 'a'.repeat(64);
        const { status, body } = await get(`referralEmailAction?token=${fakeToken}`);
        assert.equal(status, 404);
        assert.ok(body.includes('not found') || body.includes('Link not found'), `Expected not-found message`);
    });
    (0, node_test_1.it)('returns 400 for a missing token param', async () => {
        const { status } = await get('referralEmailAction');
        assert.equal(status, 400);
    });
});
// ---------------------------------------------------------------------------
// 5. Expired token
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('expired token handling', () => {
    (0, node_test_1.it)('returns 410 for an expired token', async () => {
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
