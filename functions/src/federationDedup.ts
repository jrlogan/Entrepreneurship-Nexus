/**
 * Cross-source dedup helpers for federated provisioning.
 *
 * When a new identity arrives via SSO (or via the partner API), we want to
 * avoid creating a duplicate record if Nexus already knows this person or
 * organization — possibly from a different source (another agency's push,
 * an independent signup, or a prior partner upsert).
 *
 * Match tiers (applied in order; first hit wins):
 *
 *   Tier 1 — EXTERNAL_REF_MATCH
 *     Any existing external_ref on any record matches an incoming signal.
 *     Highest confidence; silent auto-link.
 *
 *   Tier 2 — EMAIL_EXACT (people) / DOMAIN_EXACT (orgs)
 *     Email exactly matches an existing person; or org domain exactly matches
 *     an existing org's stored domain. Silent auto-link.
 *
 *   Tier 3 — WEAK_SIGNAL
 *     Email domain + normalized name similarity (people) or normalized name
 *     similarity within the same email domain (orgs). Flag for admin review;
 *     DO NOT auto-merge. Caller creates a new record to keep the user flow
 *     moving. The flag surfaces in an admin dedup queue later.
 *
 *   NONE
 *     No candidate found. Caller creates fresh.
 *
 * External refs on entities use the shape `{source, id}` already established
 * by the partner API; an `external_ref_index` collection provides O(1)
 * reverse lookups (see partnerApi.ts).
 */

import * as admin from 'firebase-admin';

export type ExternalRef = { source: string; id: string };

export type MatchTier =
  | 'external_ref'
  | 'email_exact'
  | 'domain_exact'
  | 'weak_signal'
  | 'none';

export type PersonMatch =
  | { tier: 'external_ref' | 'email_exact'; person_id: string; via: string }
  | { tier: 'weak_signal'; candidate_person_id: string; confidence: number; reason: string }
  | { tier: 'none' };

export type OrgMatch =
  | { tier: 'external_ref' | 'domain_exact'; org_id: string; via: string }
  | { tier: 'weak_signal'; candidate_org_id: string; confidence: number; reason: string }
  | { tier: 'none' };

export type PersonSignals = {
  external_refs?: ExternalRef[];
  email?: string;
  display_name?: string;
};

export type OrgSignals = {
  external_refs?: ExternalRef[];
  name?: string;
  domain?: string;
  website?: string;
};

const normalizeEmail = (raw?: string): string => (raw || '').trim().toLowerCase();

const normalizeName = (raw?: string): string =>
  (raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDomain = (raw?: string): string => {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return '';
  // Strip scheme and path if a URL slipped in; strip leading "www."
  const host = s.replace(/^https?:\/\//, '').split('/')[0] || s;
  return host.replace(/^www\./, '');
};

const domainOfEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
};

const tokenize = (s: string): Set<string> => new Set(s.split(' ').filter(Boolean));

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach(t => { if (b.has(t)) intersection++; });
  const union = a.size + b.size - intersection;
  return intersection / union;
};

const WEAK_NAME_THRESHOLD = 0.6;

/**
 * Generic consumer email providers: weak-signal dedup is skipped when the
 * user's domain is one of these, because name similarity across a shared
 * public domain produces too many false positives to auto-flag usefully.
 */
const GENERIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'fastmail.com',
  'zoho.com', 'tutanota.com', 'gmx.com', 'gmx.net',
]);

/**
 * Look up an entity by external_ref via the external_ref_index collection.
 * Returns the document id and data if found and the underlying record still
 * exists, else null.
 */
const lookupByExternalRef = async (
  db: admin.firestore.Firestore,
  ref: ExternalRef,
  entityType: 'person' | 'organization'
): Promise<string | null> => {
  const indexDocId = `${entityType}:${ref.source}:${ref.id}`;
  const indexDoc = await db.collection('external_ref_index').doc(indexDocId).get();
  if (!indexDoc.exists) return null;
  const entityId = indexDoc.get('entity_id') as string | undefined;
  if (!entityId) return null;
  const collection = entityType === 'person' ? 'people' : 'organizations';
  const entityDoc = await db.collection(collection).doc(entityId).get();
  return entityDoc.exists ? entityDoc.id : null;
};

/**
 * Match an incoming person identity against existing Nexus people. Returns
 * the highest-tier match found. Tiers cascade: strong matches short-circuit
 * weaker checks to avoid unnecessary Firestore reads.
 */
export const matchPerson = async (
  db: admin.firestore.Firestore,
  signals: PersonSignals
): Promise<PersonMatch> => {
  // Tier 1: external_ref_index lookup for each provided ref.
  for (const ref of signals.external_refs || []) {
    if (!ref.source || !ref.id) continue;
    const personId = await lookupByExternalRef(db, ref, 'person');
    if (personId) {
      return { tier: 'external_ref', person_id: personId, via: `${ref.source}:${ref.id}` };
    }
  }

  const email = normalizeEmail(signals.email);
  if (!email) return { tier: 'none' };

  // Tier 2: exact email match.
  const emailSnap = await db.collection('people').where('email', '==', email).limit(1).get();
  if (!emailSnap.empty) {
    return { tier: 'email_exact', person_id: emailSnap.docs[0].id, via: email };
  }

  // Tier 3: weak signal — same email domain + name similarity above threshold.
  const name = normalizeName(signals.display_name);
  if (!name) return { tier: 'none' };

  const domain = domainOfEmail(email);
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return { tier: 'none' };

  // Firestore cannot do substring / prefix matches inside an email string, so
  // weak-signal matching scans a bounded slice of recent people and filters
  // in-memory. v1 trade-off: misses older records, but a miss just means a
  // duplicate is created (flagged elsewhere or caught on a later upsert) —
  // the failure mode is "extra record" not "wrong link." Proper fix is a
  // denormalized `email_domain` indexed field on writes; do it later if
  // dup volume warrants.
  const candidates = await db.collection('people')
    .orderBy('updated_at', 'desc')
    .limit(200)
    .get();

  const domainMatches = candidates.docs.filter(d => {
    const e = ((d.get('email') as string) || '').toLowerCase();
    return domainOfEmail(e) === domain;
  });

  let best: { id: string; score: number } | null = null;
  const nameTokens = tokenize(name);
  for (const candidate of domainMatches) {
    const cdName = normalizeName(
      `${candidate.get('first_name') || ''} ${candidate.get('last_name') || ''}`.trim()
      || (candidate.get('display_name') as string) || ''
    );
    const score = jaccard(nameTokens, tokenize(cdName));
    if (score >= WEAK_NAME_THRESHOLD && (!best || score > best.score)) {
      best = { id: candidate.id, score };
    }
  }

  if (best) {
    return {
      tier: 'weak_signal',
      candidate_person_id: best.id,
      confidence: best.score,
      reason: `domain=${domain}, name_jaccard=${best.score.toFixed(2)}`,
    };
  }

  return { tier: 'none' };
};

/**
 * Match an incoming organization identity against existing Nexus orgs.
 */
export const matchOrganization = async (
  db: admin.firestore.Firestore,
  signals: OrgSignals
): Promise<OrgMatch> => {
  // Tier 1: external_ref_index lookup.
  for (const ref of signals.external_refs || []) {
    if (!ref.source || !ref.id) continue;
    const orgId = await lookupByExternalRef(db, ref, 'organization');
    if (orgId) {
      return { tier: 'external_ref', org_id: orgId, via: `${ref.source}:${ref.id}` };
    }
  }

  // Tier 2: exact domain match. We match on either `domain` (normalized) or
  // `url` (parsed). Nexus org schema today stores URL; new writes should also
  // store a normalized `domain` field (added as part of this phase).
  const domain = normalizeDomain(signals.domain || signals.website || '');
  if (domain) {
    const domainSnap = await db.collection('organizations')
      .where('domain', '==', domain)
      .limit(1)
      .get();
    if (!domainSnap.empty) {
      return { tier: 'domain_exact', org_id: domainSnap.docs[0].id, via: `domain:${domain}` };
    }
  }

  // Tier 3: weak name similarity within the same domain scope (if we have
  // one). Without a domain we skip weak matching for orgs — too many
  // false positives across the entire org collection.
  const name = normalizeName(signals.name);
  if (!name || !domain) return { tier: 'none' };

  const candidates = await db.collection('organizations').limit(200).get();
  const nameTokens = tokenize(name);
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates.docs) {
    const cdUrl = (candidate.get('url') || '') as string;
    const cdDomain = normalizeDomain((candidate.get('domain') as string) || cdUrl);
    if (cdDomain && cdDomain !== domain) continue;
    const cdName = normalizeName((candidate.get('name') as string) || '');
    const score = jaccard(nameTokens, tokenize(cdName));
    if (score >= WEAK_NAME_THRESHOLD && (!best || score > best.score)) {
      best = { id: candidate.id, score };
    }
  }

  if (best) {
    return {
      tier: 'weak_signal',
      candidate_org_id: best.id,
      confidence: best.score,
      reason: `domain=${domain}, name_jaccard=${best.score.toFixed(2)}`,
    };
  }

  return { tier: 'none' };
};

/**
 * Add an external_ref to an existing entity's external_refs array
 * idempotently, and update the external_ref_index for O(1) future lookups.
 */
export const attachExternalRef = async (
  db: admin.firestore.Firestore,
  entityType: 'person' | 'organization',
  entityId: string,
  ref: ExternalRef
): Promise<void> => {
  if (!ref.source || !ref.id) return;
  const collection = entityType === 'person' ? 'people' : 'organizations';
  const ref_doc = db.collection(collection).doc(entityId);
  const snap = await ref_doc.get();
  if (!snap.exists) return;

  const existing = (snap.get('external_refs') || []) as ExternalRef[];
  const already = existing.some(r => r.source === ref.source && r.id === ref.id);
  if (!already) {
    await ref_doc.update({
      external_refs: [...existing, ref],
      updated_at: new Date().toISOString(),
    });
  }

  // Index write is idempotent (deterministic doc id).
  await db.collection('external_ref_index').doc(`${entityType}:${ref.source}:${ref.id}`).set({
    ref_key: `${ref.source}:${ref.id}`,
    source: ref.source,
    external_id: ref.id,
    entity_type: entityType,
    entity_id: entityId,
    indexed_at: new Date().toISOString(),
  });
};

/**
 * Record a possible-duplicate flag for admin review. Does not block the
 * caller's flow; the caller is expected to proceed by creating a new record.
 */
export const flagPossibleDuplicate = async (
  db: admin.firestore.Firestore,
  payload: {
    entity_type: 'person' | 'organization';
    new_entity_id: string;
    candidate_entity_id: string;
    confidence: number;
    reason: string;
    source: string;
    ecosystem_id?: string;
  }
): Promise<void> => {
  await db.collection('dedup_flags').add({
    ...payload,
    status: 'pending_review',
    created_at: new Date().toISOString(),
  });
};
