/**
 * Recording a founder's consent, and the one-time links that collect it.
 *
 * Consent can arrive two ways, and both end here:
 *   - the hosted consent page (a link from the consent email, or a link a
 *     partner created with partnerCreateConsentLink and sent the founder to);
 *   - a partner's own signup form that showed the current terms (via the
 *     embeddable widget or getConsentTerms) and passes the founder's answers
 *     on partnerUpsertPerson.
 *
 * Either way the record says which words were accepted (version + text hash),
 * how, and — for partner forms — which organization attests to it.
 */
import type * as admin from 'firebase-admin';
import { createHash, randomBytes } from 'crypto';
import { FOUNDER_AGREEMENTS, type ConsentTerms, type FounderConsentChoices } from './terms';

export type ConsentVia = 'partner_form' | 'consent_page';

const arrayUnion = (current: unknown, value: string, include: boolean): string[] => {
  const list = Array.isArray(current) ? current.filter((v): v is string => typeof v === 'string') : [];
  const without = list.filter((v) => v !== value);
  return include ? [...without, value] : without;
};

export const recordFounderConsent = async (
  db: admin.firestore.Firestore,
  args: {
    personId: string;
    ecosystemId: string;
    choices: FounderConsentChoices;
    terms: ConsentTerms;
    via: ConsentVia;
    attestedByOrgId?: string | null;
  },
): Promise<{ directory_listed: boolean; shares_details: boolean }> => {
  const { personId, ecosystemId, choices, terms, via, attestedByOrgId } = args;
  const now = new Date().toISOString();
  const personSnap = await db.collection('people').doc(personId).get();
  const authUid = (personSnap.get('auth_uid') as string | undefined) || null;

  const batch = db.batch();

  for (const type of FOUNDER_AGREEMENTS) {
    const doc = terms.documents.find((d) => d.type === type)!;
    batch.set(db.collection('agreement_acceptances').doc(`${authUid || personId}_${ecosystemId}_${type}`), {
      auth_uid: authUid,
      person_id: personId,
      ecosystem_id: ecosystemId,
      agreement_type: type,
      version: doc.version,
      text_hash: doc.text_hash,
      terms_hash: terms.terms_hash,
      accepted_at: choices.accepted_at,
      accepted_via: via,
      attested_by_org_id: attestedByOrgId || null,
      recorded_at: now,
    });
  }

  const profileRef = db.collection('network_profiles').doc(personId);
  const profile = (await profileRef.get()).data() || {};
  batch.set(profileRef, {
    person_id: personId,
    ecosystem_ids: arrayUnion(profile.ecosystem_ids, ecosystemId, true),
    terms_accepted_ecosystems: arrayUnion(profile.terms_accepted_ecosystems, ecosystemId, true),
    directory_listed_ecosystems: arrayUnion(profile.directory_listed_ecosystems, ecosystemId, choices.directory_listing),
    detail_sharing_ecosystems: arrayUnion(profile.detail_sharing_ecosystems, ecosystemId, choices.share_details),
    consent_updated_at: now,
    consent_via: via,
  }, { merge: true });

  batch.set(db.collection('consent_events').doc(), {
    timestamp: now,
    actor_id: personId,
    action: 'acknowledged',
    resource_id: personId,
    viewer_id: ecosystemId,
    reason: `Accepted the network compact and privacy notice (${via === 'partner_form' ? 'partner signup form' : 'consent page'}); directory listing ${choices.directory_listing ? 'on' : 'off'}, detail sharing ${choices.share_details ? 'on' : 'off'}.`,
    attested_by_org_id: attestedByOrgId || null,
  });

  batch.set(db.collection('audit_logs').doc(), {
    event: 'founder_consent_recorded',
    actor: attestedByOrgId || personId,
    details: {
      person_id: personId,
      ecosystem_id: ecosystemId,
      via,
      terms_hash: terms.terms_hash,
      directory_listing: choices.directory_listing,
      share_details: choices.share_details,
    },
    created_at: now,
  });

  await batch.commit();
  return { directory_listed: choices.directory_listing, shares_details: choices.share_details };
};

/** A founder's current consent state in one network, as partners may see it. */
export const readConsentState = async (
  db: admin.firestore.Firestore,
  personId: string,
  ecosystemId: string,
): Promise<{ terms_accepted: boolean; directory_listed: boolean; shares_details: boolean }> => {
  const profile = (await db.collection('network_profiles').doc(personId).get()).data() || {};
  const has = (field: string) => Array.isArray(profile[field]) && profile[field].includes(ecosystemId);
  return {
    terms_accepted: has('terms_accepted_ecosystems'),
    directory_listed: has('directory_listed_ecosystems'),
    shares_details: has('detail_sharing_ecosystems'),
  };
};

// ---------------------------------------------------------------------------
// One-time consent links
// ---------------------------------------------------------------------------

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export const appBaseUrl = () =>
  process.env.NEXUS_APP_URL?.trim() || process.env.APP_BASE_URL?.trim() || 'https://entrepreneurship-nexus.web.app';

/**
 * Create a one-time consent link. Only the SHA-256 of the token is stored;
 * the raw token exists only in the URL handed to the founder.
 */
export const createConsentLink = async (
  db: admin.firestore.Firestore,
  args: {
    personId: string;
    ecosystemId: string;
    requestedByOrgId: string;
    email?: string;
    returnUrl?: string | null;
    createdVia: 'consent_email' | 'partner_link';
    ttlDays: number;
  },
): Promise<{ url: string; expires_at: string }> => {
  const raw = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + args.ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await db.collection('consent_tokens').doc(hashToken(raw)).set({
    token_hash: hashToken(raw),
    person_id: args.personId,
    ecosystem_id: args.ecosystemId,
    referring_eso_id: args.requestedByOrgId,
    email: args.email || null,
    return_url: args.returnUrl || null,
    created_via: args.createdVia,
    status: 'pending',
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });
  return { url: `${appBaseUrl()}/consent?token=${raw}`, expires_at: expiresAt };
};

/**
 * Where a partner may send the founder back to after the consent page:
 * https only, and on the partner's own site — either an origin it registered
 * (`consent_return_origins` on its organization) or its website's host.
 * Anything else is refused so the consent page cannot be used as an open
 * redirect.
 */
export const validateReturnUrl = (
  raw: unknown,
  org: { url?: string; consent_return_origins?: string[] },
): { ok: true; url: string | null } | { ok: false; error: string } => {
  if (raw === undefined || raw === null || raw === '') return { ok: true, url: null };
  let parsed: URL;
  try {
    parsed = new URL(String(raw));
  } catch {
    return { ok: false, error: 'return_url must be an absolute URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'return_url must use https' };

  const registered = (org.consent_return_origins || []).map((o) => o.replace(/\/$/, '').toLowerCase());
  if (registered.includes(parsed.origin.toLowerCase())) return { ok: true, url: parsed.toString() };

  let siteHost = '';
  try {
    siteHost = org.url ? new URL(org.url.startsWith('http') ? org.url : `https://${org.url}`).hostname.toLowerCase() : '';
  } catch {
    siteHost = '';
  }
  const bare = siteHost.replace(/^www\./, '');
  const host = parsed.hostname.toLowerCase();
  if (bare && (host === bare || host.endsWith(`.${bare}`))) return { ok: true, url: parsed.toString() };

  return {
    ok: false,
    error: 'return_url must be on your organization\'s website (or an origin registered as consent_return_origins with the network administrator)',
  };
};
