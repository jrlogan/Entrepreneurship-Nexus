/**
 * Record merge / unmerge — the "same person, two spellings" problem.
 *
 * Identity resolution across a federation is a three-stage story:
 *
 *   1. AVOID duplicates   — federationDedup.ts matches incoming records by
 *                           external_ref, then exact email/domain. Weak
 *                           signals (similar names) are FLAGGED, never
 *                           auto-merged.
 *   2. RESOLVE duplicates — this module. An admin reviews a flagged pair in
 *                           the GUI and merges them.
 *   3. REVERSE mistakes   — also this module. Every merge is reversible
 *                           because we record exactly what moved.
 *
 * What a merge must guarantee, and why:
 *
 *   - No partner loses its pointer. Every external_ref from the loser is
 *     copied onto the winner AND its external_ref_index entry is repointed,
 *     so a partner that only knows its own ID keeps resolving to the live
 *     record. (Copying refs onto the winner document alone is not enough:
 *     lookups go through the index, so an un-repointed index silently sends
 *     later pushes to an archived record.)
 *   - Nothing is destroyed. The loser is archived and tombstoned with
 *     `merged_into`, never deleted, so history and audit survive.
 *   - Reads self-heal. Anything that resolves to a tombstoned record follows
 *     `merged_into` to the survivor (see followMergePointer).
 *   - It is reversible. `merge_record` on the tombstone stores which refs
 *     were moved, so unmerge puts exactly those back and no others.
 *
 * Everything runs in a Firestore transaction so a partial merge cannot
 * leave the index pointing one way and the documents another.
 */

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export type EntityType = 'person' | 'organization';
export type ExternalRef = { source: string; id: string; owner_org_id?: string };

const collectionFor = (entityType: EntityType) =>
  entityType === 'person' ? 'people' : 'organizations';

const refKey = (r: ExternalRef) => `${r.source}:${r.id}`;
const indexDocId = (entityType: EntityType, r: ExternalRef) =>
  `${entityType}:${r.source}:${r.id}`;

/**
 * Refs on the loser that the winner does not already carry.
 *
 * Pure so it can be unit tested: the union is the part that decides whether a
 * partner keeps its pointer, and getting it wrong is silent data loss.
 */
export const refsToMove = (
  winnerRefs: ExternalRef[],
  loserRefs: ExternalRef[]
): ExternalRef[] => {
  const seen = new Set(winnerRefs.map(refKey));
  const out: ExternalRef[] = [];
  for (const r of loserRefs) {
    if (!r || !r.source || !r.id) continue;
    const k = refKey(r);
    if (seen.has(k)) continue;   // winner already has this exact ref
    seen.add(k);                 // and don't move the same ref twice
    out.push(r);
  }
  return out;
};

/**
 * Refs left on the winner after an unmerge returns `moved` to the loser.
 */
export const refsAfterUnmerge = (
  winnerRefs: ExternalRef[],
  moved: ExternalRef[]
): ExternalRef[] => {
  const movedKeys = new Set(moved.map(refKey));
  return winnerRefs.filter((r) => !movedKeys.has(refKey(r)));
};

/**
 * Follows `merged_into` to the surviving record.
 *
 * Bounded to `maxHops` so a cycle (A→B→A, only reachable through corrupted
 * data) can never hang a request; on exceeding it we return the last id
 * reached rather than throwing, because a read path must stay available.
 */
export const followMergePointer = async (
  db: FirebaseFirestore.Firestore,
  entityType: EntityType,
  startId: string,
  maxHops = 5
): Promise<{ id: string; data: admin.firestore.DocumentData } | null> => {
  const collection = collectionFor(entityType);
  let currentId = startId;
  const visited = new Set<string>();

  for (let hop = 0; hop <= maxHops; hop++) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);

    const snap = await db.collection(collection).doc(currentId).get();
    if (!snap.exists) return null;

    const mergedInto = snap.get('merged_into') as string | undefined;
    if (!mergedInto || mergedInto === currentId) {
      return { id: snap.id, data: snap.data()! };
    }
    currentId = mergedInto;
  }

  const finalSnap = await db.collection(collection).doc(currentId).get();
  return finalSnap.exists ? { id: finalSnap.id, data: finalSnap.data()! } : null;
};

/** Platform admins and ecosystem managers may merge; nobody else. */
const requireMergeAuthority = async (
  db: FirebaseFirestore.Firestore,
  uid: string | undefined
): Promise<{ uid: string; role: string }> => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to merge records.');
  }
  const personSnap = await db.collection('people').doc(uid).get();
  if (!personSnap.exists) {
    throw new HttpsError('permission-denied', 'No Nexus person record for this account.');
  }
  const role = (personSnap.get('system_role') as string) || '';
  if (!['platform_admin', 'ecosystem_manager'].includes(role)) {
    throw new HttpsError(
      'permission-denied',
      'Only platform admins and ecosystem managers can merge records.'
    );
  }
  return { uid, role };
};

/**
 * POST mergeRecords — { entity_type, winner_id, loser_id }
 *
 * Union the loser's external refs onto the winner, repoint the index, then
 * tombstone the loser. Returns what moved so the caller can show it.
 */
export const mergeRecords = onCall(async (request) => {
  const db = admin.firestore();
  const { uid } = await requireMergeAuthority(db, request.auth?.uid);

  const {
    entity_type: entityType,
    winner_id: winnerId,
    loser_id: loserId,
  } = (request.data || {}) as {
    entity_type?: EntityType;
    winner_id?: string;
    loser_id?: string;
  };

  if (entityType !== 'person' && entityType !== 'organization') {
    throw new HttpsError('invalid-argument', "entity_type must be 'person' or 'organization'.");
  }
  if (!winnerId || !loserId) {
    throw new HttpsError('invalid-argument', 'winner_id and loser_id are required.');
  }
  if (winnerId === loserId) {
    throw new HttpsError('invalid-argument', 'A record cannot be merged into itself.');
  }

  const collection = collectionFor(entityType);
  const now = new Date().toISOString();

  const moved = await db.runTransaction(async (tx) => {
    const winnerRef = db.collection(collection).doc(winnerId);
    const loserRef = db.collection(collection).doc(loserId);
    const [winnerSnap, loserSnap] = await Promise.all([tx.get(winnerRef), tx.get(loserRef)]);

    if (!winnerSnap.exists) throw new HttpsError('not-found', `Winner ${winnerId} not found.`);
    if (!loserSnap.exists) throw new HttpsError('not-found', `Loser ${loserId} not found.`);
    if (loserSnap.get('merged_into')) {
      throw new HttpsError('failed-precondition', `${loserId} is already merged.`);
    }
    if (winnerSnap.get('merged_into')) {
      throw new HttpsError(
        'failed-precondition',
        `${winnerId} is itself merged away; merge into the surviving record instead.`
      );
    }

    const winnerRefs = (winnerSnap.get('external_refs') as ExternalRef[]) || [];
    const loserRefs = (loserSnap.get('external_refs') as ExternalRef[]) || [];
    const toMove = refsToMove(winnerRefs, loserRefs);

    tx.update(winnerRef, {
      external_refs: [...winnerRefs, ...toMove],
      updated_at: now,
    });

    // Tombstone: archived, pointed at the survivor, and carrying exactly what
    // moved so the merge can be reversed precisely.
    tx.update(loserRef, {
      status: 'archived',
      merged_into: winnerId,
      merge_record: {
        merged_at: now,
        merged_by: uid,
        moved_external_refs: toMove,
        previous_status: loserSnap.get('status') || 'active',
      },
      updated_at: now,
    });

    // Repoint the index so partners keep resolving to the live record.
    for (const r of toMove) {
      tx.set(
        db.collection('external_ref_index').doc(indexDocId(entityType, r)),
        {
          ref_key: refKey(r),
          source: r.source,
          external_id: r.id,
          entity_type: entityType,
          entity_id: winnerId,
          indexed_at: now,
        },
        { merge: true }
      );
    }

    return toMove;
  });

  await db.collection('audit_logs').add({
    action: 'records_merged',
    actor_id: uid,
    entity_type: entityType,
    winner_id: winnerId,
    loser_id: loserId,
    moved_ref_count: moved.length,
    created_at: now,
  });

  return { ok: true, winner_id: winnerId, loser_id: loserId, moved_external_refs: moved };
});

/**
 * POST unmergeRecords — { entity_type, loser_id }
 *
 * Reverses a merge using the tombstone written by mergeRecords: returns the
 * moved refs (and only those) to the restored record and repoints the index
 * back. Refs the winner already owned are untouched.
 */
export const unmergeRecords = onCall(async (request) => {
  const db = admin.firestore();
  const { uid } = await requireMergeAuthority(db, request.auth?.uid);

  const { entity_type: entityType, loser_id: loserId } = (request.data || {}) as {
    entity_type?: EntityType;
    loser_id?: string;
  };

  if (entityType !== 'person' && entityType !== 'organization') {
    throw new HttpsError('invalid-argument', "entity_type must be 'person' or 'organization'.");
  }
  if (!loserId) {
    throw new HttpsError('invalid-argument', 'loser_id is required.');
  }

  const collection = collectionFor(entityType);
  const now = new Date().toISOString();

  const restored = await db.runTransaction(async (tx) => {
    const loserRef = db.collection(collection).doc(loserId);
    const loserSnap = await tx.get(loserRef);
    if (!loserSnap.exists) throw new HttpsError('not-found', `${loserId} not found.`);

    const winnerId = loserSnap.get('merged_into') as string | undefined;
    if (!winnerId) {
      throw new HttpsError('failed-precondition', `${loserId} is not a merged record.`);
    }

    const mergeRecord = (loserSnap.get('merge_record') || {}) as {
      moved_external_refs?: ExternalRef[];
      previous_status?: string;
    };
    const moved = mergeRecord.moved_external_refs || [];

    const winnerRef = db.collection(collection).doc(winnerId);
    const winnerSnap = await tx.get(winnerRef);
    if (winnerSnap.exists) {
      const winnerRefs = (winnerSnap.get('external_refs') as ExternalRef[]) || [];
      tx.update(winnerRef, {
        external_refs: refsAfterUnmerge(winnerRefs, moved),
        updated_at: now,
      });
    }

    tx.update(loserRef, {
      status: mergeRecord.previous_status || 'active',
      merged_into: admin.firestore.FieldValue.delete(),
      merge_record: admin.firestore.FieldValue.delete(),
      updated_at: now,
    });

    for (const r of moved) {
      tx.set(
        db.collection('external_ref_index').doc(indexDocId(entityType, r)),
        {
          ref_key: refKey(r),
          source: r.source,
          external_id: r.id,
          entity_type: entityType,
          entity_id: loserId,
          indexed_at: now,
        },
        { merge: true }
      );
    }

    return { winnerId, moved };
  });

  await db.collection('audit_logs').add({
    action: 'records_unmerged',
    actor_id: uid,
    entity_type: entityType,
    winner_id: restored.winnerId,
    loser_id: loserId,
    returned_ref_count: restored.moved.length,
    created_at: now,
  });

  return {
    ok: true,
    restored_id: loserId,
    winner_id: restored.winnerId,
    returned_external_refs: restored.moved,
  };
});
