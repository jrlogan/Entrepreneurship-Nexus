import { signInWithPassword, signUpWithPassword } from './helpers/emulator-auth.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;

const adminEmail = process.env.ADMIN_EMAIL || 'coach@makehaven.org';
const adminPassword = process.env.ADMIN_PASSWORD || 'Password123!';
const invitedEmail = process.env.INVITED_EMAIL || 'invited.eso@example.org';
const invitedPassword = process.env.INVITED_PASSWORD || 'Password123!';
const invitedRole = process.env.INVITED_ROLE || 'eso_coach';
const organizationId = process.env.INVITED_ORG_ID || 'org_makehaven';
const ecosystemId = process.env.INVITED_ECOSYSTEM_ID || 'eco_new_haven';

const postJson = async (path, body, idToken) => {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  try {
    const json = JSON.parse(text);
    if (!response.ok) {
      throw new Error(json?.error || `${path} failed`);
    }
    return json;
  } catch (error) {
    if (!response.ok) {
      throw new Error(text || `${path} failed`);
    }
    throw error;
  }
};

const adminAuth = await signInWithPassword(adminEmail, adminPassword);

const inviteResult = await postJson(
  'createInvite',
  {
    email: invitedEmail,
    invited_role: invitedRole,
    organization_id: organizationId,
    ecosystem_id: ecosystemId,
    note: 'Local full invite flow test',
  },
  adminAuth.idToken
);

const inviteToken = new URL(inviteResult.invite_url).searchParams.get('invite');
if (!inviteToken) {
  throw new Error('Invite token missing from invite URL.');
}

let invitedAuth;
try {
  invitedAuth = await signUpWithPassword(invitedEmail, invitedPassword, 'Invited User');
} catch (error) {
  invitedAuth = await signInWithPassword(invitedEmail, invitedPassword);
}

const acceptResult = await postJson(
  'acceptInvite',
  { token: inviteToken },
  invitedAuth.idToken
);

console.log(JSON.stringify({
  ok: true,
  invite_url: inviteResult.invite_url,
  invite_id: inviteResult.invite_id,
  accepted: acceptResult.ok === true,
  invited_email: invitedEmail,
  invited_role: invitedRole,
}, null, 2));
