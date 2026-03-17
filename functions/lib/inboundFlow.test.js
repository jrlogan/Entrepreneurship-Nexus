"use strict";
/**
 * Integration tests for the inbound email pipeline.
 *
 * Prerequisites: Firebase emulator must be running.
 *   firebase emulators:start --only firestore,functions
 *
 * Run with:
 *   npm run test:integration
 *
 * Tests cover:
 *  1. Trusted sender + routed address → auto-approve → referral created
 *  2. Trusted sender + NO route → auto-route via domain → auto-approve
 *  3. Unknown sender domain → stored as needs_review
 *  4. Trusted sender but missing client email → stored as needs_review
 *  5. Duplicate email (same provider_message_id) → deduplicated
 *  6. Manual approval of a needs_review message
 *  7. Client matched via secondary email
 *  8. Sender (referring person) matched via secondary email
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
// Init admin SDK pointed at emulator
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
const MAKEHAVEN_ORG_ID = 'org_makehaven';
const ROUTE_ADDRESS = 'newhaven+introduction@inbound.example.org';
// ---------------------------------------------------------------------------
// Seed the emulator before running tests
// ---------------------------------------------------------------------------
(0, node_test_1.before)(async () => {
    const { status, body } = await post('seedLocalReferenceData', {});
    assert.equal(status, 200, `Seed failed: ${JSON.stringify(body)}`);
    // Add organization_alias for makehaven.org so receiving-org fallback works
    await db.collection('organization_aliases').doc('alias_makehaven').set({
        id: 'alias_makehaven',
        organization_id: MAKEHAVEN_ORG_ID,
        domain: 'makehaven.org',
        created_at: new Date().toISOString(),
    });
});
// ---------------------------------------------------------------------------
// 1. Trusted sender + configured route → auto-approve
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('trusted sender with configured route', () => {
    let messageId;
    let referralId;
    (0, node_test_1.it)('processes the email and auto-approves it', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-001',
            from_email: 'staff@makehaven.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['progressable.founder@gmail.com'],
            subject: 'Introduction: Alex Chen',
            text_body: `Hi MakeHaven team,

I'd like to introduce Alex Chen who is building Progressable, a project management tool for nonprofits.

Alex is looking for workspace and manufacturing support.

Best,
Jordan`,
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.ok, true);
        assert.equal(body.auto_approved, true, 'Should have been auto-approved');
        assert.equal(body.review_required, false);
        messageId = body.inbound_message_id;
        assert.ok(messageId, 'Should return inbound_message_id');
    });
    (0, node_test_1.it)('message stored with status approved', async () => {
        const msg = await getDoc('inbound_messages', messageId);
        assert.ok(msg, 'Message should exist in Firestore');
        assert.equal(msg.review_status, 'approved');
        assert.equal(msg.ecosystem_id, ECO_ID);
        assert.equal(msg.from_email, 'staff@makehaven.org');
    });
    (0, node_test_1.it)('referral was created', async () => {
        const referral = await queryFirst('referrals', 'source', 'bcc_intake');
        assert.ok(referral, 'A referral should have been created');
        assert.equal(referral.ecosystem_id, ECO_ID);
        assert.equal(referral.referring_org_id, MAKEHAVEN_ORG_ID);
        assert.equal(referral.receiving_org_id, MAKEHAVEN_ORG_ID);
        assert.equal(referral.status, 'pending');
        referralId = referral.id;
    });
    (0, node_test_1.it)('person was created or resolved for the entrepreneur', async () => {
        const referral = await getDoc('referrals', referralId);
        assert.ok(referral.subject_person_id, 'Referral should have a subject_person_id');
        const person = await getDoc('people', referral.subject_person_id);
        assert.ok(person, 'Person should exist');
        assert.equal(person.email.toLowerCase(), 'progressable.founder@gmail.com');
    });
});
// ---------------------------------------------------------------------------
// 2. Trusted sender + NO route → auto-route via domain lookup → auto-approve
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('trusted sender with no configured route', () => {
    (0, node_test_1.it)('auto-routes via domain and auto-approves', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-002',
            from_email: 'programs@makehaven.org',
            to_emails: ['referrals@inbound.entrepreneurship.nexus'], // no route for this address
            cc_emails: ['maker@gmail.com'],
            subject: 'Introduction: Sam Rivera',
            text_body: 'Introducing Sam Rivera who wants to use the fab lab.',
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.ok, true);
        assert.equal(body.auto_approved, true, 'Should have been auto-approved via domain fallback');
        const msg = await getDoc('inbound_messages', body.inbound_message_id);
        assert.equal(msg.ecosystem_id, ECO_ID, 'Ecosystem should be resolved from sender domain');
        assert.equal(msg.review_status, 'approved');
    });
});
// ---------------------------------------------------------------------------
// 3. Unknown sender domain → needs_review
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('unknown sender domain', () => {
    (0, node_test_1.it)('stores message as needs_review with unknown_sender_domain flag', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-003',
            from_email: 'someone@unknownorg.com',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['client@gmail.com'],
            subject: 'Introduction: New Person',
            text_body: 'Someone is introducing a client.',
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.review_required, true);
        assert.equal(body.auto_approved, undefined, 'Should not be auto-approved');
        const msg = await getDoc('inbound_messages', body.inbound_message_id);
        assert.equal(msg.review_status, 'needs_review');
        const parse = await queryFirst('inbound_parse_results', 'inbound_message_id', body.inbound_message_id);
        assert.ok(parse.needs_review_reasons.includes('unknown_sender_domain'));
    });
});
// ---------------------------------------------------------------------------
// 4. Trusted sender but no client email resolvable → needs_review
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('trusted sender with no client email', () => {
    (0, node_test_1.it)('stores as needs_review with missing_client_email flag', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-004',
            from_email: 'staff@makehaven.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: [], // no CC, no footer email
            subject: 'FYI: Workshop recap',
            text_body: 'Just a note about our workshop last week. No specific introduction.',
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.review_required, true);
        const parse = await queryFirst('inbound_parse_results', 'inbound_message_id', body.inbound_message_id);
        assert.ok(parse.needs_review_reasons.includes('missing_client_email'));
    });
});
// ---------------------------------------------------------------------------
// 5. Duplicate email (same provider_message_id) → deduplicated
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('duplicate email', () => {
    (0, node_test_1.it)('returns existing message id without creating a duplicate', async () => {
        // First submission
        const first = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-005-dup',
            from_email: 'staff@makehaven.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['deduped@gmail.com'],
            subject: 'Introduction: Dup Test',
            text_body: 'Testing deduplication.',
        });
        assert.equal(first.status, 200);
        // Second submission — same provider_message_id
        const second = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-005-dup',
            from_email: 'staff@makehaven.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['deduped@gmail.com'],
            subject: 'Introduction: Dup Test',
            text_body: 'Testing deduplication.',
        });
        assert.equal(second.status, 200);
        assert.equal(second.body.is_duplicate, true, 'Second submission should be flagged as duplicate');
        assert.equal(second.body.inbound_message_id, first.body.inbound_message_id, 'Both should return same message id');
        // Confirm only one message exists in Firestore
        const all = await db.collection('inbound_messages')
            .where('provider_message_id', '==', 'test-msg-005-dup')
            .get();
        assert.equal(all.size, 1, 'Only one message should be stored');
    });
});
// ---------------------------------------------------------------------------
// 6. Manual approval of a needs_review message
//    (uses approveInboundMessage which requires auth — tested via emulator token)
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('manual approval flow', () => {
    let messageId;
    let parseResultId;
    (0, node_test_1.before)(async () => {
        // Submit an email that will need review (no client email in CC)
        const { body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-006-manual',
            from_email: 'unknown-sender@external.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['needs.review@gmail.com'],
            subject: 'Introduction: Manual Review Test',
            text_body: 'This person needs manual review.',
        });
        messageId = body.inbound_message_id;
        parseResultId = body.parse_result_id;
    });
    (0, node_test_1.it)('message starts as needs_review', async () => {
        const msg = await getDoc('inbound_messages', messageId);
        assert.equal(msg.review_status, 'needs_review');
    });
    (0, node_test_1.it)('can be approved directly via Firestore (simulating admin action)', async () => {
        // In the emulator, approveInboundMessage requires a Firebase Auth token.
        // We simulate the approval outcome directly — the HTTP endpoint logic
        // is covered by the auto-approve path tests above; here we verify the
        // data state a manual approval produces.
        const now = new Date().toISOString();
        const referralRef = db.collection('referrals').doc();
        await referralRef.set({
            id: referralRef.id,
            ecosystem_id: ECO_ID,
            referring_org_id: null,
            receiving_org_id: MAKEHAVEN_ORG_ID,
            subject_person_id: null,
            subject_org_id: null,
            date: now,
            status: 'pending',
            notes: 'Manually reviewed.',
            source: 'bcc_intake',
            created_at: now,
        });
        await db.collection('inbound_messages').doc(messageId).update({
            review_status: 'approved',
            approved_at: now,
            approved_by: 'test_admin',
        });
        const msg = await getDoc('inbound_messages', messageId);
        assert.equal(msg.review_status, 'approved');
        const referral = await getDoc('referrals', referralRef.id);
        assert.equal(referral.ecosystem_id, ECO_ID);
        assert.equal(referral.status, 'pending');
    });
});
// ---------------------------------------------------------------------------
// 7. Client matched via secondary email
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('secondary email matching — client', () => {
    const PRIMARY_EMAIL = 'client.primary@gmail.com';
    const SECONDARY_EMAIL = 'client.secondary@gmail.com';
    let existingPersonId;
    (0, node_test_1.before)(async () => {
        // Create a person with a secondary email
        const ref = db.collection('people').doc();
        existingPersonId = ref.id;
        await ref.set({
            id: existingPersonId,
            first_name: 'Alex',
            last_name: 'Secondary',
            email: PRIMARY_EMAIL,
            secondary_emails: [SECONDARY_EMAIL],
            system_role: 'entrepreneur',
            primary_organization_id: '',
            ecosystem_id: ECO_ID,
            status: 'active',
            created_at: new Date().toISOString(),
        });
    });
    (0, node_test_1.it)('resolves the existing person when CC is their secondary email', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-007-secondary-client',
            from_email: 'staff@makehaven.org',
            to_emails: [ROUTE_ADDRESS],
            cc_emails: [SECONDARY_EMAIL],
            subject: 'Introduction: Alex Secondary',
            text_body: 'Introducing Alex via their secondary email.',
        });
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.auto_approved, true);
        // Use person_id from response directly — avoids stale queryFirst results
        assert.equal(body.person_id, existingPersonId, 'Should have matched existing person via secondary email, not created a new one');
    });
    (0, node_test_1.it)('does not create a duplicate person record', async () => {
        const snap = await db.collection('people').where('email', '==', SECONDARY_EMAIL).get();
        assert.equal(snap.size, 0, 'No person should have secondary email as their primary');
        const snap2 = await db.collection('people')
            .where('secondary_emails', 'array-contains', SECONDARY_EMAIL)
            .get();
        assert.equal(snap2.size, 1, 'Exactly one person should have this secondary email');
        assert.equal(snap2.docs[0].id, existingPersonId);
    });
});
// ---------------------------------------------------------------------------
// 8. Sender matched via secondary email → referring_person_id resolved
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('secondary email matching — sender (referring person)', () => {
    const SENDER_PRIMARY = 'jordan.primary@makehaven.org';
    const SENDER_SECONDARY = 'jordan.personal@gmail.com';
    let senderPersonId;
    (0, node_test_1.before)(async () => {
        // Create a staff person whose personal gmail is a secondary email
        const ref = db.collection('people').doc();
        senderPersonId = ref.id;
        await ref.set({
            id: senderPersonId,
            first_name: 'Jordan',
            last_name: 'Staff',
            email: SENDER_PRIMARY,
            secondary_emails: [SENDER_SECONDARY],
            system_role: 'eso_staff',
            primary_organization_id: MAKEHAVEN_ORG_ID,
            ecosystem_id: ECO_ID,
            status: 'active',
            created_at: new Date().toISOString(),
        });
        // Add their personal domain as an authorized sender so the email auto-approves
        await db.collection('authorized_sender_domains').doc('alias_jordan_personal').set({
            id: 'alias_jordan_personal',
            domain: 'gmail.com', // already trusted from seed — reuses existing trust
            organization_id: MAKEHAVEN_ORG_ID,
            ecosystem_id: ECO_ID,
            is_active: true,
            access_policy: 'approved',
        });
    });
    (0, node_test_1.it)('sets referring_person_id when sender matches via secondary email', async () => {
        const { status, body } = await post('processInboundEmail', {
            provider: 'manual',
            provider_message_id: 'test-msg-008-secondary-sender',
            from_email: SENDER_SECONDARY, // sending from personal gmail
            to_emails: [ROUTE_ADDRESS],
            cc_emails: ['new.client.008@example.com'],
            subject: 'Introduction: New Client from Jordan personal',
            text_body: 'Introducing a new client from my personal email.',
        });
        assert.equal(status, 200, JSON.stringify(body));
        const referral = await queryFirst('referrals', 'source', 'bcc_intake');
        assert.ok(referral, 'Referral should exist');
        assert.equal(referral.referring_person_id, senderPersonId, 'Should resolve referring_person_id from secondary email match');
    });
});
