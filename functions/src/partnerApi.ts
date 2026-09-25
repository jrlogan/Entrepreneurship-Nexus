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
 *
 * Consent model (see functions/src/privacy/policy.ts):
 * The pushing organization works with the person immediately. Nothing beyond
 * the compact's "always shared" tier happens until the founder chooses:
 * directory listing (on by default) and detail sharing (off) are recorded per
 * network only when the founder is asked. Consent is
 * collected in the partner's own form (pass `consent` — see getConsentTerms) or
 * on the hosted page (partnerCreateConsentLink). Anyone added without consent
 * attached is emailed the notice automatically (ensureConsentNotice).
 *
 * OIDC / SSO:
 * Any ESO can register their own OAuth2/OIDC server via partnerRegisterOidcProvider.
 * MakeHaven's Drupal OAuth is just one instance of this generic system. The
 * oidcGetProviders and oidcExchangeToken functions power "Sign in with [ESO]"
 * buttons on the Nexus frontend without requiring Firebase OIDC configuration.
 */

import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createHmac, createHash, randomBytes } from 'crypto';
import { assertPublicHttpUrl } from './urlGuard';
import {
  buildInteractionWebhookPayload,
  buildReferralWebhookPayload,
  scrubSensitiveKeys,
} from './payloadRedaction';
import {
  matchPerson,
  matchOrganization,
  attachExternalRef,
  flagPossibleDuplicate,
  type ExternalRef as FedExternalRef,
} from './federationDedup';
import { followMergePointer } from './recordMerge';
import { enforceRateLimit } from './rateLimit';
import { externalRefIndexId, readExternalRefIndex } from './externalRefIndex';
import { CONSENT_SUMMARY, buildConsentTerms, parseFounderConsent, type FounderConsentChoices } from './consent/terms';
import { membershipTierOf } from './agreements/content';
import { canTransitionReferral, type ReferralStatus } from './referrals/transitions';
import {
  appBaseUrl,
  createConsentLink,
  hashToken,
  readConsentState,
  recordFounderConsent,
  validateReturnUrl,
} from './consent/recordConsent';

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
  hash: string; // SHA-256 hex of full key — validation is by hash match
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

/**
 * OIDC provider config stored in `oidc_providers/{provider_id}`.
 * client_secret is server-side only — never returned via API.
 *
 * `ref_sources` maps a userinfo response key (e.g. `drupal_uid`,
 * `civi_contact_id`) to the `external_ref.source` string Nexus should use
 * when storing that identifier on a person/org record. This lets a provider
 * align with external_ref conventions already in use by other integrations
 * (e.g. `entrepreneur_nexus_bridge` on MakeHaven's Drupal side writes its
 * pushes with `source: "makehaven_civicrm"` — to dedup reliably against
 * those writes, MakeHaven's OIDC provider should register with
 * `ref_sources: { civi_contact_id: "makehaven_civicrm" }`).
 * If a key is not configured here, oidcExchangeToken falls back to a
 * provider-namespaced default (`<provider_id>:<key>`) so dedup still works
 * within the SSO path alone.
 */
interface OidcProviderRecord {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  display_name: string;
  logo_url?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  client_id: string;
  client_secret: string;
  scopes: string[];        // e.g. ['openid', 'email', 'profile']
  ref_sources?: Record<string, string>;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

// ─── Helpers (mirrors of index.ts utilities; extract to shared.ts in cleanup) ──

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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
 * Validates an API key against the organizations collection by comparing
 * SHA-256(incoming) to the stored `hash` field on each api_keys entry.
 *
 * Previous versions of this function validated via a prefix-startsWith
 * comparison against the stored display prefix, which let anyone who could
 * read an org doc (i.e. any authenticated user) forge a valid key from the
 * last few characters of the prefix. Hash-based validation removes that
 * attack surface: the hash is one-way and storing it discloses nothing
 * that helps an attacker forge a key.
 *
 * Keys without a `hash` field (e.g. legacy records from before this
 * refactor) are ignored. Generate a new key via generatePartnerApiKey
 * to produce a record with a valid hash.
 */
const validateApiKey = async (
  db: FirebaseFirestore.Firestore,
  apiKey: string
): Promise<ApiKeyAuthContext | null> => {
  if (!apiKey) return null;
  const incomingHash = createHash('sha256').update(apiKey).digest('hex');
  
  const snapshot = await db.collectionGroup('api_keys')
    .where('hash', '==', incomingHash)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const keyDoc = snapshot.docs[0];
    const organizationId = keyDoc.ref.parent.parent?.id;
    if (organizationId) {
      return {
        type: 'api_key',
        organization_id: organizationId,
        key_id: keyDoc.id,
        label: keyDoc.get('label'),
      };
    }
  }
  return null;
};

/**
 * Members only. A referral partner's key can receive and answer referrals,
 * log its activity and register webhooks, but may not add people, ventures or
 * participation to the network: what it gets from the network is the
 * referral, and pushing records would make people "its" to see.
 */
const requireMemberTier = async (db: FirebaseFirestore.Firestore, auth: ApiKeyAuthContext, res: any): Promise<boolean> => {
  const org = (await db.collection('organizations').doc(auth.organization_id).get()).data();
  if (membershipTierOf(org) === 'member') return true;
  res.status(403).json({
    error: 'This endpoint is for network members. A referral partner receives referrals (partnerListReferrals, webhooks), answers them (partnerUpdateReferral) and logs its activity (partnerLogActivity).',
    reason: 'referral_partner_tier',
  });
  return false;
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
 * Keyed by the owning partner (see externalRefIndex.ts) and deterministic, so
 * writes are idempotent and partners' ID schemes cannot collide.
 */
const indexExternalRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef,
  entityType: 'person' | 'organization',
  entityId: string
) => {
  const docId = externalRefIndexId(entityType, ref);
  const indexRef = db.collection('external_ref_index').doc(docId);

  // Ownerless refs share a global key: first writer owns it. Without this, any
  // key could re-point another organization's ref at a record of its choosing.
  const existing = await indexRef.get();
  if (existing.exists) {
    const owner = existing.get('owner_org_id') as string | undefined;
    if (owner && ref.owner_org_id && owner !== ref.owner_org_id) {
      console.warn(
        `external_ref_index owner mismatch for ${docId}: owned by ${owner}, write attempted by ${ref.owner_org_id}`
      );
      return;
    }
  }

  await indexRef.set({
    ref_key: `${ref.source}:${ref.id}`,
    source: ref.source,
    external_id: ref.id,
    entity_type: entityType,
    entity_id: entityId,
    ...(ref.owner_org_id ? { owner_org_id: ref.owner_org_id } : {}),
    indexed_at: new Date().toISOString(),
  });
};

/**
 * Grants a person membership in an ecosystem if they don't already have it.
 *
 * Idempotent by construction: the membership id is
 * `{personId}_{ecosystemId}_none`, so repeated pushes converge rather than
 * accumulating rows. An existing elevated role (staff, manager) is preserved —
 * a partner push must never silently demote someone to 'entrepreneur'.
 */
const ensureEcosystemMembership = async (
  db: FirebaseFirestore.Firestore,
  personId: string,
  ecosystemId: string
) => {
  if (!personId || !ecosystemId) return;

  const membershipRef = db.collection('person_memberships').doc(`${personId}_${ecosystemId}_none`);
  const existing = await membershipRef.get();
  const existingRole = existing.data()?.system_role as string | undefined;
  if (existing.exists && existing.data()?.status === 'active') return;

  await membershipRef.set(
    {
      id: membershipRef.id,
      person_id: personId,
      ecosystem_id: ecosystemId,
      organization_id: '',
      system_role: existingRole && existingRole !== 'entrepreneur' ? existingRole : 'entrepreneur',
      status: 'active',
      joined_at: new Date().toISOString(),
    },
    { merge: true }
  );

  // Also union the denormalized array inline. The trigger does this too, but
  // the pushing org may read the record immediately and should not race it.
  const personRef = db.collection('people').doc(personId);
  const personSnap = await personRef.get();
  const current = (personSnap.get('ecosystem_ids') as string[] | undefined) || [];
  if (!current.includes(ecosystemId)) {
    await personRef.set({ ecosystem_ids: [...current, ecosystemId] }, { merge: true });
  }
};

/**
 * Resolves an external ref to its entity.
 *
 * `callerOrgId` scopes the lookup to refs the calling organization actually
 * owns. External refs are a partner's OWN identifiers — `{source, id}` pairs
 * are guessable by design (`makehaven_civicrm` + small integers), so an
 * unscoped lookup let any valid key resolve, read, and overwrite records
 * belonging to other organizations by iterating another org's ref scheme.
 *
 * Pass `callerOrgId` on every partner-facing path. It is omitted only for
 * internal resolution (e.g. SSO provider ref matching), where the caller is
 * not an API key acting on behalf of one organization.
 */
/**
 * Verifies the calling organization actually belongs to the ecosystem it is
 * writing into.
 *
 * `ecosystem_id` arrives in the request body, and without this check a key
 * could create records in — or drag existing people into — networks its
 * organization has no part in, mutating the very `ecosystem_ids` array the
 * Firestore rules use for tenancy. pushInteraction already enforces the
 * equivalent rule; the partner upserts did not.
 */
const orgIsInEcosystem = async (
  db: FirebaseFirestore.Firestore,
  orgId: string,
  ecosystemId: string
): Promise<boolean> => {
  if (!orgId || !ecosystemId) return false;
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  if (!orgDoc.exists) return false;
  const ecosystems = (orgDoc.get('ecosystem_ids') as string[] | undefined) || [];
  return ecosystems.includes(ecosystemId);
};

const findByExternalRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef,
  entityType: 'person' | 'organization',
  callerOrgId?: string
): Promise<{ id: string; data: admin.firestore.DocumentData } | null> => {
  // The caller's own scoped entry, else a legacy global one.
  const indexDoc = await readExternalRefIndex(db, entityType, { ...ref, owner_org_id: callerOrgId || ref.owner_org_id });
  if (!indexDoc) return null;

  const ownerOrgId = indexDoc.get('owner_org_id') as string | undefined;
  if (callerOrgId && ownerOrgId && ownerOrgId !== callerOrgId) return null;

  const entityId = indexDoc.get('entity_id') as string;
  // Follow `merged_into` so a ref that pointed at a record an admin later
  // merged away resolves to the survivor instead of writing to a tombstone.
  // Index entries are repointed on merge; this is the belt-and-braces path
  // for entries written before the merge, or by another code path.
  const found = await followMergePointer(db, entityType, entityId);

  // Legacy index entries predate owner tracking. Rather than trusting them,
  // confirm the entity itself carries this ref as owned by the caller — an
  // org must never resolve another org's record ID to a record.
  if (found && callerOrgId && !ownerOrgId) {
    const refs = (found.data.external_refs || []) as ExternalRef[];
    const ownedByCaller = refs.some((r) => r.source === ref.source && r.id === ref.id && r.owner_org_id === callerOrgId);
    if (!ownedByCaller) return null;
  }
  return found;
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

  // Defense in depth: even though callers should pass already-redacted data,
  // strip known-sensitive keys here so an accidental field addition upstream
  // can never leak via webhook. Tier-based redaction lives in payloadRedaction.ts.
  const safeData = scrubSensitiveKeys(data);
  const payload = {
    id: randomBytes(16).toString('hex'),
    event,
    timestamp: new Date().toISOString(),
    data: safeData,
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
  // Webhooks live in the /organizations/{orgId}/webhooks subcollection so
  // their signing secrets are not readable via an org doc read.
  const snap = await db.collection('organizations').doc(orgId).collection('webhooks').get();
  if (snap.empty) return;
  const webhooks = snap.docs.map(d => d.data() as WebhookRecord);
  await Promise.allSettled(webhooks.map(wh => deliverToWebhook(wh, event, data)));
};

// ─── Participation external ref index ────────────────────────────────────────

/**
 * Writes a lookup entry so the same external participation can be upserted
 * idempotently. Document ID: "participation:{source}:{id}" — same pattern as
 * the person/org external ref index.
 */
const indexParticipationRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef,
  participationId: string
) => {
  // Scoped to the providing organization — see findParticipationByExternalRef.
  const docId = `participation:${ref.owner_org_id || ''}:${ref.source}:${ref.id}`;
  await db.collection('external_ref_index').doc(docId).set({
    ref_key: `${ref.source}:${ref.id}`,
    source: ref.source,
    external_id: ref.id,
    entity_type: 'participation',
    entity_id: participationId,
    owner_org_id: ref.owner_org_id || null,
    indexed_at: new Date().toISOString(),
  });
};

/**
 * Find a participation by the provider's own external ref. The index key is
 * scoped to the providing organization, so two partners that happen to use
 * the same ID scheme ("42_membership") can never overwrite each other's
 * records. Entries written before scoping are honoured only when the record
 * really belongs to the caller.
 */
const findParticipationByExternalRef = async (
  db: FirebaseFirestore.Firestore,
  ref: ExternalRef
): Promise<{ id: string; data: admin.firestore.DocumentData } | null> => {
  const orgId = ref.owner_org_id || '';
  const scoped = await db.collection('external_ref_index').doc(`participation:${orgId}:${ref.source}:${ref.id}`).get();
  const legacy = scoped.exists ? null : await db.collection('external_ref_index').doc(`participation:${ref.source}:${ref.id}`).get();
  const indexDoc = scoped.exists ? scoped : legacy;
  if (!indexDoc?.exists) return null;
  const participationDoc = await db.collection('participations').doc(indexDoc.get('entity_id') as string).get();
  if (!participationDoc.exists) return null;
  if (participationDoc.get('provider_org_id') !== orgId) return null;
  return { id: participationDoc.id, data: participationDoc.data()! };
};

// ─── Consent email helpers ────────────────────────────────────────────────────

/**
 * Generates a short-lived consent token, persists it, and sends the opt-in
 * email via Postmark. The token is stored in `consent_tokens/{token_hash}`.
 *
 * The email invites the entrepreneur to the hosted consent page, where they
 * read the compact and privacy notice and make their two choices (directory
 * listing, detail sharing). Not clicking changes nothing: the partner that
 * pushed them still works with them, and nothing else is shared.
 */
const enqueueConsentEmail = async (
  db: FirebaseFirestore.Firestore,
  personId: string,
  firstName: string,
  email: string,
  ecosystemId: string,
  referringEsoId: string,
): Promise<boolean> => {
  const { url: consentUrl } = await createConsentLink(db, {
    personId,
    ecosystemId,
    requestedByOrgId: referringEsoId,
    email,
    createdVia: 'consent_email',
    ttlDays: 30,
  });

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = process.env.POSTMARK_FROM_EMAIL?.trim();
  if (!postmarkToken || !fromEmail) {
    console.warn('Consent email not sent — POSTMARK_SERVER_TOKEN or POSTMARK_FROM_EMAIL not configured');
    return false;
  }

  const greeting = firstName || 'there';

  // Safe mode for test environments: every outbound message goes to one
  // inbox instead of the real recipient, with the intended address in the
  // subject. Same switch the notice queue in index.ts honours.
  const redirect = process.env.POSTMARK_SAFE_MODE_REDIRECT?.trim();
  const to = redirect || email;
  const subjectPrefix = redirect ? `[REDIRECTED to ${email}] ` : '';

  // Resolve the ESO's display name for the referral attribution line.
  let esoName = 'your support organization';
  try {
    const orgDoc = await db.collection('organizations').doc(referringEsoId).get();
    if (orgDoc.exists && orgDoc.get('name')) {
      esoName = orgDoc.get('name') as string;
    }
  } catch {
    // Non-critical — fallback is fine
  }

  return fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkToken,
    },
    body: JSON.stringify({
      From: fromEmail,
      To: to,
      Subject: `${subjectPrefix}${esoName} works with a regional entrepreneurship network — your choices`,
      TextBody: [
        `Hi ${greeting},`,
        '',
        `${esoName} is part of a regional network of organizations that support entrepreneurs. Partners in the network share a small amount of information so they can coordinate instead of asking you the same questions again.`,
        '',
        `- ${CONSENT_SUMMARY.always}`,
        `- ${CONSENT_SUMMARY.choice}`,
        `- ${CONSENT_SUMMARY.never}`,
        '',
        `Read the terms and make your choices:\n${consentUrl}`,
        '',
        'If you do nothing, nothing more is shared. This link works for 30 days.',
        '',
        `— ${esoName}`,
      ].join('\n'),
      HtmlBody: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0}
.wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:8px;padding:36px 44px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
h2{font-size:20px;color:#1a1a2e;margin:0 0 16px}
p,li{font-size:15px;color:#374151;line-height:1.6}
p{margin:0 0 16px}
.btn{display:inline-block;background:#8b1919;color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-size:14px;font-weight:600}
.muted{font-size:13px;color:#6b7280}
</style></head>
<body><div class="wrap">
<h2>Your choices in the regional entrepreneurship network</h2>
<p>Hi ${escapeHtml(greeting)},</p>
<p>${escapeHtml(esoName)} is part of a regional network of organizations that support entrepreneurs. Partners share a small amount of information so they can coordinate instead of asking you the same questions again.</p>
<ul>
<li>${escapeHtml(CONSENT_SUMMARY.always)}</li>
<li>${escapeHtml(CONSENT_SUMMARY.choice)}</li>
<li>${escapeHtml(CONSENT_SUMMARY.never)}</li>
</ul>
<p><a class="btn" href="${consentUrl}">Read the terms and choose</a></p>
<p class="muted">If you do nothing, nothing more is shared. This link works for 30 days.</p>
</div></body></html>`,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || 'outbound',
    }),
  }).then(
    (r) => r.ok,
    (err) => { console.error('Consent email delivery failed:', err?.message); return false; },
  );
};

/**
 * The network's side of the compact's promise: nobody is added without being
 * told. Whenever a partner adds someone without attaching consent it collected
 * itself, the person is emailed the consent notice — and a partner cannot
 * switch that off. Each partner that adds them triggers one notice, naming
 * that partner; the same partner never triggers a second one, and nothing is
 * sent once they have answered.
 *
 * Returns whether a notice went out on this call.
 */

export const ensureConsentNotice = async (
  db: FirebaseFirestore.Firestore,
  personId: string,
  firstName: string,
  email: string,
  ecosystemId: string,
  orgId: string,
): Promise<boolean> => {
  const profileRef = db.collection('network_profiles').doc(personId);
  const profile = (await profileRef.get()).data() || {};
  const accepted = Array.isArray(profile.terms_accepted_ecosystems) && profile.terms_accepted_ecosystems.includes(ecosystemId);
  if (accepted) return false;
  // Someone who left the network is not asked again by partners' pushes.
  const withdrawn = Array.isArray(profile.withdrawn_ecosystems) && profile.withdrawn_ecosystems.includes(ecosystemId);
  if (withdrawn) return false;

  const notices = (profile.consent_notices || {}) as Record<string, { sent_at: string; delivered: boolean }>;
  const key = `${ecosystemId}__${orgId}`;
  if (notices[key]) return false;

  const sent = await enqueueConsentEmail(db, personId, firstName, email, ecosystemId, orgId);
  await profileRef.set({
    person_id: personId,
    consent_notices: { ...notices, [key]: { sent_at: new Date().toISOString(), delivered: sent } },
  }, { merge: true });
  return sent;
};

/**
 * Record consent a partner collected in its own form (if any), and report the
 * founder's consent state back to the partner either way — so a partner's
 * system always knows whether the founder has joined, is listed, and shares
 * details, without ever seeing anything else about them.
 */
const applyPartnerConsent = async (
  db: FirebaseFirestore.Firestore,
  personId: string,
  ecosystemId: string,
  orgId: string,
  choices: FounderConsentChoices | null,
  terms: Awaited<ReturnType<typeof buildConsentTerms>> | null,
) => {
  if (choices && terms) {
    await recordFounderConsent(db, {
      personId,
      ecosystemId,
      choices,
      terms,
      via: 'partner_form',
      attestedByOrgId: orgId,
    });
  }
  return readConsentState(db, personId, ecosystemId);
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
  if (!(await requireMemberTier(db, authContext, res))) return;
  if (!(await enforceRateLimit(db, authContext.key_id, 'write', res))) return;

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

  // Optional: the founder's answers from the consent terms shown in the
  // partner's own signup form (see getConsentTerms and the embed widget).
  let consentChoices: FounderConsentChoices | null = null;
  let consentTermsOutdated = false;
  const terms = req.body?.consent !== undefined ? await buildConsentTerms() : null;
  if (terms) {
    const parsed = parseFounderConsent(req.body.consent, terms);
    if (parsed.ok === false && parsed.reason !== 'terms_outdated') {
      res.status(parsed.status).json({ error: parsed.error, reason: parsed.reason, current_terms_hash: terms.terms_hash });
      return;
    }
    if (parsed.ok === false) {
      // The founder agreed to an earlier version of the terms. Consent is
      // only ever recorded against the current words, so nothing is recorded
      // here — but the push itself goes through: a partner re-sending the
      // answers it stored must not lose the ability to update its own record
      // when the terms change. Consent already on file stands; a founder with
      // none is asked directly (consent notice), and the response says so.
      consentTermsOutdated = true;
    } else {
      consentChoices = parsed.value;
    }
  }
  const outdated = consentTermsOutdated && terms ? { consent_terms_outdated: true, current_terms_hash: terms.terms_hash } : {};
  if (!ecosystemId || !firstName || !lastName || !email) {
    res.status(400).json({ error: 'ecosystem_id, first_name, last_name, and email are required' });
    return;
  }
  if (authContext.organization_id !== esoOrgId) {
    res.status(403).json({ error: 'API key organization does not match eso_org_id' });
    return;
  }
  if (!(await orgIsInEcosystem(db, esoOrgId, ecosystemId))) {
    res.status(403).json({ error: 'ecosystem_id is outside your organization\'s ecosystems' });
    return;
  }

  const ref: ExternalRef = {
    source: externalRef.source,
    id: externalRef.id,
    owner_org_id: esoOrgId,
  };
  const now = new Date().toISOString();

  // 1. Try ExternalRef index lookup (O(1))
  const byRef = await findByExternalRef(db, ref, 'person', authContext.organization_id);
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
    const consent = await applyPartnerConsent(db, byRef.id, ecosystemId, esoOrgId, consentChoices, terms);
    const noticeSent = consentChoices ? false : await ensureConsentNotice(db, byRef.id, firstName, email, ecosystemId, esoOrgId);
    res.json({ ok: true, nexus_id: byRef.id, action: 'updated', consent, consent_notice_sent: noticeSent, ...outdated });
    return;
  }

  // 2. Try email match — add ExternalRef to existing person
  const emailSnap = await db.collection('people').where('email', '==', email).limit(1).get();
  if (!emailSnap.empty) {
    // Attaching to a person the network already knows makes them "yours" to
    // see — so it is budgeted separately and tightly (see rateLimit.ts).
    if (!(await enforceRateLimit(db, authContext.key_id, 'link', res))) return;
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

    // Identity is global; ecosystem membership is not. A person first created
    // in one ecosystem (say a county cluster) who is now pushed by an org in
    // another (a statewide or interest-based network) must gain membership
    // there too — otherwise the push "succeeds" while Firestore rules, which
    // gate on people/{id}.ecosystem_ids, keep them invisible to the very org
    // that just pushed them.
    //
    // person_memberships is the source of truth; the syncPersonEcosystems
    // trigger denormalizes it onto the person. Writing the membership (rather
    // than the array directly) keeps that single path intact.
    await ensureEcosystemMembership(db, existing.id, ecosystemId);

    await logAudit(db, 'partner_person_linked', authContext.organization_id, {
      nexus_id: existing.id,
      external_ref: ref,
      ecosystem_id: ecosystemId,
    });
    const consent = await applyPartnerConsent(db, existing.id, ecosystemId, esoOrgId, consentChoices, terms);
    const noticeSent = consentChoices ? false : await ensureConsentNotice(db, existing.id, firstName, email, ecosystemId, esoOrgId);
    res.json({ ok: true, nexus_id: existing.id, action: 'linked', consent, consent_notice_sent: noticeSent, ...outdated });
    return;
  }

  // 3. Create new person record (partner-managed; no Firebase Auth account yet).
  //    status: 'active' so ESO staff can track immediately; the network_profiles
  //    record starts with every consent choice off, so the person is not in the
  //    shared directory and shares no details until they choose to.
  const personRef = db.collection('people').doc();
  const batch = db.batch();

  batch.set(personRef, {
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

  // Network profile — hidden from public directory until entrepreneur consents.
  const profileRef = db.collection('network_profiles').doc(personRef.id);
  batch.set(profileRef, {
    person_id: personRef.id,
    display_name: `${firstName} ${lastName}`.trim(),
    ecosystem_ids: [ecosystemId],
    // Nothing is shared beyond the compact's "always" tier until the founder
    // chooses: not listed, no detail sharing, terms not yet accepted.
    directory_listed_ecosystems: [],
    detail_sharing_ecosystems: [],
    terms_accepted_ecosystems: [],
    consent_updated_at: now,
    referring_eso_id: esoOrgId,
  });

  await batch.commit();
  await indexExternalRef(db, ref, 'person', personRef.id);
  await logAudit(db, 'partner_person_created', authContext.organization_id, {
    nexus_id: personRef.id,
    external_ref: ref,
  });

  const consent = await applyPartnerConsent(db, personRef.id, ecosystemId, esoOrgId, consentChoices, terms);
  const noticeSent = consentChoices ? false : await ensureConsentNotice(db, personRef.id, firstName, email, ecosystemId, esoOrgId);

  res.status(201).json({ ok: true, nexus_id: personRef.id, action: 'created', consent, consent_notice_sent: noticeSent, ...outdated });
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
  if (!(await requireMemberTier(db, authContext, res))) return;
  if (!(await enforceRateLimit(db, authContext.key_id, 'write', res))) return;

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
  if (!(await orgIsInEcosystem(db, esoOrgId, ecosystemId))) {
    res.status(403).json({ error: 'ecosystem_id is outside your organization\'s ecosystems' });
    return;
  }

  const ref: ExternalRef = {
    source: externalRef.source,
    id: externalRef.id,
    owner_org_id: esoOrgId,
  };
  const now = new Date().toISOString();

  // 1. ExternalRef index lookup
  const byRef = await findByExternalRef(db, ref, 'organization', authContext.organization_id);
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
  if (!(await enforceRateLimit(db, authContext.key_id, 'read', res))) return;

  // External refs are stored verbatim on write (partnerUpsertPerson keeps
  // externalRef.source/id exactly as the partner sent them), and the index
  // doc id is built from those raw values. Lowercasing here made the read
  // path disagree with the write path for any partner whose primary keys
  // aren't lowercase — Salesforce ("0035f00000ABC") and HubSpot IDs are the
  // common case. Those pushes succeeded and then 404'd on read-back. Treat
  // identifiers as opaque: trim only.
  const source = (req.query?.source as string | undefined)?.trim() || '';
  const externalId = (req.query?.id as string | undefined)?.trim() || '';

  if (!source || !externalId) {
    res.status(400).json({ error: 'source and id query parameters are required' });
    return;
  }

  const found = await findByExternalRef(db, { source, id: externalId }, 'person', authContext.organization_id);
  if (!found) {
    res.status(404).json({ error: 'No person found for the given external reference' });
    return;
  }

  // Only expose ExternalRefs owned by the calling org — never leak other ESOs' IDs
  const ownedRefs = ((found.data.external_refs || []) as ExternalRef[]).filter(
    r => r.owner_org_id === authContext.organization_id
  );

  // Optional ?ecosystem_id= adds the founder's consent state in that network
  // (terms accepted, directory listed, sharing details) — so a partner's
  // system can show staff where things stand without asking the founder again.
  const ecosystemId = normalize(req.query?.ecosystem_id as string | undefined);
  const consent = ecosystemId && (await orgIsInEcosystem(db, authContext.organization_id, ecosystemId))
    ? await readConsentState(db, found.id, ecosystemId)
    : undefined;

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
      ...(consent ? { consent } : {}),
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
 *   organization.created, organization.updated, person.linked
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
  if (!(await enforceRateLimit(db, authContext.key_id, 'register', res))) return;

  const url = (req.body?.url || '').toString().trim();
  const events: string[] = Array.isArray(req.body?.events) ? req.body.events : [];
  const description = (req.body?.description || '').toString().trim();

  if (!url.startsWith('https://')) {
    res.status(400).json({ error: 'url is required and must use HTTPS' });
    return;
  }
  try {
    // Webhook deliveries originate from our infrastructure, so refuse
    // endpoints that point into private address space (SSRF via triggers).
    await assertPublicHttpUrl(url, { httpsOnly: true });
  } catch {
    res.status(400).json({ error: 'url must resolve to a public host' });
    return;
  }

  const validEvents = [
    'interaction.logged',
    'referral.received',
    'referral.updated',
    'organization.created',
    'organization.updated',
    'person.linked',
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

  // Webhooks live in the /organizations/{orgId}/webhooks subcollection.
  await orgRef.collection('webhooks').doc(webhookId).set(newWebhook);

  await logAudit(db, 'partner_webhook_registered', authContext.organization_id, {
    webhook_id: webhookId,
    url,
    events,
  });

  res.status(201).json({ ok: true, webhook_id: webhookId, signing_secret: signingSecret });
});


/**
 * POST /partnerUpsertParticipation
 *
 * Creates or updates a participation record for a person by external system
 * identifier. Designed for any ESO to track structured, date-ranged involvement
 * — memberships, program enrollments, rentals, residencies, events, services.
 *
 * Idempotency: supply participation_external_ref (same source/id as the person
 * ref but scoped to this participation type) and the same call can be replayed
 * safely — it will update the existing record rather than create a duplicate.
 * Recommended ID convention: "{contactId}_{participation_type}", e.g.
 * source="makehaven_civicrm", id="12345_membership".
 *
 * Required header: X-Nexus-API-Key
 *
 * Body:
 *   person_external_ref          { source, id }  — resolves to Nexus person
 *   participation_external_ref   { source, id }  — idempotency key (optional)
 *   ecosystem_id                 string
 *   eso_org_id                   string          — must match API key org
 *   participation_type           "membership" | "program" | "application" |
 *                                "residency" | "rental" | "event" | "service"
 *   name                         string          — human label, e.g. "MakeHaven Membership"
 *   status                       "active" | "past" | "applied" | "waitlisted"
 *   start_date                   string          — ISO date, e.g. "2024-03-01"
 *   end_date?                    string          — ISO date; omit for ongoing
 *   description?                 string
 *
 * Response:
 *   { ok: true, participation_id: string, action: "created" | "updated" }
 */
export const partnerUpsertParticipation = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;
  if (!(await requireMemberTier(db, authContext, res))) return;
  if (!(await enforceRateLimit(db, authContext.key_id, 'write', res))) return;

  const personExtRef = req.body?.person_external_ref as Partial<ExternalRef> | undefined;
  const partExtRef = req.body?.participation_external_ref as Partial<ExternalRef> | undefined;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  const esoOrgId = normalize(req.body?.eso_org_id) || authContext.organization_id;
  const participationType = normalize(req.body?.participation_type);
  const name = (req.body?.name || '').toString().trim();
  const status = normalize(req.body?.status) || 'active';
  const startDate = (req.body?.start_date || '').toString().trim();
  const endDate = (req.body?.end_date || '').toString().trim() || undefined;
  const description = (req.body?.description || '').toString().trim() || undefined;

  if (!personExtRef?.source || !personExtRef?.id) {
    res.status(400).json({ error: 'person_external_ref.source and person_external_ref.id are required' });
    return;
  }
  if (!ecosystemId || !participationType || !name || !startDate) {
    res.status(400).json({ error: 'ecosystem_id, participation_type, name, and start_date are required' });
    return;
  }
  if (authContext.organization_id !== esoOrgId) {
    res.status(403).json({ error: 'API key organization does not match eso_org_id' });
    return;
  }
  if (!(await orgIsInEcosystem(db, esoOrgId, ecosystemId))) {
    res.status(403).json({ error: 'ecosystem_id is outside your organization\'s ecosystems' });
    return;
  }

  const validTypes = ['program', 'application', 'membership', 'residency', 'rental', 'event', 'service'];
  if (!validTypes.includes(participationType)) {
    res.status(400).json({ error: `Invalid participation_type. Valid values: ${validTypes.join(', ')}` });
    return;
  }
  const validStatuses = ['active', 'past', 'applied', 'waitlisted'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Valid values: ${validStatuses.join(', ')}` });
    return;
  }

  // Resolve person by external ref.
  const person = await findByExternalRef(db, { source: personExtRef.source, id: personExtRef.id }, 'person', authContext.organization_id);
  if (!person) {
    res.status(404).json({ error: 'No person found for the given person_external_ref. Push the person first via partnerUpsertPerson.' });
    return;
  }

  const now = new Date().toISOString();

  // Resolve existing participation via participation_external_ref (if provided).
  let existing: { id: string; data: admin.firestore.DocumentData } | null = null;
  const pRef: ExternalRef | null = partExtRef?.source && partExtRef?.id
    ? { source: partExtRef.source, id: partExtRef.id, owner_org_id: esoOrgId }
    : null;

  if (pRef) {
    existing = await findParticipationByExternalRef(db, pRef);
  }

  if (existing) {
    await db.collection('participations').doc(existing.id).set(
      {
        participation_type: participationType,
        name,
        status,
        start_date: startDate,
        ...(endDate !== undefined && { end_date: endDate }),
        ...(description !== undefined && { description }),
        updated_at: now,
        updated_via_api_key_id: authContext.key_id,
      },
      { merge: true }
    );
    await logAudit(db, 'partner_participation_updated', authContext.organization_id, {
      participation_id: existing.id,
      person_nexus_id: person.id,
      participation_type: participationType,
      status,
    });
    res.json({ ok: true, participation_id: existing.id, action: 'updated' });
    return;
  }

  // Create new participation record.
  const participationRef = db.collection('participations').doc();
  await participationRef.set({
    id: participationRef.id,
    ecosystem_id: ecosystemId,
    provider_org_id: esoOrgId,
    recipient_person_id: person.id,
    participation_type: participationType,
    name,
    status,
    start_date: startDate,
    ...(endDate !== undefined && { end_date: endDate }),
    ...(description !== undefined && { description }),
    source: 'external_sync',
    created_at: now,
    updated_at: now,
    updated_via_api_key_id: authContext.key_id,
  });

  if (pRef) {
    await indexParticipationRef(db, pRef, participationRef.id);
  }

  await logAudit(db, 'partner_participation_created', authContext.organization_id, {
    participation_id: participationRef.id,
    person_nexus_id: person.id,
    participation_type: participationType,
    status,
  });

  res.status(201).json({ ok: true, participation_id: participationRef.id, action: 'created' });
});

// ─── Firestore triggers — outbound webhook delivery ───────────────────────────

/**
 * Fires on every new interaction document.
 * Delivers an `interaction.logged` event to webhooks on the author ESO's org.
 *
 * Tier-aware: payload is built by buildInteractionWebhookPayload, which
 * - never includes notes (tier-3 ESO-owned content; fetched separately)
 * - returns null when note_confidential=true (tier-4 — even the metadata
 *   "ESO X met with person Y on date Z" is suppressed)
 *
 * See project_privacy_5tier memory + payloadRedaction.ts.
 */
export const onInteractionCreatedDeliverWebhooks = onDocumentCreated(
  'interactions/{interactionId}',
  async event => {
    const db = admin.firestore();
    const data = event.data?.data();
    if (!data) return;

    const authorOrgId = data.author_org_id as string | undefined;
    if (!authorOrgId) return;

    const interactionId = event.data?.id ?? '';
    const { payload, tier, suppressedReason } = buildInteractionWebhookPayload(data, interactionId);

    if (!payload) {
      await logAudit(db, 'webhook_suppressed_tier4', authorOrgId, {
        entity: 'interaction',
        interaction_id: interactionId,
        tier,
        reason: suppressedReason,
      });
      return;
    }

    await deliverWebhooksForOrg(db, authorOrgId, 'interaction.logged', payload as unknown as Record<string, unknown>);
  }
);

/**
 * Fires on every referral create or update.
 * Delivers `referral.received` on creation, `referral.updated` on changes.
 * Events go to the receiving org; status changes also go to the referring org.
 *
 * Tier-aware: payload is built by buildReferralWebhookPayload, which
 * never includes notes or response_notes (tier-3 ESO-owned content).
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

    const referralId = event.data?.after?.id ?? '';
    const payload = buildReferralWebhookPayload(after, referralId);
    await deliverWebhooksForOrg(db, receivingOrgId, eventName, payload as unknown as Record<string, unknown>);

    // The referring organization needs to know how its referral was answered
    // (accepted, declined, completed) to close the loop in its own system.
    const referringOrgId = after.referring_org_id as string | undefined;
    if (!isCreate && referringOrgId && referringOrgId !== receivingOrgId && before?.status !== after.status) {
      await deliverWebhooksForOrg(db, referringOrgId, 'referral.updated', payload as unknown as Record<string, unknown>);
    }
  }
);


// ─── Founder consent ──────────────────────────────────────────────────────────
//
// Four endpoints, one set of terms (./consent/terms.ts):
//
//   getConsentTerms          public — the exact words and choices to show.
//   partnerCreateConsentLink API key — a one-time link to the hosted page.
//   getConsentSession        public (token) — what the hosted page renders.
//   consentAccept            public (token) — records the founder's answers.
//
// consentAccept used to be a one-click GET. A GET that changes state can be
// triggered by an email security scanner following the link, so GET now only
// redirects to the hosted page; recording consent is a POST from that page.

const loadConsentToken = async (db: FirebaseFirestore.Firestore, rawToken: unknown) => {
  const raw = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!/^[0-9a-f]{64}$/.test(raw)) return { error: 'invalid' as const };
  const ref = db.collection('consent_tokens').doc(hashToken(raw));
  const snap = await ref.get();
  if (!snap.exists) return { error: 'not_found' as const };
  const data = snap.data()!;
  if (data.status === 'used') return { error: 'used' as const, ref, data };
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'expired' as const, ref, data };
  return { ref, data };
};

const TOKEN_ERRORS: Record<string, { status: number; message: string }> = {
  invalid: { status: 400, message: 'This link is not valid. Ask the organization that sent it for a new one.' },
  not_found: { status: 404, message: 'This link was not found. Ask the organization that sent it for a new one.' },
  used: { status: 409, message: 'You have already made your choices with this link. You can change them any time from your privacy settings.' },
  expired: { status: 410, message: 'This link has expired. Ask the organization that sent it for a new one.' },
};

/**
 * GET /getConsentTerms
 *
 * The current founder-facing terms: plain-language summary, the two choices,
 * the full Network Compact and Privacy Notice, and `terms_hash`. A partner
 * showing these in its own signup form sends `terms_hash` back as
 * `consent.terms_hash` on partnerUpsertPerson. Public — the terms are public.
 */
export const getConsentTerms = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: true, ...(await buildConsentTerms({ termsUrl: `${appBaseUrl()}/network-terms` })) });
});

/**
 * POST /partnerCreateConsentLink
 *
 * A one-time link to the hosted consent page for a person your organization
 * works with — for signup flows that would rather send the founder to the
 * network's page than render the terms themselves.
 *
 * Body: { ecosystem_id, external_ref: {source, id} | nexus_id, return_url? }
 * return_url must be https and on your organization's website; the founder is
 * sent back there with ?nexus_consent=accepted|declined appended.
 */
export const partnerCreateConsentLink = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;
  if (!(await enforceRateLimit(db, authContext.key_id, 'write', res))) return;

  const orgId = authContext.organization_id;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  if (!ecosystemId) {
    res.status(400).json({ error: 'ecosystem_id is required' });
    return;
  }
  if (!(await orgIsInEcosystem(db, orgId, ecosystemId))) {
    res.status(403).json({ error: 'ecosystem_id is outside your organization\'s ecosystems' });
    return;
  }

  // Resolve the person — only one your organization has itself pushed.
  let personId: string | null = null;
  const externalRef = req.body?.external_ref as Partial<ExternalRef> | undefined;
  if (externalRef?.source && externalRef?.id) {
    const found = await findByExternalRef(db, { source: externalRef.source, id: externalRef.id, owner_org_id: orgId }, 'person', orgId);
    personId = found?.id || null;
  } else if (typeof req.body?.nexus_id === 'string') {
    const snap = await db.collection('people').doc(req.body.nexus_id).get();
    const refs = (snap.get('external_refs') || []) as ExternalRef[];
    if (snap.exists && (snap.get('created_by_org_id') === orgId || refs.some((r) => r.owner_org_id === orgId))) {
      personId = snap.id;
    }
  } else {
    res.status(400).json({ error: 'external_ref or nexus_id is required' });
    return;
  }
  if (!personId) {
    res.status(404).json({ error: 'No person your organization has pushed matches that reference. Call partnerUpsertPerson first.' });
    return;
  }

  const orgSnap = await db.collection('organizations').doc(orgId).get();
  const returnUrl = validateReturnUrl(req.body?.return_url, {
    url: orgSnap.get('url') as string | undefined,
    consent_return_origins: orgSnap.get('consent_return_origins') as string[] | undefined,
  });
  if (returnUrl.ok === false) {
    res.status(400).json({ error: returnUrl.error });
    return;
  }

  const link = await createConsentLink(db, {
    personId,
    ecosystemId,
    requestedByOrgId: orgId,
    returnUrl: returnUrl.url,
    createdVia: 'partner_link',
    ttlDays: 7,
  });
  await logAudit(db, 'partner_consent_link_created', orgId, { nexus_id: personId, ecosystem_id: ecosystemId });
  res.status(201).json({ ok: true, nexus_id: personId, consent_url: link.url, expires_at: link.expires_at });
});

/**
 * POST /getConsentSession  { token }
 *
 * What the hosted consent page needs to render: who is asking, which network,
 * the founder's first name, and the current terms. Discloses nothing else.
 */
export const getConsentSession = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const db = admin.firestore();
  const loaded = await loadConsentToken(db, req.body?.token);
  if ('error' in loaded && loaded.error) {
    const e = TOKEN_ERRORS[loaded.error];
    res.status(e.status).json({ ok: false, status: loaded.error, error: e.message });
    return;
  }
  const { data } = loaded as { data: FirebaseFirestore.DocumentData };
  const [personSnap, orgSnap, ecoSnap, terms, state] = await Promise.all([
    db.collection('people').doc(data.person_id).get(),
    db.collection('organizations').doc(data.referring_eso_id).get(),
    db.collection('ecosystems').doc(data.ecosystem_id).get(),
    buildConsentTerms(),
    readConsentState(db, data.person_id, data.ecosystem_id),
  ]);
  res.json({
    ok: true,
    status: 'pending',
    first_name: (personSnap.get('first_name') as string) || '',
    requested_by: (orgSnap.get('name') as string) || 'A partner organization',
    network_name: (ecoSnap.get('name') as string) || 'the regional entrepreneurship network',
    returns_to: data.return_url ? new URL(data.return_url).hostname : null,
    current: state,
    terms,
  });
});

/**
 * POST /consentAccept  { token, consent: { agreed, terms_hash, directory_listing, share_details } }
 *   or                 { token, declined: true }
 *
 * Records the founder's answers from the hosted page. Declining records
 * nothing beyond marking the link used; the partner that sent it still works
 * with the founder, and nothing else is shared.
 *
 * GET /consentAccept?token=… (links in older emails) redirects to the page.
 */
export const consentAccept = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    const raw = typeof req.query?.token === 'string' ? req.query.token : '';
    res.redirect(302, `${appBaseUrl()}/consent?token=${encodeURIComponent(raw)}`);
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const loaded = await loadConsentToken(db, req.body?.token);
  if ('error' in loaded && loaded.error) {
    const e = TOKEN_ERRORS[loaded.error];
    res.status(e.status).json({ ok: false, status: loaded.error, error: e.message });
    return;
  }
  const { ref, data } = loaded as { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData };
  const now = new Date().toISOString();
  const withResult = (result: 'accepted' | 'declined') => {
    if (!data.return_url) return null;
    const url = new URL(data.return_url);
    url.searchParams.set('nexus_consent', result);
    return url.toString();
  };

  if (req.body?.declined === true) {
    await ref.set({ status: 'used', used_at: now, result: 'declined' }, { merge: true });
    await logAudit(db, 'founder_consent_declined', data.person_id, { ecosystem_id: data.ecosystem_id });
    res.json({ ok: true, result: 'declined', return_url: withResult('declined') });
    return;
  }

  const terms = await buildConsentTerms();
  const parsed = parseFounderConsent(req.body?.consent, terms);
  if (parsed.ok === false) {
    res.status(parsed.status).json({ ok: false, error: parsed.error, reason: parsed.reason });
    return;
  }

  const state = await recordFounderConsent(db, {
    personId: data.person_id,
    ecosystemId: data.ecosystem_id,
    choices: { ...parsed.value, accepted_at: now },
    terms,
    via: 'consent_page',
  });
  await ref.set({ status: 'used', used_at: now, result: 'accepted' }, { merge: true });
  res.json({ ok: true, result: 'accepted', ...state, return_url: withResult('accepted') });
});

// ─── Referrals and activity from partner systems ──────────────────────────────
//
// So a partner can make referrals, answer them, and share "we worked with
// them" from its own system, without anyone logging in to the shared node.
// Record IDs a partner sends (referral_external_ref, activity_external_ref)
// are idempotency keys scoped to that partner: two partners using the same ID
// scheme can never touch each other's records.

const recordIndexId = (kind: 'referral' | 'activity' | 'participation', orgId: string, ref: { source: string; id: string }) =>
  `${kind}:${orgId}:${ref.source}:${ref.id}`;

const findOwnRecordByRef = async (
  db: FirebaseFirestore.Firestore,
  kind: 'referral' | 'activity',
  orgId: string,
  ref: { source: string; id: string },
): Promise<string | null> => {
  const snap = await db.collection('external_ref_index').doc(recordIndexId(kind, orgId, ref)).get();
  return snap.exists ? (snap.get('entity_id') as string) : null;
};

const indexOwnRecord = async (
  db: FirebaseFirestore.Firestore,
  kind: 'referral' | 'activity' | 'participation',
  orgId: string,
  ref: { source: string; id: string },
  entityId: string,
) => {
  await db.collection('external_ref_index').doc(recordIndexId(kind, orgId, ref)).set({
    ref_key: `${ref.source}:${ref.id}`,
    source: ref.source,
    external_id: ref.id,
    entity_type: kind,
    entity_id: entityId,
    owner_org_id: orgId,
    indexed_at: new Date().toISOString(),
  });
};

const refFrom = (value: unknown): { source: string; id: string } | null => {
  const v = value as Partial<ExternalRef> | undefined;
  return v?.source && v?.id ? { source: String(v.source), id: String(v.id) } : null;
};

/** Resolve a person the calling org itself pushed (by its own external ref). */
const resolveOwnPerson = async (db: FirebaseFirestore.Firestore, orgId: string, value: unknown) => {
  const ref = refFrom(value);
  if (!ref) return null;
  return findByExternalRef(db, { ...ref, owner_org_id: orgId }, 'person', orgId);
};

const ACTIVITY_TYPES = ['meeting', 'call', 'email', 'event', 'note'];

/**
 * POST /partnerCreateReferral
 *
 * Refer an entrepreneur you work with to another organization in the network.
 *
 * Body:
 *   ecosystem_id          string
 *   person_external_ref   { source, id }   — a person you pushed
 *   receiving_org_id      string           — a partner in the same network
 *   notes                 string           — the introduction, for the receiver
 *   entrepreneur_agreed   true             — the entrepreneur asked for or agreed
 *                                            to this referral (the data usage
 *                                            agreement requires it)
 *   referral_external_ref { source, id }   optional — your ID; makes retries safe
 *
 * The receiving partner sees it in its referral inbox, gets a
 * referral.received webhook if it registered one, and can answer it with
 * partnerUpdateReferral. Intro notes are shared only between the two parties.
 */
export const partnerCreateReferral = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const db = admin.firestore();
  const auth = await requireApiKey(req, res, db);
  if (!auth) return;
  if (!(await enforceRateLimit(db, auth.key_id, 'write', res))) return;

  const orgId = auth.organization_id;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  const receivingOrgId = (req.body?.receiving_org_id || '').toString().trim();
  const notes = (req.body?.notes || '').toString().trim();
  const ownRef = refFrom(req.body?.referral_external_ref);

  if (!ecosystemId || !receivingOrgId || !notes) {
    res.status(400).json({ error: 'ecosystem_id, receiving_org_id and notes are required' });
    return;
  }
  if (req.body?.entrepreneur_agreed !== true) {
    res.status(400).json({
      error: 'entrepreneur_agreed must be true: only refer someone who asked for or agreed to the introduction',
      reason: 'entrepreneur_not_agreed',
    });
    return;
  }
  if (receivingOrgId === orgId) {
    res.status(400).json({ error: 'receiving_org_id must be another organization' });
    return;
  }
  if (!(await orgIsInEcosystem(db, orgId, ecosystemId)) || !(await orgIsInEcosystem(db, receivingOrgId, ecosystemId))) {
    res.status(403).json({ error: 'Both organizations must be members of ecosystem_id' });
    return;
  }

  if (ownRef) {
    const existingId = await findOwnRecordByRef(db, 'referral', orgId, ownRef);
    if (existingId) {
      const existing = await db.collection('referrals').doc(existingId).get();
      res.json({ ok: true, referral_id: existingId, status: existing.get('status'), action: 'existing' });
      return;
    }
  }

  const person = await resolveOwnPerson(db, orgId, req.body?.person_external_ref);
  if (!person) {
    res.status(404).json({ error: 'No person found for person_external_ref. Push the person first via partnerUpsertPerson.' });
    return;
  }

  const ref = db.collection('referrals').doc();
  const now = new Date().toISOString();
  await ref.set({
    id: ref.id,
    ecosystem_id: ecosystemId,
    referring_org_id: orgId,
    referring_person_id: null,
    receiving_org_id: receivingOrgId,
    subject_person_id: person.id,
    subject_org_id: person.data.organization_id || person.data.primary_organization_id || null,
    date: now,
    delivered_at: now,
    created_at: now,
    status: 'pending',
    notes,
    intake_type: 'referral',
    source: 'api',
    entrepreneur_agreed_at: now,
    created_via_api_key_id: auth.key_id,
  });
  if (ownRef) await indexOwnRecord(db, 'referral', orgId, ownRef, ref.id);
  await logAudit(db, 'partner_referral_created', orgId, { referral_id: ref.id, receiving_org_id: receivingOrgId, ecosystem_id: ecosystemId });

  res.status(201).json({ ok: true, referral_id: ref.id, status: 'pending', action: 'created' });
});

/**
 * POST /partnerUpdateReferral
 *
 * Answer a referral sent to your organization.
 *
 * Body:
 *   referral_id     string
 *   status          "accepted" | "rejected" | "completed"
 *   response_notes  string   optional — shared only with the referring org
 *   outcome         string   optional — for "completed", e.g. "service_delivered"
 *
 * Follows the referral lifecycle: pending → accepted | rejected,
 * accepted → completed.
 */
export const partnerUpdateReferral = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const db = admin.firestore();
  const auth = await requireApiKey(req, res, db);
  if (!auth) return;
  if (!(await enforceRateLimit(db, auth.key_id, 'write', res))) return;

  const referralId = (req.body?.referral_id || '').toString().trim();
  const status = normalize(req.body?.status) as ReferralStatus;
  if (!referralId || !['accepted', 'rejected', 'completed'].includes(status)) {
    res.status(400).json({ error: 'referral_id and status ("accepted" | "rejected" | "completed") are required' });
    return;
  }

  const ref = db.collection('referrals').doc(referralId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('receiving_org_id') !== auth.organization_id) {
    // Same answer whether it does not exist or is not yours: IDs are not a
    // way to probe other organizations' referrals.
    res.status(404).json({ error: 'No referral to your organization with that id' });
    return;
  }

  const from = (snap.get('status') || 'pending') as ReferralStatus;
  if (from === status) {
    res.json({ ok: true, referral_id: referralId, status, action: 'unchanged' });
    return;
  }
  if (!canTransitionReferral(from, status)) {
    res.status(409).json({ error: `A ${from} referral cannot become ${status}`, reason: 'invalid_transition', current_status: from });
    return;
  }

  const now = new Date().toISOString();
  const responseNotes = (req.body?.response_notes || '').toString().trim();
  const outcome = (req.body?.outcome || '').toString().trim();
  await ref.set({
    status,
    ...(status === 'accepted' ? { accepted_at: now } : {}),
    ...(status === 'rejected' ? { declined_at: now } : {}),
    ...(status === 'completed' ? { closed_at: now, ...(from === 'pending' ? { accepted_at: now } : {}) } : {}),
    ...(responseNotes ? { response_notes: responseNotes } : {}),
    ...(status === 'completed' && outcome ? { outcome } : {}),
    updated_at: now,
    updated_via_api_key_id: auth.key_id,
  }, { merge: true });
  await logAudit(db, 'partner_referral_updated', auth.organization_id, { referral_id: referralId, from, to: status });

  res.json({ ok: true, referral_id: referralId, status, action: 'updated' });
});

/**
 * GET /partnerListReferrals?ecosystem_id=…&direction=incoming|outgoing&status=pending&updated_since=ISO
 *
 * Referrals your organization is a party to — for partners that poll rather
 * than receive webhooks. Includes the entrepreneur's name and email (the
 * receiving organization needs to contact them) and your own record ID for
 * them when you have one; never another organization's IDs.
 */
export const partnerListReferrals = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const db = admin.firestore();
  const auth = await requireApiKey(req, res, db);
  if (!auth) return;
  if (!(await enforceRateLimit(db, auth.key_id, 'read', res))) return;

  const orgId = auth.organization_id;
  const ecosystemId = normalize(req.query?.ecosystem_id as string | undefined);
  const direction = normalize(req.query?.direction as string | undefined) || 'incoming';
  const status = normalize(req.query?.status as string | undefined);
  const since = (req.query?.updated_since as string | undefined) || '';

  if (!ecosystemId || !['incoming', 'outgoing'].includes(direction)) {
    res.status(400).json({ error: 'ecosystem_id and direction ("incoming" | "outgoing") are required' });
    return;
  }

  const field = direction === 'incoming' ? 'receiving_org_id' : 'referring_org_id';
  const snap = await db.collection('referrals').where(field, '==', orgId).where('ecosystem_id', '==', ecosystemId).get();
  const rows = snap.docs
    .map((d) => ({ ...d.data(), id: d.id }) as Record<string, any>)
    .filter((r) => !status || r.status === status)
    .filter((r) => !since || (r.updated_at || r.date || '') >= since)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 500);

  const personIds = Array.from(new Set(rows.map((r) => r.subject_person_id).filter(Boolean)));
  const people = new Map<string, FirebaseFirestore.DocumentData>();
  for (const id of personIds) {
    const p = await db.collection('people').doc(id).get();
    if (p.exists) people.set(id, p.data()!);
  }

  res.json({
    ok: true,
    referrals: rows.map((r) => {
      const person = r.subject_person_id ? people.get(r.subject_person_id) : undefined;
      const ownRef = ((person?.external_refs || []) as ExternalRef[]).find((x) => x.owner_org_id === orgId);
      return {
        referral_id: r.id,
        status: r.status,
        date: r.date,
        referring_org_id: r.referring_org_id,
        receiving_org_id: r.receiving_org_id,
        notes: r.notes || '',
        response_notes: r.response_notes || '',
        outcome: r.outcome || null,
        accepted_at: r.accepted_at || null,
        declined_at: r.declined_at || null,
        closed_at: r.closed_at || null,
        // Email only once you need it: an incoming referral you have not yet
        // accepted names the person but does not carry their contact details
        // (unless the record is already yours).
        entrepreneur: person ? {
          nexus_id: r.subject_person_id,
          first_name: person.first_name || '',
          last_name: person.last_name || '',
          ...(direction === 'outgoing' || r.status !== 'pending' || ownRef ? { email: person.email || '' } : {}),
          your_external_ref: ownRef ? { source: ownRef.source, id: ownRef.id } : null,
        } : null,
      };
    }),
  });
});

/**
 * POST /partnerLogActivity
 *
 * Record that your organization worked with an entrepreneur — a meeting,
 * call, event, or session. Partners who also work with them see the FACT
 * (your organization, the type, the date) if share_fact is true. Notes are
 * stored for your organization only and are never shared.
 *
 * Body:
 *   ecosystem_id           string
 *   person_external_ref    { source, id }   — a person you pushed
 *   type                   "meeting" | "call" | "email" | "event" | "note"
 *   date                   "YYYY-MM-DD"
 *   share_fact             boolean   optional, default true
 *   notes                  string    optional — private to your organization
 *   activity_external_ref  { source, id }   optional — your ID; makes it an upsert
 */
export const partnerLogActivity = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const db = admin.firestore();
  const auth = await requireApiKey(req, res, db);
  if (!auth) return;
  if (!(await enforceRateLimit(db, auth.key_id, 'write', res))) return;

  const orgId = auth.organization_id;
  const ecosystemId = normalize(req.body?.ecosystem_id);
  const type = normalize(req.body?.type);
  const date = (req.body?.date || '').toString().trim();
  const shareFact = req.body?.share_fact !== false;
  const notes = (req.body?.notes || '').toString();
  const ownRef = refFrom(req.body?.activity_external_ref);

  if (!ecosystemId || !ACTIVITY_TYPES.includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: `ecosystem_id, type (${ACTIVITY_TYPES.join(' | ')}) and date (YYYY-MM-DD) are required` });
    return;
  }
  if (!(await orgIsInEcosystem(db, orgId, ecosystemId))) {
    res.status(403).json({ error: 'ecosystem_id is outside your organization\'s ecosystems' });
    return;
  }
  const person = await resolveOwnPerson(db, orgId, req.body?.person_external_ref);
  if (!person) {
    res.status(404).json({ error: 'No person found for person_external_ref. Push the person first via partnerUpsertPerson.' });
    return;
  }

  const now = new Date().toISOString();
  const fields = {
    ecosystem_id: ecosystemId,
    organization_id: person.data.organization_id || person.data.primary_organization_id || '',
    subject_person_id: person.id,
    author_org_id: orgId,
    date,
    type,
    visibility: shareFact ? 'network_shared' : 'eso_private',
    note_confidential: !shareFact,
    notes,
    source: 'api',
    updated_at: now,
    updated_via_api_key_id: auth.key_id,
  };

  const existingId = ownRef ? await findOwnRecordByRef(db, 'activity', orgId, ownRef) : null;
  if (existingId) {
    await db.collection('interactions').doc(existingId).set(fields, { merge: true });
    res.json({ ok: true, activity_id: existingId, action: 'updated' });
    return;
  }

  const ref = db.collection('interactions').doc();
  await ref.set({ id: ref.id, created_at: now, ...fields });
  if (ownRef) await indexOwnRecord(db, 'activity', orgId, ownRef, ref.id);
  res.status(201).json({ ok: true, activity_id: ref.id, action: 'created' });
});

// ─── OIDC / SSO — multi-provider OAuth ───────────────────────────────────────

/**
 * POST /partnerRegisterOidcProvider
 *
 * Registers an OAuth2/OIDC server for an ESO so their members can use
 * "Sign in with [ESO name]" on the Nexus frontend.
 * MakeHaven's Drupal OAuth is just one instance — any standards-compliant
 * OAuth2 server with a userinfo endpoint works.
 *
 * Required header: X-Nexus-API-Key
 *
 * Body:
 *   display_name           string   — e.g. "Sign in with MakeHaven"
 *   authorization_endpoint string   — e.g. "https://makehaven.org/oauth/authorize"
 *   token_endpoint         string   — e.g. "https://makehaven.org/oauth/token"
 *   userinfo_endpoint      string   — e.g. "https://makehaven.org/oauth/userinfo"
 *   client_id              string
 *   client_secret          string
 *   scopes?                string[] — default: ["openid", "email", "profile"]
 *   logo_url?              string
 *   ref_sources?           { [userinfo_key: string]: string }
 *                          — Maps userinfo response keys (e.g. "drupal_uid",
 *                            "civi_contact_id") to the external_ref.source
 *                            string Nexus should use when storing that
 *                            identifier on a person/org. Lets this provider
 *                            align with other integrations writing the same
 *                            underlying ids (e.g. the entrepreneur_nexus_bridge
 *                            module on MakeHaven's Drupal writes CiviCRM
 *                            pushes with source "makehaven_civicrm" —
 *                            register with { civi_contact_id: "makehaven_civicrm" }
 *                            so SSO-provisioned and bridge-pushed records
 *                            dedup to the same Nexus person).
 *                          Values must be non-empty strings. Unspecified keys
 *                          fall back to "<provider_id>:<userinfo_key>".
 *
 * Response:
 *   { ok: true, provider_id: string }
 */
export const partnerRegisterOidcProvider = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const authContext = await requireApiKey(req, res, db);
  if (!authContext) return;
  if (!(await enforceRateLimit(db, authContext.key_id, 'register', res))) return;

  const displayName = (req.body?.display_name || '').toString().trim();
  const authorizationEndpoint = (req.body?.authorization_endpoint || '').toString().trim();
  const tokenEndpoint = (req.body?.token_endpoint || '').toString().trim();
  const userinfoEndpoint = (req.body?.userinfo_endpoint || '').toString().trim();
  const clientId = (req.body?.client_id || '').toString().trim();
  const clientSecret = (req.body?.client_secret || '').toString().trim();
  const scopes: string[] = Array.isArray(req.body?.scopes)
    ? req.body.scopes
    : ['openid', 'email', 'profile'];
  const logoUrl = (req.body?.logo_url || '').toString().trim() || undefined;

  // ref_sources: validate as a flat string-to-non-empty-string map. Reject
  // nested / non-string values rather than silently coercing — this field
  // drives dedup correctness and we want loud failure on malformed input.
  let refSources: Record<string, string> | undefined;
  const refSourcesRaw = req.body?.ref_sources;
  if (refSourcesRaw !== undefined && refSourcesRaw !== null) {
    if (typeof refSourcesRaw !== 'object' || Array.isArray(refSourcesRaw)) {
      res.status(400).json({ error: 'ref_sources must be a flat object of string-to-string pairs' });
      return;
    }
    const validated: Record<string, string> = {};
    for (const [k, v] of Object.entries(refSourcesRaw as Record<string, unknown>)) {
      if (typeof v !== 'string' || !v.trim()) {
        res.status(400).json({ error: `ref_sources.${k} must be a non-empty string` });
        return;
      }
      validated[k] = v.trim();
    }
    if (Object.keys(validated).length > 0) refSources = validated;
  }

  // client_secret is optional: public PKCE clients (confidential=0 in the
  // simple_oauth consumer) don't have one. When omitted, the token endpoint
  // exchange relies on PKCE + client_id only.
  if (!displayName || !authorizationEndpoint || !tokenEndpoint || !userinfoEndpoint || !clientId) {
    res.status(400).json({
      error: 'display_name, authorization_endpoint, token_endpoint, userinfo_endpoint, and client_id are required',
    });
    return;
  }

  for (const url of [authorizationEndpoint, tokenEndpoint, userinfoEndpoint]) {
    if (!url.startsWith('https://')) {
      res.status(400).json({ error: 'All endpoint URLs must use HTTPS' });
      return;
    }
  }

  // Fetch the organization's ecosystem_id for scoping.
  const orgDoc = await db.collection('organizations').doc(authContext.organization_id).get();
  const ecosystemId = (orgDoc.get('ecosystem_ids') as string[] | undefined)?.[0] || '';

  const providerId = `oidc_${authContext.organization_id}`;
  const now = new Date().toISOString();

  const provider: OidcProviderRecord = {
    id: providerId,
    organization_id: authContext.organization_id,
    ecosystem_id: ecosystemId,
    display_name: displayName,
    ...(logoUrl && { logo_url: logoUrl }),
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    userinfo_endpoint: userinfoEndpoint,
    client_id: clientId,
    client_secret: clientSecret,
    scopes,
    ...(refSources && { ref_sources: refSources }),
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  await db.collection('oidc_providers').doc(providerId).set(provider);
  await logAudit(db, 'oidc_provider_registered', authContext.organization_id, {
    provider_id: providerId,
    display_name: displayName,
  });

  res.status(201).json({ ok: true, provider_id: providerId });
});


/**
 * GET /oidcGetProviders?ecosystem_id=<id>
 *
 * Returns the list of active OIDC providers for an ecosystem — the info
 * the frontend needs to render "Sign in with [ESO]" buttons and initiate
 * the PKCE flow. client_secret is never included.
 *
 * No auth required — this is public metadata.
 */
export const oidcGetProviders = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ecosystemId = normalize(req.query?.ecosystem_id as string);
  if (!ecosystemId) {
    res.status(400).json({ error: 'ecosystem_id query parameter is required' });
    return;
  }

  const db = admin.firestore();
  const snap = await db.collection('oidc_providers')
    .where('ecosystem_id', '==', ecosystemId)
    .where('status', '==', 'active')
    .get();

  const providers = snap.docs.map(doc => {
    const d = doc.data() as OidcProviderRecord;
    return {
      provider_id: d.id,
      organization_id: d.organization_id,
      display_name: d.display_name,
      logo_url: d.logo_url || null,
      authorization_endpoint: d.authorization_endpoint,
      client_id: d.client_id,
      scopes: d.scopes,
      ref_sources: d.ref_sources || {},
      // client_secret intentionally excluded
    };
  });

  res.json({ ok: true, providers });
});


/**
 * GET /oidcGetProvider?provider_id=<id>
 *
 * Returns a single active OIDC provider's public config — the info the
 * frontend needs to initiate PKCE against a specific provider without
 * knowing the ecosystem in advance (i.e. when a partner site deep-links
 * the user to /sso/:providerId).
 *
 * client_secret is never included. No auth required — this is public
 * metadata, the same shape returned by oidcGetProviders.
 */
export const oidcGetProvider = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const providerId = ((req.query?.provider_id as string) || '').trim();
  if (!providerId) {
    res.status(400).json({ error: 'provider_id query parameter is required' });
    return;
  }

  const db = admin.firestore();
  const doc = await db.collection('oidc_providers').doc(providerId).get();
  if (!doc.exists || doc.get('status') !== 'active') {
    res.status(404).json({ error: 'OIDC provider not found or inactive' });
    return;
  }

  const d = doc.data() as OidcProviderRecord;
  res.json({
    ok: true,
    provider: {
      provider_id: d.id,
      organization_id: d.organization_id,
      ecosystem_id: d.ecosystem_id,
      display_name: d.display_name,
      logo_url: d.logo_url || null,
      authorization_endpoint: d.authorization_endpoint,
      client_id: d.client_id,
      scopes: d.scopes,
      ref_sources: d.ref_sources || {},
      // client_secret intentionally excluded
    },
  });
});


/**
 * POST /oidcExchangeToken
 *
 * PKCE token exchange: receives an auth code from the ESO's OAuth server,
 * exchanges it server-side (using the stored client_secret), retrieves the
 * user's identity from the userinfo endpoint, finds or creates a Nexus person
 * record, and returns a Firebase custom token for the frontend to call
 * signInWithCustomToken() with.
 *
 * The frontend does standard PKCE (generates code_verifier/code_challenge,
 * redirects to authorization_endpoint, receives code in callback). It then
 * sends the code here rather than exchanging it directly — this keeps the
 * client_secret server-side only.
 *
 * No auth required — the auth code + code_verifier is the credential.
 *
 * Body:
 *   provider_id    string  — from oidcGetProviders
 *   code           string  — authorization code from OAuth server
 *   code_verifier  string  — PKCE verifier generated by frontend
 *   redirect_uri   string  — must match what was sent to authorization_endpoint
 *
 * Response:
 *   { ok: true, firebase_token: string, nexus_id: string, is_new_account: boolean }
 */
export const oidcExchangeToken = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const providerId = (req.body?.provider_id || '').toString().trim();
  const code = (req.body?.code || '').toString().trim();
  const codeVerifier = (req.body?.code_verifier || '').toString().trim();
  const redirectUri = (req.body?.redirect_uri || '').toString().trim();

  if (!providerId || !code || !codeVerifier || !redirectUri) {
    res.status(400).json({ error: 'provider_id, code, code_verifier, and redirect_uri are required' });
    return;
  }

  // Load provider config.
  const providerDoc = await db.collection('oidc_providers').doc(providerId).get();
  if (!providerDoc.exists || providerDoc.get('status') !== 'active') {
    res.status(404).json({ error: 'OIDC provider not found or inactive' });
    return;
  }
  const provider = providerDoc.data() as OidcProviderRecord;

  // Exchange auth code for tokens at the ESO's token endpoint.
  let accessToken: string;
  try {
    const tokenBodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: provider.client_id,
      code_verifier: codeVerifier,
    };
    // Public PKCE clients have no client_secret; only include when set.
    if (provider.client_secret) tokenBodyParams.client_secret = provider.client_secret;
    const tokenBody = new URLSearchParams(tokenBodyParams);
    const tokenRes = await fetch(provider.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => '');
      console.error(`OIDC token exchange failed (${tokenRes.status}):`, errBody);
      res.status(502).json({ error: 'Token exchange with OAuth server failed' });
      return;
    }
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      res.status(502).json({ error: 'No access_token in OAuth server response' });
      return;
    }
    accessToken = tokenData.access_token;
  } catch (err: any) {
    console.error('OIDC token exchange error:', err?.message);
    res.status(502).json({ error: 'Could not reach OAuth server' });
    return;
  }

  // Fetch user identity from userinfo endpoint. Supports both:
  //   (a) standard OIDC claims (email, given_name, family_name, name)
  //   (b) the "entrepreneurship" profile shape served by the federated
  //       entrepreneurship_api Drupal module (drupal_uid, display_name,
  //       civi_contact_id, employer_org). See docs/makehaven-sso-plan.md.
  // Parsers tolerate missing fields from either shape.
  let userEmail: string;
  let userFirstName: string;
  let userLastName: string;
  let providerSubject: string = '';
  let providerCiviContactId: string = '';
  let employerInfo: { id?: string; name?: string; website?: string; domain?: string } | null = null;
  type VentureInfo = { id?: string; name: string; website?: string; domain?: string; description?: string; founded_year?: number };
  let ventures: VentureInfo[] = [];
  try {
    const infoRes = await fetch(provider.userinfo_endpoint, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!infoRes.ok) {
      res.status(502).json({ error: 'Userinfo endpoint returned an error' });
      return;
    }
    const info = await infoRes.json() as {
      email?: string; name?: string; display_name?: string;
      given_name?: string; family_name?: string;
      field_first_name?: string; field_last_name?: string; // Drupal field names
      sub?: string; drupal_uid?: string | number;
      civi_contact_id?: string | number | null;
      employer_org?: { id?: string | number; name?: string; website?: string | null; domain?: string | null } | null;
      ventures?: Array<{
        id?: string | number; name?: string;
        website?: string | null; domain?: string | null;
        description?: string | null; founded_year?: number | null;
      }> | null;
    };

    userEmail = normalize(info.email);
    if (!userEmail) {
      res.status(502).json({ error: 'Userinfo response did not include an email address' });
      return;
    }

    // Resolve name: prefer OIDC claims, then Drupal field names, then split
    // a single `name` / `display_name` string.
    userFirstName = (info.given_name || info.field_first_name || '').toString().trim();
    userLastName = (info.family_name || info.field_last_name || '').toString().trim();
    const combinedName = (info.display_name || info.name || '').toString().trim();
    if (!userFirstName && combinedName) {
      const parts = combinedName.split(/\s+/);
      userFirstName = parts[0] || '';
      userLastName = parts.slice(1).join(' ');
    }

    // A stable provider-side subject identifier. Prefer `drupal_uid` (what
    // the entrepreneurship_api module emits), fall back to standard OIDC
    // `sub`, fall back to empty (falls through to email-based dedup).
    providerSubject = (info.drupal_uid ?? info.sub ?? '').toString().trim();
    providerCiviContactId = (info.civi_contact_id ?? '').toString().trim();

    if (info.employer_org && (info.employer_org.id || info.employer_org.name)) {
      employerInfo = {
        id: info.employer_org.id != null ? info.employer_org.id.toString() : undefined,
        name: info.employer_org.name || undefined,
        website: info.employer_org.website || undefined,
        domain: info.employer_org.domain || undefined,
      };
    }

    // Entrepreneur-native: a list of ventures the user has at the provider.
    // Distinct from employer_org (which is the CRM "Employee of" relationship)
    // because an entrepreneur's own startup may have no employer record but
    // be very much their primary venture. We provision a shell for each, run
    // each through the same matchOrganization dedup, and attach the person
    // to all of them via organization_affiliations. employer_org and ventures
    // can both be present — they're independent signals.
    if (Array.isArray(info.ventures)) {
      for (const v of info.ventures) {
        const name = (v?.name || '').toString().trim();
        if (!name) continue;
        ventures.push({
          id: v.id != null ? v.id.toString() : undefined,
          name,
          website: v.website || undefined,
          domain: v.domain || undefined,
          description: v.description || undefined,
          founded_year: typeof v.founded_year === 'number' ? v.founded_year : undefined,
        });
      }
    }
  } catch (err: any) {
    console.error('OIDC userinfo error:', err?.message);
    res.status(502).json({ error: 'Could not retrieve user info from OAuth server' });
    return;
  }

  // Build external_refs carried by this identity. Each userinfo key maps to
  // an `external_ref.source` via provider.ref_sources (admin-configured at
  // registration time) so the SSO path writes the same source strings as
  // other integrations pushing the same underlying ids — e.g. MakeHaven's
  // entrepreneur_nexus_bridge writes with source "makehaven_civicrm" and
  // MakeHaven's provider should register with
  // `ref_sources: { civi_contact_id: "makehaven_civicrm" }` so dedup hits
  // Tier 1. If a key is not mapped, we fall back to a provider-namespaced
  // default so SSO-only dedup still works.
  const refSourceFor = (userinfoKey: string): string =>
    provider.ref_sources?.[userinfoKey] || `${providerId}:${userinfoKey}`;

  const providerRefs: FedExternalRef[] = [];
  if (providerSubject) {
    providerRefs.push({ source: refSourceFor('drupal_uid'), id: providerSubject });
  }
  if (providerCiviContactId) {
    providerRefs.push({ source: refSourceFor('civi_contact_id'), id: providerCiviContactId });
  }

  // Resolve the person via cross-source dedup. Tier 1 (external_ref) wins
  // silently; Tier 2 (exact email) wins silently and back-fills the missing
  // external_ref; Tier 3 (weak signal) is recorded for admin review but does
  // not block — we create a new record so the sign-in flow keeps moving.
  const personMatch = await matchPerson(db, {
    external_refs: providerRefs,
    email: userEmail,
    display_name: `${userFirstName} ${userLastName}`.trim(),
  });

  let personId = '';
  let authUid = '';
  let isNewAccount = false;
  // Tracks whether *any* of the provider's identity refs were newly attached
  // to the resolved person record on this call. Used to fire person.linked
  // exactly once per provider-per-person — first SSO sign-in, not subsequent
  // re-authentications. New accounts always count as "newly linked".
  let newlyLinkedToProvider = false;

  const ensureAuthUidForExistingPerson = async (
    personDoc: admin.firestore.DocumentSnapshot
  ): Promise<{ authUid: string; isNew: boolean }> => {
    let existingUid = (personDoc.get('auth_uid') as string) || '';
    let createdNew = false;
    if (!existingUid) {
      try {
        const fbUser = await admin.auth().createUser({
          email: userEmail,
          displayName: `${userFirstName} ${userLastName}`.trim(),
        });
        existingUid = fbUser.uid;
        createdNew = true;
      } catch (err: any) {
        if (err.code === 'auth/email-already-exists') {
          const fbUser = await admin.auth().getUserByEmail(userEmail);
          existingUid = fbUser.uid;
        } else {
          throw err;
        }
      }
      await personDoc.ref.set(
        { auth_uid: existingUid, updated_at: new Date().toISOString() },
        { merge: true }
      );
    }
    return { authUid: existingUid, isNew: createdNew };
  };

  if (personMatch.tier === 'external_ref' || personMatch.tier === 'email_exact') {
    // Silent auto-link to the existing record.
    const personRef = db.collection('people').doc(personMatch.person_id);
    const personDoc = await personRef.get();
    if (!personDoc.exists) {
      // Index drift — the external_ref_index pointed at a deleted record.
      // Fall through to creation by treating this as a miss.
      console.warn('dedup pointed at missing person, creating fresh:', personMatch);
    } else if (['platform_admin', 'ecosystem_manager'].includes((personDoc.get('system_role') as string) || '')) {
      // NEVER silently auto-link a privileged account. A provider controls
      // what its userinfo endpoint asserts, so an email match alone must not
      // mint a session for an admin — that would let any org with an API key
      // take over admin accounts. Privileged users must sign in directly and
      // use the interactive oidcLinkAccount flow.
      console.warn(`OIDC auto-link blocked for privileged account ${personMatch.person_id} via provider ${providerId}`);
      res.status(403).json({
        error: 'This account cannot be linked via SSO sign-in. Sign in with your Nexus credentials and link the provider from account settings.',
      });
      return;
    } else if (
      !(
        (provider.ecosystem_id &&
          ((personDoc.get('ecosystem_id') as string) === provider.ecosystem_id ||
            ((personDoc.get('ecosystem_ids') as string[] | undefined) || []).includes(provider.ecosystem_id))) ||
        ((personDoc.get('primary_organization_id') || personDoc.get('organization_id') || '') === provider.organization_id)
      )
    ) {
      // Any auto-link must stay within the provider's own scope, whichever
      // tier matched.
      //
      // This guard used to apply only to `email_exact`, which left the
      // external_ref tier unscoped — and that tier is attacker-reachable: a
      // partner key can attach its own ref to someone else's person record
      // (the link-by-email path), register an OIDC provider mapping that ref
      // source, and then have its own userinfo endpoint assert the ref. The
      // result was a session as that person, in any org or ecosystem. Scope
      // is now checked before any tier mints a session.
      console.warn(`OIDC auto-link out of scope (tier=${personMatch.tier}): person ${personMatch.person_id} vs provider ${providerId}`);
      res.status(403).json({
        error: 'An account with this email already exists outside this provider\'s network. Sign in with your Nexus credentials and link the provider from account settings.',
      });
      return;
    } else {
      personId = personDoc.id;
      try {
        ({ authUid, isNew: isNewAccount } = await ensureAuthUidForExistingPerson(personDoc));
      } catch (err: any) {
        console.error('Firebase user creation failed for existing person:', err?.message);
        res.status(500).json({ error: 'Could not create account' });
        return;
      }
      // Back-fill any of our provider external_refs that aren't already on the record.
      for (const ref of providerRefs) {
        const result = await attachExternalRef(db, 'person', personId, ref);
        if (result.added) {
          newlyLinkedToProvider = true;
        }
      }
    }
  }

  if (!personId) {
    // Either no match, a weak-signal match, or a stale-index miss — create a
    // fresh person record. Weak-signal matches are flagged for admin review
    // after creation (id only known post-write).
    let fbUser;
    try {
      fbUser = await admin.auth().createUser({
        email: userEmail,
        displayName: `${userFirstName} ${userLastName}`.trim(),
      });
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        fbUser = await admin.auth().getUserByEmail(userEmail);
      } else {
        console.error('Firebase user creation failed:', err?.message);
        res.status(500).json({ error: 'Could not create account' });
        return;
      }
    }

    authUid = fbUser.uid;
    const now = new Date().toISOString();
    const newPersonRef = db.collection('people').doc(authUid);
    await newPersonRef.set({
      id: authUid,
      auth_uid: authUid,
      first_name: userFirstName,
      last_name: userLastName,
      email: userEmail,
      system_role: 'entrepreneur',
      organization_id: '',
      ecosystem_id: provider.ecosystem_id,
      memberships: [],
      external_refs: providerRefs,
      tags: [],
      status: 'active',
      source: 'oidc',
      oidc_provider_id: providerId,
      created_at: now,
      updated_at: now,
    });

    // Register external_refs in the index so future logins hit Tier 1.
    for (const ref of providerRefs) {
      await attachExternalRef(db, 'person', authUid, ref);
    }

    // Network profile. Signing in with a partner's account is not consent to
    // be listed or to share details — those stay off until the founder turns
    // them on (the post-login agreement gate and privacy settings ask them).
    await db.collection('network_profiles').doc(authUid).set({
      person_id: authUid,
      display_name: `${userFirstName} ${userLastName}`.trim(),
      ecosystem_ids: [provider.ecosystem_id],
      directory_listed_ecosystems: [],
      detail_sharing_ecosystems: [],
      terms_accepted_ecosystems: [],
      consent_updated_at: now,
    });

    personId = authUid;
    isNewAccount = true;
    newlyLinkedToProvider = true;

    if (personMatch.tier === 'weak_signal') {
      await flagPossibleDuplicate(db, {
        entity_type: 'person',
        new_entity_id: personId,
        candidate_entity_id: personMatch.candidate_person_id,
        confidence: personMatch.confidence,
        reason: personMatch.reason,
        source: `oidc:${providerId}`,
        ecosystem_id: provider.ecosystem_id,
      });
    }
  }

  // If the provider surfaced an employer organization, provision (or link to)
  // a shell record for it and attach the person. This is the "one click also
  // provisions their company" behavior described in the SSO plan.
  if (employerInfo) {
    const orgRefs: FedExternalRef[] = [];
    if (employerInfo.id) {
      orgRefs.push({ source: refSourceFor('employer_org_id'), id: employerInfo.id });
    }
    const orgMatch = await matchOrganization(db, {
      external_refs: orgRefs,
      name: employerInfo.name,
      domain: employerInfo.domain,
      website: employerInfo.website,
    });

    let resolvedOrgId: string | null = null;

    if (orgMatch.tier === 'external_ref' || orgMatch.tier === 'domain_exact') {
      resolvedOrgId = orgMatch.org_id;
      for (const ref of orgRefs) {
        await attachExternalRef(db, 'organization', resolvedOrgId, ref);
      }
    } else if (employerInfo.name) {
      // Create a shell record. Minimal fields: enough to search and dedup;
      // detail enrichment can happen on the next sync from the source.
      const now = new Date().toISOString();
      const newOrgRef = db.collection('organizations').doc();
      const orgDoc = {
        id: newOrgRef.id,
        name: employerInfo.name,
        description: '',
        email: '',
        url: employerInfo.website || '',
        domain: employerInfo.domain || '',
        tax_status: '',
        external_refs: orgRefs,
        managed_by_ids: [],
        operational_visibility: 'restricted',
        ecosystem_ids: [provider.ecosystem_id],
        authorized_eso_ids: [],
        status: 'active',
        source: 'oidc_shell',
        source_authority: `oidc:${providerId}`,
        created_at: now,
        updated_at: now,
      };
      await newOrgRef.set(orgDoc);
      for (const ref of orgRefs) {
        await attachExternalRef(db, 'organization', newOrgRef.id, ref);
      }
      resolvedOrgId = newOrgRef.id;

      if (orgMatch.tier === 'weak_signal') {
        await flagPossibleDuplicate(db, {
          entity_type: 'organization',
          new_entity_id: resolvedOrgId,
          candidate_entity_id: orgMatch.candidate_org_id,
          confidence: orgMatch.confidence,
          reason: orgMatch.reason,
          source: `oidc:${providerId}`,
          ecosystem_id: provider.ecosystem_id,
        });
      }
    }

    if (resolvedOrgId) {
      // Link the person to the org by setting their organization_id if it
      // is empty. We don't overwrite an existing assignment — admin or the
      // user can change that via explicit action.
      const personRef = db.collection('people').doc(personId);
      const currentOrg = ((await personRef.get()).get('organization_id') as string) || '';
      if (!currentOrg) {
        await personRef.update({ organization_id: resolvedOrgId, updated_at: new Date().toISOString() });
      }
    }
  }

  // Provision the user's ventures (MakeHaven Business nodes). Distinct from
  // employer_org: these are entrepreneur-owned, and a user can have several.
  // For each venture name we run matchOrganization (Tier 1 external_ref →
  // Tier 2 domain → Tier 3 weak signal). Resolved org ids are folded into the
  // person's organization_affiliations as 'founder'-type entries. If no
  // primary organization_id is set yet, the first resolved venture takes that
  // slot too (preserves the prior "first SSO sets primary org" behavior).
  if (ventures.length > 0) {
    const resolvedVentureOrgIds: string[] = [];
    for (const venture of ventures) {
      const ventureRefs: FedExternalRef[] = [];
      if (venture.id) {
        ventureRefs.push({ source: refSourceFor('venture_id'), id: venture.id });
      }
      const ventureMatch = await matchOrganization(db, {
        external_refs: ventureRefs,
        name: venture.name,
        domain: venture.domain,
        website: venture.website,
      });

      let ventureOrgId: string | null = null;
      if (ventureMatch.tier === 'external_ref' || ventureMatch.tier === 'domain_exact') {
        ventureOrgId = ventureMatch.org_id;
        for (const ref of ventureRefs) {
          await attachExternalRef(db, 'organization', ventureOrgId, ref);
        }
      } else {
        const now = new Date().toISOString();
        const newOrgRef = db.collection('organizations').doc();
        await newOrgRef.set({
          id: newOrgRef.id,
          name: venture.name,
          description: venture.description || '',
          email: '',
          url: venture.website || '',
          domain: venture.domain || '',
          tax_status: '',
          founded_year: venture.founded_year ?? null,
          external_refs: ventureRefs,
          managed_by_ids: [],
          operational_visibility: 'restricted',
          ecosystem_ids: [provider.ecosystem_id],
          authorized_eso_ids: [],
          status: 'active',
          source: 'oidc_shell',
          source_authority: `oidc:${providerId}`,
          source_kind: 'venture',
          created_at: now,
          updated_at: now,
        });
        for (const ref of ventureRefs) {
          await attachExternalRef(db, 'organization', newOrgRef.id, ref);
        }
        ventureOrgId = newOrgRef.id;

        if (ventureMatch.tier === 'weak_signal') {
          await flagPossibleDuplicate(db, {
            entity_type: 'organization',
            new_entity_id: ventureOrgId,
            candidate_entity_id: ventureMatch.candidate_org_id,
            confidence: ventureMatch.confidence,
            reason: ventureMatch.reason,
            source: `oidc:${providerId}`,
            ecosystem_id: provider.ecosystem_id,
          });
        }
      }

      if (ventureOrgId) {
        resolvedVentureOrgIds.push(ventureOrgId);
      }
    }

    if (resolvedVentureOrgIds.length > 0) {
      const personRef = db.collection('people').doc(personId);
      const personSnap = await personRef.get();
      const existingAffiliations: Array<{ organization_id: string; [k: string]: unknown }> =
        (personSnap.get('organization_affiliations') as any[]) || [];
      const existingIds = new Set(existingAffiliations.map(a => a.organization_id));
      const additions = resolvedVentureOrgIds
        .filter(id => !existingIds.has(id))
        .map(id => ({
          organization_id: id,
          relationship_type: 'founder' as const,
          status: 'active' as const,
          ecosystem_ids: [provider.ecosystem_id],
          joined_at: new Date().toISOString(),
        }));

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (additions.length > 0) {
        updates.organization_affiliations = [...existingAffiliations, ...additions];
      }
      // Set primary organization_id to the first venture if none was set above
      // by the employer_org branch. Doesn't overwrite an existing assignment.
      const currentPrimary = (personSnap.get('organization_id') as string) || '';
      if (!currentPrimary) {
        updates.organization_id = resolvedVentureOrgIds[0];
      }
      await personRef.update(updates);
    }
  }

  // Mint Firebase custom token — frontend calls signInWithCustomToken() with this.
  const firebaseToken = await admin.auth().createCustomToken(authUid, {
    nexus_person_id: personId,
    oidc_provider: providerId,
  });

  await logAudit(db, 'oidc_signin', personId, {
    provider_id: providerId,
    organization_id: provider.organization_id,
    is_new_account: isNewAccount,
  });

  // Fire person.linked exactly on first attachment of this provider to this
  // record. Subsequent re-auths from the same provider are silent. Delivered
  // to webhooks registered on the provider's own organization so the upstream
  // ESO (e.g., MakeHaven Drupal) can flip a "connected" UI flag for the user.
  if (newlyLinkedToProvider) {
    await deliverWebhooksForOrg(db, provider.organization_id, 'person.linked', {
      person_id: personId,
      provider_id: providerId,
      organization_id: provider.organization_id,
      ecosystem_id: provider.ecosystem_id,
      external_refs: providerRefs,
      is_new_account: isNewAccount,
      linked_at: new Date().toISOString(),
    });
  }

  res.json({ ok: true, firebase_token: firebaseToken, nexus_id: personId, is_new_account: isNewAccount });
});


/**
 * POST /oidcLinkAccount
 *
 * Attaches a provider's identity to the already-authenticated Nexus user,
 * without creating a new person record. Used when a user signed up via
 * another path (email, Google) and wants to link their [Provider] account
 * after the fact so future SSO sign-ins resolve to the same record and
 * cross-lane dedup works.
 *
 * Requires a Firebase ID token in the Authorization header (the caller is
 * the user being linked). PKCE flow is identical to oidcExchangeToken; the
 * only differences are:
 *   - we use the caller's existing authUid/personId instead of dedup,
 *   - we reject if any of the provider refs is already linked to a DIFFERENT
 *     Nexus person,
 *   - we do NOT provision an employer org — linking is an identity action,
 *     not a profile/data import. (Users can set their org separately.)
 *
 * Body:
 *   provider_id, code, code_verifier, redirect_uri
 *
 * Response:
 *   { ok: true, linked_refs: [{ source, id }, ...] }
 *
 * Errors:
 *   401  — no/invalid Firebase ID token
 *   404  — provider not found or inactive
 *   409  — provider identity is already linked to a different Nexus person
 *   502  — provider-side OAuth/userinfo failure
 */
export const oidcLinkAccount = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();

  // Verify the caller is an authenticated Nexus user.
  const authHeader = (req.get('Authorization') || '').trim();
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearerToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  let callerUid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(bearerToken);
    callerUid = decoded.uid;
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
    return;
  }

  // Locate the caller's person record. Persons are keyed by authUid for
  // OIDC-provisioned users; for users created via email/Google, the person
  // doc may have a different id but carry auth_uid as a field. Try both.
  let personDoc = await db.collection('people').doc(callerUid).get();
  if (!personDoc.exists) {
    const snap = await db.collection('people').where('auth_uid', '==', callerUid).limit(1).get();
    if (snap.empty) {
      res.status(404).json({ error: 'No Nexus profile is linked to this session' });
      return;
    }
    personDoc = snap.docs[0];
  }
  const personId = personDoc.id;

  const providerId = (req.body?.provider_id || '').toString().trim();
  const code = (req.body?.code || '').toString().trim();
  const codeVerifier = (req.body?.code_verifier || '').toString().trim();
  const redirectUri = (req.body?.redirect_uri || '').toString().trim();
  if (!providerId || !code || !codeVerifier || !redirectUri) {
    res.status(400).json({ error: 'provider_id, code, code_verifier, and redirect_uri are required' });
    return;
  }

  const providerDoc = await db.collection('oidc_providers').doc(providerId).get();
  if (!providerDoc.exists || providerDoc.get('status') !== 'active') {
    res.status(404).json({ error: 'OIDC provider not found or inactive' });
    return;
  }
  const provider = providerDoc.data() as OidcProviderRecord;

  // Exchange auth code for access token (same as oidcExchangeToken).
  let accessToken: string;
  try {
    const tokenBodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: provider.client_id,
      code_verifier: codeVerifier,
    };
    // Public PKCE clients have no client_secret; only include when set.
    if (provider.client_secret) tokenBodyParams.client_secret = provider.client_secret;
    const tokenBody = new URLSearchParams(tokenBodyParams);
    const tokenRes = await fetch(provider.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      res.status(502).json({ error: 'Token exchange with OAuth server failed' });
      return;
    }
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      res.status(502).json({ error: 'No access_token in OAuth server response' });
      return;
    }
    accessToken = tokenData.access_token;
  } catch {
    res.status(502).json({ error: 'Could not reach OAuth server' });
    return;
  }

  // Fetch userinfo. We only need the identifier fields; display_name and
  // employer_org are ignored here because linking does not touch the
  // profile or org assignment.
  let providerSubject = '';
  let providerCiviContactId = '';
  try {
    const infoRes = await fetch(provider.userinfo_endpoint, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!infoRes.ok) {
      res.status(502).json({ error: 'Userinfo endpoint returned an error' });
      return;
    }
    const info = await infoRes.json() as {
      sub?: string;
      drupal_uid?: string | number;
      civi_contact_id?: string | number | null;
    };
    providerSubject = (info.drupal_uid ?? info.sub ?? '').toString().trim();
    providerCiviContactId = (info.civi_contact_id ?? '').toString().trim();
  } catch {
    res.status(502).json({ error: 'Could not retrieve user info from OAuth server' });
    return;
  }

  // Build refs using the provider's ref_sources map (same convention as
  // oidcExchangeToken) so link and login converge on identical sources.
  const refSourceFor = (userinfoKey: string): string =>
    provider.ref_sources?.[userinfoKey] || `${providerId}:${userinfoKey}`;
  const newRefs: FedExternalRef[] = [];
  if (providerSubject) newRefs.push({ source: refSourceFor('drupal_uid'), id: providerSubject });
  if (providerCiviContactId) newRefs.push({ source: refSourceFor('civi_contact_id'), id: providerCiviContactId });

  if (newRefs.length === 0) {
    res.status(502).json({ error: 'Provider did not return any identifier suitable for linking' });
    return;
  }

  // Conflict check: if any ref is already in the external_ref_index for a
  // DIFFERENT person, reject. A ref already on the caller's own record is
  // fine (idempotent re-link).
  for (const ref of newRefs) {
    const indexDoc = await readExternalRefIndex(db, 'person', ref);
    if (indexDoc) {
      const linkedTo = indexDoc.get('entity_id') as string;
      if (linkedTo && linkedTo !== personId) {
        res.status(409).json({
          error: 'This account is already linked to a different Nexus profile.',
          reason: 'linked_elsewhere',
          conflicting_ref: ref,
        });
        return;
      }
    }
  }

  for (const ref of newRefs) {
    await attachExternalRef(db, 'person', personId, ref);
  }

  await logAudit(db, 'oidc_account_linked', personId, {
    provider_id: providerId,
    organization_id: provider.organization_id,
    refs_added: newRefs.length,
  });

  res.json({ ok: true, linked_refs: newRefs });
});
