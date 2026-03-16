import type { Person, PersonOrganizationAffiliation } from './types';

const dedupeAffiliations = (affiliations: PersonOrganizationAffiliation[]) => {
  const byOrg = new Map<string, PersonOrganizationAffiliation>();
  for (const affiliation of affiliations) {
    if (!affiliation.organization_id) continue;
    if (!byOrg.has(affiliation.organization_id)) {
      byOrg.set(affiliation.organization_id, affiliation);
      continue;
    }

    const existing = byOrg.get(affiliation.organization_id)!;
    byOrg.set(affiliation.organization_id, {
      ...existing,
      ...affiliation,
      ecosystem_ids: Array.from(new Set([...(existing.ecosystem_ids || []), ...(affiliation.ecosystem_ids || [])])),
    });
  }
  return Array.from(byOrg.values());
};

export const getAllOrganizationAffiliations = (person: Person | null | undefined): PersonOrganizationAffiliation[] => {
  if (!person) return [];

  const affiliations: PersonOrganizationAffiliation[] = [];

  if (person.organization_id) {
    affiliations.push({
      organization_id: person.organization_id,
      role_title: person.role,
      relationship_type: person.system_role === 'entrepreneur' ? 'founder' : 'employee',
      status: 'active',
      can_self_manage: person.system_role === 'entrepreneur',
      ecosystem_ids: person.memberships
        .filter((membership) => membership.organization_id === person.organization_id)
        .map((membership) => membership.ecosystem_id),
    });
  }

  if (person.secondary_profile?.organization_id) {
    affiliations.push({
      organization_id: person.secondary_profile.organization_id,
      role_title: person.secondary_profile.role_title,
      relationship_type: person.secondary_profile.system_role === 'entrepreneur' ? 'founder' : 'employee',
      status: 'active',
      can_self_manage: person.secondary_profile.system_role === 'entrepreneur',
    });
  }

  affiliations.push(...(person.organization_affiliations || []));

  return dedupeAffiliations(affiliations);
};

export const getOrganizationAffiliations = (person: Person | null | undefined): PersonOrganizationAffiliation[] => {
  return getAllOrganizationAffiliations(person).filter((affiliation) => affiliation.status !== 'revoked');
};

export const getActiveOrganizationAffiliations = (
  person: Person | null | undefined,
  ecosystemId?: string | null
): PersonOrganizationAffiliation[] => {
  const affiliations = getOrganizationAffiliations(person).filter((affiliation) => affiliation.status !== 'pending');
  if (!ecosystemId) return affiliations;
  return affiliations.filter((affiliation) => {
    if (!affiliation.ecosystem_ids || affiliation.ecosystem_ids.length === 0) return true;
    return affiliation.ecosystem_ids.includes(ecosystemId);
  });
};
