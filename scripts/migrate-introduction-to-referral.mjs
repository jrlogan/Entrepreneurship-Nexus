/**
 * One-off migration: rename activity_type 'introduction' → 'referral' in inbound_routes.
 * Safe to re-run — skips docs that are already 'referral'.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=entrepreneurship-nexus node scripts/migrate-introduction-to-referral.mjs
 */
import { getAllDocuments, setDocument } from './helpers/firestore-admin-rest.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus';

console.log(`Scanning inbound_routes in project: ${projectId}`);

const documents = await getAllDocuments(projectId, 'inbound_routes');

let updated = 0;
let skipped = 0;

for (const doc of documents) {
  const { id, fields } = doc;
  if (fields.activity_type === 'introduction') {
    console.log(`  Updating route ${id} (${fields.route_address}): introduction → referral`);
    await setDocument(projectId, 'inbound_routes', id, {
      ...fields,
      activity_type: 'referral',
    });
    updated++;
  } else {
    console.log(`  Skipping route ${id} (${fields.route_address}): already '${fields.activity_type}'`);
    skipped++;
  }
}

console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
