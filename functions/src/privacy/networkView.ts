/**
 * getNetworkView — the redacting read path.
 *
 * Signed-in users read other organizations' records through this function,
 * never directly: Firestore rules only let an organization read the records
 * it wrote itself (see firestore.rules). The function loads one network's
 * data with the Admin SDK and returns exactly what the compact lets the
 * caller see, via the shared policy in ./policy.ts.
 *
 * POST { ecosystem_id, acting_org_id? } with a Firebase ID token.
 */
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import {
  buildNetworkView,
  type NetworkData,
  type Viewer,
  type ViewerRole,
  type PolicyConsentGrant,
} from './policy';
import { getOrgSignatureStatus } from '../agreements/orgSignatures';

const VIEWER_ROLES: ViewerRole[] = ['platform_admin', 'ecosystem_manager', 'eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur'];

const setCors = (res: any) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
};

const bearer = (req: any): string | null => {
  const header = req.get('authorization') || req.get('Authorization');
  return header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};

type Doc = Record<string, any> & { id: string };
const docs = (snap: admin.firestore.QuerySnapshot): Doc[] =>
  snap.docs.map((d) => ({ ...d.data(), id: d.id }));

const unionById = (...lists: Doc[][]): Doc[] => {
  const byId = new Map<string, Doc>();
  lists.flat().forEach((d) => byId.set(d.id, d));
  return Array.from(byId.values());
};

/**
 * Resolve who is asking and in what capacity, from the server's own records.
 * The client may name which of its organizations it is acting for, but only
 * among organizations it actually holds a membership in.
 */
export const resolveViewer = async (
  db: admin.firestore.Firestore,
  uid: string,
  ecosystemId: string,
  requestedOrgId?: string | null,
): Promise<Viewer | null> => {
  const personSnap = await db.collection('people').doc(uid).get();
  if (!personSnap.exists) return null;
  const person = personSnap.data() || {};
  const globalRole = person.system_role as ViewerRole;

  const membershipSnap = await db.collection('person_memberships').where('person_id', '==', uid).get();
  const memberships = membershipSnap.docs
    .map((d) => d.data())
    .filter((m) => m.ecosystem_id === ecosystemId && (m.status || 'active') === 'active');

  const ecosystemIds: string[] = Array.isArray(person.ecosystem_ids)
    ? person.ecosystem_ids
    : [person.ecosystem_id].filter(Boolean);
  const isMember = globalRole === 'platform_admin' || memberships.length > 0 || ecosystemIds.includes(ecosystemId);
  if (!isMember) return null;

  const primaryOrg = person.organization_id || person.primary_organization_id || null;
  const allowedOrgs = new Set<string>([
    ...memberships.map((m) => m.organization_id).filter((id: string) => id && id !== 'none'),
    ...(primaryOrg ? [primaryOrg] : []),
  ]);
  const orgId = requestedOrgId && allowedOrgs.has(requestedOrgId)
    ? requestedOrgId
    : (memberships.find((m) => m.organization_id && m.organization_id !== 'none')?.organization_id || primaryOrg);

  const membershipRole = memberships.find((m) => m.organization_id === orgId)?.system_role as ViewerRole | undefined;
  const role = (globalRole === 'platform_admin' ? 'platform_admin' : (membershipRole || globalRole)) as ViewerRole;
  if (!VIEWER_ROLES.includes(role)) return null;

  const isStaff = ['eso_admin', 'eso_staff', 'eso_coach'].includes(role);
  const orgHasSigned = isStaff && orgId
    ? (await getOrgSignatureStatus(db, orgId, ecosystemId)).signed
    : true;

  return { personId: uid, orgId: orgId || null, role, ecosystemId, orgHasSigned };
};

/** Load everything the policy needs for one network. */
export const loadNetworkData = async (db: admin.firestore.Firestore, ecosystemId: string): Promise<NetworkData> => {
  const [
    peopleByIds, peopleByLegacy, orgs, interactions, participations, referrals, grants, profiles, sharers,
  ] = await Promise.all([
    db.collection('people').where('ecosystem_ids', 'array-contains', ecosystemId).get(),
    db.collection('people').where('ecosystem_id', '==', ecosystemId).get(),
    db.collection('organizations').where('ecosystem_ids', 'array-contains', ecosystemId).get(),
    db.collection('interactions').where('ecosystem_id', '==', ecosystemId).get(),
    db.collection('participations').where('ecosystem_id', '==', ecosystemId).get(),
    db.collection('referrals').where('ecosystem_id', '==', ecosystemId).get(),
    db.collection('consent_policies').where('is_active', '==', true).get(),
    db.collection('network_profiles').where('directory_listed_ecosystems', 'array-contains', ecosystemId).get(),
    db.collection('network_profiles').where('detail_sharing_ecosystems', 'array-contains', ecosystemId).get(),
  ]);

  const consentGrants: PolicyConsentGrant[] = grants.docs.map((d) => {
    const g = d.data();
    return {
      resource_id: g.resource_id,
      viewer_id: g.viewer_id,
      is_active: g.is_active === true,
      ecosystem_id: g.ecosystem_id || null,
    };
  });

  return {
    people: unionById(docs(peopleByIds), docs(peopleByLegacy))
      .filter((p) => p.status !== 'revoked' && !p.merged_into)
      // organization_id is canonical; older person docs only carry the legacy alias.
      .map((p) => ({ ...p, organization_id: p.organization_id || p.primary_organization_id || '' })) as NetworkData['people'],
    organizations: docs(orgs).filter((o) => o.status !== 'archived' && !o.merged_into) as NetworkData['organizations'],
    interactions: docs(interactions) as NetworkData['interactions'],
    participations: docs(participations) as NetworkData['participations'],
    referrals: docs(referrals) as NetworkData['referrals'],
    consentGrants,
    directoryListedPersonIds: profiles.docs.map((d) => d.get('person_id') || d.id),
    detailSharingPersonIds: sharers.docs.map((d) => d.get('person_id') || d.id),
  };
};

export const getNetworkView = onRequest({ invoker: 'public' }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const token = bearer(req);
  if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }

  let uid: string;
  try {
    uid = (await admin.auth().verifyIdToken(token)).uid;
  } catch {
    res.status(401).json({ error: 'Invalid authentication token' });
    return;
  }

  const ecosystemId = typeof req.body?.ecosystem_id === 'string' ? req.body.ecosystem_id.trim() : '';
  if (!ecosystemId) { res.status(400).json({ error: 'ecosystem_id is required' }); return; }

  const db = admin.firestore();
  const viewer = await resolveViewer(db, uid, ecosystemId, req.body?.acting_org_id || null);
  if (!viewer) { res.status(403).json({ error: 'You are not a member of this network' }); return; }

  const data = await loadNetworkData(db, ecosystemId);
  const view = buildNetworkView(viewer, data);
  res.json({
    ok: true,
    viewer: { role: viewer.role, org_id: viewer.orgId, ecosystem_id: viewer.ecosystemId, org_has_signed: viewer.orgHasSigned !== false },
    ...view,
  });
});
