"use strict";
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
/**
 * Integration tests for the pilot additions to the Partner API: consent
 * collected in a partner's own form, the hosted consent link, referrals and
 * activity from partner systems, and the isolation between partners' own
 * record IDs.
 *
 * Runs against the emulators (firestore + functions), like partnerApi.test.ts:
 *   npm --prefix functions run test:emulator
 */
const node_test_1 = require("node:test");
const node_http_1 = require("node:http");
const assert = __importStar(require("node:assert/strict"));
const crypto_1 = require("crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const content_1 = require("./agreements/content");
const federationDedup_1 = require("./federationDedup");
const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const PROJECT_ID = 'entrepreneurship-nexus-local';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:58080';
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)({ projectId: PROJECT_ID });
const db = (0, firestore_1.getFirestore)();
const ECO_ID = 'eco_new_haven';
const ORG_A = 'org_makehaven';
const KEY_A = 'test-api-key-abc123'; // seeded by seedLocalReferenceData
const ORG_B = 'org_pilot_partner_b';
const KEY_B = 'test-api-key-pilot-partner-b'; // created below
const call = async (method, path, body, apiKey, query) => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey)
        headers['X-Nexus-API-Key'] = apiKey;
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    const res = await fetch(`${FUNCTIONS_BASE}/${path}${qs}`, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
        redirect: 'manual',
    });
    const text = await res.text();
    let json = {};
    try {
        json = JSON.parse(text);
    }
    catch { /* redirects and HTML */ }
    return { status: res.status, body: json, headers: res.headers };
};
const seed = async () => {
    const { status } = await call('POST', 'seedLocalReferenceData', {});
    assert.equal(status, 200);
    await db.collection('organizations').doc(ORG_B).set({
        id: ORG_B,
        name: 'Pilot Partner B',
        roles: ['eso'],
        ecosystem_ids: [ECO_ID],
        managed_by_ids: [],
        url: 'https://partner-b.example.org',
    });
    await db.collection('organizations').doc(ORG_B).collection('api_keys').doc('key_b').set({
        id: 'key_b',
        label: 'test',
        prefix: 'sk_live_test',
        hash: (0, crypto_1.createHash)('sha256').update(KEY_B).digest('hex'),
        status: 'active',
        created_at: new Date().toISOString(),
    });
};
const pushPerson = (apiKey, orgId, id, email, extra = {}) => call('POST', 'partnerUpsertPerson', {
    external_ref: { source: 'crm', id },
    ecosystem_id: ECO_ID,
    eso_org_id: orgId,
    first_name: 'Pilot',
    last_name: `Person ${id}`,
    email,
    ...extra,
}, apiKey);
(0, node_test_1.describe)('consent collected in a partner\'s own form', () => {
    (0, node_test_1.before)(seed);
    (0, node_test_1.it)('getConsentTerms is public and returns the terms and hash', async () => {
        const { status, body } = await call('GET', 'getConsentTerms');
        assert.equal(status, 200);
        assert.match(body.terms_hash, /^[0-9a-f]{64}$/);
        assert.equal(body.choices.directory_listing.default, true);
    });
    (0, node_test_1.it)('records consent sent with the person, against the current terms', async () => {
        const terms = (await call('GET', 'getConsentTerms')).body;
        const { status, body } = await pushPerson(KEY_A, ORG_A, 'consent-1', 'consent1@example.com', {
            consent: { agreed: true, terms_hash: terms.terms_hash, directory_listing: true, share_details: false },
        });
        assert.equal(status, 201, JSON.stringify(body));
        assert.deepEqual(body.consent, { terms_accepted: true, directory_listed: true, shares_details: false });
        const profile = (await db.collection('network_profiles').doc(body.nexus_id).get()).data();
        assert.deepEqual(profile.directory_listed_ecosystems, [ECO_ID]);
        assert.deepEqual(profile.detail_sharing_ecosystems, []);
        const acceptance = await db.collection('agreement_acceptances')
            .where('person_id', '==', body.nexus_id).where('agreement_type', '==', 'federation_compact').get();
        assert.equal(acceptance.size, 1);
        assert.equal(acceptance.docs[0].get('accepted_via'), 'partner_form');
        assert.equal(acceptance.docs[0].get('attested_by_org_id'), ORG_A);
    });
    (0, node_test_1.it)('records nothing against outdated terms, but the push goes through and the founder is asked', async () => {
        const terms = (await call('GET', 'getConsentTerms')).body;
        const { status, body } = await pushPerson(KEY_A, ORG_A, 'consent-2', 'consent2@example.com', {
            consent: { agreed: true, terms_hash: 'f'.repeat(64), directory_listing: true },
        });
        assert.equal(status, 201, JSON.stringify(body));
        assert.equal(body.consent_terms_outdated, true);
        assert.equal(body.current_terms_hash, terms.terms_hash);
        assert.deepEqual(body.consent, { terms_accepted: false, directory_listed: false, shares_details: false });
        const profile = (await db.collection('network_profiles').doc(body.nexus_id).get()).data();
        assert.deepEqual(profile.directory_listed_ecosystems, [], 'a stale hash never records a choice');
        assert.ok(profile.consent_notices, 'the founder is asked directly with the current terms');
        // Consent already on file stands when a partner re-sends its stored (now stale) answers.
        const again = await pushPerson(KEY_A, ORG_A, 'consent-1', 'consent1@example.com', {
            consent: { agreed: true, terms_hash: 'f'.repeat(64), directory_listing: false },
        });
        assert.equal(again.status, 200, JSON.stringify(again.body));
        assert.equal(again.body.consent_terms_outdated, true);
        assert.deepEqual(again.body.consent, { terms_accepted: true, directory_listed: true, shares_details: false });
    });
    (0, node_test_1.it)('still refuses consent the founder did not give', async () => {
        const terms = (await call('GET', 'getConsentTerms')).body;
        const { status, body } = await pushPerson(KEY_A, ORG_A, 'consent-2b', 'consent2b@example.com', {
            consent: { agreed: false, terms_hash: terms.terms_hash },
        });
        assert.equal(status, 400);
        assert.equal(body.reason, 'not_agreed');
    });
    (0, node_test_1.it)('a person pushed without consent starts with everything off — and is told', async () => {
        const { body } = await pushPerson(KEY_A, ORG_A, 'consent-3', 'consent3@example.com');
        assert.deepEqual(body.consent, { terms_accepted: false, directory_listed: false, shares_details: false });
        // The emulator has no Postmark, so delivery is false, but the notice was
        // attempted: a consent link exists and the attempt is recorded.
        assert.equal(body.consent_notice_sent, false);
        const profile = (await db.collection('network_profiles').doc(body.nexus_id).get()).data();
        assert.ok(profile.consent_notices[`${ECO_ID}__${ORG_A}`]);
        const tokens = await db.collection('consent_tokens').where('person_id', '==', body.nexus_id).get();
        assert.equal(tokens.size, 1);
    });
    (0, node_test_1.it)('does not nag: the same partner re-pushing sends nothing more', async () => {
        const { body } = await pushPerson(KEY_A, ORG_A, 'consent-3', 'consent3@example.com');
        const tokens = await db.collection('consent_tokens').where('person_id', '==', body.nexus_id).get();
        assert.equal(tokens.size, 1);
    });
    (0, node_test_1.it)('a second partner linking them sends one more notice, naming that partner', async () => {
        const { body } = await pushPerson(KEY_B, ORG_B, 'b-3', 'consent3@example.com');
        assert.equal(body.action, 'linked');
        const tokens = await db.collection('consent_tokens').where('person_id', '==', body.nexus_id).get();
        assert.equal(tokens.size, 2);
        assert.ok(tokens.docs.some((t) => t.get('referring_eso_id') === ORG_B));
    });
    (0, node_test_1.it)('once they have answered, no partner triggers another notice', async () => {
        const terms = (await call('GET', 'getConsentTerms')).body;
        const { body } = await pushPerson(KEY_A, ORG_A, 'consent-4', 'consent4@example.com', {
            consent: { agreed: true, terms_hash: terms.terms_hash },
        });
        assert.equal(body.consent_notice_sent, false);
        await pushPerson(KEY_B, ORG_B, 'b-4', 'consent4@example.com');
        const tokens = await db.collection('consent_tokens').where('person_id', '==', body.nexus_id).get();
        assert.equal(tokens.size, 0);
    });
});
(0, node_test_1.describe)('the hosted consent link', () => {
    (0, node_test_1.before)(seed);
    let token = '';
    (0, node_test_1.it)('a partner can create a link only for someone it pushed, returning to its own site', async () => {
        await pushPerson(KEY_A, ORG_A, 'link-1', 'link1@example.com');
        const bad = await call('POST', 'partnerCreateConsentLink', {
            ecosystem_id: ECO_ID, external_ref: { source: 'crm', id: 'link-1' }, return_url: 'https://evil.example/',
        }, KEY_A);
        assert.equal(bad.status, 400, 'return_url off the partner site must be refused');
        const otherOrg = await call('POST', 'partnerCreateConsentLink', {
            ecosystem_id: ECO_ID, external_ref: { source: 'crm', id: 'link-1' },
        }, KEY_B);
        assert.equal(otherOrg.status, 404, "partner B must not resolve partner A's record ID");
        const { status, body } = await call('POST', 'partnerCreateConsentLink', {
            ecosystem_id: ECO_ID, external_ref: { source: 'crm', id: 'link-1' },
        }, KEY_A);
        assert.equal(status, 201, JSON.stringify(body));
        token = new URL(body.consent_url).searchParams.get('token') || '';
        assert.match(token, /^[0-9a-f]{64}$/);
    });
    (0, node_test_1.it)('a GET on consentAccept records nothing — it redirects to the page', async () => {
        const { status, headers } = await call('GET', 'consentAccept', undefined, undefined, { token });
        assert.equal(status, 302);
        assert.ok((headers.get('location') || '').includes(`/consent?token=${token}`));
        const session = await call('POST', 'getConsentSession', { token });
        assert.equal(session.status, 200, 'the link must still be unused');
        assert.equal(session.body.requested_by, 'MakeHaven');
    });
    (0, node_test_1.it)('the page records the founder\'s choices once', async () => {
        const terms = (await call('GET', 'getConsentTerms')).body;
        const first = await call('POST', 'consentAccept', {
            token, consent: { agreed: true, terms_hash: terms.terms_hash, directory_listing: false, share_details: true },
        });
        assert.equal(first.status, 200, JSON.stringify(first.body));
        assert.equal(first.body.shares_details, true);
        const again = await call('POST', 'consentAccept', {
            token, consent: { agreed: true, terms_hash: terms.terms_hash },
        });
        assert.equal(again.status, 409);
    });
});
(0, node_test_1.describe)('referrals between partners', () => {
    (0, node_test_1.before)(seed);
    let referralId = '';
    (0, node_test_1.it)('requires the entrepreneur to have agreed', async () => {
        await pushPerson(KEY_A, ORG_A, 'ref-1', 'ref1@example.com');
        const { status, body } = await call('POST', 'partnerCreateReferral', {
            ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'ref-1' },
            receiving_org_id: ORG_B, notes: 'Needs patent help',
        }, KEY_A);
        assert.equal(status, 400);
        assert.equal(body.reason, 'entrepreneur_not_agreed');
    });
    (0, node_test_1.it)('creates a referral, idempotently on the partner\'s own ID', async () => {
        const payload = {
            ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'ref-1' },
            receiving_org_id: ORG_B, notes: 'Needs patent help', entrepreneur_agreed: true,
            referral_external_ref: { source: 'crm', id: 'r-77' },
        };
        const first = await call('POST', 'partnerCreateReferral', payload, KEY_A);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        referralId = first.body.referral_id;
        const second = await call('POST', 'partnerCreateReferral', payload, KEY_A);
        assert.equal(second.body.referral_id, referralId);
        assert.equal(second.body.action, 'existing');
    });
    (0, node_test_1.it)('the receiver sees it, with the intro — the entrepreneur\'s email waits until they accept', async () => {
        const { status, body } = await call('GET', 'partnerListReferrals', undefined, KEY_B, {
            ecosystem_id: ECO_ID, direction: 'incoming', status: 'pending',
        });
        assert.equal(status, 200);
        const row = body.referrals.find((r) => r.referral_id === referralId);
        assert.ok(row);
        assert.equal(row.notes, 'Needs patent help');
        assert.equal(row.entrepreneur.first_name, 'Pilot');
        assert.equal(row.entrepreneur.email, undefined, 'no contact details before accepting');
        assert.equal(row.entrepreneur.your_external_ref, null, "partner B never sees partner A's record ID");
        const outgoing = await call('GET', 'partnerListReferrals', undefined, KEY_A, { ecosystem_id: ECO_ID, direction: 'outgoing' });
        const sent = outgoing.body.referrals.find((r) => r.referral_id === referralId);
        assert.equal(sent.entrepreneur.email, 'ref1@example.com', 'the referring partner already has it');
    });
    (0, node_test_1.it)('only the receiver can answer, following the lifecycle', async () => {
        const byReferrer = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'accepted' }, KEY_A);
        assert.equal(byReferrer.status, 404);
        const skip = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'completed' }, KEY_B);
        assert.equal(skip.status, 409, 'pending cannot jump to completed');
        const accept = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'accepted', response_notes: 'Meeting booked' }, KEY_B);
        assert.equal(accept.status, 200);
        const accepted = await call('GET', 'partnerListReferrals', undefined, KEY_B, { ecosystem_id: ECO_ID, direction: 'incoming', status: 'accepted' });
        assert.equal(accepted.body.referrals.find((r) => r.referral_id === referralId).entrepreneur.email, 'ref1@example.com', 'email arrives once accepted');
        const complete = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'completed', outcome: 'service_delivered' }, KEY_B);
        assert.equal(complete.status, 200);
        const doc = (await db.collection('referrals').doc(referralId).get()).data();
        assert.equal(doc.status, 'completed');
        assert.ok(doc.accepted_at && doc.closed_at);
    });
});
(0, node_test_1.describe)('activity and participation from partner systems', () => {
    (0, node_test_1.before)(seed);
    (0, node_test_1.it)('logs activity with the fact shared and notes private, upserting on the partner\'s ID', async () => {
        await pushPerson(KEY_A, ORG_A, 'act-1', 'act1@example.com');
        const payload = {
            ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'act-1' },
            activity_external_ref: { source: 'crm', id: 'mtg-1' }, type: 'meeting', date: '2026-09-24', notes: 'private',
        };
        const first = await call('POST', 'partnerLogActivity', payload, KEY_A);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        const second = await call('POST', 'partnerLogActivity', { ...payload, share_fact: false }, KEY_A);
        assert.equal(second.body.activity_id, first.body.activity_id);
        const doc = (await db.collection('interactions').doc(first.body.activity_id).get()).data();
        assert.equal(doc.author_org_id, ORG_A);
        assert.equal(doc.visibility, 'eso_private');
    });
    (0, node_test_1.it)('two partners using the same source and ID each resolve their own person', async () => {
        const a = await pushPerson(KEY_A, ORG_A, 'same-42', 'same-a@example.com');
        const b = await pushPerson(KEY_B, ORG_B, 'same-42', 'same-b@example.com');
        assert.equal(a.status, 201);
        assert.equal(b.status, 201, 'a different person under the same partner-chosen ID must not collide');
        assert.notEqual(a.body.nexus_id, b.body.nexus_id);
        const readBack = await call('GET', 'partnerGetPerson', undefined, KEY_B, { source: 'crm', id: 'same-42' });
        assert.equal(readBack.body.person.nexus_id, b.body.nexus_id);
    });
    (0, node_test_1.it)('two partners using the same participation ID never overwrite each other', async () => {
        await pushPerson(KEY_A, ORG_A, 'part-1', 'part1@example.com');
        await pushPerson(KEY_B, ORG_B, 'part-1', 'part1@example.com');
        const body = (name, orgId) => ({
            person_external_ref: { source: 'crm', id: 'part-1' },
            participation_external_ref: { source: 'crm', id: 'part-1_membership' },
            ecosystem_id: ECO_ID, eso_org_id: orgId, participation_type: 'membership',
            name, status: 'active', start_date: '2026-01-01',
        });
        const a = await call('POST', 'partnerUpsertParticipation', body('A membership', ORG_A), KEY_A);
        const b = await call('POST', 'partnerUpsertParticipation', body('B membership', ORG_B), KEY_B);
        assert.equal(a.status, 201, JSON.stringify(a.body));
        assert.equal(b.status, 201, JSON.stringify(b.body));
        assert.notEqual(a.body.participation_id, b.body.participation_id);
        const aDoc = (await db.collection('participations').doc(a.body.participation_id).get()).data();
        assert.equal(aDoc.name, 'A membership');
        assert.equal(aDoc.provider_org_id, ORG_A);
    });
});
// ─── The network view, as a signed-in staff member ────────────────────────────
const AUTH_EMULATOR = 'http://127.0.0.1:59099';
/** Create an emulator auth user and return an ID token for it. */
const signUp = async (email) => {
    const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
    });
    const json = await res.json();
    return { uid: json.localId, idToken: json.idToken };
};
const viewAs = async (idToken, orgId) => {
    const res = await fetch(`${FUNCTIONS_BASE}/getNetworkView`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ ecosystem_id: ECO_ID, acting_org_id: orgId }),
    });
    return { status: res.status, body: await res.json() };
};
const signOrg = async (orgId) => {
    for (const type of content_1.ORG_REQUIRED_AGREEMENTS) {
        await db.collection('org_agreement_acceptances').doc(`${orgId}_${ECO_ID}_${type}`).set({
            org_id: orgId, ecosystem_id: ECO_ID, agreement_type: type, version: content_1.AGREEMENT_VERSIONS[type], signed_at: new Date().toISOString(),
        });
    }
};
(0, node_test_1.describe)('getNetworkView — what a partner sees', () => {
    let staffB = { uid: '', idToken: '' };
    let personId = '';
    (0, node_test_1.before)(async () => {
        await seed();
        staffB = await signUp(`staff-b-${Date.now()}@partner-b.example.org`);
        await db.collection('people').doc(staffB.uid).set({
            id: staffB.uid, auth_uid: staffB.uid, first_name: 'Bea', last_name: 'Staff', email: 'bea@partner-b.example.org',
            system_role: 'eso_staff', organization_id: ORG_B, ecosystem_id: ECO_ID, ecosystem_ids: [ECO_ID],
        });
        // Partner A works with a founder, logs a meeting with notes, and refers them to B.
        const pushed = await pushPerson(KEY_A, ORG_A, 'view-1', `view1-${Date.now()}@example.com`);
        personId = pushed.body.nexus_id;
        await call('POST', 'partnerLogActivity', {
            ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'view-1' },
            type: 'meeting', date: '2026-09-20', notes: 'SECRET NOTE from A',
        }, KEY_A);
        await call('POST', 'partnerUpsertParticipation', {
            person_external_ref: { source: 'crm', id: 'view-1' }, participation_external_ref: { source: 'crm', id: 'view-1_prog' },
            ecosystem_id: ECO_ID, eso_org_id: ORG_A, participation_type: 'program', name: 'SECRET PROGRAM NAME', status: 'active', start_date: '2026-01-01',
        }, KEY_A);
        await call('POST', 'partnerCreateReferral', {
            ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'view-1' }, receiving_org_id: ORG_B,
            notes: 'Intro for B', entrepreneur_agreed: true,
        }, KEY_A);
    });
    (0, node_test_1.it)('an unsigned partner sees only its own records', async () => {
        const { status, body } = await viewAs(staffB.idToken, ORG_B);
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.viewer.org_has_signed, false);
        // Its own records only (it may have some from earlier suites) — nothing of A's.
        assert.ok(body.interactions.every((i) => i.author_org_id === ORG_B), JSON.stringify(body.interactions));
        assert.ok(body.participations.every((p) => p.provider_org_id === ORG_B), JSON.stringify(body.participations));
        // B is a party to the referral, so it still sees that — its own inbox.
        assert.ok(body.referrals.some((r) => r.notes === 'Intro for B'));
    });
    (0, node_test_1.it)('once signed, it sees the facts about someone it works with — never A\'s notes or program name', async () => {
        await signOrg(ORG_B);
        const { status, body } = await viewAs(staffB.idToken, ORG_B);
        assert.equal(status, 200);
        const text = JSON.stringify(body);
        assert.ok(!text.includes('SECRET NOTE from A'), 'notes must never leave the server');
        assert.ok(!text.includes('SECRET PROGRAM NAME'), 'details need the entrepreneur\'s consent');
        const meeting = body.interactions.find((i) => i.author_org_id === ORG_A);
        assert.equal(meeting?._access, 'fact');
        assert.ok(body.people.some((p) => p.id === personId && p._visibility === 'works_with'));
        const person = body.people.find((p) => p.id === personId);
        assert.deepEqual(person.external_refs, [], "B never sees A's record IDs");
    });
    (0, node_test_1.it)('refuses someone acting for an organization they do not belong to', async () => {
        const { body } = await viewAs(staffB.idToken, ORG_A);
        assert.equal(body.viewer.org_id, ORG_B, 'falls back to the caller\'s own organization');
    });
});
// ─── Ventures pushed with their founder, and SSO matching them ────────────────
const MH_SOURCE = 'makehaven_civicrm';
const pushMhPerson = (apiKey, orgId, civiId, email) => call('POST', 'partnerUpsertPerson', {
    external_ref: { source: MH_SOURCE, id: civiId },
    ecosystem_id: ECO_ID, eso_org_id: orgId,
    first_name: 'Founder', last_name: `Civi ${civiId}`, email,
}, apiKey);
const pushVenture = (apiKey, orgId, civiOrgId, extra = {}) => call('POST', 'partnerUpsertOrganization', {
    external_ref: { source: MH_SOURCE, id: civiOrgId },
    ecosystem_id: ECO_ID, eso_org_id: orgId,
    name: `Venture ${civiOrgId}`,
    ...extra,
}, apiKey);
(0, node_test_1.describe)('partnerUpsertOrganization — founder link and venture fields', () => {
    const stamp = Date.now();
    let founderId = '';
    (0, node_test_1.before)(async () => {
        await seed();
        const pushed = await pushMhPerson(KEY_A, ORG_A, `f-${stamp}`, `founder-${stamp}@example.com`);
        assert.equal(pushed.status, 201, JSON.stringify(pushed.body));
        founderId = pushed.body.nexus_id;
    });
    (0, node_test_1.it)('links the founder found by the partner\'s own ref, idempotently', async () => {
        const first = await pushVenture(KEY_A, ORG_A, `v-${stamp}`, { founder_ref: { id: `f-${stamp}` } });
        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(first.body.founder_linked, true);
        const again = await pushVenture(KEY_A, ORG_A, `v-${stamp}`, { founder_ref: { id: `f-${stamp}`, source: MH_SOURCE } });
        assert.equal(again.body.action, 'updated');
        assert.equal(again.body.founder_linked, true);
        const person = (await db.collection('people').doc(founderId).get()).data();
        const affs = (person.organization_affiliations || []).filter((a) => a.organization_id === first.body.nexus_id);
        assert.equal(affs.length, 1, 'one affiliation however often it is pushed');
        assert.equal(affs[0].relationship_type, 'founder');
        assert.equal(affs[0].status, 'active');
        assert.deepEqual(affs[0].ecosystem_ids, [ECO_ID]);
        assert.ok(affs[0].joined_at);
        assert.equal(person.organization_id, first.body.nexus_id, 'an empty primary organization is filled');
    });
    (0, node_test_1.it)('a founder not pushed yet does not fail the upsert', async () => {
        const res = await pushVenture(KEY_A, ORG_A, `v2-${stamp}`, { founder_ref: { id: `nobody-${stamp}` } });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.founder_linked, false);
        assert.equal(res.body.founder_link_reason, 'founder_not_found');
    });
    (0, node_test_1.it)('another partner\'s person ref never resolves', async () => {
        // B pushes a venture naming A's founder id under the same source.
        const res = await pushVenture(KEY_B, ORG_B, `vb-${stamp}`, { founder_ref: { id: `f-${stamp}`, source: MH_SOURCE } });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.founder_linked, false);
        assert.equal(res.body.founder_link_reason, 'founder_not_found');
        const person = (await db.collection('people').doc(founderId).get()).data();
        assert.ok(!(person.organization_affiliations || []).some((a) => a.organization_id === res.body.nexus_id));
    });
    (0, node_test_1.it)('rejects a malformed founder_ref', async () => {
        const res = await pushVenture(KEY_A, ORG_A, `v3-${stamp}`, { founder_ref: { source: MH_SOURCE } });
        assert.equal(res.status, 400);
    });
    (0, node_test_1.it)('stores logo, industry tags, stage, org_type and a normalized domain', async () => {
        const res = await pushVenture(KEY_A, ORG_A, `v4-${stamp}`, {
            url: 'https://www.Acme-Widgets-Test.com/about',
            logo_url: 'https://acme-widgets-test.com/logo.png',
            industry_tags: ['Woodworking', 'woodworking', '  Furniture '],
            stage: '  early revenue ',
            org_type: 'startup',
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.warnings, undefined);
        const org = (await db.collection('organizations').doc(res.body.nexus_id).get()).data();
        assert.equal(org.domain, 'acme-widgets-test.com');
        assert.equal(org.logo_url, 'https://acme-widgets-test.com/logo.png');
        assert.deepEqual(org.classification.industry_tags, ['Woodworking', 'Furniture']);
        assert.equal(org.stage, 'early revenue');
        assert.equal(org.org_type, 'startup');
        const update = await pushVenture(KEY_A, ORG_A, `v4-${stamp}`, { industry_tags: ['Retail'], url: 'https://www.etsy.com/shop/Acme' });
        assert.equal(update.body.action, 'updated');
        const updated = (await db.collection('organizations').doc(res.body.nexus_id).get()).data();
        assert.deepEqual(updated.classification.industry_tags, ['Woodworking', 'Furniture', 'Retail']);
        assert.equal(updated.domain, 'acme-widgets-test.com', 'a shared-platform url never becomes a domain');
    });
    (0, node_test_1.it)('drops an invalid logo or org_type with a warning instead of failing', async () => {
        const res = await pushVenture(KEY_A, ORG_A, `v5-${stamp}`, { logo_url: 'http://insecure.example/logo.png', org_type: 'unicorn' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal((res.body.warnings || []).length, 2);
        const org = (await db.collection('organizations').doc(res.body.nexus_id).get()).data();
        assert.equal(org.logo_url, undefined);
        assert.equal(org.org_type, undefined);
    });
    (0, node_test_1.it)('linking by name fills only empty fields of someone else\'s record', async () => {
        const otherId = `org_existing_${stamp}`;
        await db.collection('organizations').doc(otherId).set({
            id: otherId, name: `Venture name-${stamp}`, description: 'Curated by its manager', roles: [],
            url: 'https://curated.example.com', logo_url: 'https://curated.example.com/logo.png',
            classification: { industry_tags: ['Curated'] }, ecosystem_ids: [ECO_ID], managed_by_ids: ['org_someone_else'],
        });
        const res = await pushVenture(KEY_A, ORG_A, `name-${stamp}`, {
            description: 'Overwrite attempt', url: 'https://mine.example.com', logo_url: 'https://mine.example.com/logo.png',
            industry_tags: ['Added'], stage: 'idea', founder_ref: { id: `f-${stamp}` },
        });
        assert.equal(res.body.action, 'linked', JSON.stringify(res.body));
        assert.equal(res.body.nexus_id, otherId);
        assert.equal(res.body.founder_linked, true);
        const org = (await db.collection('organizations').doc(otherId).get()).data();
        assert.equal(org.description, 'Curated by its manager');
        assert.equal(org.url, 'https://curated.example.com');
        assert.equal(org.logo_url, 'https://curated.example.com/logo.png');
        assert.equal(org.domain, 'curated.example.com', 'domain backfilled from the record\'s own url');
        assert.equal(org.stage, 'idea');
        assert.deepEqual(org.classification.industry_tags, ['Curated', 'Added']);
    });
    (0, node_test_1.it)('a listed founder lists the venture in another partner\'s directory', async () => {
        const venture = await pushVenture(KEY_A, ORG_A, `dir-${stamp}`, { founder_ref: { id: `f-${stamp}` }, logo_url: 'https://acme-widgets-test.com/d.png' });
        await db.collection('network_profiles').doc(founderId).set({ directory_listed_ecosystems: [ECO_ID] }, { merge: true });
        await signOrg(ORG_B);
        const staff = await signUp(`dir-staff-${stamp}@partner-b.example.org`);
        await db.collection('people').doc(staff.uid).set({
            id: staff.uid, auth_uid: staff.uid, first_name: 'Dee', last_name: 'Staff', email: `dir-staff-${stamp}@partner-b.example.org`,
            system_role: 'eso_staff', organization_id: ORG_B, ecosystem_id: ECO_ID, ecosystem_ids: [ECO_ID],
        });
        const { status, body } = await viewAs(staff.idToken, ORG_B);
        assert.equal(status, 200, JSON.stringify(body));
        const listed = body.organizations.find((o) => o.id === venture.body.nexus_id);
        assert.equal(listed?._visibility, 'directory', JSON.stringify(listed));
        assert.equal(listed.logo_url, 'https://acme-widgets-test.com/d.png');
        assert.equal(listed.domain, undefined, 'directory carries only the directory fields');
    });
});
(0, node_test_1.describe)('SSO sign-in matches what the same partner pushed (scoped refs)', () => {
    const stamp = Date.now();
    const PROVIDER_ID = `oidc_test_mh_${stamp}`;
    const civiPerson = `sso-p-${stamp}`;
    const civiVenture = `sso-v-${stamp}`;
    const email = `sso-founder-${stamp}@example.com`;
    let server;
    let personId = '';
    let ventureId = '';
    (0, node_test_1.before)(async () => {
        await seed();
        const person = await pushMhPerson(KEY_A, ORG_A, civiPerson, email);
        personId = person.body.nexus_id;
        const venture = await pushVenture(KEY_A, ORG_A, civiVenture, {
            name: `SSO Venture ${stamp}`, url: `https://sso-venture-${stamp}.example.com`, founder_ref: { id: civiPerson },
        });
        ventureId = venture.body.nexus_id;
        // A stand-in for MakeHaven's Drupal OAuth server.
        server = (0, node_http_1.createServer)((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url?.startsWith('/token')) {
                res.end(JSON.stringify({ access_token: 'test-access-token' }));
            }
            else if (req.url?.startsWith('/userinfo')) {
                res.end(JSON.stringify({
                    email, given_name: 'Founder', family_name: `Civi ${civiPerson}`,
                    drupal_uid: `uid-${stamp}`, civi_contact_id: civiPerson,
                    // Different name and website from the push: only the scoped ref can match.
                    ventures: [{ id: civiVenture, name: `Renamed In Drupal ${stamp}`, website: `https://elsewhere-${stamp}.example.com` }],
                }));
            }
            else {
                res.statusCode = 404;
                res.end('{}');
            }
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
        const { port } = server.address();
        const base = `http://127.0.0.1:${port}`;
        await db.collection('oidc_providers').doc(PROVIDER_ID).set({
            id: PROVIDER_ID, organization_id: ORG_A, ecosystem_id: ECO_ID, display_name: 'Sign in with Test MH',
            authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, userinfo_endpoint: `${base}/userinfo`,
            client_id: 'test-client', client_secret: '', scopes: ['openid'],
            ref_sources: { civi_contact_id: MH_SOURCE, venture_id: MH_SOURCE },
            status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
    });
    (0, node_test_1.after)(() => new Promise((resolve) => server.close(() => resolve())));
    (0, node_test_1.it)('resolves to the pushed person and venture — no duplicate, no review flag', async () => {
        const res = await call('POST', 'oidcExchangeToken', {
            provider_id: PROVIDER_ID, code: 'code', code_verifier: 'verifier', redirect_uri: 'http://localhost:3000/sso/callback',
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.nexus_id, personId, 'Tier-1 match on the partner-scoped person ref');
        const shells = await db.collection('organizations').where('name', '==', `Renamed In Drupal ${stamp}`).get();
        assert.equal(shells.size, 0, 'no duplicate venture shell');
        const flags = await db.collection('dedup_flags').where('source', '==', `oidc:${PROVIDER_ID}`).get();
        assert.equal(flags.size, 0, 'no possible-duplicate flag');
        const person = (await db.collection('people').doc(personId).get()).data();
        const affs = (person.organization_affiliations || []).filter((a) => a.organization_id === ventureId);
        assert.equal(affs.length, 1, 'the founder link from the push is reused, not doubled');
        const scoped = await db.collection('external_ref_index').doc(`person:${ORG_A}:${MH_SOURCE}:${civiPerson}`).get();
        assert.equal(scoped.get('entity_id'), personId);
        // The unmapped drupal_uid stays provider-namespaced and global.
        const uidIndex = await db.collection('external_ref_index').doc(`person:${PROVIDER_ID}:drupal_uid:uid-${stamp}`).get();
        assert.equal(uidIndex.get('entity_id'), personId);
        assert.equal(uidIndex.get('owner_org_id'), undefined);
    });
    (0, node_test_1.it)('another organization\'s provider mapping the same source does not match it', async () => {
        const otherProvider = `${PROVIDER_ID}_b`;
        const base = (await db.collection('oidc_providers').doc(PROVIDER_ID).get()).data();
        await db.collection('oidc_providers').doc(otherProvider).set({ ...base, id: otherProvider, organization_id: ORG_B });
        const res = await call('POST', 'oidcExchangeToken', {
            provider_id: otherProvider, code: 'code', code_verifier: 'verifier', redirect_uri: 'http://localhost:3000/sso/callback',
        });
        // The person still resolves by exact email (in-ecosystem), but B's scoped
        // venture ref must not reach A's venture: B gets its own shell.
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const shells = await db.collection('organizations').where('name', '==', `Renamed In Drupal ${stamp}`).get();
        assert.equal(shells.size, 1);
        assert.notEqual(shells.docs[0].id, ventureId);
        const aIndex = await db.collection('external_ref_index').doc(`organization:${ORG_A}:${MH_SOURCE}:${civiVenture}`).get();
        assert.equal(aIndex.get('entity_id'), ventureId, 'A\'s index entry is untouched');
    });
});
(0, node_test_1.describe)('one person, several emails', () => {
    const stamp = Date.now();
    const selfId = `self-${stamp}`;
    const work = `jr-${stamp}@work.example.org`;
    const personal = `jr-${stamp}@gmail.com`;
    (0, node_test_1.before)(async () => {
        await seed();
        // The founder signed up on their own with a work address, and added
        // their personal address as an extra email.
        await db.collection('people').doc(selfId).set({
            id: selfId, first_name: 'Jay', last_name: `Arr${stamp}`, email: work, secondary_emails: [personal],
            system_role: 'entrepreneur', ecosystem_id: ECO_ID, ecosystem_ids: [ECO_ID], status: 'active',
            external_refs: [], source: 'self_signup', updated_at: new Date().toISOString(),
        });
    });
    (0, node_test_1.it)('a push under an extra email links to that person — and leaves their own name and main email alone', async () => {
        const push = (first) => call('POST', 'partnerUpsertPerson', {
            external_ref: { source: MH_SOURCE, id: `civi-${stamp}` }, ecosystem_id: ECO_ID, eso_org_id: ORG_A,
            first_name: first, last_name: `Arr${stamp}`, email: personal,
        }, KEY_A);
        const first = await push('J.');
        assert.equal(first.status, 200, JSON.stringify(first.body));
        assert.equal(first.body.action, 'linked');
        assert.equal(first.body.nexus_id, selfId);
        const again = await push('Jaybird');
        assert.equal(again.body.action, 'updated');
        const person = (await db.collection('people').doc(selfId).get()).data();
        assert.equal(person.email, work, 'main email is the person\'s own');
        assert.equal(person.first_name, 'Jay', 'name is the person\'s own');
    });
    (0, node_test_1.it)('a partner-created record still follows the partner\'s updates', async () => {
        const id = `own-${stamp}`;
        const body = (email) => ({ external_ref: { source: MH_SOURCE, id }, ecosystem_id: ECO_ID, eso_org_id: ORG_A, first_name: 'Own', last_name: `Rec${stamp}`, email });
        const created = await call('POST', 'partnerUpsertPerson', body(`own-${stamp}@a.example.org`), KEY_A);
        assert.equal(created.body.action, 'created');
        await call('POST', 'partnerUpsertPerson', body(`own-${stamp}@b.example.org`), KEY_A);
        const person = (await db.collection('people').doc(created.body.nexus_id).get()).data();
        assert.equal(person.email, `own-${stamp}@b.example.org`);
    });
    (0, node_test_1.it)('sign-in under an extra email matches the person', async () => {
        const match = await (0, federationDedup_1.matchPerson)(db, { email: personal, display_name: 'Someone Else' });
        assert.equal(match.tier, 'email_exact');
        assert.equal(match.person_id, selfId);
    });
    (0, node_test_1.it)('the same name under an unknown email creates a person and flags the pair for review', async () => {
        const res = await call('POST', 'partnerUpsertPerson', {
            external_ref: { source: MH_SOURCE, id: `other-${stamp}` }, ecosystem_id: ECO_ID, eso_org_id: ORG_A,
            first_name: 'JAY', last_name: `Arr${stamp}`, email: `elsewhere-${stamp}@yahoo.com`,
        }, KEY_A);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.action, 'created', 'never merged on a name');
        assert.equal(res.body.possible_duplicate_flagged, true);
        const flags = await db.collection('dedup_flags').where('new_entity_id', '==', res.body.nexus_id).get();
        assert.equal(flags.size, 1);
        assert.equal(flags.docs[0].get('candidate_entity_id'), selfId);
        assert.equal(flags.docs[0].get('reason'), 'same_name_different_email');
        assert.equal(flags.docs[0].get('status'), 'pending_review');
    });
    (0, node_test_1.it)('a different name raises no flag', async () => {
        const res = await call('POST', 'partnerUpsertPerson', {
            external_ref: { source: MH_SOURCE, id: `diff-${stamp}` }, ecosystem_id: ECO_ID, eso_org_id: ORG_A,
            first_name: 'Kay', last_name: `Arr${stamp}`, email: `kay-${stamp}@yahoo.com`,
        }, KEY_A);
        assert.equal(res.body.action, 'created');
        assert.equal(res.body.possible_duplicate_flagged, undefined);
    });
    (0, node_test_1.it)('sign-in with the same name under an unknown email is a review flag, not a match', async () => {
        const match = await (0, federationDedup_1.matchPerson)(db, { email: `new-${stamp}@hotmail.com`, display_name: `Jay Arr${stamp}`, first_name: 'Jay', last_name: `Arr${stamp}` });
        assert.equal(match.tier, 'weak_signal');
        assert.equal(match.reason, 'same_name_different_email');
    });
});
