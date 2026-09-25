/**
 * Keys for `external_ref_index` — the O(1) lookup from a partner's own record
 * ID (source + id) to a Nexus record.
 *
 * Refs owned by a partner are indexed under that partner:
 *   "{entityType}:{ownerOrgId}:{source}:{id}"
 * so two partners that choose the same source name ("crm") and IDs ("42")
 * never collide — each resolves only its own records. Refs with no owner
 * (identity-provider refs, older data) use the original global key:
 *   "{entityType}:{source}:{id}"
 *
 * Readers try the scoped key first, then the global one; a global entry that
 * names a different owner is ignored.
 */
import type * as admin from 'firebase-admin';

export interface IndexedRef {
  source: string;
  id: string;
  owner_org_id?: string;
}

export const globalIndexId = (entityType: string, ref: IndexedRef) =>
  `${entityType}:${ref.source}:${ref.id}`;

export const externalRefIndexId = (entityType: string, ref: IndexedRef) =>
  ref.owner_org_id
    ? `${entityType}:${ref.owner_org_id}:${ref.source}:${ref.id}`
    : globalIndexId(entityType, ref);

export const readExternalRefIndex = async (
  db: admin.firestore.Firestore,
  entityType: string,
  ref: IndexedRef,
): Promise<admin.firestore.DocumentSnapshot | null> => {
  const collection = db.collection('external_ref_index');
  if (ref.owner_org_id) {
    const scoped = await collection.doc(externalRefIndexId(entityType, ref)).get();
    if (scoped.exists) return scoped;
  }
  const legacy = await collection.doc(globalIndexId(entityType, ref)).get();
  if (!legacy.exists) return null;
  const owner = legacy.get('owner_org_id') as string | undefined;
  if (ref.owner_org_id && owner && owner !== ref.owner_org_id) return null;
  return legacy;
};
