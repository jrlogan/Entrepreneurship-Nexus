"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.flagPossibleDuplicate = exports.attachExternalRef = exports.matchOrganization = exports.matchPerson = exports.storableDomain = exports.normalizeDomain = void 0;
const externalRefIndex_1 = require("./externalRefIndex");
const normalizeEmail = (raw) => (raw || '').trim().toLowerCase();
const normalizeName = (raw) => (raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/**
 * Normalized host for org domain matching: lowercased, scheme/path/port
 * stripped, leading "www." removed. Exported so writers (partner API, SSO
 * shells) store `domain` in exactly the form Tier-2 matching queries.
 */
const normalizeDomain = (raw) => {
    const s = (raw || '').trim().toLowerCase();
    if (!s)
        return '';
    // Strip scheme and path if a URL slipped in; strip leading "www."
    const host = s.replace(/^https?:\/\//, '').split(/[/?#]/)[0] || s;
    return host.replace(/:\d+$/, '').replace(/^www\./, '');
};
exports.normalizeDomain = normalizeDomain;
/**
 * Hosts many unrelated businesses share (social profiles, marketplaces,
 * link-in-bio pages). A venture whose "website" is its Etsy shop or
 * Instagram page must not get `domain: "etsy.com"`: Tier-2 domain matching
 * silently auto-links, so a shared host would merge strangers' ventures.
 */
const SHARED_PLATFORM_DOMAINS = new Set([
    'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
    'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'threads.net',
    'etsy.com', 'ebay.com', 'amazon.com', 'shopify.com', 'square.site', 'squareup.com',
    'linktr.ee', 'linktree.com', 'bio.link', 'beacons.ai', 'carrd.co',
    'google.com', 'sites.google.com', 'business.site', 'goo.gl', 'g.page',
    'github.com', 'gitlab.com', 'medium.com', 'substack.com', 'patreon.com',
    'kickstarter.com', 'indiegogo.com', 'gofundme.com', 'yelp.com', 'eventbrite.com',
    'wix.com', 'squarespace.com', 'wordpress.com', 'weebly.com', 'godaddysites.com',
    'notion.site', 'notion.so', 'canva.site', 'bit.ly',
]);
/**
 * The `domain` worth storing on an org record for Tier-2 matching, from a
 * domain or website value: normalized, a plausible hostname, and not a
 * shared platform. Returns '' when nothing safe to store.
 */
const storableDomain = (raw) => {
    const domain = (0, exports.normalizeDomain)(raw);
    if (!domain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain))
        return '';
    return SHARED_PLATFORM_DOMAINS.has(domain) ? '' : domain;
};
exports.storableDomain = storableDomain;
const domainOfEmail = (email) => {
    const at = email.lastIndexOf('@');
    return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
};
const tokenize = (s) => new Set(s.split(' ').filter(Boolean));
const jaccard = (a, b) => {
    if (a.size === 0 || b.size === 0)
        return 0;
    let intersection = 0;
    a.forEach(t => { if (b.has(t))
        intersection++; });
    const union = a.size + b.size - intersection;
    return intersection / union;
};
const WEAK_NAME_THRESHOLD = 0.6;
/**
 * Generic consumer email providers: weak-signal dedup is skipped when the
 * user's domain is one of these, because name similarity across a shared
 * public domain produces too many false positives to auto-flag usefully.
 */
const GENERIC_EMAIL_DOMAINS = new Set([
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
 *
 * `ref.owner_org_id` is passed straight through: an owned ref (an SSO
 * provider's key mapped via `ref_sources` to its partner ID scheme) reads the
 * owner's scoped entry first — where that organization's partner-API pushes
 * are indexed — then an ownerless global one; a global entry owned by a
 * different organization never matches. Ownerless refs read only the global
 * key, as before.
 */
const lookupByExternalRef = async (db, ref, entityType) => {
    const indexDoc = await (0, externalRefIndex_1.readExternalRefIndex)(db, entityType, ref);
    if (!indexDoc)
        return null;
    const entityId = indexDoc.get('entity_id');
    if (!entityId)
        return null;
    const collection = entityType === 'person' ? 'people' : 'organizations';
    const entityDoc = await db.collection(collection).doc(entityId).get();
    return entityDoc.exists ? entityDoc.id : null;
};
/**
 * Match an incoming person identity against existing Nexus people. Returns
 * the highest-tier match found. Tiers cascade: strong matches short-circuit
 * weaker checks to avoid unnecessary Firestore reads.
 */
const matchPerson = async (db, signals) => {
    // Tier 1: external_ref_index lookup for each provided ref.
    for (const ref of signals.external_refs || []) {
        if (!ref.source || !ref.id)
            continue;
        const personId = await lookupByExternalRef(db, ref, 'person');
        if (personId) {
            return { tier: 'external_ref', person_id: personId, via: `${ref.source}:${ref.id}` };
        }
    }
    const email = normalizeEmail(signals.email);
    if (!email)
        return { tier: 'none' };
    // Tier 2: exact email match.
    const emailSnap = await db.collection('people').where('email', '==', email).limit(1).get();
    if (!emailSnap.empty) {
        return { tier: 'email_exact', person_id: emailSnap.docs[0].id, via: email };
    }
    // Tier 3: weak signal — same email domain + name similarity above threshold.
    const name = normalizeName(signals.display_name);
    if (!name)
        return { tier: 'none' };
    const domain = domainOfEmail(email);
    if (!domain || GENERIC_EMAIL_DOMAINS.has(domain))
        return { tier: 'none' };
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
        const e = (d.get('email') || '').toLowerCase();
        return domainOfEmail(e) === domain;
    });
    let best = null;
    const nameTokens = tokenize(name);
    for (const candidate of domainMatches) {
        const cdName = normalizeName(`${candidate.get('first_name') || ''} ${candidate.get('last_name') || ''}`.trim()
            || candidate.get('display_name') || '');
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
exports.matchPerson = matchPerson;
/**
 * Match an incoming organization identity against existing Nexus orgs.
 */
const matchOrganization = async (db, signals) => {
    // Tier 1: external_ref_index lookup.
    for (const ref of signals.external_refs || []) {
        if (!ref.source || !ref.id)
            continue;
        const orgId = await lookupByExternalRef(db, ref, 'organization');
        if (orgId) {
            return { tier: 'external_ref', org_id: orgId, via: `${ref.source}:${ref.id}` };
        }
    }
    // Tier 2: exact domain match. We match on either `domain` (normalized) or
    // `url` (parsed). Nexus org schema today stores URL; new writes should also
    // store a normalized `domain` field (added as part of this phase).
    // storableDomain: a shared platform host (etsy.com, instagram.com, …) is
    // never a match signal, even if an older record stored it.
    const domain = (0, exports.storableDomain)(signals.domain || signals.website || '');
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
    if (!name || !domain)
        return { tier: 'none' };
    const candidates = await db.collection('organizations').limit(200).get();
    const nameTokens = tokenize(name);
    let best = null;
    for (const candidate of candidates.docs) {
        const cdUrl = (candidate.get('url') || '');
        const cdDomain = (0, exports.normalizeDomain)(candidate.get('domain') || cdUrl);
        if (cdDomain && cdDomain !== domain)
            continue;
        const cdName = normalizeName(candidate.get('name') || '');
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
exports.matchOrganization = matchOrganization;
/**
 * Add an external_ref to an existing entity's external_refs array
 * idempotently, and update the external_ref_index for O(1) future lookups.
 */
const attachExternalRef = async (db, entityType, entityId, ref) => {
    if (!ref.source || !ref.id)
        return { added: false };
    const collection = entityType === 'person' ? 'people' : 'organizations';
    const ref_doc = db.collection(collection).doc(entityId);
    const snap = await ref_doc.get();
    if (!snap.exists)
        return { added: false };
    const existing = (snap.get('external_refs') || []);
    // Same source + id + owner. An owner-scoped ref is a different claim from
    // an ownerless one with the same source string (another provider may use
    // it), so it is recorded alongside rather than treated as present.
    const already = existing.some(r => r.source === ref.source && r.id === ref.id && (r.owner_org_id || '') === (ref.owner_org_id || ''));
    if (!already) {
        await ref_doc.update({
            external_refs: [...existing, ref],
            updated_at: new Date().toISOString(),
        });
    }
    // Index write is idempotent (deterministic doc id). A ref with an owner is
    // written under that owner's scoped key, so it lands next to the entries
    // the same organization's partner-API pushes made. Mirror the guard in
    // partnerApi indexExternalRef: never re-point an entry another
    // organization owns (an ownerless ref on a global key that a partner
    // already owns is exactly that case).
    const indexRef = db.collection('external_ref_index').doc((0, externalRefIndex_1.externalRefIndexId)(entityType, ref));
    const existingIndex = await indexRef.get();
    if (existingIndex.exists) {
        const owner = existingIndex.get('owner_org_id');
        if (owner && owner !== ref.owner_org_id) {
            console.warn(`external_ref_index owner mismatch for ${indexRef.id}: owned by ${owner}, attach attempted by ${ref.owner_org_id || '(no owner)'}`);
            return { added: !already };
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
    return { added: !already };
};
exports.attachExternalRef = attachExternalRef;
/**
 * Record a possible-duplicate flag for admin review. Does not block the
 * caller's flow; the caller is expected to proceed by creating a new record.
 */
const flagPossibleDuplicate = async (db, payload) => {
    await db.collection('dedup_flags').add({
        ...payload,
        status: 'pending_review',
        created_at: new Date().toISOString(),
    });
};
exports.flagPossibleDuplicate = flagPossibleDuplicate;
