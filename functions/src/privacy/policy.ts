/**
 * The network privacy policy — what one organization may see about the people
 * and ventures other organizations work with.
 *
 * This is the single implementation of the compact's visibility rules. The
 * `getNetworkView` Cloud Function applies it to real data before anything
 * leaves the server, and the in-memory demo repos apply the same function to
 * sample data so the demo behaves exactly like production. Firestore rules
 * deny the direct reads that would bypass it (see firestore.rules).
 *
 * The rules, as presented to the consortium:
 *
 *   ALWAYS SHARED — with staff at organizations the entrepreneur actually
 *   works with: name, each organization's own records with them, and the
 *   FACT of other partners' activity (who, what kind, when). EMAIL only once
 *   the organization needs it: an organization whose only relationship is a
 *   referral it has not yet accepted sees the person without contact
 *   details, and the directory never carries them (spam protection).
 *
 *   THE ENTREPRENEUR'S CHOICE — per network, revocable:
 *     - listing in the network directory (visible to partners who do NOT
 *       already work with them; name and venture only) — ON by default at
 *       consent time, so the network builds a list of people to connect;
 *     - another organization seeing the DETAILS of a first organization's
 *       records (program names, referral outcomes) — OFF by default.
 *
 *   NEVER SHARED — stays with the organization that wrote it:
 *     - notes (interaction notes, referral intro/response notes);
 *     - other organizations' internal record IDs (external_refs).
 *   Financial information is not collected by the network at all.
 *
 * Pure and dependency-free on purpose: no Firebase imports, so it can be unit
 * tested and imported by the frontend.
 */

// ---------------------------------------------------------------------------
// Input shapes — structural, so both the functions and the frontend types fit.
// ---------------------------------------------------------------------------

export type ViewerRole =
  | 'platform_admin'
  | 'ecosystem_manager'
  | 'eso_admin'
  | 'eso_staff'
  | 'eso_coach'
  | 'entrepreneur';

export interface Viewer {
  personId: string;
  orgId: string | null;
  role: ViewerRole;
  ecosystemId: string;
  /**
   * Whether the viewer's organization has signed the network's agreements
   * in this network. An organization that has not sees only its own records.
   * Defaults to signed when omitted (e.g. the demo).
   */
  orgHasSigned?: boolean;
}

export interface PolicyExternalRef {
  source: string;
  id: string;
  owner_org_id?: string;
}

export interface PolicyAffiliation {
  organization_id: string;
  relationship_type?: string;
  status?: string;
}

export interface PolicyPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  system_role?: string;
  organization_id?: string;
  organization_affiliations?: PolicyAffiliation[];
  external_refs?: PolicyExternalRef[];
  created_by_org_id?: string;
  [key: string]: unknown;
}

export interface PolicyOrganization {
  id: string;
  name?: string;
  roles?: string[];
  managed_by_ids?: string[];
  /** A founder's per-network choice to share record details with every partner they work with. */
  operational_visibility_by_ecosystem?: Record<string, string>;
  external_refs?: PolicyExternalRef[];
  [key: string]: unknown;
}

export interface PolicyInteraction {
  id: string;
  organization_id: string;
  author_org_id: string;
  ecosystem_id?: string;
  subject_person_id?: string | null;
  visibility?: string;
  note_confidential?: boolean;
  [key: string]: unknown;
}

export interface PolicyParticipation {
  id: string;
  provider_org_id: string;
  recipient_person_id?: string | null;
  recipient_org_id?: string | null;
  [key: string]: unknown;
}

export interface PolicyReferral {
  id: string;
  referring_org_id?: string | null;
  receiving_org_id?: string | null;
  subject_person_id?: string | null;
  subject_org_id?: string | null;
  status?: string;
  [key: string]: unknown;
}

export interface PolicyConsentGrant {
  resource_id: string;
  viewer_id: string;
  is_active: boolean;
  ecosystem_id?: string | null;
}

export interface NetworkData {
  people: PolicyPerson[];
  organizations: PolicyOrganization[];
  interactions: PolicyInteraction[];
  participations: PolicyParticipation[];
  referrals: PolicyReferral[];
  consentGrants: PolicyConsentGrant[];
  /** People who chose to be listed in THIS network's directory. */
  directoryListedPersonIds: string[];
  /**
   * People who chose, in THIS network, to let every partner they work with
   * see the details of each other's records. Optional for older callers.
   */
  detailSharingPersonIds?: string[];
  /**
   * People who withdrew from THIS network. Each organization keeps its own
   * records with them and keeps working with them; nothing about them crosses
   * between organizations — not even the fact of activity — and they are not
   * listed. Optional for older callers.
   */
  withdrawnPersonIds?: string[];
  /**
   * Support organizations that have signed this network's agreements at
   * their current versions — the network's members, as opposed to resources
   * merely listed in the directory. Optional for older callers.
   */
  signedOrgIds?: string[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/**
 * How much of a record the viewer sees:
 *   full   — their own organization's record, everything including notes.
 *   detail — another organization's record with consent: all fields except
 *            notes and other organizations' IDs.
 *   fact   — another organization's record without consent: who, what kind,
 *            when, status.
 */
export type AccessTier = 'full' | 'detail' | 'fact';

export interface Projected<T> {
  record: T;
  access: AccessTier;
}

export interface NetworkView {
  people: Array<PolicyPerson & { _visibility: PersonVisibility }>;
  /**
   * `_detail_access` — whether the viewer may see other organizations' record
   * details about this venture (own org, a support org, or entrepreneur consent).
   */
  organizations: Array<PolicyOrganization & { _visibility: OrgVisibility; _detail_access: boolean; _compact_signed?: boolean }>;
  interactions: Array<PolicyInteraction & { _access: AccessTier }>;
  participations: Array<PolicyParticipation & { _access: AccessTier }>;
  referrals: Array<PolicyReferral & { _access: AccessTier }>;
}

/** Why a person is visible to the viewer. */
export type PersonVisibility = 'self' | 'colleague' | 'works_with' | 'directory' | 'operator';
export type OrgVisibility = 'own' | 'support_org' | 'works_with' | 'directory' | 'operator';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const STAFF_ROLES: ViewerRole[] = ['eso_admin', 'eso_staff', 'eso_coach'];
const OPERATOR_ROLES: ViewerRole[] = ['platform_admin', 'ecosystem_manager'];

export const isStaffRole = (role: ViewerRole) => STAFF_ROLES.includes(role);
export const isOperatorRole = (role: ViewerRole) => OPERATOR_ROLES.includes(role);

/** Organizations offering support are public within the network by nature. */
const SUPPORT_ROLES = ['eso', 'funder', 'resource'];
export const isSupportOrganization = (org: Pick<PolicyOrganization, 'roles'>) =>
  (org.roles || []).some((role) => SUPPORT_ROLES.includes(role));

/** Staff affiliations — a person on an organization's team, not a client. */
const STAFF_RELATIONSHIPS = ['employee', 'staff', 'admin', 'coach', 'mentor', 'board', 'volunteer'];

// ---------------------------------------------------------------------------
// Subjects and relationships
// ---------------------------------------------------------------------------

const personKey = (id: string) => `p:${id}`;
const orgKey = (id: string) => `o:${id}`;

const activeAffiliations = (person: PolicyPerson): PolicyAffiliation[] =>
  (person.organization_affiliations || []).filter(
    (a) => !!a.organization_id && (!a.status || a.status === 'active')
  );

/** The ventures a person founds, owns or works for (excluding support orgs). */
const ventureOrgIdsFor = (person: PolicyPerson, orgsById: Map<string, PolicyOrganization>): string[] => {
  const ids = new Set<string>();
  if (person.organization_id) ids.add(person.organization_id);
  activeAffiliations(person).forEach((a) => ids.add(a.organization_id));
  return Array.from(ids).filter((id) => {
    const org = orgsById.get(id);
    return !org || !isSupportOrganization(org);
  });
};

/**
 * The subjects (people and ventures) an organization works with.
 *
 * A relationship exists when the organization has itself recorded something
 * about the subject: a participation it provides, a referral it sent or
 * received (a declined referral does not count for the receiver), an
 * interaction it logged, a record it pushed through the API, or a venture it
 * manages. Working with a venture means working with its founders, and the
 * other way round.
 *
 * With `acceptedOnly`, a referral the organization received but has not yet
 * answered does not count: that is the set of subjects it may CONTACT, and
 * the person's email is withheld until then.
 */
export const computeWorksWith = (orgId: string, data: NetworkData, options: { acceptedOnly?: boolean } = {}): Set<string> => {
  const keys = new Set<string>();
  const orgsById = new Map(data.organizations.map((o) => [o.id, o]));

  for (const p of data.participations) {
    if (p.provider_org_id !== orgId) continue;
    if (p.recipient_person_id) keys.add(personKey(p.recipient_person_id));
    if (p.recipient_org_id) keys.add(orgKey(p.recipient_org_id));
  }

  for (const r of data.referrals) {
    const isReferrer = r.referring_org_id === orgId;
    const isActiveReceiver = r.receiving_org_id === orgId && r.status !== 'rejected'
      && !(options.acceptedOnly && r.status === 'pending');
    if (!isReferrer && !isActiveReceiver) continue;
    if (r.subject_person_id) keys.add(personKey(r.subject_person_id));
    if (r.subject_org_id) keys.add(orgKey(r.subject_org_id));
  }

  for (const i of data.interactions) {
    if (i.author_org_id !== orgId) continue;
    keys.add(orgKey(i.organization_id));
    if (i.subject_person_id) keys.add(personKey(i.subject_person_id));
  }

  for (const org of data.organizations) {
    if ((org.managed_by_ids || []).includes(orgId) && !isSupportOrganization(org)) keys.add(orgKey(org.id));
  }

  for (const person of data.people) {
    const pushedByUs = person.created_by_org_id === orgId
      || (person.external_refs || []).some((ref) => ref.owner_org_id === orgId);
    const isOurClient = activeAffiliations(person).some(
      (a) => a.organization_id === orgId && !STAFF_RELATIONSHIPS.includes(a.relationship_type || '')
    );
    if (pushedByUs || isOurClient) keys.add(personKey(person.id));
  }

  // Founders <-> their ventures.
  for (const person of data.people) {
    const ventures = ventureOrgIdsFor(person, orgsById).filter((id) => id !== orgId);
    const knowsPerson = keys.has(personKey(person.id));
    const knowsVenture = ventures.some((id) => keys.has(orgKey(id)));
    if (knowsVenture) keys.add(personKey(person.id));
    if (knowsPerson) ventures.forEach((id) => keys.add(orgKey(id)));
  }

  return keys;
};

/** The subject keys that identify "this entrepreneur" — themselves and their ventures. */
const subjectKeysForEntrepreneur = (personId: string, data: NetworkData): Set<string> => {
  const orgsById = new Map(data.organizations.map((o) => [o.id, o]));
  const person = data.people.find((p) => p.id === personId);
  const keys = new Set<string>([personKey(personId)]);
  if (person) ventureOrgIdsFor(person, orgsById).forEach((id) => keys.add(orgKey(id)));
  return keys;
};

const interactionSubjects = (i: PolicyInteraction) =>
  [orgKey(i.organization_id), ...(i.subject_person_id ? [personKey(i.subject_person_id)] : [])];
const participationSubjects = (p: PolicyParticipation) =>
  [...(p.recipient_person_id ? [personKey(p.recipient_person_id)] : []), ...(p.recipient_org_id ? [orgKey(p.recipient_org_id)] : [])];
const referralSubjects = (r: PolicyReferral) =>
  [...(r.subject_person_id ? [personKey(r.subject_person_id)] : []), ...(r.subject_org_id ? [orgKey(r.subject_org_id)] : [])];

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * Whether the entrepreneur behind a subject let `viewerOrgId` see other
 * organizations' record details in this network — either a grant to that
 * partner, or "open" for this network (shared with every partner they work
 * with). A grant on the person covers their ventures and vice versa. Grants
 * with no network recorded predate network scoping and apply everywhere.
 *
 * The legacy org-wide `operational_visibility` is deliberately ignored: it
 * defaulted to 'open', so it does not record a choice anyone made.
 */
const hasDetailConsent = (
  subjectKeys: string[],
  viewerOrgId: string,
  ecosystemId: string,
  data: NetworkData,
  expand: (key: string) => string[]
): boolean => {
  const covered = new Set(subjectKeys.flatMap(expand));
  const openInThisNetwork = data.organizations.some((org) =>
    covered.has(orgKey(org.id)) && org.operational_visibility_by_ecosystem?.[ecosystemId] === 'open'
  ) || (data.detailSharingPersonIds || []).some((id) => covered.has(personKey(id)));
  if (openInThisNetwork) return true;
  return data.consentGrants.some((g) =>
    g.is_active
    && g.viewer_id === viewerOrgId
    && (!g.ecosystem_id || g.ecosystem_id === ecosystemId)
    && (covered.has(personKey(g.resource_id)) || covered.has(orgKey(g.resource_id)))
  );
};

// ---------------------------------------------------------------------------
// Field projection
// ---------------------------------------------------------------------------

const ownRefsOnly = (refs: PolicyExternalRef[] | undefined, orgId: string | null) =>
  (refs || []).filter((ref) => !!orgId && ref.owner_org_id === orgId);

const pick = <T extends object>(source: T, keys: string[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) out[key] = (source as Record<string, unknown>)[key];
  }
  return out as Partial<T>;
};

const NOTE_FIELDS = ['notes', 'response_notes', 'attendees', 'recorded_by', 'private_notes'];
const without = <T extends object>(source: T, keys: string[]): T => {
  const out = { ...source } as Record<string, unknown>;
  keys.forEach((key) => { delete out[key]; });
  return out as T;
};

const INTERACTION_FACT_FIELDS = ['id', 'ecosystem_id', 'organization_id', 'subject_person_id', 'author_org_id', 'date', 'type', 'visibility'];
const PARTICIPATION_FACT_FIELDS = ['id', 'ecosystem_id', 'provider_org_id', 'recipient_person_id', 'recipient_org_id', 'participation_type', 'status', 'start_date', 'end_date'];
const REFERRAL_FACT_FIELDS = ['id', 'ecosystem_id', 'referring_org_id', 'receiving_org_id', 'subject_person_id', 'subject_org_id', 'status', 'date', 'accepted_at', 'declined_at', 'closed_at', 'source', 'intake_type'];

/** Blank strings rather than missing fields keep existing UI code (`.notes.length`) safe. */
const factInteraction = (i: PolicyInteraction) =>
  ({ ...pick(i, INTERACTION_FACT_FIELDS), note_confidential: false, notes: '' }) as PolicyInteraction;
const detailInteraction = (i: PolicyInteraction) =>
  ({ ...without(i, NOTE_FIELDS), notes: '' }) as PolicyInteraction;

const factParticipation = (p: PolicyParticipation) =>
  ({ ...pick(p, PARTICIPATION_FACT_FIELDS), name: '' }) as PolicyParticipation;
const detailParticipation = (p: PolicyParticipation) =>
  without(p, [...NOTE_FIELDS, 'external_refs']);

const factReferral = (r: PolicyReferral) =>
  ({ ...pick(r, REFERRAL_FACT_FIELDS), notes: '' }) as PolicyReferral;
const detailReferral = (r: PolicyReferral) =>
  ({ ...without(r, [...NOTE_FIELDS, 'owner_id', 'follow_up_date', 'referring_person_id']), notes: '' }) as PolicyReferral;
/** Parties to a referral share its notes: the intro is written for the receiver. */
const partyReferral = (r: PolicyReferral) => r;

const PERSON_CORE_FIELDS = ['id', 'first_name', 'last_name', 'email', 'avatar_url', 'system_role', 'organization_id', 'organization_affiliations', 'tags', 'status', 'ecosystem_id', 'memberships', 'links'];
/** The directory carries no contact details: an organization reaches a listed person through a referral. */
const PERSON_DIRECTORY_FIELDS = ['id', 'first_name', 'last_name', 'avatar_url', 'organization_id', 'system_role'];

const ORG_DIRECTORY_FIELDS = ['id', 'name', 'description', 'url', 'logo_url', 'roles', 'org_type', 'classification', 'tags', 'ecosystem_ids', 'support_offerings', 'status', 'tax_status'];

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * Everything `viewer` may see in `viewer.ecosystemId`, already redacted.
 * Records the viewer may not see are omitted entirely.
 */
export const buildNetworkView = (viewer: Viewer, data: NetworkData): NetworkView => {
  const eco = viewer.ecosystemId;
  const orgsById = new Map(data.organizations.map((o) => [o.id, o]));
  const peopleById = new Map(data.people.map((p) => [p.id, p]));

  // Expand a subject key to cover founder <-> venture, so consent granted on
  // either counts for both.
  const expand = (key: string): string[] => {
    const out = [key];
    if (key.startsWith('p:')) {
      const person = peopleById.get(key.slice(2));
      if (person) ventureOrgIdsFor(person, orgsById).forEach((id) => out.push(orgKey(id)));
    } else {
      const orgId = key.slice(2);
      data.people.forEach((person) => {
        if (ventureOrgIdsFor(person, orgsById).includes(orgId)) out.push(personKey(person.id));
      });
    }
    return out;
  };

  // A withdrawn person, and their ventures, are invisible across organizations.
  const withdrawn = new Set((data.withdrawnPersonIds || []).map(personKey));
  const isWithdrawnSubject = (subjects: string[]) =>
    subjects.flatMap(expand).some((key) => withdrawn.has(key));

  const isOperator = isOperatorRole(viewer.role);
  const isStaff = isStaffRole(viewer.role) && !!viewer.orgId;
  const isEntrepreneur = viewer.role === 'entrepreneur';
  // An organization that has not signed the network's agreements keeps full
  // access to its own records but sees nothing of its partners'.
  const hasSigned = viewer.orgHasSigned !== false;
  const worksWith = isStaff && hasSigned ? computeWorksWith(viewer.orgId as string, data) : new Set<string>();
  // Email is shared only once the organization needs it: a referral it has
  // not yet accepted shows the person, not how to reach them.
  const mayContact = isStaff && hasSigned ? computeWorksWith(viewer.orgId as string, data, { acceptedOnly: true }) : new Set<string>();
  const ownSubjects = isEntrepreneur ? subjectKeysForEntrepreneur(viewer.personId, data) : new Set<string>();

  const touches = (subjects: string[], set: Set<string>) => subjects.some((key) => set.has(key));

  /** Tier for a record another organization wrote about `subjects`. */
  const tierForOthersRecord = (subjects: string[]): AccessTier | null => {
    if (isEntrepreneur) return touches(subjects, ownSubjects) ? 'detail' : null;
    if (isWithdrawnSubject(subjects)) return null;
    if (isStaff && touches(subjects, worksWith)) {
      return hasDetailConsent(subjects, viewer.orgId as string, eco, data, expand) ? 'detail' : 'fact';
    }
    // Network operators see that activity exists (to run the network and its
    // statistics), never the details or notes.
    if (isOperator) return 'fact';
    return null;
  };

  // --- Interactions -------------------------------------------------------
  const interactions: NetworkView['interactions'] = [];
  for (const i of data.interactions) {
    if (isStaff && i.author_org_id === viewer.orgId) {
      interactions.push({ ...i, _access: 'full' });
      continue;
    }
    // "It happened" is shared only when the author chose to share it.
    const shared = (i.visibility || 'network_shared') === 'network_shared' && !i.note_confidential;
    if (!shared) continue;
    const tier = tierForOthersRecord(interactionSubjects(i));
    if (!tier) continue;
    interactions.push({ ...(tier === 'detail' ? detailInteraction(i) : factInteraction(i)), _access: tier });
  }

  // --- Participations -----------------------------------------------------
  const participations: NetworkView['participations'] = [];
  for (const p of data.participations) {
    if (isStaff && p.provider_org_id === viewer.orgId) {
      participations.push({ ...p, _access: 'full' });
      continue;
    }
    const tier = tierForOthersRecord(participationSubjects(p));
    if (!tier) continue;
    participations.push({ ...(tier === 'detail' ? detailParticipation(p) : factParticipation(p)), _access: tier });
  }

  // --- Referrals ----------------------------------------------------------
  const referrals: NetworkView['referrals'] = [];
  for (const r of data.referrals) {
    const isParty = (isStaff && (r.referring_org_id === viewer.orgId || r.receiving_org_id === viewer.orgId))
      // An entrepreneur's own self-introduction: they wrote the note.
      || (isEntrepreneur && !!r.referring_org_id && ownSubjects.has(orgKey(r.referring_org_id)));
    if (isParty) {
      referrals.push({ ...partyReferral(r), _access: 'full' });
      continue;
    }
    const tier = tierForOthersRecord(referralSubjects(r));
    if (!tier) continue;
    referrals.push({ ...(tier === 'detail' ? detailReferral(r) : factReferral(r)), _access: tier });
  }

  // --- People -------------------------------------------------------------
  const listed = new Set(data.directoryListedPersonIds.filter((id) => !withdrawn.has(personKey(id))));
  const people: NetworkView['people'] = [];
  for (const person of data.people) {
    let visibility: PersonVisibility | null = null;
    if (person.id === viewer.personId) visibility = 'self';
    else if (isStaff && activeAffiliations(person).some((a) => a.organization_id === viewer.orgId && STAFF_RELATIONSHIPS.includes(a.relationship_type || ''))) visibility = 'colleague';
    else if (isStaff && person.organization_id === viewer.orgId && person.system_role !== 'entrepreneur') visibility = 'colleague';
    else if (isStaff && worksWith.has(personKey(person.id))) visibility = 'works_with';
    else if (isOperator) visibility = 'operator';
    else if (listed.has(person.id) && ((isStaff && hasSigned) || isEntrepreneur)) visibility = 'directory';
    if (!visibility) continue;

    const base = visibility === 'directory'
      ? pick(person, PERSON_DIRECTORY_FIELDS)
      : pick(person, PERSON_CORE_FIELDS);
    if (visibility === 'works_with' && !mayContact.has(personKey(person.id))) delete (base as Record<string, unknown>).email;
    people.push({
      ...(base as PolicyPerson),
      external_refs: visibility === 'self' ? person.external_refs || [] : ownRefsOnly(person.external_refs, viewer.orgId),
      _visibility: visibility,
    });
  }

  // --- Organizations ------------------------------------------------------
  const listedVentures = new Set<string>();
  data.people.forEach((person) => {
    if (listed.has(person.id)) ventureOrgIdsFor(person, orgsById).forEach((id) => listedVentures.add(id));
  });
  const signedOrgs = data.signedOrgIds ? new Set(data.signedOrgIds) : null;
  const organizations: NetworkView['organizations'] = [];
  for (const org of data.organizations) {
    let visibility: OrgVisibility | null = null;
    if (org.id === viewer.orgId || (isEntrepreneur && ownSubjects.has(orgKey(org.id)))) visibility = 'own';
    else if (isSupportOrganization(org)) visibility = 'support_org';
    else if (isStaff && worksWith.has(orgKey(org.id))) visibility = 'works_with';
    else if (isOperator) visibility = 'operator';
    else if (listedVentures.has(org.id) && (!isStaff || hasSigned)) visibility = 'directory';
    if (!visibility) continue;

    const base = visibility === 'directory' ? (pick(org, ORG_DIRECTORY_FIELDS) as PolicyOrganization) : without(org, ['api_keys', 'webhooks']);
    const detailAccess = visibility === 'own' || visibility === 'support_org'
      || (visibility === 'works_with' && hasDetailConsent([orgKey(org.id)], viewer.orgId as string, eco, data, expand));
    organizations.push({
      ...base,
      external_refs: ownRefsOnly(org.external_refs, viewer.orgId),
      _visibility: visibility,
      _detail_access: detailAccess,
      // Whether this support organization is a signed member of the network.
      // Founders see this: a member can coordinate about them under the
      // compact; a mere resource sees nothing about them.
      ...(signedOrgs && isSupportOrganization(org) ? { _compact_signed: signedOrgs.has(org.id) } : {}),
    });
  }

  return { people, organizations, interactions, participations, referrals };
};

/** Exposed for tests and for callers that only need the relationship check. */
export const worksWithSubject = (orgId: string, subject: { personId?: string; orgId?: string }, data: NetworkData): boolean => {
  const keys = computeWorksWith(orgId, data);
  return (!!subject.personId && keys.has(personKey(subject.personId)))
    || (!!subject.orgId && keys.has(orgKey(subject.orgId)));
};
