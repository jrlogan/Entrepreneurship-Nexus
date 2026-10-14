"use strict";
/**
 * Pure helpers for the optional venture fields a partner can send with
 * partnerUpsertOrganization, and for linking a founder to a venture.
 *
 * Kept free of Firestore so the sanitizing rules and the affiliation shape are
 * unit-tested (partnerOrgFields.test.ts) and shared by the partner API and the
 * OIDC sign-in path — both must write a founder link the same way, because
 * the privacy policy lists a venture in the directory only through an active
 * affiliation (or organization_id) on a directory-listed founder
 * (privacy/policy.ts, ventureOrgIdsFor).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLinkedToVenture = exports.newFounderAffiliations = exports.parseFounderRef = exports.parseOrgType = exports.ORG_TYPE_ALIASES = exports.sanitizeStage = exports.mergeIndustryTags = exports.sanitizeIndustryTags = exports.ORGANIZATION_TYPES = exports.MAX_STAGE_LENGTH = exports.MAX_INDUSTRY_TAG_LENGTH = exports.MAX_INDUSTRY_TAGS = void 0;
exports.MAX_INDUSTRY_TAGS = 20;
exports.MAX_INDUSTRY_TAG_LENGTH = 40;
exports.MAX_STAGE_LENGTH = 40;
/**
 * Mirrors OrganizationType in src/domain/organizations/types.ts (and
 * ENUMS.OrganizationType). A root test asserts the two lists stay equal.
 */
exports.ORGANIZATION_TYPES = [
    'startup',
    'small_business',
    'business',
    'nonprofit',
    'government_agency',
    'other',
];
const cleanShortString = (raw, max) => {
    if (typeof raw !== 'string')
        return '';
    return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
};
/**
 * Industry tags from a request body: strings only, whitespace collapsed,
 * each cut to MAX_INDUSTRY_TAG_LENGTH, de-duplicated case-insensitively,
 * at most MAX_INDUSTRY_TAGS. Anything that is not an array yields [].
 */
const sanitizeIndustryTags = (raw) => {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const value of raw) {
        const tag = cleanShortString(value, exports.MAX_INDUSTRY_TAG_LENGTH);
        if (!tag || seen.has(tag.toLowerCase()))
            continue;
        seen.add(tag.toLowerCase());
        out.push(tag);
        if (out.length >= exports.MAX_INDUSTRY_TAGS)
            break;
    }
    return out;
};
exports.sanitizeIndustryTags = sanitizeIndustryTags;
/**
 * Union of a record's existing industry tags and incoming ones. Existing tags
 * keep their place (someone else may have curated them); new ones are added
 * until the cap.
 */
const mergeIndustryTags = (existing, incoming) => {
    const current = Array.isArray(existing) ? existing.filter((t) => typeof t === 'string') : [];
    const seen = new Set(current.map((t) => t.toLowerCase()));
    const merged = [...current];
    for (const tag of incoming) {
        if (merged.length >= exports.MAX_INDUSTRY_TAGS)
            break;
        if (seen.has(tag.toLowerCase()))
            continue;
        seen.add(tag.toLowerCase());
        merged.push(tag);
    }
    return merged;
};
exports.mergeIndustryTags = mergeIndustryTags;
/** Free-text stage label: trimmed, at most MAX_STAGE_LENGTH characters. */
const sanitizeStage = (raw) => cleanShortString(raw, exports.MAX_STAGE_LENGTH);
exports.sanitizeStage = sanitizeStage;
/**
 * Partner vocabularies that name a Nexus type differently. MakeHaven's Drupal
 * bridge sends every member business as "member_business"; in Nexus terms
 * that is a small business (a founder can still be re-typed by hand).
 */
exports.ORG_TYPE_ALIASES = {
    member_business: 'small_business',
};
/** An org_type, if it is one of the shared vocabulary's values (or an alias of one). */
const parseOrgType = (raw) => {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (exports.ORGANIZATION_TYPES.includes(value))
        return value;
    return Object.prototype.hasOwnProperty.call(exports.ORG_TYPE_ALIASES, value) ? exports.ORG_TYPE_ALIASES[value] : undefined;
};
exports.parseOrgType = parseOrgType;
/** The `founder_ref` of a partnerUpsertOrganization body, or null if absent/invalid. */
const parseFounderRef = (raw, defaultSource) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const r = raw;
    const id = r.id != null ? String(r.id).trim() : '';
    const source = typeof r.source === 'string' && r.source.trim() ? r.source.trim() : defaultSource;
    if (!id || !source)
        return null;
    return { source, id };
};
exports.parseFounderRef = parseFounderRef;
/**
 * The founder affiliations to add for `ventureIds`: one per venture the person
 * has no affiliation with yet. An existing affiliation — whatever its type or
 * status — is left alone: an ended one was ended deliberately and is not
 * revived by a sync.
 */
const newFounderAffiliations = (existing, ventureIds, ecosystemId, now) => {
    const have = new Set((existing || []).map((a) => a.organization_id).filter(Boolean));
    const out = [];
    for (const id of ventureIds) {
        if (!id || have.has(id))
            continue;
        have.add(id);
        out.push({
            organization_id: id,
            relationship_type: 'founder',
            status: 'active',
            ecosystem_ids: [ecosystemId],
            joined_at: now,
        });
    }
    return out;
};
exports.newFounderAffiliations = newFounderAffiliations;
/**
 * Whether linking `personAffiliations` + `organizationId` makes the person a
 * current founder/member of the venture, as the privacy policy reads it
 * (active affiliation, or the primary organization_id).
 */
const isLinkedToVenture = (person, ventureId) => person.organization_id === ventureId
    || (person.organization_affiliations || []).some((a) => a.organization_id === ventureId && (!a.status || a.status === 'active'));
exports.isLinkedToVenture = isLinkedToVenture;
