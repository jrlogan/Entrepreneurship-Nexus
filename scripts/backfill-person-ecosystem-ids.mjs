/**
 * One-off migration: denormalize active person_memberships onto
 * people/{id}.ecosystem_ids.
 *
 * REQUIRED BEFORE DEPLOYING the ecosystem-tenancy firestore.rules. Those
 * rules gate reads on people/{id}.ecosystem_ids because Firestore rules can
 * get() a document but cannot query a collection. The rules fall back to the
 * single legacy `ecosystem_id` when the array is absent, so single-ecosystem
 * users are safe either way — but anyone with memberships in MORE than one
 * ecosystem would silently lose access to their secondary ecosystems until
 * this runs.
 *
 * Idempotent: skips documents whose array already matches.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging node scripts/backfill-person-ecosystem-ids.mjs
 *   FIREBASE_PROJECT_ID=entrepreneurship-nexus            node scripts/backfill-person-ecosystem-ids.mjs
 *
 * Add --dry-run to report what would change without writing.
 */
import { getAllDocuments, setDocument } from './helpers/firestore-admin-rest.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus';
const dryRun = process.argv.includes('--dry-run');

console.log(`Backfilling people.ecosystem_ids in project: ${projectId}${dryRun ? ' (DRY RUN)' : ''}`);

const [people, memberships] = await Promise.all([
  getAllDocuments(projectId, 'people'),
  getAllDocuments(projectId, 'person_memberships'),
]);

console.log(`  ${people.length} people, ${memberships.length} membership records`);

// person_id -> Set(ecosystem_id) for active memberships only
const byPerson = new Map();
for (const { fields } of memberships) {
  if (fields.status !== 'active') continue;
  const personId = fields.person_id;
  const ecosystemId = fields.ecosystem_id;
  if (!personId || !ecosystemId) continue;
  if (!byPerson.has(personId)) byPerson.set(personId, new Set());
  byPerson.get(personId).add(ecosystemId);
}

let updated = 0;
let skipped = 0;
let multi = 0;

for (const { id, fields } of people) {
  const fromMemberships = byPerson.get(id) || new Set();
  // Retain the primary ecosystem_id so a person with no membership rows yet
  // is not locked out of their own ecosystem.
  if (fields.ecosystem_id) fromMemberships.add(fields.ecosystem_id);

  const next = [...fromMemberships].filter(Boolean).sort();
  if (next.length === 0) {
    skipped++;
    continue;
  }
  if (next.length > 1) multi++;

  const existing = Array.isArray(fields.ecosystem_ids) ? [...fields.ecosystem_ids].sort() : null;
  const unchanged = existing && existing.length === next.length && existing.every((v, i) => v === next[i]);
  if (unchanged) {
    skipped++;
    continue;
  }

  console.log(`  ${id}: ${existing ? JSON.stringify(existing) : '(none)'} -> ${JSON.stringify(next)}`);
  if (!dryRun) {
    await setDocument(projectId, 'people', id, { ...fields, ecosystem_ids: next });
  }
  updated++;
}

console.log(
  `\nDone. ${updated} ${dryRun ? 'would be updated' : 'updated'}, ${skipped} already correct/skipped.` +
  `\n${multi} people belong to more than one ecosystem (these are the ones that would break without this backfill).`
);
