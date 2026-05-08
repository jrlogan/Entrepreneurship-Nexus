
import { collection, getDocs, limit as fbLimit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { setDocument } from '../../../services/firestoreClient';
import { getFirestoreDb, isFirebaseEnabled } from '../../../services/firebaseApp';
import type { AdminReadEvent } from '../../../domain/audit/types';

const COLLECTION = 'admin_audit_logs';

export class FirebaseAdminAuditRepo {
  /**
   * Fire-and-forget log write. Returns the event id; rejects only on truly
   * exceptional errors. Audit failures must never break user-facing flows,
   * so callers are expected to swallow rejection.
   */
  async logAdminRead(input: Omit<AdminReadEvent, 'id' | 'timestamp'>): Promise<string> {
    if (!isFirebaseEnabled()) {
      // Demo / non-Firebase contexts: skip silently. Logging is only
      // meaningful in real deployments.
      return '';
    }
    const id = `aar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const record: AdminReadEvent = { id, timestamp, ...input };
    await setDocument(COLLECTION, id, record, false);
    return id;
  }

  async getRecent(opts?: { ecosystemId?: string; limit?: number }): Promise<AdminReadEvent[]> {
    if (!isFirebaseEnabled()) return [];
    const db = getFirestoreDb();
    if (!db) return [];
    const constraints: QueryConstraint[] = [];
    if (opts?.ecosystemId) {
      constraints.push(where('ecosystem_id', '==', opts.ecosystemId));
    }
    const q = query(
      collection(db, COLLECTION),
      ...constraints,
      orderBy('timestamp', 'desc'),
      fbLimit(opts?.limit ?? 200),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AdminReadEvent);
  }
}
