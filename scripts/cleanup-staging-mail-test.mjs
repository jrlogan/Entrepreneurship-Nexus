import { deleteDocumentByName, getAllDocuments } from './helpers/firestore-admin-rest.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-staging';
const ecosystemId = process.env.NEXUS_MAIL_TEST_ECOSYSTEM_ID || 'eco_mail_test';
const routeAddress = process.env.NEXUS_MAIL_TEST_ROUTE_ADDRESS || 'mail-test+introduction@inbound.entrepreneurship.nexus';

const includesValue = (value, expected) => Array.isArray(value) && value.includes(expected);

const deleteMatchingDocuments = async (collectionId, matcher) => {
  const docs = await getAllDocuments(projectId, collectionId);
  const matches = docs.filter((doc) => matcher(doc.fields));
  for (const doc of matches) {
    await deleteDocumentByName(doc.name);
  }
  return matches.map((doc) => doc.id);
};

const inboundMessageIds = await deleteMatchingDocuments('inbound_messages', (fields) =>
  fields.ecosystem_id === ecosystemId || fields.route_address === routeAddress
);

await deleteMatchingDocuments('inbound_parse_results', (fields) =>
  inboundMessageIds.includes(fields.inbound_message_id)
);

await deleteMatchingDocuments('referrals', (fields) =>
  fields.ecosystem_id === ecosystemId || fields.source === 'bcc_intake'
);

const personIds = await deleteMatchingDocuments('people', (fields) =>
  fields.ecosystem_id === ecosystemId && fields.status === 'draft'
);

await deleteMatchingDocuments('network_profiles', (fields) =>
  personIds.includes(fields.person_id)
);

await deleteMatchingDocuments('notice_queue', (fields) =>
  personIds.includes(fields.person_id) ||
  inboundMessageIds.includes(fields?.payload?.inbound_message_id)
);

const draftOrganizationIds = await deleteMatchingDocuments('organizations', (fields) =>
  fields.status === 'draft' && includesValue(fields.ecosystem_ids, ecosystemId)
);

await deleteMatchingDocuments('audit_logs', (fields) =>
  personIds.includes(fields.actor_person_id) ||
  inboundMessageIds.includes(fields?.details?.inbound_message_id) ||
  draftOrganizationIds.includes(fields?.details?.organization_id)
);

console.log(JSON.stringify({
  ok: true,
  project_id: projectId,
  ecosystem_id: ecosystemId,
  deleted: {
    inbound_messages: inboundMessageIds.length,
    inbound_parse_results: 'matched_by_inbound_message_id',
    referrals: 'matched_by_ecosystem_or_bcc_intake',
    people: personIds.length,
    draft_organizations: draftOrganizationIds.length,
  },
}, null, 2));
