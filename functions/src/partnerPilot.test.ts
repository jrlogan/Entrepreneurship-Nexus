/**
 * Integration tests for the pilot additions to the Partner API: consent
 * collected in a partner's own form, the hosted consent link, referrals and
 * activity from partner systems, and the isolation between partners' own
 * record IDs.
 *
 * Runs against the emulators (firestore + functions), like partnerApi.test.ts:
 *   npm --prefix functions run test:emulator
 */
import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AGREEMENT_VERSIONS, ORG_REQUIRED_AGREEMENTS } from './agreements/content';

const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const PROJECT_ID = 'entrepreneurship-nexus-local';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:58080';
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const ECO_ID = 'eco_new_haven';
const ORG_A = 'org_makehaven';
const KEY_A = 'test-api-key-abc123';           // seeded by seedLocalReferenceData
const ORG_B = 'org_pilot_partner_b';
const KEY_B = 'test-api-key-pilot-partner-b';  // created below

const call = async (method: 'GET' | 'POST', path: string, body?: object, apiKey?: string, query?: Record<string, string>) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Nexus-API-Key'] = apiKey;
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${FUNCTIONS_BASE}/${path}${qs}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json: Record<string, any> = {};
  try { json = JSON.parse(text); } catch { /* redirects and HTML */ }
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
    hash: createHash('sha256').update(KEY_B).digest('hex'),
    status: 'active',
    created_at: new Date().toISOString(),
  });
};

const pushPerson = (apiKey: string, orgId: string, id: string, email: string, extra: object = {}) =>
  call('POST', 'partnerUpsertPerson', {
    external_ref: { source: 'crm', id },
    ecosystem_id: ECO_ID,
    eso_org_id: orgId,
    first_name: 'Pilot',
    last_name: `Person ${id}`,
    email,
    ...extra,
  }, apiKey);

describe('consent collected in a partner\'s own form', () => {
  before(seed);

  it('getConsentTerms is public and returns the terms and hash', async () => {
    const { status, body } = await call('GET', 'getConsentTerms');
    assert.equal(status, 200);
    assert.match(body.terms_hash, /^[0-9a-f]{64}$/);
    assert.equal(body.choices.directory_listing.default, false);
  });

  it('records consent sent with the person, against the current terms', async () => {
    const terms = (await call('GET', 'getConsentTerms')).body;
    const { status, body } = await pushPerson(KEY_A, ORG_A, 'consent-1', 'consent1@example.com', {
      consent: { agreed: true, terms_hash: terms.terms_hash, directory_listing: true, share_details: false },
    });
    assert.equal(status, 201, JSON.stringify(body));
    assert.deepEqual(body.consent, { terms_accepted: true, directory_listed: true, shares_details: false });

    const profile = (await db.collection('network_profiles').doc(body.nexus_id).get()).data()!;
    assert.deepEqual(profile.directory_listed_ecosystems, [ECO_ID]);
    assert.deepEqual(profile.detail_sharing_ecosystems, []);

    const acceptance = await db.collection('agreement_acceptances')
      .where('person_id', '==', body.nexus_id).where('agreement_type', '==', 'federation_compact').get();
    assert.equal(acceptance.size, 1);
    assert.equal(acceptance.docs[0].get('accepted_via'), 'partner_form');
    assert.equal(acceptance.docs[0].get('attested_by_org_id'), ORG_A);
  });

  it('refuses consent against outdated terms and creates nothing', async () => {
    const { status, body } = await pushPerson(KEY_A, ORG_A, 'consent-2', 'consent2@example.com', {
      consent: { agreed: true, terms_hash: 'f'.repeat(64) },
    });
    assert.equal(status, 409);
    assert.equal(body.reason, 'terms_outdated');
    const people = await db.collection('people').where('email', '==', 'consent2@example.com').get();
    assert.equal(people.size, 0);
  });

  it('a person pushed without consent starts with everything off', async () => {
    const { body } = await pushPerson(KEY_A, ORG_A, 'consent-3', 'consent3@example.com');
    assert.deepEqual(body.consent, { terms_accepted: false, directory_listed: false, shares_details: false });
  });
});

describe('the hosted consent link', () => {
  before(seed);
  let token = '';

  it('a partner can create a link only for someone it pushed, returning to its own site', async () => {
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

  it('a GET on consentAccept records nothing — it redirects to the page', async () => {
    const { status, headers } = await call('GET', 'consentAccept', undefined, undefined, { token });
    assert.equal(status, 302);
    assert.ok((headers.get('location') || '').includes(`/consent?token=${token}`));
    const session = await call('POST', 'getConsentSession', { token });
    assert.equal(session.status, 200, 'the link must still be unused');
    assert.equal(session.body.requested_by, 'MakeHaven');
  });

  it('the page records the founder\'s choices once', async () => {
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

describe('referrals between partners', () => {
  before(seed);
  let referralId = '';

  it('requires the entrepreneur to have agreed', async () => {
    await pushPerson(KEY_A, ORG_A, 'ref-1', 'ref1@example.com');
    const { status, body } = await call('POST', 'partnerCreateReferral', {
      ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'ref-1' },
      receiving_org_id: ORG_B, notes: 'Needs patent help',
    }, KEY_A);
    assert.equal(status, 400);
    assert.equal(body.reason, 'entrepreneur_not_agreed');
  });

  it('creates a referral, idempotently on the partner\'s own ID', async () => {
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

  it('the receiver sees it, with the entrepreneur\'s contact and the intro', async () => {
    const { status, body } = await call('GET', 'partnerListReferrals', undefined, KEY_B, {
      ecosystem_id: ECO_ID, direction: 'incoming', status: 'pending',
    });
    assert.equal(status, 200);
    const row = body.referrals.find((r: any) => r.referral_id === referralId);
    assert.ok(row);
    assert.equal(row.notes, 'Needs patent help');
    assert.equal(row.entrepreneur.email, 'ref1@example.com');
    assert.equal(row.entrepreneur.your_external_ref, null, "partner B never sees partner A's record ID");
  });

  it('only the receiver can answer, following the lifecycle', async () => {
    const byReferrer = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'accepted' }, KEY_A);
    assert.equal(byReferrer.status, 404);
    const skip = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'completed' }, KEY_B);
    assert.equal(skip.status, 409, 'pending cannot jump to completed');
    const accept = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'accepted', response_notes: 'Meeting booked' }, KEY_B);
    assert.equal(accept.status, 200);
    const complete = await call('POST', 'partnerUpdateReferral', { referral_id: referralId, status: 'completed', outcome: 'service_delivered' }, KEY_B);
    assert.equal(complete.status, 200);
    const doc = (await db.collection('referrals').doc(referralId).get()).data()!;
    assert.equal(doc.status, 'completed');
    assert.ok(doc.accepted_at && doc.closed_at);
  });
});

describe('activity and participation from partner systems', () => {
  before(seed);

  it('logs activity with the fact shared and notes private, upserting on the partner\'s ID', async () => {
    await pushPerson(KEY_A, ORG_A, 'act-1', 'act1@example.com');
    const payload = {
      ecosystem_id: ECO_ID, person_external_ref: { source: 'crm', id: 'act-1' },
      activity_external_ref: { source: 'crm', id: 'mtg-1' }, type: 'meeting', date: '2026-09-24', notes: 'private',
    };
    const first = await call('POST', 'partnerLogActivity', payload, KEY_A);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await call('POST', 'partnerLogActivity', { ...payload, share_fact: false }, KEY_A);
    assert.equal(second.body.activity_id, first.body.activity_id);
    const doc = (await db.collection('interactions').doc(first.body.activity_id).get()).data()!;
    assert.equal(doc.author_org_id, ORG_A);
    assert.equal(doc.visibility, 'eso_private');
  });

  it('two partners using the same source and ID each resolve their own person', async () => {
    const a = await pushPerson(KEY_A, ORG_A, 'same-42', 'same-a@example.com');
    const b = await pushPerson(KEY_B, ORG_B, 'same-42', 'same-b@example.com');
    assert.equal(a.status, 201);
    assert.equal(b.status, 201, 'a different person under the same partner-chosen ID must not collide');
    assert.notEqual(a.body.nexus_id, b.body.nexus_id);
    const readBack = await call('GET', 'partnerGetPerson', undefined, KEY_B, { source: 'crm', id: 'same-42' });
    assert.equal(readBack.body.person.nexus_id, b.body.nexus_id);
  });

  it('two partners using the same participation ID never overwrite each other', async () => {
    await pushPerson(KEY_A, ORG_A, 'part-1', 'part1@example.com');
    await pushPerson(KEY_B, ORG_B, 'part-1', 'part1@example.com');
    const body = (name: string, orgId: string) => ({
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
    const aDoc = (await db.collection('participations').doc(a.body.participation_id).get()).data()!;
    assert.equal(aDoc.name, 'A membership');
    assert.equal(aDoc.provider_org_id, ORG_A);
  });
});

// ─── The network view, as a signed-in staff member ────────────────────────────

const AUTH_EMULATOR = 'http://127.0.0.1:59099';

/** Create an emulator auth user and return an ID token for it. */
const signUp = async (email: string): Promise<{ uid: string; idToken: string }> => {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  const json = await res.json() as { localId: string; idToken: string };
  return { uid: json.localId, idToken: json.idToken };
};

const viewAs = async (idToken: string, orgId: string) => {
  const res = await fetch(`${FUNCTIONS_BASE}/getNetworkView`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ ecosystem_id: ECO_ID, acting_org_id: orgId }),
  });
  return { status: res.status, body: await res.json() as Record<string, any> };
};

const signOrg = async (orgId: string) => {
  for (const type of ORG_REQUIRED_AGREEMENTS) {
    await db.collection('org_agreement_acceptances').doc(`${orgId}_${ECO_ID}_${type}`).set({
      org_id: orgId, ecosystem_id: ECO_ID, agreement_type: type, version: AGREEMENT_VERSIONS[type], signed_at: new Date().toISOString(),
    });
  }
};

describe('getNetworkView — what a partner sees', () => {
  let staffB = { uid: '', idToken: '' };
  let personId = '';

  before(async () => {
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

  it('an unsigned partner sees only its own records', async () => {
    const { status, body } = await viewAs(staffB.idToken, ORG_B);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.viewer.org_has_signed, false);
    // Its own records only (it may have some from earlier suites) — nothing of A's.
    assert.ok(body.interactions.every((i: any) => i.author_org_id === ORG_B), JSON.stringify(body.interactions));
    assert.ok(body.participations.every((p: any) => p.provider_org_id === ORG_B), JSON.stringify(body.participations));
    // B is a party to the referral, so it still sees that — its own inbox.
    assert.ok(body.referrals.some((r: any) => r.notes === 'Intro for B'));
  });

  it('once signed, it sees the facts about someone it works with — never A\'s notes or program name', async () => {
    await signOrg(ORG_B);
    const { status, body } = await viewAs(staffB.idToken, ORG_B);
    assert.equal(status, 200);
    const text = JSON.stringify(body);
    assert.ok(!text.includes('SECRET NOTE from A'), 'notes must never leave the server');
    assert.ok(!text.includes('SECRET PROGRAM NAME'), 'details need the entrepreneur\'s consent');
    const meeting = body.interactions.find((i: any) => i.author_org_id === ORG_A);
    assert.equal(meeting?._access, 'fact');
    assert.ok(body.people.some((p: any) => p.id === personId && p._visibility === 'works_with'));
    const person = body.people.find((p: any) => p.id === personId);
    assert.deepEqual(person.external_refs, [], "B never sees A's record IDs");
  });

  it('refuses someone acting for an organization they do not belong to', async () => {
    const { body } = await viewAs(staffB.idToken, ORG_A);
    assert.equal(body.viewer.org_id, ORG_B, 'falls back to the caller\'s own organization');
  });
});
