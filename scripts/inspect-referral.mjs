import { getAdminDocument } from './helpers/firestore-emulator-admin.mjs';

const ids = ['hgJOFYIwFhLbVtkIaB74', 'CMu3MHTi7jDpPQRnXhWy'];

for (const id of ids) {
  const doc = await getAdminDocument('referrals', id);
  console.log(`--- Referral ID: ${id} ---`);
  console.log(JSON.stringify(doc?.fields, null, 2));
}
