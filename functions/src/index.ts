import { createHash, randomBytes } from 'crypto';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import {
  extractEmails,
  extractNameFromSubject,
  parseFooter,
  extractReferralNote,
  extractClientEmail,
  type IntroContactPermission,
} from './emailParsing';

admin.initializeApp();

const db = admin.firestore();


interface InboundEmailPayload {
  provider?: string;
  provider_message_id?: string;
  message_id_header?: string;
  route_address?: string;
  from_email?: string;
  to_emails?: string[];
  cc_emails?: string[];
  subject?: string;
  text_body?: string;
  html_body?: string;
  raw_payload?: Record<string, unknown>;
}

interface PostmarkInboundPayload {
  MessageID?: string;
  MessageStream?: string;
  MailboxHash?: string;
  Date?: string;
  From?: string;
  FromName?: string;
  FromFull?: {
    Email?: string;
    Name?: string;
    MailboxHash?: string;
  };
  To?: string;
  ToFull?: Array<{ Email?: string; Name?: string; MailboxHash?: string }>;
  Cc?: string;
  CcFull?: Array<{ Email?: string; Name?: string; MailboxHash?: string }>;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: Array<{ Name?: string; Value?: string }>;
  OriginalRecipient?: string;
  RawEmail?: string;
}

interface PostmarkSendResponse {
  MessageID?: string;
  Message?: string;
}

type MembershipStatus = 'invited' | 'pending_acceptance' | 'active' | 'suspended' | 'revoked';

interface PersonMembershipRecord {
  id: string;
  person_id: string;
  ecosystem_id: string;
  organization_id: string;
  system_role: string;
  status: MembershipStatus;
  joined_at: string;
}

interface AuthorizedSenderDomainRecord {
  id: string;
  ecosystem_id: string;
  organization_id: string;
  domain: string;
  is_active?: boolean;
  access_policy?: 'approved' | 'invite_only' | 'request_access' | 'blocked';
  allow_sender_affiliation?: boolean;
  allow_auto_acknowledgement?: boolean;
  allow_invite_prompt?: boolean;
}

interface InviteRecord {
  id: string;
  email: string;
  invited_role: string;
  organization_id: string;
  ecosystem_id: string;
  invited_by_person_id: string;
  invited_by_role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  note?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  last_sent_at?: string;
  accepted_at?: string;
  accepted_by_auth_uid?: string;
  revoked_at?: string;
  revoked_by_person_id?: string;
  token_hash: string;
  token_last4: string;
}

interface ParticipationRecord {
  id: string;
  ecosystem_id: string;
  name: string;
  provider_org_id: string;
  participation_type?: 'program' | 'application' | 'membership' | 'residency' | 'rental' | 'event' | 'service';
  recipient_org_id?: string;
  recipient_person_id?: string;
  start_date: string;
  end_date?: string;
  status: 'active' | 'past' | 'applied' | 'waitlisted';
  description?: string;
  source?: 'manual_ui' | 'api' | 'external_sync' | null;
  created_at?: string;
  updated_at?: string;
  updated_by_uid?: string;
  updated_via_api_key_id?: string;
}

const setCors = (res: any) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Nexus-API-Key, X-Bootstrap-Secret');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};

const getRequiredEnv = (key: string) => {
  const value = process.env[key]?.trim();
  return value || null;
};

const getProjectId = () => {
  const directProjectId = getRequiredEnv('GCLOUD_PROJECT') || getRequiredEnv('GOOGLE_CLOUD_PROJECT');
  if (directProjectId) {
    return directProjectId;
  }

  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (!firebaseConfig) {
    return '';
  }

  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: string; project_id?: string };
    return parsed.projectId || parsed.project_id || '';
  } catch {
    return '';
  }
};

const isLocalOnlyEnvironment = () => {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return true;
  }

  const explicit = getRequiredEnv('ALLOW_LOCAL_ONLY_FUNCTIONS');
  if (explicit) {
    return explicit === 'true';
  }

  const projectId = getProjectId();
  return projectId.includes('local');
};

const requireLocalOnlyEnvironment = (res: any) => {
  if (isLocalOnlyEnvironment()) {
    return true;
  }

  res.status(403).json({ error: 'This endpoint is only available in local or explicitly enabled environments' });
  return false;
};

const getAppBaseUrl = () => getRequiredEnv('APP_BASE_URL') || 'http://localhost:3000';

const parseCsvEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const getEmailDomain = (email?: string | null) => {
  const normalized = normalize(email);
  if (!normalized || !normalized.includes('@')) {
    return '';
  }

  return normalized.split('@')[1] || '';
};

const hasPlatformAdmin = async () => {
  const snapshot = await db.collection('people')
    .where('system_role', '==', 'platform_admin')
    .limit(1)
    .get();

  return !snapshot.empty;
};

const getBootstrapSecret = (req: any) => {
  const fromHeader = req.get('x-bootstrap-secret') || req.get('X-Bootstrap-Secret');
  const fromBody = req.body?.secret;
  return (fromHeader || fromBody || '').toString().trim();
};

const getBearerToken = (req: any) => {
  const header = req.get('authorization') || req.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
};

const validateApiKey = async (apiKey: string) => {
  if (!apiKey) return null;
  
  // In a real system, we might use a hash or a separate collection for performance.
  // For the MVP, we scan organizations for the matching key prefix.
  // Note: This is simplified. Proper implementation should use a hashed lookup.
  const snapshot = await db.collection('organizations').get();
  for (const doc of snapshot.docs) {
    const apiKeys = (doc.get('api_keys') || []) as any[];
    const match = apiKeys.find(k => k.status === 'active' && (k.prefix === apiKey || apiKey.startsWith(k.prefix.replace('...', ''))));
    if (match) {
      return {
        organization_id: doc.id,
        key_id: match.id,
        label: match.label
      };
    }
  }
  return null;
};

const requireAuthOrApiKey = async (req: any, res: any): Promise<AuthContext | null> => {
  const token = getBearerToken(req);
  const apiKey = req.get('X-Nexus-API-Key');

  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return { type: 'user', uid: decoded.uid };
    } catch {
      // Fall through to API key check
    }
  }

  if (apiKey) {
    const apiContext = await validateApiKey(apiKey);
    if (apiContext) {
      return { type: 'api_key', ...apiContext };
    }
  }

  res.status(401).json({ error: 'Authentication or valid API key required' });
  return null;
};

type AuthContext =
  | { type: 'user'; uid: string }
  | { type: 'api_key'; organization_id: string; key_id: string; label: string };

const requirePlatformAdmin = async (req: any, res: any) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const person = await db.collection('people').doc(decoded.uid).get();
    if (!person.exists || person.get('system_role') !== 'platform_admin') {
      res.status(403).json({ error: 'Platform admin access required' });
      return null;
    }

    return {
      uid: decoded.uid,
      person,
    };
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
    return null;
  }
};

const getActiveMembershipsForPerson = async (personId: string) => {
  const snapshot = await db.collection('person_memberships')
    .where('person_id', '==', personId)
    .where('status', '==', 'active')
    .get();

  return snapshot.docs.map((doc) => doc.data() as PersonMembershipRecord);
};

const hasInviteAuthority = (
  memberships: PersonMembershipRecord[],
  requestedRole: string,
  organizationId: string,
  ecosystemId: string
) => {
  if (memberships.some((membership) => membership.system_role === 'platform_admin')) {
    return true;
  }

  if (memberships.some((membership) =>
    membership.system_role === 'ecosystem_manager' &&
    membership.ecosystem_id === ecosystemId &&
    !['platform_admin'].includes(requestedRole)
  )) {
    return true;
  }

  return memberships.some((membership) =>
    membership.system_role === 'eso_admin' &&
    membership.organization_id === organizationId &&
    membership.ecosystem_id === ecosystemId &&
    ['eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur'].includes(requestedRole)
  );
};

const requireInviteManager = async (req: any, res: any, requestedRole: string, organizationId: string, ecosystemId: string) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const person = await db.collection('people').doc(decoded.uid).get();
    if (!person.exists) {
      res.status(403).json({ error: 'No Nexus person record found' });
      return null;
    }

    const memberships = await getActiveMembershipsForPerson(decoded.uid);
    if (!hasInviteAuthority(memberships, requestedRole, organizationId, ecosystemId)) {
      res.status(403).json({ error: 'You do not have permission to manage this invite scope' });
      return null;
    }

    return {
      uid: decoded.uid,
      person,
      memberships,
    };
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
    return null;
  }
};

const canManageParticipationForOrg = (
  memberships: PersonMembershipRecord[],
  ecosystemId: string,
  providerOrgId: string
) => {
  if (memberships.some((membership) => membership.system_role === 'platform_admin')) {
    return true;
  }

  if (memberships.some((membership) =>
    membership.system_role === 'ecosystem_manager' &&
    membership.ecosystem_id === ecosystemId
  )) {
    return true;
  }

  return memberships.some((membership) =>
    membership.ecosystem_id === ecosystemId &&
    membership.organization_id === providerOrgId &&
    ['eso_admin', 'eso_staff', 'eso_coach'].includes(membership.system_role)
  );
};

const requireParticipationManager = async (req: any, res: any, ecosystemId: string, providerOrgId: string): Promise<AuthContext | null> => {
  const authContext = await requireAuthOrApiKey(req, res);
  if (!authContext) {
    return null;
  }

  if (authContext.type === 'api_key') {
    if (authContext.organization_id !== providerOrgId) {
      res.status(403).json({ error: 'API key does not match provider organization' });
      return null;
    }

    return authContext;
  }

  const person = await db.collection('people').doc(authContext.uid).get();
  if (!person.exists) {
    res.status(403).json({ error: 'No Nexus person record found' });
    return null;
  }

  const memberships = await getActiveMembershipsForPerson(authContext.uid);
  if (!canManageParticipationForOrg(memberships, ecosystemId, providerOrgId)) {
    res.status(403).json({ error: 'Participation management access required for this provider organization' });
    return null;
  }

  return authContext;
};

const requireUserAuth = async (req: any, res: any) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const person = await db.collection('people').doc(decoded.uid).get();
    if (!person.exists) {
      res.status(403).json({ error: 'No Nexus person record found' });
      return null;
    }
    const memberships = await getActiveMembershipsForPerson(decoded.uid);
    return { uid: decoded.uid, person, memberships };
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
    return null;
  }
};

const sanitizeParticipation = (doc: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot) => {
  const data = doc.data() as ParticipationRecord;
  return {
    id: data.id,
    ecosystem_id: data.ecosystem_id,
    name: data.name,
    provider_org_id: data.provider_org_id,
    participation_type: data.participation_type || 'service',
    recipient_org_id: data.recipient_org_id || null,
    recipient_person_id: data.recipient_person_id || null,
    start_date: data.start_date,
    end_date: data.end_date || null,
    status: data.status || 'active',
    description: data.description || '',
    source: data.source || null,
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
  };
};

const handlePreflight = (req: any, res: any) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

const normalize = (value?: string | null) => (value || '').trim().toLowerCase();

const parseAddressList = (value?: string | null) => {
  if (!value) {
    return [];
  }

  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};

const splitName = (fullName?: string) => {
  const trimmed = (fullName || '').trim();
  if (!trimmed) {
    return { first_name: 'Unknown', last_name: 'Contact' };
  }

  const [first_name, ...rest] = trimmed.split(/\s+/);
  return {
    first_name,
    last_name: rest.join(' ') || 'Contact',
  };
};


const resolveReceivingOrganization = async (receivingOrgName?: string, toEmails: string[] = []) => {
  if (receivingOrgName) {
    const byName = await db.collection('organizations').where('name', '==', receivingOrgName).limit(1).get();
    if (!byName.empty) {
      return byName.docs[0];
    }
  }

  const domains = toEmails
    .map((email) => email.split('@')[1]?.toLowerCase())
    .filter((value): value is string => Boolean(value));

  for (const domain of domains) {
    const byDomain = await db.collection('organization_aliases').where('domain', '==', domain).limit(1).get();
    if (!byDomain.empty) {
      const orgId = byDomain.docs[0].get('organization_id');
      if (orgId) {
        const organization = await db.collection('organizations').doc(orgId).get();
        if (organization.exists) {
          return organization;
        }
      }
    }
  }

  return null;
};

const upsertDraftOrganization = async (ventureName?: string, ecosystemId?: string) => {
  if (!ventureName) {
    return null;
  }

  const exact = await db.collection('organizations').where('name', '==', ventureName).limit(1).get();
  if (!exact.empty) {
    return {
      doc: exact.docs[0],
      created: false,
    };
  }

  const docRef = db.collection('organizations').doc();
  const now = new Date().toISOString();
  await docRef.set({
    id: docRef.id,
    name: ventureName,
    description: 'Draft organization created from inbound introduction.',
    tax_status: 'other',
    roles: ['startup'],
    managed_by_ids: [],
    operational_visibility: 'restricted',
    authorized_eso_ids: [],
    ecosystem_ids: ecosystemId ? [ecosystemId] : [],
    version: 1,
    status: 'draft',
    created_at: now,
    updated_at: now,
  });
  return {
    doc: await docRef.get(),
    created: true,
  };
};

const upsertDraftPerson = async (
  candidateEmail: string,
  candidateName?: string,
  organizationId?: string,
  ecosystemId?: string,
  options?: { autoLinkOrganization?: boolean }
) => {
  const normalizedEmail = candidateEmail.toLowerCase();
  // Check primary email first, then secondary_emails array
  const [primaryMatch, secondaryMatch] = await Promise.all([
    db.collection('people').where('email', '==', normalizedEmail).limit(1).get(),
    db.collection('people').where('secondary_emails', 'array-contains', normalizedEmail).limit(1).get(),
  ]);
  const existing = !primaryMatch.empty ? primaryMatch : (!secondaryMatch.empty ? secondaryMatch : null);
  if (existing && !existing.empty) {
    return existing.docs[0];
  }

  const docRef = db.collection('people').doc();
  const names = splitName(candidateName);
  const now = new Date().toISOString();
  await docRef.set({
    id: docRef.id,
    auth_uid: null,
    first_name: names.first_name,
    last_name: names.last_name,
    email: normalizedEmail,
    role: '',
    system_role: 'entrepreneur',
    primary_organization_id: options?.autoLinkOrganization ? (organizationId || '') : '',
    ecosystem_id: ecosystemId || '',
    status: 'draft',
    created_at: now,
    updated_at: now,
  });

  await db.collection('network_profiles').doc(docRef.id).set({
    person_id: docRef.id,
    display_name: `${names.first_name} ${names.last_name}`.trim(),
    venture_name: null,
    ecosystem_ids: ecosystemId ? [ecosystemId] : [],
    directory_status: 'pending_notice',
    network_directory_consent: false,
    network_activity_visibility: false,
    consent_recorded_at: null,
    consent_updated_at: now,
  });

  return docRef.get();
};

const enqueueNotice = async (personId: string, email: string, payload: Record<string, unknown>) => {
  const docRef = db.collection('notice_queue').doc();
  await docRef.set({
    id: docRef.id,
    type: 'referral_follow_up',
    person_id: personId,
    to_email: email,
    status: 'queued',
    payload,
    created_at: new Date().toISOString(),
  });
};

const enqueueTypedNotice = async (
  type: string,
  toEmail: string,
  payload: Record<string, unknown>,
  options?: { personId?: string | null; dedupeKey?: string | null }
) => {
  const normalizedEmail = normalize(toEmail);
  if (!normalizedEmail) {
    return null;
  }

  const dedupeKey = options?.dedupeKey || null;
  if (dedupeKey) {
    const existing = await db.collection('notice_queue')
      .where('type', '==', type)
      .where('to_email', '==', normalizedEmail)
      .where('dedupe_key', '==', dedupeKey)
      .limit(1)
      .get();

    if (!existing.empty) {
      return existing.docs[0];
    }
  }

  const docRef = db.collection('notice_queue').doc();
  await docRef.set({
    id: docRef.id,
    type,
    person_id: options?.personId || null,
    to_email: normalizedEmail,
    status: 'queued',
    payload,
    dedupe_key: dedupeKey,
    created_at: new Date().toISOString(),
  });

  return docRef.get();
};

const getEcosystemName = async (ecosystemId?: string | null): Promise<string | null> => {
  if (!ecosystemId) return null;
  const doc = await db.collection('ecosystems').doc(ecosystemId).get();
  return doc.exists ? (doc.get('name') || null) : null;
};

const getReferralManageUrl = (ecosystemId?: string | null) => {
  const baseUrl = getAppBaseUrl();
  if (!ecosystemId) {
    return `${baseUrl}?view=referrals`;
  }
  return `${baseUrl}?view=referrals&eco=${encodeURIComponent(ecosystemId)}`;
};

const getInboundIntakeUrl = (ecosystemId?: string | null) => {
  const baseUrl = getAppBaseUrl();
  if (!ecosystemId) {
    return `${baseUrl}?view=inbound_intake`;
  }
  return `${baseUrl}?view=inbound_intake&eco=${encodeURIComponent(ecosystemId)}`;
};

// When no route is configured, look up sender domain across ALL ecosystems to auto-route the message.
const findAuthorizedSenderDomainAnyEcosystem = async (fromEmail?: string | null) => {
  const domain = getEmailDomain(fromEmail);
  if (!domain) {
    return { match: null, domain };
  }
  const snapshot = await db.collection('authorized_sender_domains')
    .where('domain', '==', domain)
    .where('is_active', '==', true)
    .limit(1)
    .get();
  if (!snapshot.empty) {
    return { match: snapshot.docs[0].data() as AuthorizedSenderDomainRecord, domain };
  }
  return { match: null, domain };
};

const findAuthorizedSenderDomain = async (ecosystemId?: string | null, fromEmail?: string | null, fallbackDomains: string[] = []) => {
  const domain = getEmailDomain(fromEmail);
  if (!ecosystemId || !domain) {
    return { match: null, domain };
  }

  const snapshot = await db.collection('authorized_sender_domains')
    .where('ecosystem_id', '==', ecosystemId)
    .where('domain', '==', domain)
    .where('is_active', '==', true)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return {
      domain,
      match: snapshot.docs[0].data() as AuthorizedSenderDomainRecord,
    };
  }

  if (fallbackDomains.includes(domain)) {
    return {
      domain,
      match: {
        id: `route_fallback_${domain}`,
        ecosystem_id: ecosystemId,
        organization_id: '',
        domain,
        is_active: true,
        access_policy: 'approved',
        allow_sender_affiliation: true,
        allow_auto_acknowledgement: true,
        allow_invite_prompt: true,
      } satisfies AuthorizedSenderDomainRecord,
    };
  }

  return { match: null, domain };
};

const queueSenderReferralNotice = async (args: {
  senderEmail?: string | null;
  ecosystemId?: string | null;
  ecosystemName?: string | null;
  referralId: string;
  inboundMessageId: string;
  receivingOrgName?: string | null;
  referringOrgId?: string | null;
  senderDomainMatch: AuthorizedSenderDomainRecord | null;
  subject?: string | null;
  subjectName?: string | null;
}) => {
  const senderEmail = normalize(args.senderEmail);
  if (!senderEmail) {
    return;
  }

  const domainPolicy = args.senderDomainMatch?.access_policy
    || (args.senderDomainMatch ? 'approved' : 'request_access');
  if (domainPolicy === 'blocked') {
    return;
  }

  const existingPerson = await findExistingPersonByEmail(senderEmail);
  const referringOrgName = args.referringOrgId
    ? (await db.collection('organizations').doc(args.referringOrgId).get()).get('name') || null
    : null;
  const commonPayload = {
    referral_id: args.referralId,
    inbound_message_id: args.inboundMessageId,
    ecosystem_id: args.ecosystemId || null,
    ecosystem_name: args.ecosystemName || null,
    receiving_org_name: args.receivingOrgName || null,
    referring_org_name: referringOrgName,
    subject_name: args.subjectName || null,
    sender_domain: args.senderDomainMatch?.domain || getEmailDomain(senderEmail),
    manage_url: getReferralManageUrl(args.ecosystemId),
    intake_url: getInboundIntakeUrl(args.ecosystemId),
    request_access_url: `${getAppBaseUrl()}${args.ecosystemId ? `?eco=${encodeURIComponent(args.ecosystemId)}` : ''}`,
    subject: args.subject || '',
  };

  if (domainPolicy === 'approved' && existingPerson && args.senderDomainMatch?.allow_auto_acknowledgement !== false) {
    await enqueueTypedNotice('sender_referral_receipt', senderEmail, commonPayload, {
      personId: existingPerson.id,
      dedupeKey: `${args.referralId}:sender-receipt:${senderEmail}`,
    });
    return;
  }

  if (domainPolicy === 'approved' && args.senderDomainMatch?.allow_invite_prompt !== false) {
    await enqueueTypedNotice('sender_domain_claim', senderEmail, commonPayload, {
      dedupeKey: `${args.referralId}:sender-claim:${senderEmail}`,
    });
    return;
  }

  if (domainPolicy === 'invite_only') {
    await enqueueTypedNotice('sender_invite_required', senderEmail, commonPayload, {
      dedupeKey: `${args.referralId}:sender-invite:${senderEmail}`,
    });
    return;
  }

  await enqueueTypedNotice('sender_access_request', senderEmail, commonPayload, {
    personId: existingPerson?.id || null,
    dedupeKey: `${args.referralId}:sender-access:${senderEmail}`,
  });
};

const logAudit = async (action: string, actorId: string, details: Record<string, unknown>) => {
  const docRef = db.collection('audit_logs').doc();
  await docRef.set({
    id: docRef.id,
    action,
    actor_person_id: actorId,
    details,
    created_at: new Date().toISOString(),
  });
};

const generateInviteToken = () => randomBytes(24).toString('hex');
const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

const isExpired = (isoDate?: string | null) => {
  if (!isoDate) {
    return false;
  }
  return new Date(isoDate).getTime() <= Date.now();
};

const findExistingPersonByEmail = async (email: string) => {
  const [primarySnap, secondarySnap] = await Promise.all([
    db.collection('people').where('email', '==', email).limit(1).get(),
    db.collection('people').where('secondary_emails', 'array-contains', email).limit(1).get(),
  ]);
  if (!primarySnap.empty) return primarySnap.docs[0];
  if (!secondarySnap.empty) return secondarySnap.docs[0];
  return null;
};

const resolveInviteScope = async (organizationId: string, requestedEcosystemId?: string | null) => {
  const organizationDoc = await db.collection('organizations').doc(organizationId).get();
  if (!organizationDoc.exists) {
    throw new Error('Organization not found');
  }

  const ecosystemIds = (organizationDoc.get('ecosystem_ids') || []) as string[];
  if (!ecosystemIds.length) {
    throw new Error('Organization is not assigned to any ecosystem');
  }

  if (requestedEcosystemId) {
    if (!ecosystemIds.includes(requestedEcosystemId)) {
      throw new Error('Organization is not part of the requested ecosystem');
    }
    return {
      organization: organizationDoc,
      ecosystemId: requestedEcosystemId,
    };
  }

  return {
    organization: organizationDoc,
    ecosystemId: ecosystemIds[0],
  };
};

const findInviteByToken = async (token: string) => {
  const hashedToken = hashInviteToken(token);
  let snapshot = await db.collection('invites').where('token_hash', '==', hashedToken).limit(1).get();
  if (!snapshot.empty) {
    return snapshot.docs[0];
  }

  // Backward-compatible lookup for older local invites created before token hashing.
  snapshot = await db.collection('invites').where('token', '==', token).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
};

const getPostmarkConfig = () => {
  const serverToken = getRequiredEnv('POSTMARK_SERVER_TOKEN');
  const fromEmail = getRequiredEnv('POSTMARK_FROM_EMAIL');
  const messageStream = getRequiredEnv('POSTMARK_MESSAGE_STREAM') || 'outbound';
  const safeModeRedirect = getRequiredEnv('POSTMARK_SAFE_MODE_REDIRECT');
  return { serverToken, fromEmail, messageStream, safeModeRedirect };
};

// ---------------------------------------------------------------------------
// Email layout helpers
// ---------------------------------------------------------------------------

const emailWrap = (content: string, ecosystemName?: string | null) => {
  const brand = ecosystemName || 'Entrepreneurship Nexus';
  const nexusUrl = getAppBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1a1a2e;padding:20px 32px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px;">${brand}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#f4f4f5;padding:16px 32px;text-align:center;font-size:12px;color:#6b7280;">
            Powered by <a href="${nexusUrl}" style="color:#6b7280;">Entrepreneurship Nexus</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const ctaButton = (label: string, url: string) =>
  `<p style="margin:24px 0 0;">
    <a href="${url}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:bold;">${label}</a>
  </p>`;

const emailP = (text: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a2e;">${text}</p>`;

const emailH2 = (text: string) => `<h2 style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#1a1a2e;">${text}</h2>`;

const detailBox = (rows: Array<[string, string]>) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:0;margin:20px 0;">
    ${rows.map(([label, value]) => `
      <tr>
        <td style="padding:8px 16px;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:8px 16px;font-size:14px;color:#1a1a2e;vertical-align:top;">${value}</td>
      </tr>`).join('')}
  </table>`;

// ---------------------------------------------------------------------------
// Notice renderer
// ---------------------------------------------------------------------------

const renderNoticeContent = (notice: FirebaseFirestore.DocumentData) => {
  const ecosystemName: string | null = notice.payload?.ecosystem_name || null;
  const wrap = (content: string) => emailWrap(content, ecosystemName);

  if (notice.type === 'access_invite') {
    const inviteUrl = notice.payload?.invite_url || getAppBaseUrl();
    const invitedRole = notice.payload?.invited_role || 'member';
    return {
      subject: 'You have been invited to Entrepreneurship Nexus',
      textBody: [
        'Hello,',
        '',
        `You have been invited to Entrepreneurship Nexus as ${invitedRole}.`,
        `Use this link to accept your invite: ${inviteUrl}`,
        '',
        'If you already have an account, sign in with the invited email address before accepting.',
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2('You\'ve been invited'),
        emailP(`You have been invited to join <strong>Entrepreneurship Nexus</strong> as a <strong>${invitedRole}</strong>.`),
        emailP('Entrepreneurship Nexus connects entrepreneurs with the right resources, coaches, and organizations in your ecosystem.'),
        emailP('If you already have an account, sign in with this email address before accepting.'),
        ctaButton('Accept Invitation', inviteUrl),
      ].join('')),
    };
  }

  if (notice.type === 'referral_follow_up') {
    const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
    const referringOrgName = notice.payload?.referring_org_name || null;
    const networkName = ecosystemName || 'the network';
    const appUrl = getAppBaseUrl();
    const introLine = referringOrgName
      ? `<strong>${referringOrgName}</strong> has introduced you to <strong>${receivingOrgName}</strong>.`
      : `You have been referred to <strong>${receivingOrgName}</strong> through ${networkName}.`;
    const introLineText = referringOrgName
      ? `${referringOrgName} has introduced you to ${receivingOrgName}.`
      : `You have been referred to ${receivingOrgName} through ${networkName}.`;
    return {
      subject: `${referringOrgName ? `${referringOrgName} introduced you to` : 'You\'ve been referred to'} ${receivingOrgName}`,
      textBody: [
        'Hello,',
        '',
        introLineText,
        '',
        'You can create a free account to track the status of your referral and stay informed as things move forward.',
        '',
        `Get started: ${appUrl}`,
        '',
      ].join('\n'),
      htmlBody: wrap([
        emailH2(`You've been referred to ${receivingOrgName}`),
        emailP(introLine),
        emailP('Create a free account to track the status of your referral and stay informed as things move forward.'),
        ctaButton('Track Your Referral', appUrl),
        emailP('<span style="font-size:13px;color:#6b7280;">If you already have an account, sign in with this email address.</span>'),
      ].join('')),
    };
  }

  if (notice.type === 'referral_new_intake') {
    const subjectName = notice.payload?.subject_name || 'a new contact';
    const referringOrgName = notice.payload?.referring_org_name || 'a partner organization';
    const ventureName = notice.payload?.venture_name || null;
    const supportNeeds: string[] = notice.payload?.support_needs || [];
    const ventureStage = notice.payload?.venture_stage || null;
    const referralNotes = notice.payload?.referral_notes || '';
    const manageUrl = notice.payload?.manage_url || getReferralManageUrl(notice.payload?.ecosystem_id);

    const detailRows: Array<[string, string]> = [
      ['Referred by', referringOrgName],
    ];
    if (ventureName) detailRows.push(['Venture', ventureName]);
    if (ventureStage) detailRows.push(['Stage', ventureStage.replace(/_/g, ' ')]);
    if (supportNeeds.length) detailRows.push(['Support needed', supportNeeds.map((n: string) => n.replace(/_/g, ' ')).join(', ')]);

    const textLines = [
      `Hello,`,
      '',
      `${referringOrgName} has referred ${subjectName}${ventureName ? ` (${ventureName})` : ''} to your organization.`,
      '',
      referralNotes ? `Introduction notes:\n${referralNotes}` : '',
      supportNeeds.length ? `Support needs: ${supportNeeds.join(', ')}` : '',
      ventureStage ? `Venture stage: ${ventureStage}` : '',
      '',
      'This referral has been logged in Entrepreneurship Nexus. You can sign in to review it, assign it to a team member, and update its status.',
      '',
      `Open referral: ${manageUrl}`,
      '',
      'Thank you,',
      'Entrepreneurship Nexus',
    ].filter(Boolean);

    return {
      subject: `New referral: ${subjectName}${ventureName ? ` — ${ventureName}` : ''} via ${referringOrgName}`,
      textBody: textLines.join('\n'),
      htmlBody: wrap([
        emailH2('New referral received'),
        emailP(`<strong>${referringOrgName}</strong> has referred <strong>${subjectName}</strong>${ventureName ? ` of <strong>${ventureName}</strong>` : ''} to your organization.`),
        detailBox(detailRows),
        referralNotes ? [
          `<p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Introduction notes</p>`,
          `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#1a1a2e;background:#f9fafb;border-left:3px solid #1a1a2e;padding:12px 16px;border-radius:0 4px 4px 0;">${referralNotes.replace(/\n/g, '<br>')}</p>`,
        ].join('') : '',
        emailP('This referral is tracked in Entrepreneurship Nexus. Sign in to assign it to a team member, review the full profile, and update the status as your work progresses.'),
        ctaButton('Review Referral', manageUrl),
        emailP('<span style="font-size:13px;color:#6b7280;">Don\'t have an account? Your organization administrator can invite you, or contact us to get set up.</span>'),
      ].join('')),
    };
  }

  if (notice.type === 'sender_referral_receipt') {
    const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
    const subjectName = notice.payload?.subject_name || null;
    const manageUrl = notice.payload?.manage_url || getReferralManageUrl(notice.payload?.ecosystem_id);
    const introLine = subjectName
      ? `Your referral for <strong>${subjectName}</strong> to <strong>${receivingOrgName}</strong> has been logged.`
      : `Your referral to <strong>${receivingOrgName}</strong> has been logged in Entrepreneurship Nexus.`;
    return {
      subject: subjectName
        ? `Referral logged: ${subjectName} → ${receivingOrgName}`
        : `Your referral to ${receivingOrgName} is now in Entrepreneurship Nexus`,
      textBody: [
        'Hello,',
        '',
        subjectName
          ? `Your referral for ${subjectName} to ${receivingOrgName} has been logged in Entrepreneurship Nexus.`
          : `Your referral to ${receivingOrgName} has been logged in Entrepreneurship Nexus.`,
        'You can sign in to track its status, add notes, and mark the work complete when it wraps up.',
        '',
        `Open referral workspace: ${manageUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2('Referral logged'),
        emailP(introLine),
        emailP('Sign in to track its status, add notes, and mark the work complete when it wraps up.'),
        ctaButton('Open Referral Workspace', manageUrl),
      ].join('')),
    };
  }

  if (notice.type === 'referral_sender_reminder' || notice.type === 'referral_sender_follow_up') {
    const isFollowUp = notice.type === 'referral_sender_follow_up';
    const receivingOrgName = notice.payload?.receiving_org_name || 'your organization';
    const referringOrgName = notice.payload?.referring_org_name || 'a partner organization';
    const subjectLabel = notice.payload?.subject_label || 'this referral';
    const manageUrl = notice.payload?.manage_url || getReferralManageUrl(notice.payload?.ecosystem_id);
    const senderName = notice.payload?.sender_name || 'A colleague';
    const customMessage = notice.payload?.custom_message || '';
    const defaultBody = isFollowUp
      ? 'Additional details have been added for your team.'
      : 'When you have a moment, please review it in Entrepreneurship Nexus and accept it if it is a fit.';
    return {
      subject: isFollowUp
        ? `Follow-up on referral: ${subjectLabel}`
        : `Reminder: referral for ${subjectLabel} is pending`,
      textBody: [
        `Hello ${receivingOrgName},`,
        '',
        isFollowUp
          ? `${senderName} from ${referringOrgName} shared a follow-up on the referral for ${subjectLabel}.`
          : `${senderName} from ${referringOrgName} is checking in on the referral for ${subjectLabel}.`,
        customMessage || defaultBody,
        '',
        `Open referral workspace: ${manageUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2(isFollowUp ? 'Referral follow-up' : 'Referral reminder'),
        emailP(isFollowUp
          ? `<strong>${senderName}</strong> from <strong>${referringOrgName}</strong> shared a follow-up on the referral for <strong>${subjectLabel}</strong>.`
          : `<strong>${senderName}</strong> from <strong>${referringOrgName}</strong> is checking in on the referral for <strong>${subjectLabel}</strong>.`),
        emailP(customMessage || defaultBody),
        ctaButton('Open Referral Workspace', manageUrl),
      ].join('')),
    };
  }

  if (notice.type === 'referral_decision_update') {
    const decision = notice.payload?.decision === 'declined' ? 'declined' : 'accepted';
    const recipientKind = notice.payload?.recipient_kind === 'introducer' ? 'introducer' : 'entrepreneur';
    const receivingOrgName = notice.payload?.receiving_org_name || 'the receiving organization';
    const referringOrgName = notice.payload?.referring_org_name || 'the introducing organization';
    const subjectLabel = notice.payload?.subject_label || 'this referral';
    const sharedNote = notice.payload?.shared_note || '';
    const actionMessage = notice.payload?.action_message || '';
    const customSubject = notice.payload?.custom_subject || '';
    const manageUrl = notice.payload?.manage_url || getReferralManageUrl(notice.payload?.ecosystem_id);

    if (decision === 'accepted') {
      const defaultHeadline = recipientKind === 'entrepreneur'
        ? `${receivingOrgName} accepted your referral`
        : `${receivingOrgName} accepted the referral for ${subjectLabel}`;
      const headline = customSubject || defaultHeadline;
      const bodyLine = recipientKind === 'entrepreneur'
        ? `<strong>${receivingOrgName}</strong> has accepted the referral connected to you and will be following up.`
        : `<strong>${receivingOrgName}</strong> accepted the referral that <strong>${referringOrgName}</strong> sent for <strong>${subjectLabel}</strong>.`;
      return {
        subject: headline,
        textBody: [
          'Hello,',
          '',
          recipientKind === 'entrepreneur'
            ? `${receivingOrgName} accepted the referral connected to you and will be following up.`
            : `${receivingOrgName} accepted the referral that ${referringOrgName} sent for ${subjectLabel}.`,
          sharedNote ? `Shared note: ${sharedNote}` : '',
          actionMessage || '',
          '',
          `Referral workspace: ${manageUrl}`,
          '',
          'Thank you,',
          'Entrepreneurship Nexus',
        ].filter(Boolean).join('\n'),
        htmlBody: wrap([
          emailH2(headline),
          emailP(bodyLine),
          sharedNote ? emailP(`<strong>Note from ${receivingOrgName}:</strong> ${sharedNote}`) : '',
          actionMessage ? emailP(actionMessage) : '',
          ctaButton('View Referral', manageUrl),
        ].join('')),
      };
    }

    const headline = recipientKind === 'entrepreneur'
      ? `${receivingOrgName} is unable to take this referral`
      : `${receivingOrgName} declined the referral for ${subjectLabel}`;
    const bodyLine = recipientKind === 'entrepreneur'
      ? `<strong>${receivingOrgName}</strong> is not able to take on this referral at this time.`
      : `<strong>${receivingOrgName}</strong> declined the referral that <strong>${referringOrgName}</strong> sent for <strong>${subjectLabel}</strong>.`;
    return {
      subject: headline,
      textBody: [
        'Hello,',
        '',
        recipientKind === 'entrepreneur'
          ? `${receivingOrgName} is not able to take on this referral at this time.`
          : `${receivingOrgName} declined the referral that ${referringOrgName} sent for ${subjectLabel}.`,
        sharedNote ? `Reason shared: ${sharedNote}` : '',
        '',
        `Referral workspace: ${manageUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].filter(Boolean).join('\n'),
      htmlBody: wrap([
        emailH2(headline),
        emailP(bodyLine),
        sharedNote ? emailP(`<strong>Reason shared:</strong> ${sharedNote}`) : '',
        ctaButton('View Referral', manageUrl),
      ].join('')),
    };
  }

  if (notice.type === 'sender_domain_claim') {
    const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
    const manageUrl = notice.payload?.manage_url || getReferralManageUrl(notice.payload?.ecosystem_id);
    const senderDomain = notice.payload?.sender_domain || 'your organization email domain';
    return {
      subject: 'Your referral is in Entrepreneurship Nexus — sign in to manage it',
      textBody: [
        'Hello,',
        '',
        `We logged a referral for ${receivingOrgName} from ${senderDomain}.`,
        'Your organization\'s email domain is approved for this ecosystem.',
        'Sign in to Entrepreneurship Nexus with this email address to manage the referral, track its status, and add notes.',
        '',
        `Sign in here: ${manageUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2('Referral logged — claim it in Nexus'),
        emailP(`We logged a referral for <strong>${receivingOrgName}</strong> that came from <strong>${senderDomain}</strong>.`),
        emailP('Your organization\'s email domain is approved for this ecosystem. Sign in to Entrepreneurship Nexus with this email address to manage the referral, track its status, and add notes.'),
        ctaButton('Sign In & Review Referral', manageUrl),
        emailP('<span style="font-size:13px;color:#6b7280;">New to Nexus? Use the sign-in page to create an account — your domain is already approved.</span>'),
      ].join('')),
    };
  }

  if (notice.type === 'sender_access_request') {
    const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
    const requestAccessUrl = notice.payload?.request_access_url || getAppBaseUrl();
    return {
      subject: 'We received your referral — request access to track it',
      textBody: [
        'Hello,',
        '',
        `We received your referral for ${receivingOrgName} and it has been logged in Entrepreneurship Nexus.`,
        'To manage referrals and track outcomes, sign in to Nexus and request access for your organization.',
        'If your organization already uses Nexus, an existing administrator can invite you directly.',
        '',
        `Open Entrepreneurship Nexus: ${requestAccessUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2('Referral received'),
        emailP(`Your referral for <strong>${receivingOrgName}</strong> has been logged in Entrepreneurship Nexus.`),
        emailP('To manage referrals and track outcomes directly in Nexus, sign in and request access for your organization. If your organization is already on Nexus, an administrator can invite you directly.'),
        ctaButton('Request Access', requestAccessUrl),
      ].join('')),
    };
  }

  if (notice.type === 'sender_invite_required') {
    const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
    const requestAccessUrl = notice.payload?.request_access_url || getAppBaseUrl();
    return {
      subject: 'Referral received — an invite is required to manage it',
      textBody: [
        'Hello,',
        '',
        `We received your referral for ${receivingOrgName}.`,
        'Your organization is configured for invite-based access in this ecosystem.',
        'Ask an existing Nexus administrator at your organization to invite you, or sign in to request access.',
        '',
        `Open Entrepreneurship Nexus: ${requestAccessUrl}`,
        '',
        'Thank you,',
        'Entrepreneurship Nexus',
      ].join('\n'),
      htmlBody: wrap([
        emailH2('Referral received'),
        emailP(`Your referral for <strong>${receivingOrgName}</strong> has been received.`),
        emailP('Your organization is configured for invite-based access in this ecosystem. Ask an existing Nexus administrator at your organization to invite you, or sign in to request access.'),
        ctaButton('Sign In to Request Access', requestAccessUrl),
      ].join('')),
    };
  }

  return {
    subject: 'Notification from Entrepreneurship Nexus',
    textBody: 'A new notification is available in Entrepreneurship Nexus.',
    htmlBody: wrap(emailP('A new notification is available in Entrepreneurship Nexus.')),
  };
};

const sendPostmarkEmail = async (notice: FirebaseFirestore.DocumentData) => {
  const config = getPostmarkConfig();
  if (!config.serverToken || !config.fromEmail) {
    throw new Error('Postmark outbound configuration is incomplete');
  }

  const content = renderNoticeContent(notice);
  const toEmail = config.safeModeRedirect || notice.to_email;
  const subject = config.safeModeRedirect 
    ? `[REDIRECTED to ${notice.to_email}] ${content.subject}` 
    : content.subject;

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': config.serverToken,
    },
    body: JSON.stringify({
      From: config.fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: content.textBody,
      HtmlBody: content.htmlBody,
      MessageStream: config.messageStream,
      Metadata: {
        notice_id: notice.id,
        notice_type: notice.type || 'unknown',
      },
    }),
  });

  const json = await response.json().catch(() => null) as PostmarkSendResponse | null;
  if (!response.ok) {
    throw new Error(json?.Message || 'Postmark send failed');
  }

  return json;
};

// Shared logic: create a referral from a fully-parsed inbound message.
// Called by both auto-approve (trusted sender, no review needed) and the manual approveInboundMessage endpoint.
const createReferralFromInboundMessage = async (args: {
  message: FirebaseFirestore.DocumentData;
  messageRef: FirebaseFirestore.DocumentReference;
  parseResult: FirebaseFirestore.DocumentData;
  personEmail: string;
  personName?: string | null;
  ventureName?: string | null;
  subjectOrgId?: string | null;
  receivingOrgId: string;
  referringOrgId?: string | null;
  ecosystemId?: string | null;
  approvedBy?: string | null; // uid or 'system' for auto-approve
}) => {
  const now = new Date().toISOString();
  const { message, messageRef, parseResult, personEmail, personName, ventureName, subjectOrgId,
    receivingOrgId, referringOrgId, ecosystemId, approvedBy } = args;

  let organization: FirebaseFirestore.DocumentSnapshot | null = null;
  let autoLinkOrganization = false;
  if (subjectOrgId) {
    const snap = await db.collection('organizations').doc(subjectOrgId).get();
    if (snap.exists) organization = snap;
  } else {
    const organizationResult = await upsertDraftOrganization(ventureName ?? undefined, ecosystemId ?? undefined);
    organization = organizationResult?.doc || null;
    autoLinkOrganization = !!organizationResult?.created;
  }

  const person = await upsertDraftPerson(personEmail, personName ?? undefined, organization?.id, ecosystemId ?? undefined, {
    autoLinkOrganization,
  });

  // Resolve referring person from sender email (primary or secondary) if they're already in the system
  const senderEmail = normalize(message.from_email);
  let referringPersonId: string | null = null;
  if (senderEmail) {
    const [senderPrimary, senderSecondary] = await Promise.all([
      db.collection('people').where('email', '==', senderEmail).limit(1).get(),
      db.collection('people').where('secondary_emails', 'array-contains', senderEmail).limit(1).get(),
    ]);
    const senderSnap = !senderPrimary.empty ? senderPrimary : senderSecondary;
    if (!senderSnap.empty) referringPersonId = senderSnap.docs[0].id;
  }

  const referralNote = extractReferralNote(message.text_body);
  const referralRef = db.collection('referrals').doc();
  await referralRef.set({
    id: referralRef.id,
    ecosystem_id: ecosystemId || null,
    referring_org_id: referringOrgId || null,
    referring_person_id: referringPersonId,
    receiving_org_id: receivingOrgId,
    subject_person_id: person.id || null,
    subject_org_id: organization?.id || null,
    date: message.received_at || now,
    status: 'pending',
    notes: referralNote,
    intro_email_sent: true,
    source: 'bcc_intake',
    created_at: now,
  });

  const receivingOrganization = await db.collection('organizations').doc(receivingOrgId).get();
  const receivingOrgIntakePrefs = receivingOrganization?.get('referral_intake_prefs') || {};
  const suppressEntrepreneurIntro = !!receivingOrgIntakePrefs.suppress_entrepreneur_intro;
  const receivingOrgIntakeEmail: string | null =
    receivingOrgIntakePrefs.intake_contact_email || receivingOrganization?.get('email') || null;

  const referringOrgName = referringOrgId
    ? ((await db.collection('organizations').doc(referringOrgId).get()).get('name') || null)
    : null;
  const ecosystemName = await getEcosystemName(ecosystemId);

  const introContactPermission = parseResult.intro_contact_permission || 'unknown';
  if (!suppressEntrepreneurIntro && introContactPermission !== 'not_confirmed') {
    await enqueueNotice(person.id, personEmail, {
      inbound_message_id: message.id,
      referral_id: referralRef.id,
      receiving_org_name: receivingOrganization?.get('name') || null,
      referring_org_name: referringOrgName,
      ecosystem_name: ecosystemName,
      subject: message.subject || '',
    });
  }

  if (receivingOrgIntakeEmail) {
    await enqueueTypedNotice('referral_new_intake', receivingOrgIntakeEmail, {
      inbound_message_id: message.id,
      referral_id: referralRef.id,
      subject_name: personName || null,
      venture_name: ventureName || null,
      venture_stage: parseResult.venture_stage || null,
      support_needs: parseResult.support_needs || [],
      referral_notes: referralNote || null,
      referring_org_name: referringOrgName,
      receiving_org_name: receivingOrganization?.get('name') || null,
      ecosystem_id: ecosystemId || null,
      ecosystem_name: ecosystemName,
      manage_url: getReferralManageUrl(ecosystemId || null),
    }, {
      dedupeKey: `${referralRef.id}:new-intake:${receivingOrgIntakeEmail}`,
    });
  }

  const senderDomainInfo = await findAuthorizedSenderDomain(ecosystemId, message.from_email);
  await queueSenderReferralNotice({
    senderEmail: message.from_email,
    ecosystemId: ecosystemId || null,
    ecosystemName,
    referralId: referralRef.id,
    inboundMessageId: message.id,
    receivingOrgName: receivingOrganization?.get('name') || null,
    referringOrgId: referringOrgId || null,
    senderDomainMatch: senderDomainInfo.match,
    subject: message.subject || '',
    subjectName: personName || null,
  });

  await messageRef.update({
    review_status: 'approved',
    approved_at: now,
    approved_by: approvedBy || 'system',
  });

  return { referralId: referralRef.id, personId: person.id, organizationId: organization?.id || null };
};

const processInboundEmailPayload = async (payload: InboundEmailPayload) => {
  const routeAddress = normalize(payload.route_address || payload.to_emails?.[0] || '');
  const routeMatch = await db.collection('inbound_routes').where('route_address', '==', routeAddress).limit(1).get();
  const route = routeMatch.empty ? null : routeMatch.docs[0].data();

  const senderEmail = normalize(payload.from_email);
  const providerMessageId = payload.provider_message_id || null;

  // 1. Deduplication check
  if (providerMessageId) {
    const duplicate = await db.collection('inbound_messages')
      .where('provider_message_id', '==', providerMessageId)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      const existing = duplicate.docs[0];
      return {
        ok: true,
        inbound_message_id: existing.id,
        is_duplicate: true,
        status: existing.get('parse_status'),
      };
    }
  }

  // 2. Resolve ecosystem: prefer route match; fall back to sender domain lookup across all ecosystems.
  //    This allows emails from trusted partners to be auto-routed even without a configured inbound route.
  let resolvedEcosystemId: string | null = route?.ecosystem_id || null;
  let senderDomainInfo = await findAuthorizedSenderDomain(resolvedEcosystemId, senderEmail, route?.allowed_sender_domains || []);

  if (!resolvedEcosystemId && !senderDomainInfo.match) {
    const crossEcosystemMatch = await findAuthorizedSenderDomainAnyEcosystem(senderEmail);
    if (crossEcosystemMatch.match) {
      resolvedEcosystemId = crossEcosystemMatch.match.ecosystem_id;
      senderDomainInfo = crossEcosystemMatch;
    }
  }

  const footer = parseFooter(payload.text_body);

  const footerEmail = typeof footer?.client_email === 'string' ? normalize(footer.client_email) : undefined;
  const { clientEmail, additionalCcEmails: ccEmails } = extractClientEmail({
    footerEmail,
    ccEmails: payload.cc_emails || [],
    textBody: payload.text_body,
    senderEmail,
    routeAddress,
  });
  const clientName = typeof footer?.client_name === 'string' ? footer.client_name : extractNameFromSubject(payload.subject);
  const ventureName = typeof footer?.client_venture === 'string' ? footer.client_venture : undefined;
  const receivingOrgName = typeof footer?.receiving_org === 'string' ? footer.receiving_org : undefined;
  const introContactPermission = (Array.isArray(footer?.intro_contact_permission) && footer?.intro_contact_permission[0]
    ? footer?.intro_contact_permission[0]
    : 'unknown') as IntroContactPermission;
  const supportNeeds = Array.isArray(footer?.support_needs) ? footer.support_needs : [];
  const ventureStage = Array.isArray(footer?.venture_stage) ? footer.venture_stage[0] : undefined;

  const referringOrgId = senderDomainInfo.match?.allow_sender_affiliation === false
    ? null
    : (senderDomainInfo.match?.organization_id || null);

  // Resolve receiving org from footer name or TO email domains.
  // Fallback: if the sender belongs to a known org (via authorized_sender_domains) and no other
  // receiving org is found, assume they are introducing to their own org (self-intake pattern).
  let receivingOrganization = await resolveReceivingOrganization(receivingOrgName, payload.to_emails || []);
  if (!receivingOrganization && senderDomainInfo.match?.organization_id) {
    const senderOrg = await db.collection('organizations').doc(senderDomainInfo.match.organization_id).get();
    if (senderOrg.exists) {
      receivingOrganization = senderOrg;
    }
  }

  const needsReviewReasons = [
    ...(clientEmail ? [] : ['missing_client_email']),
    ...(senderDomainInfo.match ? [] : ['unknown_sender_domain']),
    ...(receivingOrganization ? [] : ['unknown_receiving_org']),
    ...(ccEmails.length > 0 ? ['multiple_cc_entrepreneurs'] : []),
  ];

  const inboundMessageRef = db.collection('inbound_messages').doc();
  const now = new Date().toISOString();
  await inboundMessageRef.set({
    id: inboundMessageRef.id,
    provider: payload.provider || 'manual',
    provider_message_id: providerMessageId,
    message_id_header: payload.message_id_header || null,
    route_address: routeAddress,
    ecosystem_id: resolvedEcosystemId,
    activity_type: route?.activity_type || 'introduction',
    from_email: senderEmail,
    to_emails: payload.to_emails || [],
    cc_emails: payload.cc_emails || [],
    subject: payload.subject || '',
    text_body: payload.text_body || '',
    html_body: payload.html_body || '',
    raw_payload: payload.raw_payload || payload,
    parse_status: 'parsed',
    review_status: 'needs_review',
    received_at: now,
  });

  const parseResultRef = db.collection('inbound_parse_results').doc();
  const parseResultData = {
    id: parseResultRef.id,
    inbound_message_id: inboundMessageRef.id,
    candidate_person_email: clientEmail || null,
    candidate_person_name: clientName || null,
    additional_cc_emails: ccEmails,
    candidate_venture_name: ventureName || null,
    candidate_receiving_org_id: receivingOrganization?.id || null,
    candidate_referring_org_id: referringOrgId,
    intro_contact_permission: introContactPermission,
    venture_stage: ventureStage || null,
    support_needs: supportNeeds,
    confidence: (clientEmail && receivingOrganization) ? 0.85 : 0.45,
    needs_review_reasons: needsReviewReasons,
    parsed_at: now,
  };
  await parseResultRef.set(parseResultData);

  // 3. Auto-approve if sender is trusted, all required fields resolved, and no ambiguity.
  //    TODO: Add more sophisticated routing logic when ESOs operate in multiple ecosystems.
  const canAutoApprove =
    needsReviewReasons.length === 0 &&
    !!clientEmail &&
    !!receivingOrganization &&
    senderDomainInfo.match?.access_policy !== 'blocked' &&
    senderDomainInfo.match?.access_policy !== 'invite_only' &&
    senderDomainInfo.match?.access_policy !== 'request_access';

  if (canAutoApprove && clientEmail && receivingOrganization) {
    const autoApproveResult = await createReferralFromInboundMessage({
      message: { ...inboundMessageRef, id: inboundMessageRef.id, ...payload, ecosystem_id: resolvedEcosystemId, received_at: now },
      messageRef: inboundMessageRef,
      parseResult: parseResultData,
      personEmail: clientEmail,
      personName: clientName || null,
      ventureName: ventureName || null,
      receivingOrgId: receivingOrganization.id,
      referringOrgId: referringOrgId || null,
      ecosystemId: resolvedEcosystemId,
      approvedBy: 'system',
    });
    return {
      ok: true,
      inbound_message_id: inboundMessageRef.id,
      parse_result_id: parseResultRef.id,
      review_required: false,
      auto_approved: true,
      referral_id: autoApproveResult.referralId,
      person_id: autoApproveResult.personId,
    };
  }

  return {
    ok: true,
    inbound_message_id: inboundMessageRef.id,
    parse_result_id: parseResultRef.id,
    review_required: true,
  };
};

export const approveInboundMessage = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Require platform admin or ecosystem manager
  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const isAuthorized = auth.memberships.some((m) => ['platform_admin', 'ecosystem_manager'].includes(m.system_role));
  if (!isAuthorized) {
    res.status(403).json({ error: 'You do not have permission to approve inbound messages' });
    return;
  }

  const inboundMessageId = req.body?.inbound_message_id;
  if (!inboundMessageId) {
    res.status(400).json({ error: 'inbound_message_id is required' });
    return;
  }

  const messageDoc = await db.collection('inbound_messages').doc(inboundMessageId).get();
  if (!messageDoc.exists) {
    res.status(404).json({ error: 'Inbound message not found' });
    return;
  }

  const message = messageDoc.data()!;
  if (message.review_status === 'approved') {
    res.status(400).json({ error: 'Message is already approved' });
    return;
  }

  const parseResults = await db.collection('inbound_parse_results')
    .where('inbound_message_id', '==', inboundMessageId)
    .limit(1)
    .get();
  
  if (parseResults.empty) {
    res.status(400).json({ error: 'No parse results found for this message' });
    return;
  }

  const parseResult = parseResults.docs[0].data();
  
  // Overrides from review UI
  const finalPersonEmail = normalize(req.body?.person_email || parseResult.candidate_person_email);
  const finalPersonName = req.body?.person_name || parseResult.candidate_person_name;
  const finalVentureName = req.body?.venture_name || parseResult.candidate_venture_name;
  const finalSubjectOrgId = req.body?.subject_org_id || null;
  const finalReceivingOrgId = req.body?.receiving_org_id || parseResult.candidate_receiving_org_id;
  const finalReferringOrgId = req.body?.referring_org_id || parseResult.candidate_referring_org_id;
  const ecosystemId = message.ecosystem_id;

  if (!finalPersonEmail || !finalReceivingOrgId) {
    res.status(400).json({ error: 'Person email and receiving organization ID are required for approval' });
    return;
  }

  const result = await createReferralFromInboundMessage({
    message,
    messageRef: messageDoc.ref,
    parseResult,
    personEmail: finalPersonEmail,
    personName: finalPersonName || null,
    ventureName: finalSubjectOrgId ? null : (finalVentureName || null),
    subjectOrgId: finalSubjectOrgId,
    receivingOrgId: finalReceivingOrgId,
    referringOrgId: finalReferringOrgId || null,
    ecosystemId,
    approvedBy: auth.uid,
  });

  await logAudit('inbound_message_approved', auth.uid, {
    inbound_message_id: message.id,
    referral_id: result.referralId,
  });

  res.json({
    ok: true,
    referral_id: result.referralId,
    person_id: result.personId,
    organization_id: result.organizationId,
  });
});

export const rejectInboundMessage = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) return;

  const isAuthorized = auth.memberships.some((m) => ['platform_admin', 'ecosystem_manager'].includes(m.system_role));
  if (!isAuthorized) {
    res.status(403).json({ error: 'You do not have permission to reject inbound messages' });
    return;
  }

  const inboundMessageId = req.body?.inbound_message_id;
  const reason = req.body?.reason || '';
  if (!inboundMessageId) {
    res.status(400).json({ error: 'inbound_message_id is required' });
    return;
  }

  const messageDoc = await db.collection('inbound_messages').doc(inboundMessageId).get();
  if (!messageDoc.exists) {
    res.status(404).json({ error: 'Inbound message not found' });
    return;
  }

  await messageDoc.ref.update({
    review_status: 'rejected',
    rejection_reason: reason,
    rejected_at: new Date().toISOString(),
    rejected_by: auth.uid,
  });

  await logAudit('inbound_message_rejected', auth.uid, {
    inbound_message_id: inboundMessageId,
    reason,
  });

  res.json({ ok: true });
});

const mapPostmarkInboundToInternal = (payload: PostmarkInboundPayload): InboundEmailPayload => {
  const toEmails = payload.ToFull?.map((entry) => normalize(entry.Email)).filter(Boolean) as string[]
    || parseAddressList(payload.To);
  const ccEmails = payload.CcFull?.map((entry) => normalize(entry.Email)).filter(Boolean) as string[]
    || parseAddressList(payload.Cc);

  return {
    provider: 'postmark',
    provider_message_id: payload.MessageID || undefined,
    message_id_header: undefined,
    route_address: normalize(payload.OriginalRecipient) || toEmails[0] || '',
    from_email: normalize(payload.FromFull?.Email) || parseAddressList(payload.From)[0] || '',
    to_emails: toEmails,
    cc_emails: ccEmails,
    subject: payload.Subject || '',
    text_body: payload.TextBody || '',
    html_body: payload.HtmlBody || '',
    raw_payload: payload as Record<string, unknown>,
  };
};

export const resolvePerson = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const context = await requireAuthOrApiKey(req, res) as AuthContext | null;
  if (!context) return;

  const email = normalize(req.body?.email);
  const fullName = normalize(req.body?.full_name);
  const organizationName = normalize(req.body?.organization_name);

  if (!email && !fullName) {
    res.status(400).json({ error: 'email or full_name is required' });
    return;
  }

  if (email) {
    const byEmail = await db.collection('people').where('email', '==', email).limit(1).get();
    if (!byEmail.empty) {
      const person = byEmail.docs[0].data();
      res.json({
        match_found: true,
        confidence: 0.98,
        person_id: person.id,
        organization_id: person.primary_organization_id || undefined,
        network_profile_url: `/people/${person.id}`,
      });
      return;
    }
  }

  if (fullName) {
    const byName = await db
      .collection('people')
      .where('first_name', '==', fullName.split(' ')[0])
      .limit(5)
      .get();
    const matched = byName.docs.find((doc) => {
      const data = doc.data();
      const combined = `${normalize(data.first_name)} ${normalize(data.last_name)}`.trim();
      if (combined !== fullName) {
        return false;
      }
      if (!organizationName) {
        return true;
      }
      return normalize(data.primary_organization_name) === organizationName || true;
    });

    if (matched) {
      const person = matched.data();
      res.json({
        match_found: true,
        confidence: 0.86,
        person_id: person.id,
        organization_id: person.primary_organization_id || undefined,
        network_profile_url: `/people/${person.id}`,
      });
      return;
    }
  }

  res.json({ match_found: false, confidence: 0 });
});

export const resolveOrganization = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const context = await requireAuthOrApiKey(req, res);
  if (!context) return;

  const name = (req.body?.name || '').trim();
  const domain = normalize(req.body?.domain);
  if (!name && !domain) {
    res.status(400).json({ error: 'name or domain is required' });
    return;
  }

  if (name) {
    const byName = await db.collection('organizations').where('name', '==', name).limit(1).get();
    if (!byName.empty) {
      res.json({
        match_found: true,
        confidence: 0.97,
        organization_id: byName.docs[0].id,
      });
      return;
    }
  }

  if (domain) {
    const alias = await db.collection('organization_aliases').where('domain', '==', domain).limit(1).get();
    if (!alias.empty) {
      res.json({
        match_found: true,
        confidence: 0.83,
        organization_id: alias.docs[0].get('organization_id'),
      });
      return;
    }
  }

  res.json({ match_found: false, confidence: 0 });
});

export const createTestAccount = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireLocalOnlyEnvironment(res)) {
    return;
  }

  const email = normalize(req.body?.email);
  const password = req.body?.password || 'Password123!';
  const firstName = (req.body?.first_name || 'Local').trim();
  const lastName = (req.body?.last_name || 'User').trim();
  const systemRole = req.body?.system_role || 'entrepreneur';
  const organizationId = req.body?.organization_id || '';
  const ecosystemId = req.body?.ecosystem_id || '';

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const existing = await admin.auth().getUserByEmail(email).catch(() => null);
  const authUser = existing || await admin.auth().createUser({
    email,
    password,
    displayName: `${firstName} ${lastName}`.trim(),
  });

  const personRef = db.collection('people').doc(authUser.uid);
  const now = new Date().toISOString();
  await personRef.set({
    id: authUser.uid,
    auth_uid: authUser.uid,
    first_name: firstName,
    last_name: lastName,
    email,
    role: '',
    system_role: systemRole,
    organization_id: organizationId,
    primary_organization_id: organizationId, // legacy alias kept for backwards compat
    ecosystem_id: ecosystemId,
    status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  if (ecosystemId) {
    const membershipRef = db.collection('person_memberships').doc(`${authUser.uid}_${ecosystemId}_${organizationId || 'none'}`);
    await membershipRef.set({
      id: membershipRef.id,
      person_id: authUser.uid,
      ecosystem_id: ecosystemId,
      organization_id: organizationId,
      system_role: systemRole,
      status: 'active',
      joined_at: now,
    }, { merge: true });
  }

  res.json({
    ok: true,
    uid: authUser.uid,
    email,
    password,
  });
});

export const completeSelfSignup = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const ecosystemId = req.body?.ecosystem_id || '';
  if (!ecosystemId) {
    res.status(400).json({ error: 'ecosystem_id is required' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const authUser = await admin.auth().getUser(decoded.uid);
    const firstName = (req.body?.first_name || authUser.displayName?.split(' ')[0] || 'New').trim();
    const lastName = (req.body?.last_name || authUser.displayName?.split(' ').slice(1).join(' ') || 'User').trim();
    const email = normalize(authUser.email);
    const now = new Date().toISOString();

    if (!email) {
      res.status(400).json({ error: 'Authenticated account must have an email address' });
      return;
    }

    const existingPerson = await findExistingPersonByEmail(email);
    const personRef = existingPerson?.ref || db.collection('people').doc(decoded.uid);
    await personRef.set({
      id: personRef.id,
      auth_uid: decoded.uid,
      first_name: firstName,
      last_name: lastName,
      email,
      role: '',
      system_role: 'entrepreneur',
      primary_organization_id: '',
      ecosystem_id: ecosystemId,
      status: 'active',
      updated_at: now,
      created_at: now,
      signup_note: req.body?.note || null,
    }, { merge: true });

    const membershipRef = db.collection('person_memberships').doc(`${personRef.id}_${ecosystemId}_none`);
    await membershipRef.set({
      id: membershipRef.id,
      person_id: personRef.id,
      ecosystem_id: ecosystemId,
      organization_id: '',
      system_role: 'entrepreneur',
      status: 'active',
      joined_at: now,
    }, { merge: true });

    await logAudit('self_signup_completed', decoded.uid, {
      ecosystem_id: ecosystemId,
      role: 'entrepreneur',
    });

    res.json({ ok: true, person_id: personRef.id, ecosystem_id: ecosystemId });
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
});

export const bootstrapPlatformAdmin = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const configuredSecret = getRequiredEnv('BOOTSTRAP_PLATFORM_ADMIN_SECRET');
  if (!configuredSecret) {
    res.status(500).json({ error: 'Bootstrap secret is not configured' });
    return;
  }

  const providedSecret = getBootstrapSecret(req);
  if (!providedSecret || providedSecret !== configuredSecret) {
    res.status(401).json({ error: 'Invalid bootstrap secret' });
    return;
  }

  const email = normalize(req.body?.email);
  const password = req.body?.password || '';
  const firstName = (req.body?.first_name || 'Platform').trim();
  const lastName = (req.body?.last_name || 'Admin').trim();
  const ecosystemId = (req.body?.ecosystem_id || '').trim();
  const organizationId = (req.body?.organization_id || '').trim();

  if (!email || !password || !ecosystemId) {
    res.status(400).json({ error: 'email, password, and ecosystem_id are required' });
    return;
  }

  try {
    if (await hasPlatformAdmin()) {
      res.status(409).json({ error: 'A platform admin already exists. Bootstrap is disabled.' });
      return;
    }

    const existing = await admin.auth().getUserByEmail(email).catch(() => null);
    const authUser = existing || await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim(),
    });

    const now = new Date().toISOString();
    const personRef = db.collection('people').doc(authUser.uid);
    await personRef.set({
      id: authUser.uid,
      auth_uid: authUser.uid,
      first_name: firstName,
      last_name: lastName,
      email,
      role: '',
      system_role: 'platform_admin',
      primary_organization_id: organizationId,
      ecosystem_id: ecosystemId,
      status: 'active',
      created_at: now,
      updated_at: now,
    }, { merge: true });

    const membershipRef = db.collection('person_memberships').doc(`${authUser.uid}_${ecosystemId}_${organizationId || 'none'}`);
    await membershipRef.set({
      id: membershipRef.id,
      person_id: authUser.uid,
      ecosystem_id: ecosystemId,
      organization_id: organizationId,
      system_role: 'platform_admin',
      status: 'active',
      joined_at: now,
    }, { merge: true });

    await logAudit('platform_admin_bootstrapped', authUser.uid, {
      ecosystem_id: ecosystemId,
      organization_id: organizationId || null,
      email,
    });

    res.json({
      ok: true,
      uid: authUser.uid,
      email,
      ecosystem_id: ecosystemId,
      organization_id: organizationId || null,
      message: 'Initial platform admin created. Disable or rotate the bootstrap secret now.',
    });
  } catch (error: any) {
    console.error('bootstrapPlatformAdmin failed', error);
    res.status(500).json({ error: error?.message || 'Unable to bootstrap platform admin' });
  }
});

export const createInvite = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = normalize(req.body?.email);
  const invitedRole = req.body?.invited_role || 'entrepreneur';
  const organizationId = req.body?.organization_id || '';
  const requestedEcosystemId = req.body?.ecosystem_id || '';
  const note = req.body?.note || '';

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  let ecosystemId = '';
  if (organizationId) {
    try {
      const scope = await resolveInviteScope(organizationId, requestedEcosystemId || null);
      ecosystemId = scope.ecosystemId;
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Unable to resolve invite scope' });
      return;
    }
  } else {
    if (invitedRole !== 'entrepreneur') {
      res.status(400).json({ error: 'organization_id is required for ESO staff, coach, and admin invites' });
      return;
    }

    ecosystemId = requestedEcosystemId || '';
    if (!ecosystemId) {
      res.status(400).json({ error: 'ecosystem_id is required when inviting an entrepreneur without an organization' });
      return;
    }
  }

  const manager = await requireInviteManager(req, res, invitedRole, organizationId, ecosystemId);
  if (!manager) {
    return;
  }

  const token = generateInviteToken();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const inviteRef = db.collection('invites').doc();
  const inviterRole = manager.person.get('system_role') || 'entrepreneur';
  const tokenHash = hashInviteToken(token);

  await inviteRef.set({
    id: inviteRef.id,
    email,
    invited_role: invitedRole,
    organization_id: organizationId,
    ecosystem_id: ecosystemId,
    invited_by_person_id: manager.uid,
    invited_by_role: inviterRole,
    status: 'pending',
    note,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
    last_sent_at: now,
    token_hash: tokenHash,
    token_last4: token.slice(-4),
  });

  await logAudit('invite_created', manager.uid, {
    invite_id: inviteRef.id,
    email,
    invited_role: invitedRole,
    organization_id: organizationId,
    ecosystem_id: ecosystemId,
  });

  const inviteUrl = `${getAppBaseUrl()}?invite=${token}`;
  await db.collection('notice_queue').add({
    type: 'access_invite',
    status: 'queued',
    to_email: email,
    created_at: now,
    payload: {
      invite_id: inviteRef.id,
      invite_url: inviteUrl,
      invited_role: invitedRole,
      organization_id: organizationId,
      ecosystem_id: ecosystemId,
      note,
    },
  });

  res.json({ ok: true, invite_id: inviteRef.id, invite_url: inviteUrl });
});

export const listInvites = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const memberships = await getActiveMembershipsForPerson(decoded.uid);
    const person = await db.collection('people').doc(decoded.uid).get();
    if (!person.exists) {
      res.status(403).json({ error: 'No Nexus person record found' });
      return;
    }

    const sanitizeInvite = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => {
      const data = doc.data() as InviteRecord;
      return {
        id: data.id,
        email: data.email,
        invited_role: data.invited_role,
        organization_id: data.organization_id,
        ecosystem_id: data.ecosystem_id,
        invited_by_person_id: data.invited_by_person_id,
        invited_by_role: data.invited_by_role,
        status: data.status,
        note: data.note || '',
        created_at: data.created_at,
        updated_at: data.updated_at,
        expires_at: data.expires_at,
        last_sent_at: data.last_sent_at || null,
        accepted_at: data.accepted_at || null,
        accepted_by_auth_uid: data.accepted_by_auth_uid || null,
        revoked_at: data.revoked_at || null,
        revoked_by_person_id: data.revoked_by_person_id || null,
        token_last4: data.token_last4 || null,
      };
    };

    let invitesSnapshot;
    if (person.get('system_role') === 'platform_admin') {
      invitesSnapshot = await db.collection('invites').limit(50).get();
    } else {
      const scoped = memberships
        .filter((membership) => ['ecosystem_manager', 'eso_admin'].includes(membership.system_role))
        .map((membership) => ({ ecosystem_id: membership.ecosystem_id, organization_id: membership.organization_id }));

      const allInvites = await db.collection('invites').limit(100).get();
      const docs = allInvites.docs.filter((doc) => {
        const data = doc.data();
        return scoped.some((scope) =>
          data.ecosystem_id === scope.ecosystem_id &&
          (person.get('system_role') === 'ecosystem_manager' || data.organization_id === scope.organization_id)
        );
      });
      res.json({ invites: docs.map((doc) => sanitizeInvite(doc)) });
      return;
    }

    res.json({ invites: invitesSnapshot.docs.map((doc) => sanitizeInvite(doc)) });
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
});

export const getInviteSummary = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  const token = (req.method === 'POST' ? req.body?.token : req.query?.token) || '';
  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const inviteDoc = await findInviteByToken(token);
  if (!inviteDoc) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }

  const invite = inviteDoc.data() as InviteRecord;
  if (invite.status !== 'pending' || isExpired(invite.expires_at)) {
    res.status(410).json({ error: 'Invite is no longer valid' });
    return;
  }

  res.json({
    id: invite.id,
    email: invite.email,
    invited_role: invite.invited_role,
    organization_id: invite.organization_id,
    ecosystem_id: invite.ecosystem_id,
    status: invite.status,
    expires_at: invite.expires_at,
    note: invite.note || '',
  });
});

export const acceptInvite = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const inviteToken = req.body?.token || '';
  if (!inviteToken) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const authUser = await admin.auth().getUser(decoded.uid);
    const inviteDoc = await findInviteByToken(inviteToken);
    if (!inviteDoc) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    const invite = inviteDoc.data() as InviteRecord;
    const authEmail = normalize(authUser.email);
    if (!authEmail || authEmail !== invite.email) {
      res.status(403).json({ error: 'Authenticated email does not match invite email' });
      return;
    }
    if (invite.status !== 'pending' || isExpired(invite.expires_at)) {
      await inviteDoc.ref.set({ status: 'expired', updated_at: new Date().toISOString() }, { merge: true });
      res.status(410).json({ error: 'Invite is no longer valid' });
      return;
    }

    const now = new Date().toISOString();
    const firstName = authUser.displayName?.split(' ')[0] || 'New';
    const lastName = authUser.displayName?.split(' ').slice(1).join(' ') || 'User';
    const existingPerson = await findExistingPersonByEmail(authEmail);
    const personRef = existingPerson?.ref || db.collection('people').doc(decoded.uid);
    await personRef.set({
      id: personRef.id,
      auth_uid: decoded.uid,
      first_name: firstName,
      last_name: lastName,
      email: authEmail,
      role: '',
      system_role: invite.invited_role,
      primary_organization_id: invite.organization_id,
      ecosystem_id: invite.ecosystem_id,
      status: 'active',
      updated_at: now,
      created_at: now,
    }, { merge: true });

    const membershipRef = db.collection('person_memberships').doc(`${personRef.id}_${invite.ecosystem_id}_${invite.organization_id || 'none'}`);
    await membershipRef.set({
      id: membershipRef.id,
      person_id: personRef.id,
      ecosystem_id: invite.ecosystem_id,
      organization_id: invite.organization_id,
      system_role: invite.invited_role,
      status: 'active',
      joined_at: now,
      invited_by_person_id: invite.invited_by_person_id,
    }, { merge: true });

    await inviteDoc.ref.set({
      status: 'accepted',
      accepted_at: now,
      accepted_by_auth_uid: decoded.uid,
      updated_at: now,
    }, { merge: true });

    await logAudit('invite_accepted', decoded.uid, {
      invite_id: invite.id,
      invited_role: invite.invited_role,
      organization_id: invite.organization_id,
      ecosystem_id: invite.ecosystem_id,
    });

    res.json({ ok: true, invite_id: invite.id });
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
});

export const resendInvite = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const inviteId = req.body?.invite_id || '';
  if (!inviteId) {
    res.status(400).json({ error: 'invite_id is required' });
    return;
  }

  const inviteDoc = await db.collection('invites').doc(inviteId).get();
  if (!inviteDoc.exists) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  const invite = inviteDoc.data()!;

  const manager = await requireInviteManager(req, res, invite.invited_role, invite.organization_id, invite.ecosystem_id);
  if (!manager) {
    return;
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const nextToken = generateInviteToken();
  await inviteDoc.ref.set({
    status: 'pending',
    expires_at: expiresAt,
    last_sent_at: now,
    updated_at: now,
    token_hash: hashInviteToken(nextToken),
    token_last4: nextToken.slice(-4),
  }, { merge: true });

  const inviteUrl = `${getAppBaseUrl()}?invite=${nextToken}`;
  await db.collection('notice_queue').add({
    type: 'access_invite',
    status: 'queued',
    to_email: invite.email,
    created_at: now,
    payload: {
      invite_id: invite.id,
      invite_url: inviteUrl,
      invited_role: invite.invited_role,
      organization_id: invite.organization_id,
      ecosystem_id: invite.ecosystem_id,
      note: invite.note || '',
    },
  });

  await logAudit('invite_resent', manager.uid, { invite_id: invite.id });
  res.json({ ok: true, invite_url: inviteUrl });
});

export const revokeInvite = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const inviteId = req.body?.invite_id || '';
  if (!inviteId) {
    res.status(400).json({ error: 'invite_id is required' });
    return;
  }

  const inviteDoc = await db.collection('invites').doc(inviteId).get();
  if (!inviteDoc.exists) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  const invite = inviteDoc.data()!;

  const manager = await requireInviteManager(req, res, invite.invited_role, invite.organization_id, invite.ecosystem_id);
  if (!manager) {
    return;
  }

  const now = new Date().toISOString();
  await inviteDoc.ref.set({
    status: 'revoked',
    revoked_at: now,
    revoked_by_person_id: manager.uid,
    updated_at: now,
  }, { merge: true });

  await logAudit('invite_revoked', manager.uid, { invite_id: invite.id });
  res.json({ ok: true });
});

export const approveAccountRequest = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminContext = await requirePlatformAdmin(req, res);
  if (!adminContext) {
    return;
  }

  const requestId = req.body?.request_id;
  const approvedRole = req.body?.approved_role || 'entrepreneur';
  const organizationId = req.body?.organization_id || '';
  const ecosystemId = req.body?.ecosystem_id || '';
  if (!requestId) {
    res.status(400).json({ error: 'request_id is required' });
    return;
  }

  const requestRef = db.collection('account_requests').doc(requestId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) {
    res.status(404).json({ error: 'Account request not found' });
    return;
  }

  const request = requestDoc.data() || {};
  const now = new Date().toISOString();
  const personRef = db.collection('people').doc(requestId);
  await personRef.set({
    id: requestId,
    auth_uid: requestId,
    first_name: request.first_name || 'New',
    last_name: request.last_name || 'User',
    email: request.email,
    role: '',
    system_role: approvedRole,
    primary_organization_id: organizationId,
    ecosystem_id: ecosystemId,
    status: 'active',
    updated_at: now,
    created_at: request.created_at || now,
  }, { merge: true });

  if (ecosystemId) {
    const membershipRef = db.collection('person_memberships').doc(`${requestId}_${ecosystemId}_${organizationId || 'none'}`);
    await membershipRef.set({
      id: membershipRef.id,
      person_id: requestId,
      ecosystem_id: ecosystemId,
      organization_id: organizationId,
      system_role: approvedRole,
      status: 'active',
      joined_at: now,
    }, { merge: true });
  }

  await admin.auth().setCustomUserClaims(requestId, {
    nexus_role: approvedRole,
    nexus_org_id: organizationId,
    nexus_ecosystem_id: ecosystemId,
  }).catch(() => undefined);

  await requestRef.set({
    status: 'approved',
    reviewed_at: now,
    reviewed_by: adminContext.uid,
    approved_role: approvedRole,
    approved_organization_id: organizationId,
    approved_ecosystem_id: ecosystemId,
    updated_at: now,
  }, { merge: true });

  await logAudit('access_request_approved', adminContext.uid, {
    request_id: requestId,
    approved_role: approvedRole,
    organization_id: organizationId,
    ecosystem_id: ecosystemId,
  });

  res.json({ ok: true, request_id: requestId });
});

export const upsertParticipation = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ecosystemId = normalize(req.body?.ecosystem_id);
  const providerOrgId = normalize(req.body?.provider_org_id);
  const name = (req.body?.name || '').toString().trim();
  const participationType = normalize(req.body?.participation_type) || 'service';
  const recipientOrgId = normalize(req.body?.recipient_org_id);
  const recipientPersonId = normalize(req.body?.recipient_person_id);
  const startDate = (req.body?.start_date || '').toString().trim();
  const endDate = (req.body?.end_date || '').toString().trim();
  const status = normalize(req.body?.status) || 'active';
  const description = (req.body?.description || '').toString().trim();
  const requestedId = normalize(req.body?.id);

  if (!ecosystemId || !providerOrgId || !name || !startDate) {
    res.status(400).json({ error: 'ecosystem_id, provider_org_id, name, and start_date are required' });
    return;
  }

  if (!recipientOrgId && !recipientPersonId) {
    res.status(400).json({ error: 'recipient_org_id or recipient_person_id is required' });
    return;
  }

  if (!['program', 'application', 'membership', 'residency', 'rental', 'event', 'service'].includes(participationType)) {
    res.status(400).json({ error: 'Invalid participation_type' });
    return;
  }

  if (!['active', 'past', 'applied', 'waitlisted'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const providerOrg = await db.collection('organizations').doc(providerOrgId).get();
  if (!providerOrg.exists) {
    res.status(404).json({ error: 'Provider organization not found' });
    return;
  }

  const providerOrgEcosystemIds = (providerOrg.get('ecosystem_ids') || []) as string[];
  if (!providerOrgEcosystemIds.includes(ecosystemId)) {
    res.status(400).json({ error: 'Provider organization is not part of the requested ecosystem' });
    return;
  }

  const authContext = await requireParticipationManager(req, res, ecosystemId, providerOrgId);
  if (!authContext) {
    return;
  }

  const now = new Date().toISOString();
  const participationRef = requestedId
    ? db.collection('participations').doc(requestedId)
    : db.collection('participations').doc();

  const existing = requestedId ? await participationRef.get() : null;
  if (existing && existing.exists) {
    const existingProviderOrgId = normalize(existing.get('provider_org_id'));
    if (existingProviderOrgId !== providerOrgId) {
      res.status(403).json({ error: 'Existing participation belongs to a different provider organization' });
      return;
    }
  }

  const payload: ParticipationRecord = {
    id: participationRef.id,
    ecosystem_id: ecosystemId,
    name,
    provider_org_id: providerOrgId,
    participation_type: participationType as ParticipationRecord['participation_type'],
    recipient_org_id: recipientOrgId || undefined,
    recipient_person_id: recipientPersonId || undefined,
    start_date: startDate,
    end_date: endDate || undefined,
    status: status as ParticipationRecord['status'],
    description: description || undefined,
    source: authContext.type === 'api_key' ? 'external_sync' : 'api',
    created_at: existing?.exists ? (existing.get('created_at') || now) : now,
    updated_at: now,
    updated_by_uid: authContext.type === 'user' ? authContext.uid : undefined,
    updated_via_api_key_id: authContext.type === 'api_key' ? authContext.key_id : undefined,
  };

  await participationRef.set(payload, { merge: true });

  if (authContext.type === 'user') {
    await logAudit(existing?.exists ? 'participation_updated' : 'participation_created', authContext.uid, {
      participation_id: participationRef.id,
      ecosystem_id: ecosystemId,
      provider_org_id: providerOrgId,
      recipient_org_id: recipientOrgId || null,
      recipient_person_id: recipientPersonId || null,
      status,
      participation_type: participationType,
    });
  }

  res.json({
    ok: true,
    participation: sanitizeParticipation(await participationRef.get()),
  });
});

export const listParticipations = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ecosystemId = normalize(req.body?.ecosystem_id);
  const providerOrgId = normalize(req.body?.provider_org_id);
  const recipientOrgId = normalize(req.body?.recipient_org_id);
  const recipientPersonId = normalize(req.body?.recipient_person_id);

  if (!ecosystemId || !providerOrgId) {
    res.status(400).json({ error: 'ecosystem_id and provider_org_id are required' });
    return;
  }

  const authContext = await requireParticipationManager(req, res, ecosystemId, providerOrgId);
  if (!authContext) {
    return;
  }

  const snapshot = await db.collection('participations')
    .where('ecosystem_id', '==', ecosystemId)
    .where('provider_org_id', '==', providerOrgId)
    .get();

  let docs = snapshot.docs;
  if (recipientOrgId) {
    docs = docs.filter((doc) => normalize(doc.get('recipient_org_id')) === recipientOrgId);
  }
  if (recipientPersonId) {
    docs = docs.filter((doc) => normalize(doc.get('recipient_person_id')) === recipientPersonId);
  }

  docs.sort((left, right) => {
    const leftTime = new Date((left.get('start_date') || '') as string).getTime();
    const rightTime = new Date((right.get('start_date') || '') as string).getTime();
    return rightTime - leftTime;
  });

  res.json({
    participations: docs.map((doc) => sanitizeParticipation(doc)),
  });
});

export const sendReferralReminder = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) {
    return;
  }

  const referralId = normalize(req.body?.referral_id);
  const message = (req.body?.message || '').toString().trim();
  const mode = normalize(req.body?.mode) || 'reminder';

  if (!referralId) {
    res.status(400).json({ error: 'referral_id is required' });
    return;
  }

  const referralDoc = await db.collection('referrals').doc(referralId).get();
  if (!referralDoc.exists) {
    res.status(404).json({ error: 'Referral not found' });
    return;
  }

  const referral = referralDoc.data() || {};
  const referralEcosystemId = normalize(referral.ecosystem_id);
  const referringOrgId = normalize(referral.referring_org_id);
  const receivingOrgId = normalize(referral.receiving_org_id);

  const isPlatformAdmin = auth.memberships.some((membership) => membership.system_role === 'platform_admin');
  const isSenderScoped = auth.memberships.some((membership) =>
    membership.organization_id === referringOrgId &&
    membership.ecosystem_id === referralEcosystemId
  );

  if (!isPlatformAdmin && !isSenderScoped) {
    res.status(403).json({ error: 'Only the referring organization can send reminders for this referral' });
    return;
  }

  const receivingOrgDoc = receivingOrgId ? await db.collection('organizations').doc(receivingOrgId).get() : null;
  const recipientEmail = normalize(receivingOrgDoc?.get('email'));
  if (!recipientEmail) {
    res.status(400).json({ error: 'Receiving organization does not have an email configured' });
    return;
  }

  const referringOrgDoc = referringOrgId ? await db.collection('organizations').doc(referringOrgId).get() : null;
  const subjectPersonDoc = referral.subject_person_id ? await db.collection('people').doc(referral.subject_person_id).get() : null;
  const subjectPersonName = subjectPersonDoc?.exists
    ? `${subjectPersonDoc.get('first_name') || ''} ${subjectPersonDoc.get('last_name') || ''}`.trim()
    : 'this referral';
  const referralLabel = subjectPersonName || 'this referral';
  const senderName = `${auth.person.get('first_name') || ''} ${auth.person.get('last_name') || ''}`.trim() || 'A colleague';
  const senderOrgName = referringOrgDoc?.get('name') || 'a partner organization';
  const receivingOrgName = receivingOrgDoc?.get('name') || 'your organization';
  const manageUrl = getReferralManageUrl(referralEcosystemId);

  const noticeType = mode === 'follow_up' ? 'referral_sender_follow_up' : 'referral_sender_reminder';
  const payload = {
    referral_id: referralId,
    receiving_org_name: receivingOrgName,
    referring_org_name: senderOrgName,
    subject_label: referralLabel,
    manage_url: manageUrl,
    sender_name: senderName,
    custom_message: message,
  };

  const sendResult = await sendPostmarkEmail({
    id: `adhoc_${noticeType}_${Date.now()}`,
    type: noticeType,
    to_email: recipientEmail,
    payload,
  });

  await logAudit(mode === 'follow_up' ? 'referral_follow_up_sent' : 'referral_reminder_sent', auth.uid, {
    referral_id: referralId,
    to_email: recipientEmail,
    receiving_org_id: receivingOrgId,
    provider_message_id: sendResult?.MessageID || null,
  });

  res.json({
    ok: true,
    to_email: recipientEmail,
    provider_message_id: sendResult?.MessageID || null,
  });
});

export const sendReferralDecisionEmail = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireUserAuth(req, res);
  if (!auth) {
    return;
  }

  const referralId = normalize(req.body?.referral_id);
  const decision = normalize(req.body?.decision) === 'declined' ? 'declined' : 'accepted';
  const note = (req.body?.note || '').toString().trim();
  const template = normalize(req.body?.template) || 'schedule_link';
  const actionLink = (req.body?.action_link || '').toString().trim();
  const message = (req.body?.message || '').toString().trim();
  const customSubject = (req.body?.custom_subject || '').toString().trim();

  if (!referralId) {
    res.status(400).json({ error: 'referral_id is required' });
    return;
  }

  const referralDoc = await db.collection('referrals').doc(referralId).get();
  if (!referralDoc.exists) {
    res.status(404).json({ error: 'Referral not found' });
    return;
  }

  const referral = referralDoc.data() || {};
  const referralEcosystemId = normalize(referral.ecosystem_id);
  const receivingOrgId = normalize(referral.receiving_org_id);
  const referringOrgId = normalize(referral.referring_org_id);

  const isPlatformAdmin = auth.memberships.some((membership) => membership.system_role === 'platform_admin');
  const isReceiverScoped = auth.memberships.some((membership) =>
    membership.organization_id === receivingOrgId &&
    membership.ecosystem_id === referralEcosystemId
  );

  if (!isPlatformAdmin && !isReceiverScoped) {
    res.status(403).json({ error: 'Only the receiving organization can send referral decision emails' });
    return;
  }

  const [receivingOrgDoc, referringOrgDoc, subjectPersonDoc, ecosystemDoc] = await Promise.all([
    receivingOrgId ? db.collection('organizations').doc(receivingOrgId).get() : Promise.resolve(null),
    referringOrgId ? db.collection('organizations').doc(referringOrgId).get() : Promise.resolve(null),
    referral.subject_person_id ? db.collection('people').doc(referral.subject_person_id).get() : Promise.resolve(null),
    referralEcosystemId ? db.collection('ecosystems').doc(referralEcosystemId).get() : Promise.resolve(null),
  ]);

  const notifyEntrepreneurs = !!(ecosystemDoc?.get('settings.feature_flags.notify_entrepreneurs'));

  const entrepreneurEmail = normalize(subjectPersonDoc?.get('email'));
  const introducerEmail = normalize(referringOrgDoc?.get('email'));
  const receivingOrgName = receivingOrgDoc?.get('name') || 'The receiving organization';
  const referringOrgName = referringOrgDoc?.get('name') || 'The introducing organization';
  const subjectLabel = subjectPersonDoc?.exists
    ? `${subjectPersonDoc.get('first_name') || ''} ${subjectPersonDoc.get('last_name') || ''}`.trim() || 'this referral'
    : 'this referral';
  const manageUrl = getReferralManageUrl(referralEcosystemId);

  const subjectFirstName = subjectPersonDoc?.exists
    ? (subjectPersonDoc.get('first_name') || '').toString().trim() || subjectLabel
    : subjectLabel;

  const applyTokens = (text: string) =>
    text
      .replace(/\{\{first_name\}\}/g, subjectFirstName)
      .replace(/\{\{subject_name\}\}/g, subjectLabel)
      .replace(/\{\{receiving_org\}\}/g, receivingOrgName)
      .replace(/\{\{referring_org\}\}/g, referringOrgName);

  let actionMessage = '';
  if (decision === 'accepted') {
    if (template === 'custom') {
      actionMessage = applyTokens(message);
    } else if (template === 'book_tour' && actionLink) {
      actionMessage = `Please use this link to schedule a tour: ${actionLink}`;
    } else if (actionLink) {
      actionMessage = `Please use this link to schedule time with us: ${actionLink}`;
    } else if (message) {
      actionMessage = applyTokens(message);
    }
  }

  const recipients = [
    (notifyEntrepreneurs && entrepreneurEmail) ? { to_email: entrepreneurEmail, recipient_kind: 'entrepreneur' } : null,
    introducerEmail ? { to_email: introducerEmail, recipient_kind: 'introducer' } : null,
  ].filter(Boolean) as Array<{ to_email: string; recipient_kind: 'entrepreneur' | 'introducer' }>;

  if (!recipients.length) {
    res.status(400).json({ error: 'No introducer email is available for this referral' });
    return;
  }

  const results = await Promise.all(recipients.map(async (recipient) => {
    const sendResult = await sendPostmarkEmail({
      id: `adhoc_referral_decision_${Date.now()}_${recipient.recipient_kind}`,
      type: 'referral_decision_update',
      to_email: recipient.to_email,
      payload: {
        decision,
        recipient_kind: recipient.recipient_kind,
        receiving_org_name: receivingOrgName,
        referring_org_name: referringOrgName,
        subject_label: subjectLabel,
        shared_note: note,
        action_message: actionMessage,
        custom_subject: customSubject || null,
        manage_url: manageUrl,
        ecosystem_id: referralEcosystemId,
      },
    });

    return {
      to_email: recipient.to_email,
      recipient_kind: recipient.recipient_kind,
      provider_message_id: sendResult?.MessageID || null,
    };
  }));

  await logAudit(decision === 'accepted' ? 'referral_acceptance_email_sent' : 'referral_decline_email_sent', auth.uid, {
    referral_id: referralId,
    results,
  });

  res.json({ ok: true, results });
});

export const pushInteraction = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const context = await requireAuthOrApiKey(req, res);
  if (!context) return;

  const {
    ecosystem_id,
    organization_id,
    person_id,
    date,
    type,
    notes,
    recorded_by,
    attendees
  } = req.body;

  if (!ecosystem_id || !organization_id || !notes) {
    res.status(400).json({ error: 'ecosystem_id, organization_id, and notes are required' });
    return;
  }

  const interactionRef = db.collection('interactions').doc();
  const now = new Date().toISOString();
  
  const apiKeyContext: Extract<AuthContext, { type: 'api_key' }> | null = context.type === 'api_key'
    ? context as Extract<AuthContext, { type: 'api_key' }>
    : null;

  const interaction = {
    id: interactionRef.id,
    ecosystem_id,
    organization_id,
    person_id: person_id || null,
    date: date || now.split('T')[0],
    type: type || 'other',
    notes,
    recorded_by: recorded_by || (apiKeyContext?.label || 'System'),
    attendees: attendees || [],
    author_org_id: apiKeyContext?.organization_id || (req.body.author_org_id || null),
    visibility: 'network_shared',
    note_confidential: false,
    created_at: now,
    source: context.type === 'api_key' ? 'api' : 'manual'
  };

  await interactionRef.set(interaction);

  const actorId: string = context.type === 'user'
    ? (context.uid || 'unknown_user')
    : (apiKeyContext?.organization_id || 'unknown_api_key_org');

  await logAudit('interaction_pushed', actorId, {
    interaction_id: interactionRef.id,
    ecosystem_id,
    organization_id,
    source: context.type
  });

  res.json({ ok: true, interaction_id: interactionRef.id });
});

export const rejectAccountRequest = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminContext = await requirePlatformAdmin(req, res);
  if (!adminContext) {
    return;
  }

  const requestId = req.body?.request_id;
  const reason = req.body?.reason || '';
  if (!requestId) {
    res.status(400).json({ error: 'request_id is required' });
    return;
  }

  const requestRef = db.collection('account_requests').doc(requestId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) {
    res.status(404).json({ error: 'Account request not found' });
    return;
  }

  const now = new Date().toISOString();
  await requestRef.set({
    status: 'rejected',
    rejection_reason: reason,
    reviewed_at: now,
    reviewed_by: adminContext.uid,
    updated_at: now,
  }, { merge: true });

  await logAudit('access_request_rejected', adminContext.uid, {
    request_id: requestId,
    reason,
  });

  res.json({ ok: true, request_id: requestId });
});

export const seedLocalReferenceData = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireLocalOnlyEnvironment(res)) {
    return;
  }

  const now = new Date().toISOString();

  await db.collection('ecosystems').doc('eco_new_haven').set({
    id: 'eco_new_haven',
    name: 'New Haven Entrepreneurship Network',
    region: 'New Haven, CT',
    settings: {
      interaction_privacy_default: 'restricted',
    },
    pipelines: [],
  }, { merge: true });

  await db.collection('organizations').doc('org_makehaven').set({
    id: 'org_makehaven',
    name: 'MakeHaven',
    description: 'Local seed ESO organization.',
    tax_status: 'non_profit',
    roles: ['eso'],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    version: 1,
    status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await db.collection('organizations').doc('org_sbdc').set({
    id: 'org_sbdc',
    name: 'SBDC',
    description: 'Local seed receiving organization.',
    email: 'advisor@sbdc.org',
    tax_status: 'government',
    roles: ['eso'],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    version: 1,
    status: 'active',
    // suppress_entrepreneur_intro: false means Nexus WILL send the intro to the entrepreneur.
    // Set to true if SBDC manages their own communications with referred clients.
    referral_intake_prefs: {
      suppress_entrepreneur_intro: false,
      intake_contact_email: 'advisor@sbdc.org',
    },
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await db.collection('organizations').doc('org_ct_innovations').set({
    id: 'org_ct_innovations',
    name: 'CT Innovations',
    description: 'Local seed partner ESO organization.',
    tax_status: 'non_profit',
    roles: ['eso'],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    version: 1,
    status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await db.collection('organizations').doc('org_darkstar').set({
    id: 'org_darkstar',
    name: 'DarkStar Marine',
    description: 'Local seed founder venture.',
    email: 'founder@darkstarmarine.com',
    url: 'https://darkstarmarine.com',
    tax_status: 'for_profit',
    roles: ['startup'],
    demographics: {
      minority_owned: false,
      woman_owned: false,
      veteran_owned: false,
    },
    classification: {
      industry_tags: ['marine', 'manufacturing'],
    },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'restricted',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    version: 1,
    status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await db.collection('organizations').doc('org_progressable').set({
    id: 'org_progressable',
    name: 'Progressable',
    description: 'Test entrepreneur venture for invite flow testing.',
    email: 'jane.smith@progressable.io',
    url: 'https://progressable.io',
    tax_status: 'for_profit',
    roles: ['startup'],
    demographics: {
      minority_owned: false,
      woman_owned: false,
      veteran_owned: false,
    },
    classification: {
      naics_code: '541511',
      industry_tags: ['Information & Technology'],
    },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'restricted',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    version: 1,
    status: 'active',
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await db.collection('organization_aliases').doc('alias_sbdc').set({
    id: 'alias_sbdc',
    organization_id: 'org_sbdc',
    canonical_name: 'SBDC',
    alias: 'SBDC',
    domain: 'sbdc.org',
    ecosystem_id: 'eco_new_haven',
  }, { merge: true });

  await db.collection('authorized_sender_domains').doc('auth_domain_makehaven').set({
    id: 'auth_domain_makehaven',
    ecosystem_id: 'eco_new_haven',
    organization_id: 'org_makehaven',
    domain: 'makehaven.org',
    is_active: true,
    access_policy: 'approved',
    allow_sender_affiliation: true,
    allow_auto_acknowledgement: true,
    allow_invite_prompt: true,
  }, { merge: true });

  await db.collection('authorized_sender_domains').doc('auth_domain_ctinnovations').set({
    id: 'auth_domain_ctinnovations',
    ecosystem_id: 'eco_new_haven',
    organization_id: 'org_ct_innovations',
    domain: 'ctinnovations.org',
    is_active: true,
    access_policy: 'approved',
    allow_sender_affiliation: true,
    allow_auto_acknowledgement: true,
    allow_invite_prompt: true,
  }, { merge: true });

  await db.collection('inbound_routes').doc('route_newhaven_intro').set({
    id: 'route_newhaven_intro',
    route_address: 'newhaven+introduction@inbound.example.org',
    ecosystem_id: 'eco_new_haven',
    activity_type: 'introduction',
    allowed_sender_domains: ['makehaven.org', 'ctinnovations.org'],
    is_active: true,
  }, { merge: true });

  res.json({ ok: true });
});

export const processInboundEmail = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireLocalOnlyEnvironment(res)) {
    return;
  }

  const payload = req.body as InboundEmailPayload;
  const result = await processInboundEmailPayload(payload);
  res.json(result);
});

export const postmarkInboundWebhook = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const configuredSecret = getRequiredEnv('POSTMARK_INBOUND_WEBHOOK_SECRET');
  if (!configuredSecret) {
    res.status(500).json({ error: 'Postmark inbound secret is not configured' });
    return;
  }

  const providedSecret = (req.query.secret || req.get('x-postmark-webhook-secret') || '').toString().trim();
  if (!providedSecret || providedSecret !== configuredSecret) {
    res.status(401).json({ error: 'Invalid Postmark webhook secret' });
    return;
  }

  const payload = req.body as PostmarkInboundPayload;
  const internalPayload = mapPostmarkInboundToInternal(payload);

  const allowedRecipients = parseCsvEnv('POSTMARK_INBOUND_ALLOWED_RECIPIENTS');
  if (allowedRecipients.length > 0) {
    const routeAddress = normalize(internalPayload.route_address);
    if (!routeAddress || !allowedRecipients.includes(routeAddress)) {
      res.status(403).json({ error: 'Recipient address is not allowlisted' });
      return;
    }
  }

  const result = await processInboundEmailPayload(internalPayload);
  res.json(result);
});

export const sendQueuedNotices = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const adminContext = await requirePlatformAdmin(req, res);
  if (!adminContext) {
    return;
  }

  const noticeId = req.body?.notice_id || null;
  const limit = Math.max(1, Math.min(parseInt(req.body?.limit || '10', 10), 25));

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (noticeId) {
    const doc = await db.collection('notice_queue').doc(noticeId).get();
    if (doc.exists) {
      docs = [doc as FirebaseFirestore.QueryDocumentSnapshot];
    }
  } else {
    const snapshot = await db.collection('notice_queue').where('status', '==', 'queued').limit(limit).get();
    docs = snapshot.docs;
  }

  const results: Array<{ notice_id: string; status: 'sent' | 'failed'; error?: string }> = [];
  for (const doc of docs) {
    const notice = doc.data();
    try {
      const sendResult = await sendPostmarkEmail(notice);
      await doc.ref.set({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider: 'postmark',
        provider_message_id: (sendResult as PostmarkSendResponse | null)?.MessageID || null,
        last_error: null,
      }, { merge: true });
      results.push({ notice_id: doc.id, status: 'sent' });
    } catch (error: any) {
      await doc.ref.set({
        status: 'failed',
        failed_at: new Date().toISOString(),
        last_error: error?.message || 'Postmark send failed',
      }, { merge: true });
      results.push({ notice_id: doc.id, status: 'failed', error: error?.message || 'Postmark send failed' });
    }
  }

  res.json({
    ok: true,
    processed: results.length,
    results,
    requested_by: adminContext.uid,
  });
});

export const previewQueuedNotices = onRequest({ invoker: 'public' }, async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }
  setCors(res);

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!requireLocalOnlyEnvironment(res)) {
    return;
  }

  const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
  const snapshot = await db.collection('notice_queue')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  res.json({
    ok: true,
    count: snapshot.size,
    notices: snapshot.docs.map((doc) => {
      const notice = doc.data();
      return {
        id: doc.id,
        type: notice.type || 'unknown',
        status: notice.status || 'unknown',
        to_email: notice.to_email || null,
        created_at: notice.created_at || null,
        payload: notice.payload || {},
        rendered: renderNoticeContent(notice),
      };
    }),
  });
});
