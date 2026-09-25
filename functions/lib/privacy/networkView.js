"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNetworkStats = exports.getNetworkView = exports.loadNetworkData = exports.resolveViewer = void 0;
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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const policy_1 = require("./policy");
const orgSignatures_1 = require("../agreements/orgSignatures");
const networkStats_1 = require("../metrics/networkStats");
const VIEWER_ROLES = ['platform_admin', 'ecosystem_manager', 'eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur'];
const setCors = (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
};
const bearer = (req) => {
    const header = req.get('authorization') || req.get('Authorization');
    return header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
};
const docs = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));
const unionById = (...lists) => {
    const byId = new Map();
    lists.flat().forEach((d) => byId.set(d.id, d));
    return Array.from(byId.values());
};
/**
 * Resolve who is asking and in what capacity, from the server's own records.
 * The client may name which of its organizations it is acting for, but only
 * among organizations it actually holds a membership in.
 */
const resolveViewer = async (db, uid, ecosystemId, requestedOrgId) => {
    const personSnap = await db.collection('people').doc(uid).get();
    if (!personSnap.exists)
        return null;
    const person = personSnap.data() || {};
    const globalRole = person.system_role;
    const membershipSnap = await db.collection('person_memberships').where('person_id', '==', uid).get();
    const memberships = membershipSnap.docs
        .map((d) => d.data())
        .filter((m) => m.ecosystem_id === ecosystemId && (m.status || 'active') === 'active');
    const ecosystemIds = Array.isArray(person.ecosystem_ids)
        ? person.ecosystem_ids
        : [person.ecosystem_id].filter(Boolean);
    const isMember = globalRole === 'platform_admin' || memberships.length > 0 || ecosystemIds.includes(ecosystemId);
    if (!isMember)
        return null;
    const primaryOrg = person.organization_id || person.primary_organization_id || null;
    const allowedOrgs = new Set([
        ...memberships.map((m) => m.organization_id).filter((id) => id && id !== 'none'),
        ...(primaryOrg ? [primaryOrg] : []),
    ]);
    const orgId = requestedOrgId && allowedOrgs.has(requestedOrgId)
        ? requestedOrgId
        : (memberships.find((m) => m.organization_id && m.organization_id !== 'none')?.organization_id || primaryOrg);
    const membershipRole = memberships.find((m) => m.organization_id === orgId)?.system_role;
    const role = (globalRole === 'platform_admin' ? 'platform_admin' : (membershipRole || globalRole));
    if (!VIEWER_ROLES.includes(role))
        return null;
    const isStaff = ['eso_admin', 'eso_staff', 'eso_coach'].includes(role);
    const orgHasSigned = isStaff && orgId
        ? (await (0, orgSignatures_1.getOrgSignatureStatus)(db, orgId, ecosystemId)).signed
        : true;
    return { personId: uid, orgId: orgId || null, role, ecosystemId, orgHasSigned };
};
exports.resolveViewer = resolveViewer;
/** Load everything the policy needs for one network. */
const loadNetworkData = async (db, ecosystemId) => {
    const [peopleByIds, peopleByLegacy, orgs, interactions, participations, referrals, grants, profiles, sharers,] = await Promise.all([
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
    const consentGrants = grants.docs.map((d) => {
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
            .map((p) => ({ ...p, organization_id: p.organization_id || p.primary_organization_id || '' })),
        organizations: docs(orgs).filter((o) => o.status !== 'archived' && !o.merged_into),
        interactions: docs(interactions),
        participations: docs(participations),
        referrals: docs(referrals),
        consentGrants,
        directoryListedPersonIds: profiles.docs.map((d) => d.get('person_id') || d.id),
        detailSharingPersonIds: sharers.docs.map((d) => d.get('person_id') || d.id),
    };
};
exports.loadNetworkData = loadNetworkData;
exports.getNetworkView = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const token = bearer(req);
    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    let uid;
    try {
        uid = (await admin.auth().verifyIdToken(token)).uid;
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
    }
    const ecosystemId = typeof req.body?.ecosystem_id === 'string' ? req.body.ecosystem_id.trim() : '';
    if (!ecosystemId) {
        res.status(400).json({ error: 'ecosystem_id is required' });
        return;
    }
    const db = admin.firestore();
    const viewer = await (0, exports.resolveViewer)(db, uid, ecosystemId, req.body?.acting_org_id || null);
    if (!viewer) {
        res.status(403).json({ error: 'You are not a member of this network' });
        return;
    }
    const data = await (0, exports.loadNetworkData)(db, ecosystemId);
    const view = (0, policy_1.buildNetworkView)(viewer, data);
    res.json({
        ok: true,
        viewer: { role: viewer.role, org_id: viewer.orgId, ecosystem_id: viewer.ecosystemId, org_has_signed: viewer.orgHasSigned !== false },
        ...view,
    });
});
/**
 * getNetworkStats — anonymous aggregate statistics for one network.
 *
 * POST { ecosystem_id, from?, to? } with a Firebase ID token. For partner
 * staff whose organization has signed the agreements, and network operators.
 * Computed over every partner's records; only counts are returned
 * (functions/src/metrics/networkStats.ts).
 */
exports.getNetworkStats = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const token = bearer(req);
    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    let uid;
    try {
        uid = (await admin.auth().verifyIdToken(token)).uid;
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
    }
    const ecosystemId = typeof req.body?.ecosystem_id === 'string' ? req.body.ecosystem_id.trim() : '';
    if (!ecosystemId) {
        res.status(400).json({ error: 'ecosystem_id is required' });
        return;
    }
    const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const window = {
        ...(isDate(req.body?.from) ? { from: req.body.from } : {}),
        ...(isDate(req.body?.to) ? { to: req.body.to } : {}),
    };
    const db = admin.firestore();
    const viewer = await (0, exports.resolveViewer)(db, uid, ecosystemId, req.body?.acting_org_id || null);
    if (!viewer || viewer.role === 'entrepreneur') {
        res.status(403).json({ error: 'Network statistics are available to partner staff and network operators' });
        return;
    }
    if (viewer.orgHasSigned === false) {
        res.status(403).json({ error: 'Your organization sees network statistics once it has signed the network agreements', reason: 'agreements_unsigned' });
        return;
    }
    const data = await (0, exports.loadNetworkData)(db, ecosystemId);
    res.json({ ok: true, stats: (0, networkStats_1.computeNetworkStats)(data, window) });
});
