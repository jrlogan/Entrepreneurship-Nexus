/**
 * Partner API — Cloud Functions for ESO integration (e.g. CiviCRM → Nexus)
 *
 * These endpoints allow trusted partner systems (identified by Nexus API keys)
 * to push and pull data for entrepreneurs and organizations, and to register
 * outbound webhook endpoints for real-time event delivery.
 *
 * Auth: All endpoints require an X-Nexus-API-Key header, issued per ESO via
 * the Nexus API Console. Machine-to-machine only — no user JWT accepted here.
 *
 * Identity: People and organizations are matched by ExternalRef first
 * ({ source: "makehaven_civicrm", id: "12345" }), then by email/name.
 * An `external_ref_index` collection provides O(1) lookups.
 *
 * Idempotency: All upserts are safe to replay. A repeated push updates the
 * existing record rather than creating a duplicate.
 *
 * Outbound delivery: Firestore triggers on `interactions` and `referrals`
 * fire webhooks to registered URLs, signed with HMAC-SHA256.
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createHmac, randomBytes } from 'crypto';

// ─── Internal types ───────────────────────────────────────────────────────────

interface ExternalRef {
  source: string;        // e.g. "makehaven_civicrm"
  id: string;            // ID in the external system
  owner_org_id?: string; // Nexus org ID that manages this reference
}

interface ApiKeyRecord {
  id: string;
  label: string;
  prefix: string;
  status: 'active' | 'revoked';
}

interface ApiKeyAuthContext {
  type: 'api_key';
  organization_id: string;
  key_id: string;
  label: string;
}

interface WebhookRecord {
  id: string;
  url: string;
  description?: string;
  events: string[];
  secret: string;
  status: 'active' | 'inactive' | 'failed';
  created_at: string;
  last_delivery?: string;
}

// ─── Helpers (mirrors of index.ts utilities; extract to shared.ts in cleanup) ──

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const setCors = (res: any) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-API-Key');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};

const handlePreflight = (req: any, res: any): boolean => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

/**
 * Validates an API key against the organizations collection.
 * Note: Uses a full collection scan (same MVP pattern as index.ts validateApiKey).
 * A proper implementation should use a hashed lookup in a separate collection.
 */
const validateApiKey = async (
  db: FirebaseFirestore.Firestore,
  apiKey: string
): Promise<ApiKeyAuthContext | null> => {
  if (!apiKey) return null;
  const snapshot = await db.collection('organizations').get();
  for (const doc of snapshot.docs) {
    const keys = (doc.get('api_keys') || []) as ApiKeyRecord[];
    const match = keys.find(
      k =>
        k.status === 'active' &&
        (k.prefix === apiKey || apiKey.startsWith(k.prefix.replace('...', '')))
    );
    if (match) {
      return {
        type: 'api_key',
        organization_id: doc.id,
        key_id: match.id,
        label: match.label,
      };
    }
  }
  return null;
};

/**
 * Partner API requires API key auth. User JWTs are not accepted — this API is
 * machine-to-machine only.
 */
const requireApiKey = async (
  req: any,
  res: any,
  db: FirebaseFirestore.Firestore
): Promise<ApiKeyAuthContext | null> => {
  const apiKey = req.get('X-Nexus-API-Key');
  if (!apiKey) {
    res.status(401).json({ error: 'X-Nexus-API-Key header required for partner API' });
    return null;
  }
  const context = await validateApiKey(db, apiKey);
  if (!context) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return null;
  }
  return context;
};

const logAudit = async (
  db: FirebaseFirestore.Firestore,
  action: string,
  actorId: string,
  details: Record<string, unknown>
) => {
  try {
    await db.collection('audit_logs').add({
      action,
      actor_id: actorId,
      timestamp: new Date().toISOString(),
      details,
    });
  } catch {
    // Audit log failure must not fail the request
  }
};

// ─── ExternalRef index ────────────────────────────────────────────────────────

/**
 * Writes a lookup entry to `external_ref_index` so future lookups are O(1).
 * Document ID: "{entityType}:{source}:{externalId}" — deterministic, so writes
 * are idempotent even if called multiple times for the same ref.
 */
const indexExternalRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef,
  entityType: 'person' | 'organization',
  entityId: string
) => {
  const docId = `${entityType}:${ref.source}:${ref.id}`;
  await db.collection('external_ref_index').doc(docId).set({
    ref_key: `${ref.source}:${ref.id}`,
    source: ref.source,
    external_id: ref.id,
    entity_type: entityType,
    entity_id: entityId,
    indexed_at: new Date().toISOString(),
  });
};

const findByExternalRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef,
  entityType: 'person' | 'organization'
): Promise<{ id: string; data: admin.firestore.DocumentData } | null> => {
  const docId = `${entityType}:${ref.source}:${ref.id}`;
  const indexDoc = await db.collection('external_ref_index').doc(docId).get();
  if (!indexDoc.exists) return null;

  const entityId = indexDoc.get('entity_id') as string;
  const collection = entityType === 'person' ? 'people' : 'organizations';
  const entityDoc = await db.collection(collection).doc(entityId).get();
  if (!entityDoc.exists) return null;

  return { id: entityDoc.id, data: entityDoc.data()! };
};

// ─── Outbound webhook delivery ────────────────────────────────────────────────

const signPayload = (secret: string, body: string): string =>
  createHmac('sha256', secret).update(body).digest('hex');

const deliverToWebhook = async (
  webhook: WebhookRecord,
  event: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; error?: string }> => {
  if (webhook.status !== 'active') return { ok: false, error: 'webhook inactive' };
  if (!webhook.events.includes(event) && !webhook.events.includes('*')) {
    return { ok: false, error: 'event not subscribed' };
  }

  const payload = {
    id: randomBytes(16).toString('hex'),
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(webhook.secret, body);

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Signature': `sha256=${signature}`,
        'X-Nexus-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, status: response.status };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
};

/**
 * Delivers an event to all webhooks registered on the given organization.
 * Uses Promise.allSettled so a failing delivery doesn't block others.
 */
const deliverWebhooksForOrg = async (
  db: FirebaseFirestore.Firestore,
  orgId: string,
  event: string,
  data: Record<string, unknown>
) => {
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  if (!orgDoc.exists) return;
  const webhooks = (orgDoc.get('webhooks') || []) as WebhookRecord[];
  if (webhooks.length === 0) return;

  await Promise.allSettled(webhooks.map(wh => deliverToWebhook(wh, event, data)));
};

// ─── Exported HTTP functions ──────────────────────────────────────────────────

/**
 * POST /partnerUpsertPerson
 *
 * Creates or updates a person record by external system identifier.
 * Call this when an entrepreneur is enrolled or their profile changes in CiviCRM.
 *
 * Required header: X-Nexus-API-Key
 *
 * Body:
 *   external_ref   { source: "makehaven_civicrm", id: "12345" }
 *   ecosystem_id   string  — Nexus ecosystem to place the person in
 *   eso_org_id     string  — Nexus org ID of the submitting ESO (must match API key)
 *   first_name     string
 *   last_name      string
 *   email          string
 *   tags?          string[]
 *
 * Response:
 *   { ok: true, nexus_id: string, action: "created" | "updated" | "linked" }
 *   action "linked" means an existing person was found by email and the
 *   ExternalRef was added to their record.
 */
export const partnerUpsertPerson = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;

  const externalRef = req.body?.external_ref as Partial<ExternalRef> | undefined;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  const esoOrgId = normalize(req.body?.eso_org_id) || authContext.organization_id;
  const firstName = (req.body?.first_name || '').toString().trim();
  const lastName = (req.body?.last_name || '').toString().trim();
  const email = normalize(req.body?.email);
  const tags: string[] = Array.isArray(req.body?.tags) ? req.body.tags : [];

  if (!externalRef?.source || !externalRef?.id) {
    res.status(400).json({ error: 'external_ref.source and external_ref.id are required' });
    return;
  }
  if (!ecosystemId || !firstName || !lastName || !email) {
    res.status(400).json({ error: 'ecosystem_id, first_name, last_name, and email are required' });
    return;
  }
  if (authContext.organization_id !== esoOrgId) {
    res.status(403).json({ error: 'API key organization does not match eso_org_id' });
    return;
  }

  const ref: ExternalRef = {
    source: externalRef.source,
    id: externalRef.id,
    owner_org_id: esoOrgId,
  };
  const now = new Date().toISOString();

  // 1. Try ExternalRef index lookup (O(1))
  const byRef = await findByExternalRef(db, ref, 'person');
  if (byRef) {
    const existingRefs = (byRef.data.external_refs || []) as ExternalRef[];
    const refPresent = existingRefs.some(r => r.source === ref.source && r.id === ref.id);
    await db.collection('people').doc(byRef.id).set(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        external_refs: refPresent ? existingRefs : [...existingRefs, ref],
        tags: Array.from(new Set([...(byRef.data.tags || []), ...tags])),
        updated_at: now,
        updated_via_api_key_id: authContext.key_id,
      },
      { merge: true }
    );
    await logAudit(db, 'partner_person_updated', authContext.organization_id, {
      nexus_id: byRef.id,
      external_ref: ref,
    });
    res.json({ ok: true, nexus_id: byRef.id, action: 'updated' });
    return;
  }

  // 2. Try email match — add ExternalRef to existing person
  const emailSnap = await db.collection('people').where('email', '==', email).limit(1).get();
  if (!emailSnap.empty) {
    const existing = emailSnap.docs[0];
    const existingRefs = (existing.get('external_refs') || []) as ExternalRef[];
    await existing.ref.set(
      {
        external_refs: [...existingRefs, ref],
        tags: Array.from(new Set([...(existing.get('tags') || []), ...tags])),
        updated_at: now,
        updated_via_api_key_id: authContext.key_id,
      },
      { merge: true }
    );
    await indexExternalRef(db, ref, 'person', existing.id);
    await logAudit(db, 'partner_person_linked', authContext.organization_id, {
      nexus_id: existing.id,
      external_ref: ref,
    });
    res.json({ ok: true, nexus_id: existing.id, action: 'linked' });
    return;
  }

  // 3. Create new person record (partner-managed; no Firebase Auth account)
  const personRef = db.collection('people').doc();
  await personRef.set({
    id: personRef.id,
    first_name: firstName,
    last_name: lastName,
    email,
    system_role: 'entrepreneur',
    organization_id: '',
    ecosystem_id: ecosystemId,
    memberships: [],
    external_refs: [ref],
    tags,
    status: 'active',
    source: 'partner_api',
    created_at: now,
    updated_at: now,
    created_via_api_key_id: authContext.key_id,
    created_by_org_id: esoOrgId,
  });
  await indexExternalRef(db, ref, 'person', personRef.id);
  await logAudit(db, 'partner_person_created', authContext.organization_id, {
    nexus_id: personRef.id,
    external_ref: ref,
  });

  res.status(201).json({ ok: true, nexus_id: personRef.id, action: 'created' });
});


/**
 * POST /partnerUpsertOrganization
 *
 * Creates or updates an organization record by external system identifier.
 * Call this to sync an entrepreneur's business from CiviCRM into the Nexus.
 *
 * Required header: X-Nexus-API-Key
 *
 * Body:
 *   external_ref   { source: "makehaven_civicrm", id: "67890" }
 *   ecosystem_id   string
 *   eso_org_id     string   — must match API key organization
 *   name           string
 *   description?   string
 *   email?         string
 *   url?           string
 *   tax_status?    "non_profit" | "for_profit" | "government" | "other"
 *   tags?          string[]
 *
 * Response:
 *   { ok: true, nexus_id: string, action: "created" | "updated" | "linked" }
 */
export const partnerUpsertOrganization = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;

  const externalRef = req.body?.external_ref as Partial<ExternalRef> | undefined;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  const esoOrgId = normalize(req.body?.eso_org_id) || authContext.organization_id;
  const name = (req.body?.name || '').toString().trim();
  const description = (req.body?.description || '').toString().trim();
  const email = normalize(req.body?.email);
  const url = (req.body?.url || '').toString().trim();
  const taxStatus = normalize(req.body?.tax_status) || 'other';
  const tags: string[] = Array.isArray(req.body?.tags) ? req.body.tags : [];

  if (!externalRef?.source || !externalRef?.id) {
    res.status(400).json({ error: 'external_ref.source and external_ref.id are required' });
    return;
  }
  if (!ecosystemId || !name) {
    res.status(400).json({ error: 'ecosystem_id and name are required' });
    return;
  }
  if (authContext.organization_id !== esoOrgId) {
    res.status(403).json({ error: 'API key organization does not match eso_org_id' });
    return;
  }

  const ref: ExternalRef = {
    source: externalRef.source,
    id: externalRef.id,
    owner_org_id: esoOrgId,
  };
  const now = new Date().toISOString();

  // 1. ExternalRef index lookup
  const byRef = await findByExternalRef(db, ref, 'organization');
  if (byRef) {
    const existingRefs = (byRef.data.external_refs || []) as ExternalRef[];
    const refPresent = existingRefs.some(r => r.source === ref.source && r.id === ref.id);
    await db.collection('organizations').doc(byRef.id).set(
      {
        name,
        ...(description && { description }),
        ...(email && { email }),
        ...(url && { url }),
        external_refs: refPresent ? existingRefs : [...existingRefs, ref],
        tags: Array.from(new Set([...(byRef.data.tags || []), ...tags])),
        updated_at: now,
        updated_via_api_key_id: authContext.key_id,
      },
      { merge: true }
    );
    await logAudit(db, 'partner_org_updated', authContext.organization_id, {
      nexus_id: byRef.id,
      external_ref: ref,
    });
    res.json({ ok: true, nexus_id: byRef.id, action: 'updated' });
    return;
  }

  // 2. Exact name match within ecosystem — link ExternalRef to existing org
  const ecosystemOrgs = await db
    .collection('organizations')
    .where('ecosystem_ids', 'array-contains', ecosystemId)
    .get();
  const nameMatch = ecosystemOrgs.docs.find(d => normalize(d.get('name')) === normalize(name));
  if (nameMatch) {
    const existingRefs = (nameMatch.get('external_refs') || []) as ExternalRef[];
    await nameMatch.ref.set(
      {
        external_refs: [...existingRefs, ref],
        tags: Array.from(new Set([...(nameMatch.get('tags') || []), ...tags])),
        updated_at: now,
        updated_via_api_key_id: authContext.key_id,
      },
      { merge: true }
    );
    await indexExternalRef(db, ref, 'organization', nameMatch.id);
    await logAudit(db, 'partner_org_linked', authContext.organization_id, {
      nexus_id: nameMatch.id,
      external_ref: ref,
    });
    res.json({ ok: true, nexus_id: nameMatch.id, action: 'linked' });
    return;
  }

  // 3. Create new organization (restricted visibility, managed by the ESO)
  const orgRef = db.collection('organizations').doc();
  await orgRef.set({
    id: orgRef.id,
    name,
    description: description || '',
    ...(email && { email }),
    ...(url && { url }),
    tax_status: taxStatus,
    roles: [],
    classification: { industry_tags: [] },
    external_refs: [ref],
    managed_by_ids: [esoOrgId],
    operational_visibility: 'restricted',
    authorized_eso_ids: [esoOrgId],
    ecosystem_ids: [ecosystemId],
    tags,
    status: 'active',
    version: 1,
    source: 'partner_api',
    created_at: now,
    updated_at: now,
    created_via_api_key_id: authContext.key_id,
    created_by_org_id: esoOrgId,
  });
  await indexExternalRef(db, ref, 'organization', orgRef.id);
  await logAudit(db, 'partner_org_created', authContext.organization_id, {
    nexus_id: orgRef.id,
    external_ref: ref,
  });

  res.status(201).json({ ok: true, nexus_id: orgRef.id, action: 'created' });
});


/**
 * GET /partnerGetPerson?source=makehaven_civicrm&id=12345
 *
 * Retrieves a Nexus person record by external system ID.
 * Returns only fields the calling ESO is entitled to see — external_refs are
 * filtered to only show refs owned by the calling org.
 *
 * Required header: X-Nexus-API-Key
 */
export const partnerGetPerson = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;

  const source = normalize(req.query?.source as string);
  const externalId = normalize(req.query?.id as string);

  if (!source || !externalId) {
    res.status(400).json({ error: 'source and id query parameters are required' });
    return;
  }

  const found = await findByExternalRef(db, { source, id: externalId }, 'person');
  if (!found) {
    res.status(404).json({ error: 'No person found for the given external reference' });
    return;
  }

  // Only expose ExternalRefs owned by the calling org — never leak other ESOs' IDs
  const ownedRefs = ((found.data.external_refs || []) as ExternalRef[]).filter(
    r => r.owner_org_id === authContext.organization_id
  );

  res.json({
    ok: true,
    person: {
      nexus_id: found.id,
      first_name: found.data.first_name,
      last_name: found.data.last_name,
      email: found.data.email,
      status: found.data.status,
      tags: found.data.tags || [],
      external_refs: ownedRefs,
      created_at: found.data.created_at,
      updated_at: found.data.updated_at,
    },
  });
});


/**
 * POST /partnerRegisterWebhook
 *
 * Registers an HTTPS endpoint on the ESO's organization to receive Nexus events.
 * The signing_secret is returned once — store it immediately to verify incoming
 * X-Nexus-Signature headers (HMAC-SHA256 of the raw request body).
 *
 * Required header: X-Nexus-API-Key
 *
 * Body:
 *   url        string    — HTTPS endpoint (must start with https://)
 *   events     string[]  — one or more of the valid event types below, or ["*"]
 *   description? string
 *
 * Valid events:
 *   interaction.logged, referral.received, referral.updated,
 *   organization.created, organization.updated
 *
 * Response:
 *   { ok: true, webhook_id: string, signing_secret: string }
 *
 * Verifying deliveries (Drupal side):
 *   $body = file_get_contents('php://input');
 *   $sig  = hash_hmac('sha256', $body, $signing_secret);
 *   if (!hash_equals("sha256={$sig}", $_SERVER['HTTP_X_NEXUS_SIGNATURE'])) { abort(401); }
 */
export const partnerRegisterWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;

  const url = (req.body?.url || '').toString().trim();
  const events: string[] = Array.isArray(req.body?.events) ? req.body.events : [];
  const description = (req.body?.description || '').toString().trim();

  if (!url.startsWith('https://')) {
    res.status(400).json({ error: 'url is required and must use HTTPS' });
    return;
  }

  const validEvents = [
    'interaction.logged',
    'referral.received',
    'referral.updated',
    'organization.created',
    'organization.updated',
  ];
  if (events.length === 0) {
    res.status(400).json({ error: `events is required. Valid values: ${validEvents.join(', ')}, *` });
    return;
  }
  const invalid = events.filter(e => e !== '*' && !validEvents.includes(e));
  if (invalid.length > 0) {
    res.status(400).json({
      error: `Unknown event types: ${invalid.join(', ')}. Valid events: ${validEvents.join(', ')}`,
    });
    return;
  }

  const orgRef = db.collection('organizations').doc(authContext.organization_id);
  const orgDoc = await orgRef.get();
  if (!orgDoc.exists) {
    res.status(404).json({ error: 'Organization not found' });
    return;
  }

  const signingSecret = `whsec_${randomBytes(32).toString('hex')}`;
  const webhookId = `wh_${randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  const newWebhook: WebhookRecord = {
    id: webhookId,
    url,
    ...(description && { description }),
    events,
    secret: signingSecret,
    status: 'active',
    created_at: now,
  };

  const existingWebhooks = (orgDoc.get('webhooks') || []) as WebhookRecord[];
  await orgRef.set({ webhooks: [...existingWebhooks, newWebhook] }, { merge: true });

  await logAudit(db, 'partner_webhook_registered', authContext.organization_id, {
    webhook_id: webhookId,
    url,
    events,
  });

  res.status(201).json({ ok: true, webhook_id: webhookId, signing_secret: signingSecret });
});


// ─── Firestore triggers — outbound webhook delivery ───────────────────────────

/**
 * Fires on every new interaction document.
 * Delivers an `interaction.logged` event to webhooks on the author ESO's org.
 * Notes are intentionally excluded from the payload — the receiving system
 * should call partnerGetPerson if it needs the full record.
 */
export const onInteractionCreatedDeliverWebhooks = onDocumentCreated(
  'interactions/{interactionId}',
  async event => {
    const db = admin.firestore();
    const data = event.data?.data();
    if (!data) return;

    const authorOrgId = data.author_org_id as string | undefined;
    if (!authorOrgId) return;

    await deliverWebhooksForOrg(db, authorOrgId, 'interaction.logged', {
      interaction_id: event.data?.id,
      ecosystem_id: data.ecosystem_id,
      organization_id: data.organization_id,   // subject org (the entrepreneur's org)
      person_id: data.person_id || null,
      date: data.date,
      type: data.type,
      recorded_by: data.recorded_by,
      source: data.source,
      // notes omitted — fetch full record via partnerGetPerson if needed
    });
  }
);

/**
 * Fires on every referral create or update.
 * Delivers `referral.received` on creation, `referral.updated` on changes.
 * Events are sent to webhooks on the receiving ESO's org.
 */
export const onReferralWrittenDeliverWebhooks = onDocumentWritten(
  'referrals/{referralId}',
  async event => {
    const db = admin.firestore();
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after) return;

    const isCreate = !before;
    const eventName = isCreate ? 'referral.received' : 'referral.updated';

    const receivingOrgId = after.receiving_org_id as string | undefined;
    if (!receivingOrgId) return;

    // Only deliver updates when status actually changed — avoids noise from
    // metadata-only writes (e.g. last_delivery timestamp updates)
    if (!isCreate && before?.status === after.status && before?.notes === after.notes) return;

    await deliverWebhooksForOrg(db, receivingOrgId, eventName, {
      referral_id: event.data?.after?.id,
      ecosystem_id: after.ecosystem_id,
      status: after.status,
      referring_org_id: after.referring_org_id,
      receiving_org_id: after.receiving_org_id,
      subject_person_id: after.subject_person_id,
      date: after.date,
      intake_type: after.intake_type,
      source: after.source,
      // notes omitted intentionally
    });
  }
);
