/**
 * The consent notice for people staff add by hand.
 *
 * A partner with no system of its own records clients directly in Nexus
 * (People → Add). Nobody is added to the network without being told, so
 * this trigger does for those people what partnerUpsertPerson does for
 * people pushed through the API: sends the consent notice — one per
 * person, network and organization — with the link to make their choices.
 * People created by the API are skipped (the API already sent it).
 */
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { ensureConsentNotice } from '../partnerApi';

export const onPersonCreatedNotifyConsent = onDocumentCreated('people/{personId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  if (data.system_role !== 'entrepreneur' || data.source === 'partner_api') return;
  const orgId = data.created_by_org_id as string | undefined;
  const ecosystemId = data.ecosystem_id as string | undefined;
  const email = (data.email as string | undefined)?.trim();
  if (!orgId || !ecosystemId || !email) return;
  await ensureConsentNotice(admin.firestore(), event.params.personId, (data.first_name as string) || '', email, ecosystemId, orgId);
});
