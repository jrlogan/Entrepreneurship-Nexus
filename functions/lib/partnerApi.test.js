"use strict";
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
// ─── Config (matches firebase.json emulator ports) ────────────────────────────
const FUNCTIONS_BASE = 'http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1';
const FIRESTORE_HOST = '127.0.0.1:58080';
const PROJECT_ID = 'entrepreneurship-nexus-local';
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)({ projectId: PROJECT_ID });
}
const db = (0, firestore_1.getFirestore)();
// ─── HTTP helpers ─────────────────────────────────────────────────────────────
const post = async (path, body, apiKey) => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey)
        headers['X-Nexus-API-Key'] = apiKey;
    const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, body: json };
};
const get = async (path, params, apiKey) => {
    const headers = {};
    if (apiKey)
        headers['X-Nexus-API-Key'] = apiKey;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${FUNCTIONS_BASE}/${path}?${qs}`, { headers });
    const json = await res.json();
    return { status: res.status, body: json };
};
const getDoc = async (collection, id) => {
    const snap = await db.collection(collection).doc(id).get();
    return snap.exists ? snap.data() : null;
};
const getOrgWebhooks = async (orgId) => {
    const snap = await db.collection('organizations').doc(orgId).collection('webhooks').get();
    return snap.docs.map(d => d.data());
};
// ─── Seed data constants ──────────────────────────────────────────────────────
const MAKEHAVEN_ORG_ID = 'org_makehaven';
const ECO_ID = 'eco_new_haven';
const VALID_API_KEY = 'test-api-key-abc123';
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
(0, node_test_1.describe)('partner API authentication', () => {
    (0, node_test_1.before)(seed);
    (0, node_test_1.it)('returns 401 when X-Nexus-API-Key header is missing', async () => {
        const { status, body } = await post('partnerUpsertPerson', {
            external_ref: { source: 'test', id: '1' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'A', last_name: 'B', email: 'a@b.com',
        }); // no API key passed
        assert.equal(status, 401);
        assert.ok(body.error.includes('X-Nexus-API-Key'));
    });
    (0, node_test_1.it)('returns 401 for an invalid API key', async () => {
        const { status } = await post('partnerUpsertPerson', {
            external_ref: { source: 'test', id: '1' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'A', last_name: 'B', email: 'a@b.com',
        }, 'wrong-key-xyz');
        assert.equal(status, 401);
    });
    (0, node_test_1.it)('returns 403 when API key org does not match eso_org_id', async () => {
        const { status } = await post('partnerUpsertPerson', {
            external_ref: { source: 'test', id: '99' },
            ecosystem_id: ECO_ID,
            eso_org_id: 'org_some_other_eso', // API key belongs to org_makehaven
            first_name: 'A', last_name: 'B', email: 'a@b.com',
        }, VALID_API_KEY);
        assert.equal(status, 403);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertPerson — create flow
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('partnerUpsertPerson — create new person', () => {
    (0, node_test_1.before)(seed);
    let nexusId;
    (0, node_test_1.it)('returns 201 and nexus_id with action=created', async () => {
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
        nexusId = body.nexus_id;
    });
    (0, node_test_1.it)('stores person in Firestore with correct fields', async () => {
        const person = await getDoc('people', nexusId);
        assert.ok(person, 'Person should exist in Firestore');
        assert.equal(person.email, 'jane@example.com');
        assert.equal(person.first_name, 'Jane');
        assert.equal(person.last_name, 'Smith');
        assert.equal(person.ecosystem_id, ECO_ID);
        assert.equal(person.source, 'partner_api');
        assert.equal(person.status, 'active');
        assert.deepEqual(person.tags, ['entrepreneur']);
    });
    (0, node_test_1.it)('writes external_ref_index with deterministic document ID', async () => {
        const indexDoc = await getDoc('external_ref_index', 'person:makehaven_civicrm:1001');
        assert.ok(indexDoc, 'Index entry should exist');
        assert.equal(indexDoc.entity_id, nexusId);
        assert.equal(indexDoc.entity_type, 'person');
        assert.equal(indexDoc.source, 'makehaven_civicrm');
        assert.equal(indexDoc.external_id, '1001');
    });
    (0, node_test_1.it)('email is normalised to lowercase before storage', async () => {
        const { status, body } = await post('partnerUpsertPerson', {
            external_ref: { source: 'makehaven_civicrm', id: '1002' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'Bob',
            last_name: 'Jones',
            email: 'BOB.JONES@EXAMPLE.COM',
        }, VALID_API_KEY);
        assert.equal(status, 201, JSON.stringify(body));
        const person = await getDoc('people', body.nexus_id);
        assert.equal(person.email, 'bob.jones@example.com');
    });
    (0, node_test_1.it)('returns 400 when external_ref fields are missing', async () => {
        const { status } = await post('partnerUpsertPerson', {
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'A', last_name: 'B', email: 'a@b.com',
            // external_ref omitted
        }, VALID_API_KEY);
        assert.equal(status, 400);
    });
    (0, node_test_1.it)('returns 400 when required fields are missing', async () => {
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
(0, node_test_1.describe)('partnerUpsertPerson — update existing person by ExternalRef', () => {
    (0, node_test_1.before)(seed);
    let nexusId;
    (0, node_test_1.it)('creates a person first', async () => {
        const { body } = await post('partnerUpsertPerson', {
            external_ref: { source: 'makehaven_civicrm', id: '2001' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'Alice',
            last_name: 'Old',
            email: 'alice@example.com',
        }, VALID_API_KEY);
        nexusId = body.nexus_id;
    });
    (0, node_test_1.it)('returns 200 with action=updated when pushed again', async () => {
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
    (0, node_test_1.it)('updates person fields in Firestore', async () => {
        const person = await getDoc('people', nexusId);
        assert.equal(person.last_name, 'Updated');
        assert.ok(person.tags.includes('mentor'));
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertPerson — link flow (person already exists with matching email)
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('partnerUpsertPerson — link by email to pre-existing person', () => {
    (0, node_test_1.before)(seed);
    let existingNexusId;
    (0, node_test_1.it)('creates a person directly in Firestore (simulating a Nexus-native signup)', async () => {
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
    (0, node_test_1.it)('returns 200 with action=linked when email matches existing person', async () => {
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
    (0, node_test_1.it)('adds ExternalRef to the existing person and indexes it', async () => {
        const person = await getDoc('people', existingNexusId);
        const refs = person.external_refs;
        assert.ok(refs.some(r => r.source === 'makehaven_civicrm' && r.id === '3001'));
        const indexDoc = await getDoc('external_ref_index', 'person:makehaven_civicrm:3001');
        assert.ok(indexDoc, 'Index entry must be created on link');
        assert.equal(indexDoc.entity_id, existingNexusId);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// partnerUpsertOrganization
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('partnerUpsertOrganization — create new organization', () => {
    (0, node_test_1.before)(seed);
    let nexusOrgId;
    (0, node_test_1.it)('returns 201 with action=created', async () => {
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
        nexusOrgId = body.nexus_id;
    });
    (0, node_test_1.it)('stores organization in Firestore with correct fields', async () => {
        const org = await getDoc('organizations', nexusOrgId);
        assert.ok(org, 'Organization should exist');
        assert.equal(org.name, 'Acme Startup');
        assert.equal(org.email, 'hello@acme.example.com');
        assert.equal(org.tax_status, 'for_profit');
        assert.equal(org.source, 'partner_api');
        assert.equal(org.operational_visibility, 'restricted');
        assert.ok(org.authorized_eso_ids.includes(MAKEHAVEN_ORG_ID));
    });
    (0, node_test_1.it)('writes external_ref_index entry for the organization', async () => {
        const indexDoc = await getDoc('external_ref_index', 'organization:makehaven_civicrm:org_5001');
        assert.ok(indexDoc, 'Index entry should exist');
        assert.equal(indexDoc.entity_id, nexusOrgId);
        assert.equal(indexDoc.entity_type, 'organization');
    });
    (0, node_test_1.it)('returns 200 with action=updated when the same ExternalRef is pushed again', async () => {
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
        assert.equal(org.name, 'Acme Startup (Updated)');
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// partnerGetPerson — retrieve and privacy scoping
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('partnerGetPerson', () => {
    (0, node_test_1.before)(seed);
    let nexusId;
    (0, node_test_1.it)('setup: creates a person via upsert', async () => {
        const { body } = await post('partnerUpsertPerson', {
            external_ref: { source: 'makehaven_civicrm', id: '4001' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'Fetch',
            last_name: 'Me',
            email: 'fetchme@example.com',
            tags: ['active'],
        }, VALID_API_KEY);
        nexusId = body.nexus_id;
    });
    (0, node_test_1.it)('returns 200 with person data for a valid ExternalRef', async () => {
        const { status, body } = await get('partnerGetPerson', { source: 'makehaven_civicrm', id: '4001' }, VALID_API_KEY);
        assert.equal(status, 200, JSON.stringify(body));
        assert.equal(body.ok, true);
        const person = body.person;
        assert.equal(person.nexus_id, nexusId);
        assert.equal(person.first_name, 'Fetch');
        assert.equal(person.email, 'fetchme@example.com');
        assert.deepEqual(person.tags, ['active']);
    });
    (0, node_test_1.it)('only returns external_refs owned by the calling org (privacy scoping)', async () => {
        // Directly inject a ref from a different org into the person's record
        await db.collection('people').doc(nexusId).update({
            external_refs: [
                { source: 'makehaven_civicrm', id: '4001', owner_org_id: MAKEHAVEN_ORG_ID },
                { source: 'other_eso_crm', id: 'ext_999', owner_org_id: 'org_other_eso' },
            ],
        });
        const { body } = await get('partnerGetPerson', { source: 'makehaven_civicrm', id: '4001' }, VALID_API_KEY);
        const person = body.person;
        const refs = person.external_refs;
        assert.equal(refs.length, 1, 'Should only return refs owned by the calling org');
        assert.equal(refs[0].source, 'makehaven_civicrm');
        assert.ok(!refs.some(r => r.owner_org_id === 'org_other_eso'), 'Must not leak other org refs');
    });
    (0, node_test_1.it)('returns 404 for an unknown ExternalRef', async () => {
        const { status } = await get('partnerGetPerson', { source: 'makehaven_civicrm', id: 'nonexistent_9999' }, VALID_API_KEY);
        assert.equal(status, 404);
    });
    (0, node_test_1.it)('returns 401 without API key', async () => {
        const { status } = await get('partnerGetPerson', { source: 'makehaven_civicrm', id: '4001' });
        assert.equal(status, 401);
    });
    (0, node_test_1.it)('returns 400 when source or id query params are missing', async () => {
        const { status } = await get('partnerGetPerson', { source: 'makehaven_civicrm' }, VALID_API_KEY);
        assert.equal(status, 400);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// partnerRegisterWebhook
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('partnerRegisterWebhook', () => {
    (0, node_test_1.before)(seed);
    let webhookId;
    let signingSecret;
    (0, node_test_1.it)('returns 201 with webhook_id and signing_secret', async () => {
        const { status, body } = await post('partnerRegisterWebhook', {
            url: 'https://makehaven.org/nexus/webhook',
            events: ['interaction.logged', 'referral.received'],
            description: 'MakeHaven CiviCRM bridge',
        }, VALID_API_KEY);
        assert.equal(status, 201, JSON.stringify(body));
        assert.equal(body.ok, true);
        assert.ok(typeof body.webhook_id === 'string' && body.webhook_id.startsWith('wh_'));
        assert.ok(typeof body.signing_secret === 'string' && body.signing_secret.startsWith('whsec_'));
        webhookId = body.webhook_id;
        signingSecret = body.signing_secret;
    });
    (0, node_test_1.it)('stores webhook in the organization webhooks subcollection', async () => {
        const webhooks = await getOrgWebhooks(MAKEHAVEN_ORG_ID);
        const stored = webhooks.find(wh => wh.id === webhookId);
        assert.ok(stored, 'Webhook should be stored in the org webhooks subcollection');
        assert.equal(stored.url, 'https://makehaven.org/nexus/webhook');
        assert.deepEqual(stored.events, ['interaction.logged', 'referral.received']);
        assert.equal(stored.status, 'active');
    });
    (0, node_test_1.it)('signing_secret is persisted in the subcollection for outbound signing', async () => {
        // The secret is stored in the webhooks subcollection (not on the org doc)
        // so it's only readable by platform admins or the org's own ESO operators.
        const webhooks = await getOrgWebhooks(MAKEHAVEN_ORG_ID);
        const stored = webhooks.find(wh => wh.id === webhookId);
        assert.ok(stored.secret.startsWith('whsec_'));
    });
    (0, node_test_1.it)('returns 400 for non-HTTPS url', async () => {
        const { status } = await post('partnerRegisterWebhook', {
            url: 'http://insecure.example.com/webhook',
            events: ['interaction.logged'],
        }, VALID_API_KEY);
        assert.equal(status, 400);
    });
    (0, node_test_1.it)('returns 400 when events array is empty', async () => {
        const { status } = await post('partnerRegisterWebhook', {
            url: 'https://example.com/webhook',
            events: [],
        }, VALID_API_KEY);
        assert.equal(status, 400);
    });
    (0, node_test_1.it)('returns 400 for unknown event types', async () => {
        const { status, body } = await post('partnerRegisterWebhook', {
            url: 'https://example.com/webhook',
            events: ['interaction.logged', 'invalid.event'],
        }, VALID_API_KEY);
        assert.equal(status, 400);
        assert.ok(body.error.includes('invalid.event'));
    });
    (0, node_test_1.it)('accepts wildcard "*" as an event subscription', async () => {
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
(0, node_test_1.describe)('idempotency — repeated upsert does not duplicate index entries', () => {
    (0, node_test_1.before)(seed);
    let nexusId;
    (0, node_test_1.it)('first push creates the person', async () => {
        const { body } = await post('partnerUpsertPerson', {
            external_ref: { source: 'makehaven_civicrm', id: '5001' },
            ecosystem_id: ECO_ID,
            eso_org_id: MAKEHAVEN_ORG_ID,
            first_name: 'Idem', last_name: 'Potent', email: 'idem@example.com',
        }, VALID_API_KEY);
        nexusId = body.nexus_id;
    });
    (0, node_test_1.it)('second push updates without creating a second index document', async () => {
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
