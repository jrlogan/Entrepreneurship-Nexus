import { setDocument } from './helpers/firestore-admin-rest.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-staging';
const ecosystemId = process.env.NEXUS_MAIL_TEST_ECOSYSTEM_ID || 'eco_mail_test';
const routeAddress = process.env.NEXUS_MAIL_TEST_ROUTE_ADDRESS || 'mail-test+introduction@inbound.entrepreneurship.nexus';
const now = new Date().toISOString();

const senderOrgId = 'org_mail_test_sender';
const receiverOrgId = 'org_mail_test_receiver';

await setDocument(projectId, 'organizations', senderOrgId, {
  id: senderOrgId,
  name: 'Mail Test Referrer',
  description: 'Staging-only organization used to generate inbound referral email tests.',
  tax_status: 'non_profit',
  roles: ['eso'],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: [ecosystemId],
  version: 1,
  status: 'active',
  created_at: now,
  updated_at: now,
});

await setDocument(projectId, 'organizations', receiverOrgId, {
  id: receiverOrgId,
  name: 'Mail Test Receiver',
  description: 'Staging-only receiving organization for inbound referral mail tests.',
  tax_status: 'non_profit',
  roles: ['eso'],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: [ecosystemId],
  version: 1,
  status: 'active',
  created_at: now,
  updated_at: now,
});

await setDocument(projectId, 'organization_aliases', 'alias_mail_test_receiver', {
  id: 'alias_mail_test_receiver',
  organization_id: receiverOrgId,
  canonical_name: 'Mail Test Receiver',
  alias: 'Mail Test Receiver',
  domain: 'mail-test.entrepreneurship.nexus',
  ecosystem_id: ecosystemId,
});

await setDocument(projectId, 'authorized_sender_domains', 'auth_domain_mail_test_sender_makehaven', {
  id: 'auth_domain_mail_test_sender_makehaven',
  ecosystem_id: ecosystemId,
  organization_id: senderOrgId,
  domain: 'makehaven.org',
  is_active: true,
  access_policy: 'approved',
  allow_sender_affiliation: true,
  allow_auto_acknowledgement: true,
  allow_invite_prompt: true,
});

await setDocument(projectId, 'authorized_sender_domains', 'auth_domain_mail_test_sender_nexus', {
  id: 'auth_domain_mail_test_sender_nexus',
  ecosystem_id: ecosystemId,
  organization_id: senderOrgId,
  domain: 'entrepreneurship.nexus',
  is_active: true,
  access_policy: 'approved',
  allow_sender_affiliation: true,
  allow_auto_acknowledgement: true,
  allow_invite_prompt: true,
});

await setDocument(projectId, 'inbound_routes', 'route_mail_test_intro', {
  id: 'route_mail_test_intro',
  route_address: routeAddress,
  ecosystem_id: ecosystemId,
  activity_type: 'introduction',
  allowed_sender_domains: ['makehaven.org', 'entrepreneurship.nexus'],
  is_active: true,
});

console.log(JSON.stringify({
  ok: true,
  project_id: projectId,
  ecosystem_id: ecosystemId,
  route_address: routeAddress,
  sender_org_id: senderOrgId,
  receiver_org_id: receiverOrgId,
}, null, 2));
