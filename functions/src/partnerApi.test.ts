/**
 * Integration tests for the Partner API (partnerApi.ts).
 *
 * Tests the full HTTP contract of each endpoint against the Firebase emulator:
 *   - partnerUpsertPerson   (create / update / link-by-email flows)
 *   - partnerUpsertOrganization
 *   - partnerGetPerson      (privacy scoping — only calling org's refs returned)
 *   - partnerRegisterWebhook
 *   - Missing / wrong API key → 401
 *   - Invalid bodies → 400
 *
 * Prerequisites: Firebase emulator must be running.
 *   firebase emulators:start --only firestore,functions
 *
 * Run with:
 *   npm run test:integration
 *
 * Notes:
 *   - Tests run sequentially (node:test). Emulator state persists between tests
 *     in the same describe block intentionally so we can assert on created docs.
 *   - The `seedLocalReferenceData` function must exist in your deployed functions
 *     and create the org_makehaven org with its api_keys array before each suite.
 */

import { describe, it, before, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Config (matches firebase.json emulator ports) ────────────────────────────

const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const FIRESTORE_HOST = '127.0.0.1:58080';
const PROJECT_ID = 'entrepreneurship-nexus-local';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const post = async (path: string, body: object, apiKey?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Nexus-API-Key'] = apiKey;
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
};

const get = async (path: string, params: Record<string, string>, apiKey?: string) => {
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Nexus-API-Key'] = apiKey;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FUNCTIONS_BASE}/${path}?${qs}`, { headers });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, body: json };
};

const getDoc = async (collection: string, id: string) => {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
};

const getOrgWebhooks = async (orgId: string) => {
  const snap = await db.collection('organizations').doc(orgId).collection('webhooks').get();
  return snap.docs.map(d => d.data());
};

// ─── Seed data constants ──────────────────────────────────────────────────────

const MAKEHAVEN_ORG_ID = 'org_makehaven';
const ECO_ID           = 'eco_new_haven';
const VALID_API_KEY    = 'test-api-key-abc123';

// ─── Suite-level seed ─────────────────────────────────────────────────────────

/**
 * We re-seed before every suite so each describe block starts from a clean slate.
 * If seedLocalReferenceData is idempotent this is safe to call multiple times.
 */
const seed = async () => {
  const { status, body } = await post('seedLocalReferenceData', {});
  assert.equal(status, 200, `Seed failed: ${JSON.stringify(body)}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Authentication guard tests
// ─────────────────────────────────────────────────────────────────────────────

describe('partner API authentication', () => {
  before(seed);

  it('returns 401 when X-Nexus-API-Key header is missing', async () => {
    const { status, body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'test', id: '1' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'A', last_name: 'B', email: 'a@b.com',
    }); // no API key passed
    assert.equal(status, 401);
    assert.ok((body.error as string).includes('X-Nexus-API-Key'));
  });

  it('returns 401 for an invalid API key', async () => {
    const { status } = await post('partnerUpsertPerson', {
      external_ref: { source: 'test', id: '1' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'A', last_name: 'B', email: 'a@b.com',
    }, 'wrong-key-xyz');
    assert.equal(status, 401);
  });

  it('returns 403 when API key org does not match eso_org_id', async () => {
    const { status } = await post('partnerUpsertPerson', {
      external_ref: { source: 'test', id: '99' },
      ecosystem_id: ECO_ID,
      eso_org_id: 'org_some_other_eso',  // API key belongs to org_makehaven
      first_name: 'A', last_name: 'B', email: 'a@b.com',
    }, VALID_API_KEY);
    assert.equal(status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertPerson — create flow
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerUpsertPerson — create new person', () => {
  before(seed);

  let nexusId: string;

  it('returns 201 and nexus_id with action=created', async () => {
    const { status, body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '1001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      tags: ['entrepreneur'],
    }, VALID_API_KEY);

    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.action, 'created');
    assert.ok(typeof body.nexus_id === 'string' && body.nexus_id.length > 0);
    nexusId = body.nexus_id as string;
  });

  it('stores person in Firestore with correct fields', async () => {
    const person = await getDoc('people', nexusId);
    assert.ok(person, 'Person should exist in Firestore');
    assert.equal(person!.email, 'jane@example.com');
    assert.equal(person!.first_name, 'Jane');
    assert.equal(person!.last_name, 'Smith');
    assert.equal(person!.ecosystem_id, ECO_ID);
    assert.equal(person!.source, 'partner_api');
    assert.equal(person!.status, 'active');
    assert.deepEqual(person!.tags, ['entrepreneur']);
  });

  it('writes external_ref_index with deterministic document ID', async () => {
    const indexDoc = await getDoc('external_ref_index', 'person:makehaven_civicrm:1001');
    assert.ok(indexDoc, 'Index entry should exist');
    assert.equal(indexDoc!.entity_id, nexusId);
    assert.equal(indexDoc!.entity_type, 'person');
    assert.equal(indexDoc!.source, 'makehaven_civicrm');
    assert.equal(indexDoc!.external_id, '1001');
  });

  it('email is normalised to lowercase before storage', async () => {
    const { status, body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '1002' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Bob',
      last_name: 'Jones',
      email: 'BOB.JONES@EXAMPLE.COM',
    }, VALID_API_KEY);

    assert.equal(status, 201, JSON.stringify(body));
    const person = await getDoc('people', body.nexus_id as string);
    assert.equal(person!.email, 'bob.jones@example.com');
  });

  it('returns 400 when external_ref fields are missing', async () => {
    const { status } = await post('partnerUpsertPerson', {
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'A', last_name: 'B', email: 'a@b.com',
      // external_ref omitted
    }, VALID_API_KEY);
    assert.equal(status, 400);
  });

  it('returns 400 when required fields are missing', async () => {
    const { status } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '9999' },
      eso_org_id: MAKEHAVEN_ORG_ID,
      // ecosystem_id, first_name, last_name, email all omitted
    }, VALID_API_KEY);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertPerson — update flow (same external_ref pushed again)
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerUpsertPerson — update existing person by ExternalRef', () => {
  before(seed);

  let nexusId: string;

  it('creates a person first', async () => {
    const { body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '2001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Alice',
      last_name: 'Old',
      email: 'alice@example.com',
    }, VALID_API_KEY);
    nexusId = body.nexus_id as string;
  });

  it('returns 200 with action=updated when pushed again', async () => {
    const { status, body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '2001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Alice',
      last_name: 'Updated',
      email: 'alice@example.com',
      tags: ['mentor'],
    }, VALID_API_KEY);

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.action, 'updated');
    assert.equal(body.nexus_id, nexusId, 'Must return the same nexus_id');
  });

  it('updates person fields in Firestore', async () => {
    const person = await getDoc('people', nexusId);
    assert.equal(person!.last_name, 'Updated');
    assert.ok((person!.tags as string[]).includes('mentor'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertPerson — link flow (person already exists with matching email)
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerUpsertPerson — link by email to pre-existing person', () => {
  before(seed);

  let existingNexusId: string;

  it('creates a person directly in Firestore (simulating a Nexus-native signup)', async () => {
    const ref = db.collection('people').doc();
    await ref.set({
      id: ref.id,
      first_name: 'Pre',
      last_name: 'Existing',
      email: 'preexisting@example.com',
      system_role: 'entrepreneur',
      status: 'active',
      external_refs: [],
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    existingNexusId = ref.id;
  });

  it('returns 200 with action=linked when email matches existing person', async () => {
    const { status, body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '3001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Pre',
      last_name: 'Existing',
      email: 'preexisting@example.com',
    }, VALID_API_KEY);

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.action, 'linked');
    assert.equal(body.nexus_id, existingNexusId, 'Should return the existing person ID');
  });

  it('adds ExternalRef to the existing person and indexes it', async () => {
    const person = await getDoc('people', existingNexusId);
    const refs = person!.external_refs as Array<{ source: string; id: string }>;
    assert.ok(refs.some(r => r.source === 'makehaven_civicrm' && r.id === '3001'));

    const indexDoc = await getDoc('external_ref_index', 'person:makehaven_civicrm:3001');
    assert.ok(indexDoc, 'Index entry must be created on link');
    assert.equal(indexDoc!.entity_id, existingNexusId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertOrganization
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerUpsertOrganization — create new organization', () => {
  before(seed);

  let nexusOrgId: string;

  it('returns 201 with action=created', async () => {
    const { status, body } = await post('partnerUpsertOrganization', {
      external_ref: { source: 'makehaven_civicrm', id: 'org_5001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      name: 'Acme Startup',
      email: 'hello@acme.example.com',
      url: 'https://acme.example.com',
      tax_status: 'for_profit',
      tags: ['tech'],
    }, VALID_API_KEY);

    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.action, 'created');
    nexusOrgId = body.nexus_id as string;
  });

  it('stores organization in Firestore with correct fields', async () => {
    const org = await getDoc('organizations', nexusOrgId);
    assert.ok(org, 'Organization should exist');
    assert.equal(org!.name, 'Acme Startup');
    assert.equal(org!.email, 'hello@acme.example.com');
    assert.equal(org!.tax_status, 'for_profit');
    assert.equal(org!.source, 'partner_api');
    assert.equal(org!.operational_visibility, 'restricted');
    assert.ok((org!.authorized_eso_ids as string[]).includes(MAKEHAVEN_ORG_ID));
  });

  it('writes external_ref_index entry for the organization', async () => {
    const indexDoc = await getDoc('external_ref_index', 'organization:makehaven_civicrm:org_5001');
    assert.ok(indexDoc, 'Index entry should exist');
    assert.equal(indexDoc!.entity_id, nexusOrgId);
    assert.equal(indexDoc!.entity_type, 'organization');
  });

  it('returns 200 with action=updated when the same ExternalRef is pushed again', async () => {
    const { status, body } = await post('partnerUpsertOrganization', {
      external_ref: { source: 'makehaven_civicrm', id: 'org_5001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      name: 'Acme Startup (Updated)',
    }, VALID_API_KEY);

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.action, 'updated');
    assert.equal(body.nexus_id, nexusOrgId);

    const org = await getDoc('organizations', nexusOrgId);
    assert.equal(org!.name, 'Acme Startup (Updated)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerGetPerson — retrieve and privacy scoping
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerGetPerson', () => {
  before(seed);

  let nexusId: string;

  it('setup: creates a person via upsert', async () => {
    const { body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '4001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Fetch',
      last_name: 'Me',
      email: 'fetchme@example.com',
      tags: ['active'],
    }, VALID_API_KEY);
    nexusId = body.nexus_id as string;
  });

  it('returns 200 with person data for a valid ExternalRef', async () => {
    const { status, body } = await get(
      'partnerGetPerson',
      { source: 'makehaven_civicrm', id: '4001' },
      VALID_API_KEY,
    );

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    const person = body.person as Record<string, unknown>;
    assert.equal(person.nexus_id, nexusId);
    assert.equal(person.first_name, 'Fetch');
    assert.equal(person.email, 'fetchme@example.com');
    assert.deepEqual(person.tags, ['active']);
  });

  it('only returns external_refs owned by the calling org (privacy scoping)', async () => {
    // Directly inject a ref from a different org into the person's record
    await db.collection('people').doc(nexusId).update({
      external_refs: [
        { source: 'makehaven_civicrm', id: '4001', owner_org_id: MAKEHAVEN_ORG_ID },
        { source: 'other_eso_crm', id: 'ext_999', owner_org_id: 'org_other_eso' },
      ],
    });

    const { body } = await get(
      'partnerGetPerson',
      { source: 'makehaven_civicrm', id: '4001' },
      VALID_API_KEY,
    );
    const person = body.person as Record<string, unknown>;
    const refs = person.external_refs as Array<{ source: string; owner_org_id: string }>;

    assert.equal(refs.length, 1, 'Should only return refs owned by the calling org');
    assert.equal(refs[0].source, 'makehaven_civicrm');
    assert.ok(!refs.some(r => r.owner_org_id === 'org_other_eso'), 'Must not leak other org refs');
  });

  it('returns 404 for an unknown ExternalRef', async () => {
    const { status } = await get(
      'partnerGetPerson',
      { source: 'makehaven_civicrm', id: 'nonexistent_9999' },
      VALID_API_KEY,
    );
    assert.equal(status, 404);
  });

  it('returns 401 without API key', async () => {
    const { status } = await get(
      'partnerGetPerson',
      { source: 'makehaven_civicrm', id: '4001' },
      // no API key
    );
    assert.equal(status, 401);
  });

  it('returns 400 when source or id query params are missing', async () => {
    const { status } = await get('partnerGetPerson', { source: 'makehaven_civicrm' }, VALID_API_KEY);
    assert.equal(status, 400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// partnerRegisterWebhook
// ─────────────────────────────────────────────────────────────────────────────

describe('partnerRegisterWebhook', () => {
  before(seed);

  let webhookId: string;
  let signingSecret: string;

  it('returns 201 with webhook_id and signing_secret', async () => {
    const { status, body } = await post('partnerRegisterWebhook', {
      url: 'https://makehaven.org/nexus/webhook',
      events: ['interaction.logged', 'referral.received'],
      description: 'MakeHaven CiviCRM bridge',
    }, VALID_API_KEY);

    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.ok(typeof body.webhook_id === 'string' && (body.webhook_id as string).startsWith('wh_'));
    assert.ok(typeof body.signing_secret === 'string' && (body.signing_secret as string).startsWith('whsec_'));
    webhookId = body.webhook_id as string;
    signingSecret = body.signing_secret as string;
  });

  it('stores webhook in the organization webhooks subcollection', async () => {
    const webhooks = await getOrgWebhooks(MAKEHAVEN_ORG_ID) as Array<{ id: string; url: string; events: string[]; status: string }>;
    const stored = webhooks.find(wh => wh.id === webhookId);
    assert.ok(stored, 'Webhook should be stored in the org webhooks subcollection');
    assert.equal(stored!.url, 'https://makehaven.org/nexus/webhook');
    assert.deepEqual(stored!.events, ['interaction.logged', 'referral.received']);
    assert.equal(stored!.status, 'active');
  });

  it('signing_secret is persisted in the subcollection for outbound signing', async () => {
    // The secret is stored in the webhooks subcollection (not on the org doc)
    // so it's only readable by platform admins or the org's own ESO operators.
    const webhooks = await getOrgWebhooks(MAKEHAVEN_ORG_ID) as Array<{ id: string; secret: string }>;
    const stored = webhooks.find(wh => wh.id === webhookId);
    assert.ok(stored!.secret.startsWith('whsec_'));
  });

  it('returns 400 for non-HTTPS url', async () => {
    const { status } = await post('partnerRegisterWebhook', {
      url: 'http://insecure.example.com/webhook',
      events: ['interaction.logged'],
    }, VALID_API_KEY);
    assert.equal(status, 400);
  });

  it('returns 400 when events array is empty', async () => {
    const { status } = await post('partnerRegisterWebhook', {
      url: 'https://example.com/webhook',
      events: [],
    }, VALID_API_KEY);
    assert.equal(status, 400);
  });

  it('returns 400 for unknown event types', async () => {
    const { status, body } = await post('partnerRegisterWebhook', {
      url: 'https://example.com/webhook',
      events: ['interaction.logged', 'invalid.event'],
    }, VALID_API_KEY);
    assert.equal(status, 400);
    assert.ok((body.error as string).includes('invalid.event'));
  });

  it('accepts wildcard "*" as an event subscription', async () => {
    const { status, body } = await post('partnerRegisterWebhook', {
      url: 'https://example.com/webhook-wildcard',
      events: ['*'],
    }, VALID_API_KEY);
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.action, undefined); // No "action" field — just ok, webhook_id, signing_secret
    assert.equal(body.ok, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency — upsert twice, same ExternalRef, expect no duplicate in index
// ─────────────────────────────────────────────────────────────────────────────

describe('idempotency — repeated upsert does not duplicate index entries', () => {
  before(seed);

  let nexusId: string;

  it('first push creates the person', async () => {
    const { body } = await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '5001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Idem', last_name: 'Potent', email: 'idem@example.com',
    }, VALID_API_KEY);
    nexusId = body.nexus_id as string;
  });

  it('second push updates without creating a second index document', async () => {
    await post('partnerUpsertPerson', {
      external_ref: { source: 'makehaven_civicrm', id: '5001' },
      ecosystem_id: ECO_ID,
      eso_org_id: MAKEHAVEN_ORG_ID,
      first_name: 'Idem', last_name: 'Potent', email: 'idem@example.com',
    }, VALID_API_KEY);

    // Index doc must be a single document, not duplicated
    const snap = await db
      .collection('external_ref_index')
      .where('source', '==', 'makehaven_civicrm')
      .where('external_id', '==', '5001')
      .get();
    assert.equal(snap.size, 1, 'Index must have exactly one entry per ExternalRef');
    assert.equal(snap.docs[0].data().entity_id, nexusId);
  });
});
