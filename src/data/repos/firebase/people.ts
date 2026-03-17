import type { Person, SystemRole } from '../../../domain/people/types';
import type { EcosystemMembership } from '../../../domain/people/types';
import { getDocument, queryCollection, updateDocument, whereEquals } from '../../../services/firestoreClient';

interface FirestorePersonRecord {
  id: string;
  auth_uid?: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
  role?: string;
  system_role: SystemRole;
  primary_organization_id: string;
  ecosystem_id?: string;
  tags?: string[];
  external_refs?: Person['external_refs'];
  links?: Person['links'];
  organization_affiliations?: Person['organization_affiliations'];
  secondary_profile?: Person['secondary_profile'];
}

interface FirestorePersonMembershipRecord {
  id: string;
  person_id: string;
  ecosystem_id: string;
  organization_id: string;
  system_role: SystemRole;
  status: 'active' | 'inactive' | 'invited';
  joined_at: string;
}

const toPerson = (
  record: FirestorePersonRecord,
  memberships: FirestorePersonMembershipRecord[]
): Person => {
  const activeMemberships = memberships.filter((membership) => membership.status === 'active');
  const primaryMembership = activeMemberships[0];
  const normalizedMemberships: EcosystemMembership[] = activeMemberships.map((membership) => ({
    ecosystem_id: membership.ecosystem_id,
    system_role: membership.system_role,
    joined_at: membership.joined_at,
  }));

  return {
    id: record.id,
    first_name: record.first_name,
    last_name: record.last_name,
    email: record.email,
    avatar_url: record.avatar_url,
    role: record.role || '',
    system_role: primaryMembership?.system_role || record.system_role,
    organization_id: primaryMembership?.organization_id || record.primary_organization_id,
    ecosystem_id: primaryMembership?.ecosystem_id || record.ecosystem_id || '',
    memberships: normalizedMemberships,
    organization_affiliations: record.organization_affiliations,
    secondary_profile: record.secondary_profile,
    tags: record.tags,
    external_refs: record.external_refs,
    links: record.links,
  };
};

export class FirebasePeopleRepo {
  async getById(id: string): Promise<Person | null> {
    const record = await getDocument<FirestorePersonRecord>('people', id);
    if (!record) {
      return null;
    }

    const memberships = await this.getMembershipsForPerson(record.id);
    return toPerson(record, memberships);
  }

  async getByAuthUid(authUid: string): Promise<Person | null> {
    const matches = await queryCollection<FirestorePersonRecord>('people', [whereEquals('auth_uid', authUid)]);
    const record = matches[0];
    if (!record) {
      return null;
    }

    const memberships = await this.getMembershipsForPerson(record.id);
    return toPerson(record, memberships);
  }

  async getByEmail(email: string): Promise<Person | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const matches = await queryCollection<FirestorePersonRecord>('people', [whereEquals('email', normalizedEmail)]);
    const record = matches[0];
    if (!record) {
      return null;
    }

    const memberships = await this.getMembershipsForPerson(record.id);
    return toPerson(record, memberships);
  }

  async getMembershipsForPerson(personId: string): Promise<FirestorePersonMembershipRecord[]> {
    return queryCollection<FirestorePersonMembershipRecord>('person_memberships', [whereEquals('person_id', personId)]);
  }

  async getAll(ecosystemId?: string): Promise<Person[]> {
    const constraints = ecosystemId ? [whereEquals('ecosystem_id', ecosystemId)] : [];
    const records = await queryCollection<FirestorePersonRecord>('people', constraints);
    
    const results: Person[] = [];
    for (const record of records) {
        const memberships = await this.getMembershipsForPerson(record.id);
        results.push(toPerson(record, memberships));
    }
    return results;
  }

  async add(person: Person): Promise<void> {
    const record: FirestorePersonRecord = {
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        avatar_url: person.avatar_url,
        role: person.role,
        system_role: person.system_role,
        primary_organization_id: person.organization_id,
        ecosystem_id: person.ecosystem_id,
        tags: person.tags,
        external_refs: person.external_refs,
        links: person.links,
        organization_affiliations: person.organization_affiliations,
        secondary_profile: person.secondary_profile,
    };
    await setDocument('people', person.id, record);
  }

  async update(id: string, updates: Partial<Person>): Promise<void> {
    // Strip undefined values — Firestore rejects them
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await updateDocument('people', id, clean as any);
  }
}
