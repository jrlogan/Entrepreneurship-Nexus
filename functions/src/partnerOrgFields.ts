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

export const MAX_INDUSTRY_TAGS = 20;
export const MAX_INDUSTRY_TAG_LENGTH = 40;
export const MAX_STAGE_LENGTH = 40;

/**
 * Mirrors OrganizationType in src/domain/organizations/types.ts (and
 * ENUMS.OrganizationType). A root test asserts the two lists stay equal.
 */
export const ORGANIZATION_TYPES = [
  'startup',
  'small_business',
  'business',
  'nonprofit',
  'government_agency',
  'other',
] as const;
export type PartnerOrgType = (typeof ORGANIZATION_TYPES)[number];

const cleanShortString = (raw: unknown, max: number): string => {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
};

/**
 * Industry tags from a request body: strings only, whitespace collapsed,
 * each cut to MAX_INDUSTRY_TAG_LENGTH, de-duplicated case-insensitively,
 * at most MAX_INDUSTRY_TAGS. Anything that is not an array yields [].
 */
export const sanitizeIndustryTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const tag = cleanShortString(value, MAX_INDUSTRY_TAG_LENGTH);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= MAX_INDUSTRY_TAGS) break;
  }
  return out;
};

/**
 * Union of a record's existing industry tags and incoming ones. Existing tags
 * keep their place (someone else may have curated them); new ones are added
 * until the cap.
 */
export const mergeIndustryTags = (existing: unknown, incoming: string[]): string[] => {
  const current = Array.isArray(existing) ? existing.filter((t): t is string => typeof t === 'string') : [];
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const merged = [...current];
  for (const tag of incoming) {
    if (merged.length >= MAX_INDUSTRY_TAGS) break;
    if (seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    merged.push(tag);
  }
  return merged;
};

/** Free-text stage label: trimmed, at most MAX_STAGE_LENGTH characters. */
export const sanitizeStage = (raw: unknown): string => cleanShortString(raw, MAX_STAGE_LENGTH);

/**
 * Partner vocabularies that name a Nexus type differently. MakeHaven's Drupal
 * bridge sends every member business as "member_business"; in Nexus terms
 * that is a small business (a founder can still be re-typed by hand).
 */
export const ORG_TYPE_ALIASES: Readonly<Record<string, PartnerOrgType>> = {
  member_business: 'small_business',
};

/** An org_type, if it is one of the shared vocabulary's values (or an alias of one). */
export const parseOrgType = (raw: unknown): PartnerOrgType | undefined => {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((ORGANIZATION_TYPES as readonly string[]).includes(value)) return value as PartnerOrgType;
  return Object.prototype.hasOwnProperty.call(ORG_TYPE_ALIASES, value) ? ORG_TYPE_ALIASES[value] : undefined;
};

/** The `founder_ref` of a partnerUpsertOrganization body, or null if absent/invalid. */
export const parseFounderRef = (
  raw: unknown,
  defaultSource: string,
): { source: string; id: string } | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = r.id != null ? String(r.id).trim() : '';
  const source = typeof r.source === 'string' && r.source.trim() ? r.source.trim() : defaultSource;
  if (!id || !source) return null;
  return { source, id };
};

export interface FounderAffiliation {
  organization_id: string;
  relationship_type: 'founder';
  status: 'active';
  ecosystem_ids: string[];
  joined_at: string;
}

type ExistingAffiliation = { organization_id?: string; status?: string; [k: string]: unknown };

/**
 * The founder affiliations to add for `ventureIds`: one per venture the person
 * has no affiliation with yet. An existing affiliation — whatever its type or
 * status — is left alone: an ended one was ended deliberately and is not
 * revived by a sync.
 */
export const newFounderAffiliations = (
  existing: ExistingAffiliation[] | undefined,
  ventureIds: string[],
  ecosystemId: string,
  now: string,
): FounderAffiliation[] => {
  const have = new Set((existing || []).map((a) => a.organization_id).filter(Boolean));
  const out: FounderAffiliation[] = [];
  for (const id of ventureIds) {
    if (!id || have.has(id)) continue;
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

/**
 * Whether linking `personAffiliations` + `organizationId` makes the person a
 * current founder/member of the venture, as the privacy policy reads it
 * (active affiliation, or the primary organization_id).
 */
export const isLinkedToVenture = (
  person: { organization_id?: string; organization_affiliations?: ExistingAffiliation[] },
  ventureId: string,
): boolean =>
  person.organization_id === ventureId
  || (person.organization_affiliations || []).some(
    (a) => a.organization_id === ventureId && (!a.status || a.status === 'active'),
  );
