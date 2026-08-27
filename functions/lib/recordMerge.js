"use strict";
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
exports.unmergeRecords = exports.mergeRecords = exports.followMergePointer = exports.refsAfterUnmerge = exports.refsToMove = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const collectionFor = (entityType) => entityType === 'person' ? 'people' : 'organizations';
const refKey = (r) => `${r.source}:${r.id}`;
const indexDocId = (entityType, r) => `${entityType}:${r.source}:${r.id}`;
/**
 * Refs on the loser that the winner does not already carry.
 *
 * Pure so it can be unit tested: the union is the part that decides whether a
 * partner keeps its pointer, and getting it wrong is silent data loss.
 */
const refsToMove = (winnerRefs, loserRefs) => {
    const seen = new Set(winnerRefs.map(refKey));
    const out = [];
    for (const r of loserRefs) {
        if (!r || !r.source || !r.id)
            continue;
        const k = refKey(r);
        if (seen.has(k))
            continue; // winner already has this exact ref
        seen.add(k); // and don't move the same ref twice
        out.push(r);
    }
    return out;
};
exports.refsToMove = refsToMove;
/**
 * Refs left on the winner after an unmerge returns `moved` to the loser.
 */
const refsAfterUnmerge = (winnerRefs, moved) => {
    const movedKeys = new Set(moved.map(refKey));
    return winnerRefs.filter((r) => !movedKeys.has(refKey(r)));
};
exports.refsAfterUnmerge = refsAfterUnmerge;
/**
 * Follows `merged_into` to the surviving record.
 *
 * Bounded to `maxHops` so a cycle (A→B→A, only reachable through corrupted
 * data) can never hang a request; on exceeding it we return the last id
 * reached rather than throwing, because a read path must stay available.
 */
const followMergePointer = async (db, entityType, startId, maxHops = 5) => {
    const collection = collectionFor(entityType);
    let currentId = startId;
    const visited = new Set();
    for (let hop = 0; hop <= maxHops; hop++) {
        if (visited.has(currentId))
            break; // cycle guard
        visited.add(currentId);
        const snap = await db.collection(collection).doc(currentId).get();
        if (!snap.exists)
            return null;
        const mergedInto = snap.get('merged_into');
        if (!mergedInto || mergedInto === currentId) {
            return { id: snap.id, data: snap.data() };
        }
        currentId = mergedInto;
    }
    const finalSnap = await db.collection(collection).doc(currentId).get();
    return finalSnap.exists ? { id: finalSnap.id, data: finalSnap.data() } : null;
};
exports.followMergePointer = followMergePointer;
/** Platform admins and ecosystem managers may merge; nobody else. */
const requireMergeAuthority = async (db, uid) => {
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to merge records.');
    }
    const personSnap = await db.collection('people').doc(uid).get();
    if (!personSnap.exists) {
        throw new https_1.HttpsError('permission-denied', 'No Nexus person record for this account.');
    }
    const role = personSnap.get('system_role') || '';
    if (!['platform_admin', 'ecosystem_manager'].includes(role)) {
        throw new https_1.HttpsError('permission-denied', 'Only platform admins and ecosystem managers can merge records.');
    }
    return { uid, role };
};
/**
 * POST mergeRecords — { entity_type, winner_id, loser_id }
 *
 * Union the loser's external refs onto the winner, repoint the index, then
 * tombstone the loser. Returns what moved so the caller can show it.
 */
exports.mergeRecords = (0, https_1.onCall)(async (request) => {
    const db = admin.firestore();
    const { uid } = await requireMergeAuthority(db, request.auth?.uid);
    const { entity_type: entityType, winner_id: winnerId, loser_id: loserId, } = (request.data || {});
    if (entityType !== 'person' && entityType !== 'organization') {
        throw new https_1.HttpsError('invalid-argument', "entity_type must be 'person' or 'organization'.");
    }
    if (!winnerId || !loserId) {
        throw new https_1.HttpsError('invalid-argument', 'winner_id and loser_id are required.');
    }
    if (winnerId === loserId) {
        throw new https_1.HttpsError('invalid-argument', 'A record cannot be merged into itself.');
    }
    const collection = collectionFor(entityType);
    const now = new Date().toISOString();
    const moved = await db.runTransaction(async (tx) => {
        const winnerRef = db.collection(collection).doc(winnerId);
        const loserRef = db.collection(collection).doc(loserId);
        const [winnerSnap, loserSnap] = await Promise.all([tx.get(winnerRef), tx.get(loserRef)]);
        if (!winnerSnap.exists)
            throw new https_1.HttpsError('not-found', `Winner ${winnerId} not found.`);
        if (!loserSnap.exists)
            throw new https_1.HttpsError('not-found', `Loser ${loserId} not found.`);
        if (loserSnap.get('merged_into')) {
            throw new https_1.HttpsError('failed-precondition', `${loserId} is already merged.`);
        }
        if (winnerSnap.get('merged_into')) {
            throw new https_1.HttpsError('failed-precondition', `${winnerId} is itself merged away; merge into the surviving record instead.`);
        }
        const winnerRefs = winnerSnap.get('external_refs') || [];
        const loserRefs = loserSnap.get('external_refs') || [];
        const toMove = (0, exports.refsToMove)(winnerRefs, loserRefs);
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
            tx.set(db.collection('external_ref_index').doc(indexDocId(entityType, r)), {
                ref_key: refKey(r),
                source: r.source,
                external_id: r.id,
                entity_type: entityType,
                entity_id: winnerId,
                indexed_at: now,
            }, { merge: true });
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
exports.unmergeRecords = (0, https_1.onCall)(async (request) => {
    const db = admin.firestore();
    const { uid } = await requireMergeAuthority(db, request.auth?.uid);
    const { entity_type: entityType, loser_id: loserId } = (request.data || {});
    if (entityType !== 'person' && entityType !== 'organization') {
        throw new https_1.HttpsError('invalid-argument', "entity_type must be 'person' or 'organization'.");
    }
    if (!loserId) {
        throw new https_1.HttpsError('invalid-argument', 'loser_id is required.');
    }
    const collection = collectionFor(entityType);
    const now = new Date().toISOString();
    const restored = await db.runTransaction(async (tx) => {
        const loserRef = db.collection(collection).doc(loserId);
        const loserSnap = await tx.get(loserRef);
        if (!loserSnap.exists)
            throw new https_1.HttpsError('not-found', `${loserId} not found.`);
        const winnerId = loserSnap.get('merged_into');
        if (!winnerId) {
            throw new https_1.HttpsError('failed-precondition', `${loserId} is not a merged record.`);
        }
        const mergeRecord = (loserSnap.get('merge_record') || {});
        const moved = mergeRecord.moved_external_refs || [];
        const winnerRef = db.collection(collection).doc(winnerId);
        const winnerSnap = await tx.get(winnerRef);
        if (winnerSnap.exists) {
            const winnerRefs = winnerSnap.get('external_refs') || [];
            tx.update(winnerRef, {
                external_refs: (0, exports.refsAfterUnmerge)(winnerRefs, moved),
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
            tx.set(db.collection('external_ref_index').doc(indexDocId(entityType, r)), {
                ref_key: refKey(r),
                source: r.source,
                external_id: r.id,
                entity_type: entityType,
                entity_id: loserId,
                indexed_at: now,
            }, { merge: true });
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
