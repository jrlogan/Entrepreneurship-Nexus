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
exports.sendQueuedNotices = exports.postmarkInboundWebhook = exports.processInboundEmail = exports.seedLocalReferenceData = exports.rejectAccountRequest = exports.pushInteraction = exports.approveAccountRequest = exports.revokeInvite = exports.resendInvite = exports.acceptInvite = exports.getInviteSummary = exports.listInvites = exports.createInvite = exports.bootstrapPlatformAdmin = exports.completeSelfSignup = exports.createTestAccount = exports.resolveOrganization = exports.resolvePerson = void 0;
const crypto_1 = require("crypto");
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
admin.initializeApp();
const db = admin.firestore();
const setCors = (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
};
const getRequiredEnv = (key) => {
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
        const parsed = JSON.parse(firebaseConfig);
        return parsed.projectId || parsed.project_id || '';
    }
    catch {
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
const requireLocalOnlyEnvironment = (res) => {
    if (isLocalOnlyEnvironment()) {
        return true;
    }
    res.status(403).json({ error: 'This endpoint is only available in local or explicitly enabled environments' });
    return false;
};
const getAppBaseUrl = () => getRequiredEnv('APP_BASE_URL') || 'http://localhost:3000';
const parseCsvEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
};
const hasPlatformAdmin = async () => {
    const snapshot = await db.collection('people')
        .where('system_role', '==', 'platform_admin')
        .limit(1)
        .get();
    return !snapshot.empty;
};
const getBootstrapSecret = (req) => {
    const fromHeader = req.get('x-bootstrap-secret') || req.get('X-Bootstrap-Secret');
    const fromBody = req.body?.secret;
    return (fromHeader || fromBody || '').toString().trim();
};
const getBearerToken = (req) => {
    const header = req.get('authorization') || req.get('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
        return null;
    }
    return header.slice('Bearer '.length).trim();
};
const validateApiKey = async (apiKey) => {
    if (!apiKey)
        return null;
    // In a real system, we might use a hash or a separate collection for performance.
    // For the MVP, we scan organizations for the matching key prefix.
    // Note: This is simplified. Proper implementation should use a hashed lookup.
    const snapshot = await db.collection('organizations').get();
    for (const doc of snapshot.docs) {
        const apiKeys = (doc.get('api_keys') || []);
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
const requireAuthOrApiKey = async (req, res) => {
    const token = getBearerToken(req);
    const apiKey = req.get('X-Nexus-API-Key');
    if (token) {
        try {
            const decoded = await admin.auth().verifyIdToken(token);
            return { type: 'user', uid: decoded.uid };
        }
        catch {
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
const requirePlatformAdmin = async (req, res) => {
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
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
        return null;
    }
};
const getActiveMembershipsForPerson = async (personId) => {
    const snapshot = await db.collection('person_memberships')
        .where('person_id', '==', personId)
        .where('status', '==', 'active')
        .get();
    return snapshot.docs.map((doc) => doc.data());
};
const hasInviteAuthority = (memberships, requestedRole, organizationId, ecosystemId) => {
    if (memberships.some((membership) => membership.system_role === 'platform_admin')) {
        return true;
    }
    if (memberships.some((membership) => membership.system_role === 'ecosystem_manager' &&
        membership.ecosystem_id === ecosystemId &&
        !['platform_admin'].includes(requestedRole))) {
        return true;
    }
    return memberships.some((membership) => membership.system_role === 'eso_admin' &&
        membership.organization_id === organizationId &&
        membership.ecosystem_id === ecosystemId &&
        ['eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur'].includes(requestedRole));
};
const requireInviteManager = async (req, res, requestedRole, organizationId, ecosystemId) => {
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
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
        return null;
    }
};
const handlePreflight = (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
};
const normalize = (value) => (value || '').trim().toLowerCase();
const parseAddressList = (value) => {
    if (!value) {
        return [];
    }
    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};
const splitName = (fullName) => {
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
const extractEmails = (text) => {
    if (!text) {
        return [];
    }
    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};
const extractNameFromSubject = (subject) => {
    const match = (subject || '').match(/Introduction:\s*(.+?)(?:\s+to\s+.+)?$/i);
    return match?.[1]?.trim();
};
const parseFooter = (text) => {
    const blockMatch = (text || '').match(/--- NETWORK REFERRAL DATA ---([\s\S]*?)--- END NETWORK REFERRAL DATA ---/i);
    if (!blockMatch) {
        return null;
    }
    const block = blockMatch[1];
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const result = {};
    let currentSection = null;
    for (const line of lines) {
        const keyValueMatch = line.match(/^([a-z_]+):\s*(.*)$/i);
        if (keyValueMatch) {
            const [, key, rawValue] = keyValueMatch;
            if (rawValue) {
                result[key] = rawValue;
                currentSection = null;
            }
            else {
                currentSection = key;
                result[key] = [];
            }
            continue;
        }
        const checkboxMatch = line.match(/^- \[x\]\s+([a-z_]+)$/i);
        if (checkboxMatch && currentSection) {
            const [, option] = checkboxMatch;
            const existing = result[currentSection];
            if (Array.isArray(existing)) {
                existing.push(option);
            }
        }
    }
    return result;
};
const resolveReceivingOrganization = async (receivingOrgName, toEmails = []) => {
    if (receivingOrgName) {
        const byName = await db.collection('organizations').where('name', '==', receivingOrgName).limit(1).get();
        if (!byName.empty) {
            return byName.docs[0];
        }
    }
    const domains = toEmails
        .map((email) => email.split('@')[1]?.toLowerCase())
        .filter((value) => Boolean(value));
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
const upsertDraftOrganization = async (ventureName, ecosystemId) => {
    if (!ventureName) {
        return null;
    }
    const exact = await db.collection('organizations').where('name', '==', ventureName).limit(1).get();
    if (!exact.empty) {
        return exact.docs[0];
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
    return docRef.get();
};
const upsertDraftPerson = async (candidateEmail, candidateName, organizationId, ecosystemId) => {
    const normalizedEmail = candidateEmail.toLowerCase();
    const existing = await db.collection('people').where('email', '==', normalizedEmail).limit(1).get();
    if (!existing.empty) {
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
        primary_organization_id: organizationId || '',
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
const enqueueNotice = async (personId, email, payload) => {
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
const logAudit = async (action, actorId, details) => {
    const docRef = db.collection('audit_logs').doc();
    await docRef.set({
        id: docRef.id,
        action,
        actor_person_id: actorId,
        details,
        created_at: new Date().toISOString(),
    });
};
const generateInviteToken = () => (0, crypto_1.randomBytes)(24).toString('hex');
const hashInviteToken = (token) => (0, crypto_1.createHash)('sha256').update(token).digest('hex');
const isExpired = (isoDate) => {
    if (!isoDate) {
        return false;
    }
    return new Date(isoDate).getTime() <= Date.now();
};
const findExistingPersonByEmail = async (email) => {
    const snapshot = await db.collection('people').where('email', '==', email).limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0];
};
const resolveInviteScope = async (organizationId, requestedEcosystemId) => {
    const organizationDoc = await db.collection('organizations').doc(organizationId).get();
    if (!organizationDoc.exists) {
        throw new Error('Organization not found');
    }
    const ecosystemIds = (organizationDoc.get('ecosystem_ids') || []);
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
const findInviteByToken = async (token) => {
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
    return { serverToken, fromEmail, messageStream };
};
const renderNoticeContent = (notice) => {
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
            htmlBody: `
        <p>Hello,</p>
        <p>You have been invited to Entrepreneurship Nexus as <strong>${invitedRole}</strong>.</p>
        <p><a href="${inviteUrl}">Accept your invite</a></p>
        <p>If you already have an account, sign in with the invited email address before accepting.</p>
        <p>Thank you,<br />Entrepreneurship Nexus</p>
      `,
        };
    }
    if (notice.type === 'referral_follow_up') {
        const receivingOrgName = notice.payload?.receiving_org_name || 'a partner organization';
        return {
            subject: 'Confirm your Entrepreneurship Nexus referral',
            textBody: [
                'Hello,',
                '',
                `A referral introduction was logged for ${receivingOrgName}.`,
                'We are following up so you can confirm your sharing preferences and complete your network profile.',
                '',
                'You can sign in to Entrepreneurship Nexus to review and manage your information.',
                '',
                'Thank you,',
                'Entrepreneurship Nexus',
            ].join('\n'),
            htmlBody: `
        <p>Hello,</p>
        <p>A referral introduction was logged for <strong>${receivingOrgName}</strong>.</p>
        <p>We are following up so you can confirm your sharing preferences and complete your network profile.</p>
        <p>You can sign in to Entrepreneurship Nexus to review and manage your information.</p>
        <p>Thank you,<br />Entrepreneurship Nexus</p>
      `,
        };
    }
    return {
        subject: 'Notification from Entrepreneurship Nexus',
        textBody: 'A new notification is available in Entrepreneurship Nexus.',
        htmlBody: '<p>A new notification is available in Entrepreneurship Nexus.</p>',
    };
};
const sendPostmarkEmail = async (notice) => {
    const config = getPostmarkConfig();
    if (!config.serverToken || !config.fromEmail) {
        throw new Error('Postmark outbound configuration is incomplete');
    }
    const content = renderNoticeContent(notice);
    const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': config.serverToken,
        },
        body: JSON.stringify({
            From: config.fromEmail,
            To: notice.to_email,
            Subject: content.subject,
            TextBody: content.textBody,
            HtmlBody: content.htmlBody,
            MessageStream: config.messageStream,
            Metadata: {
                notice_id: notice.id,
                notice_type: notice.type || 'unknown',
            },
        }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(json?.Message || 'Postmark send failed');
    }
    return json;
};
const processInboundEmailPayload = async (payload) => {
    const routeAddress = payload.route_address || payload.to_emails?.[0] || '';
    const routeMatch = await db.collection('inbound_routes').where('route_address', '==', routeAddress).limit(1).get();
    const route = routeMatch.empty ? null : routeMatch.docs[0].data();
    const footer = parseFooter(payload.text_body);
    const clientEmail = normalize(typeof footer?.client_email === 'string' ? footer.client_email : undefined)
        || extractEmails(payload.text_body).find((email) => email !== normalize(payload.from_email)) || '';
    const clientName = typeof footer?.client_name === 'string' ? footer.client_name : extractNameFromSubject(payload.subject);
    const ventureName = typeof footer?.client_venture === 'string' ? footer.client_venture : undefined;
    const receivingOrgName = typeof footer?.receiving_org === 'string' ? footer.receiving_org : undefined;
    const introContactPermission = (Array.isArray(footer?.intro_contact_permission) && footer?.intro_contact_permission[0]
        ? footer?.intro_contact_permission[0]
        : 'unknown');
    const supportNeeds = Array.isArray(footer?.support_needs) ? footer.support_needs : [];
    const ventureStage = Array.isArray(footer?.venture_stage) ? footer.venture_stage[0] : undefined;
    const inboundMessageRef = db.collection('inbound_messages').doc();
    const now = new Date().toISOString();
    await inboundMessageRef.set({
        id: inboundMessageRef.id,
        provider: payload.provider || 'manual',
        provider_message_id: payload.provider_message_id || null,
        message_id_header: payload.message_id_header || null,
        route_address: routeAddress,
        ecosystem_id: route?.ecosystem_id || null,
        activity_type: route?.activity_type || 'introduction',
        from_email: normalize(payload.from_email),
        to_emails: payload.to_emails || [],
        cc_emails: payload.cc_emails || [],
        subject: payload.subject || '',
        text_body: payload.text_body || '',
        html_body: payload.html_body || '',
        raw_payload: payload.raw_payload || payload,
        parse_status: 'pending',
        review_status: 'unreviewed',
        received_at: now,
    });
    const receivingOrganization = await resolveReceivingOrganization(receivingOrgName, payload.to_emails || []);
    const organization = await upsertDraftOrganization(ventureName, route?.ecosystem_id);
    const person = clientEmail
        ? await upsertDraftPerson(clientEmail, clientName, organization?.id, route?.ecosystem_id)
        : null;
    const parseResultRef = db.collection('inbound_parse_results').doc();
    await parseResultRef.set({
        id: parseResultRef.id,
        inbound_message_id: inboundMessageRef.id,
        candidate_person_email: clientEmail || null,
        candidate_person_name: clientName || null,
        candidate_venture_name: ventureName || null,
        candidate_receiving_org_id: receivingOrganization?.id || null,
        candidate_referring_org_id: null,
        intro_contact_permission: introContactPermission,
        venture_stage: ventureStage || null,
        support_needs: supportNeeds,
        confidence: clientEmail ? 0.82 : 0.45,
        needs_review_reasons: clientEmail ? [] : ['missing_client_email'],
    });
    const referralRef = db.collection('referrals').doc();
    await referralRef.set({
        id: referralRef.id,
        ecosystem_id: route?.ecosystem_id || null,
        referring_org_id: null,
        receiving_org_id: receivingOrganization?.id || null,
        subject_person_id: person?.id || null,
        subject_org_id: organization?.id || null,
        status: 'pending',
        notes: payload.text_body || '',
        intro_email_sent: true,
        source: 'bcc_intake',
        created_at: now,
    });
    if (person && clientEmail && introContactPermission !== 'not_confirmed') {
        await enqueueNotice(person.id, clientEmail, {
            inbound_message_id: inboundMessageRef.id,
            referral_id: referralRef.id,
            receiving_org_name: receivingOrganization?.get('name') || receivingOrgName || null,
            subject: payload.subject || '',
        });
    }
    await inboundMessageRef.update({
        parse_status: 'parsed',
        review_status: clientEmail ? 'needs_review' : 'unreviewed',
    });
    return {
        ok: true,
        inbound_message_id: inboundMessageRef.id,
        parse_result_id: parseResultRef.id,
        referral_id: referralRef.id,
        person_id: person?.id || null,
        organization_id: organization?.id || null,
    };
};
const mapPostmarkInboundToInternal = (payload) => {
    const toEmails = payload.ToFull?.map((entry) => normalize(entry.Email)).filter(Boolean)
        || parseAddressList(payload.To);
    const ccEmails = payload.CcFull?.map((entry) => normalize(entry.Email)).filter(Boolean)
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
        raw_payload: payload,
    };
};
exports.resolvePerson = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
    if (handlePreflight(req, res)) {
        return;
    }
    setCors(res);
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const context = await requireAuthOrApiKey(req, res);
    if (!context)
        return;
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
exports.resolveOrganization = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
    if (handlePreflight(req, res)) {
        return;
    }
    setCors(res);
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const context = await requireAuthOrApiKey(req, res);
    if (!context)
        return;
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
exports.createTestAccount = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
        primary_organization_id: organizationId,
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
exports.completeSelfSignup = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
    }
});
exports.bootstrapPlatformAdmin = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    }
    catch (error) {
        console.error('bootstrapPlatformAdmin failed', error);
        res.status(500).json({ error: error?.message || 'Unable to bootstrap platform admin' });
    }
});
exports.createInvite = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    if (!email || !organizationId) {
        res.status(400).json({ error: 'email and organization_id are required' });
        return;
    }
    let ecosystemId = '';
    try {
        const scope = await resolveInviteScope(organizationId, requestedEcosystemId || null);
        ecosystemId = scope.ecosystemId;
    }
    catch (error) {
        res.status(400).json({ error: error?.message || 'Unable to resolve invite scope' });
        return;
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
exports.listInvites = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
        const sanitizeInvite = (doc) => {
            const data = doc.data();
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
        }
        else {
            const scoped = memberships
                .filter((membership) => ['ecosystem_manager', 'eso_admin'].includes(membership.system_role))
                .map((membership) => ({ ecosystem_id: membership.ecosystem_id, organization_id: membership.organization_id }));
            const allInvites = await db.collection('invites').limit(100).get();
            const docs = allInvites.docs.filter((doc) => {
                const data = doc.data();
                return scoped.some((scope) => data.ecosystem_id === scope.ecosystem_id &&
                    (person.get('system_role') === 'ecosystem_manager' || data.organization_id === scope.organization_id));
            });
            res.json({ invites: docs.map((doc) => sanitizeInvite(doc)) });
            return;
        }
        res.json({ invites: invitesSnapshot.docs.map((doc) => sanitizeInvite(doc)) });
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
    }
});
exports.getInviteSummary = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    const invite = inviteDoc.data();
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
exports.acceptInvite = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
        const invite = inviteDoc.data();
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
    }
    catch {
        res.status(401).json({ error: 'Invalid authentication token' });
    }
});
exports.resendInvite = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    const invite = inviteDoc.data();
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
exports.revokeInvite = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    const invite = inviteDoc.data();
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
exports.approveAccountRequest = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
exports.pushInteraction = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
    if (handlePreflight(req, res)) {
        return;
    }
    setCors(res);
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const context = await requireAuthOrApiKey(req, res);
    if (!context)
        return;
    const { ecosystem_id, organization_id, person_id, date, type, notes, recorded_by, attendees } = req.body;
    if (!ecosystem_id || !organization_id || !notes) {
        res.status(400).json({ error: 'ecosystem_id, organization_id, and notes are required' });
        return;
    }
    const interactionRef = db.collection('interactions').doc();
    const now = new Date().toISOString();
    const apiKeyContext = context.type === 'api_key'
        ? context
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
    const actorId = context.type === 'user'
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
exports.rejectAccountRequest = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
exports.seedLocalReferenceData = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
        tax_status: 'government',
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
    await db.collection('organization_aliases').doc('alias_sbdc').set({
        id: 'alias_sbdc',
        organization_id: 'org_sbdc',
        canonical_name: 'SBDC',
        alias: 'SBDC',
        domain: 'sbdc.org',
        ecosystem_id: 'eco_new_haven',
    }, { merge: true });
    await db.collection('inbound_routes').doc('route_newhaven_intro').set({
        id: 'route_newhaven_intro',
        route_address: 'newhaven+introduction@inbound.example.org',
        ecosystem_id: 'eco_new_haven',
        activity_type: 'introduction',
        allowed_sender_domains: ['makehaven.org'],
        is_active: true,
    }, { merge: true });
    res.json({ ok: true });
});
exports.processInboundEmail = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    const payload = req.body;
    const result = await processInboundEmailPayload(payload);
    res.json(result);
});
exports.postmarkInboundWebhook = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    const payload = req.body;
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
exports.sendQueuedNotices = (0, https_1.onRequest)({ invoker: 'public' }, async (req, res) => {
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
    let docs = [];
    if (noticeId) {
        const doc = await db.collection('notice_queue').doc(noticeId).get();
        if (doc.exists) {
            docs = [doc];
        }
    }
    else {
        const snapshot = await db.collection('notice_queue').where('status', '==', 'queued').limit(limit).get();
        docs = snapshot.docs;
    }
    const results = [];
    for (const doc of docs) {
        const notice = doc.data();
        try {
            const sendResult = await sendPostmarkEmail(notice);
            await doc.ref.set({
                status: 'sent',
                sent_at: new Date().toISOString(),
                provider: 'postmark',
                provider_message_id: sendResult?.MessageID || null,
                last_error: null,
            }, { merge: true });
            results.push({ notice_id: doc.id, status: 'sent' });
        }
        catch (error) {
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
