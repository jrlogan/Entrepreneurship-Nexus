import { queryCollection, setDocument, updateDocument, whereEquals } from '../../../services/firestoreClient';
import type { CalendarEvent, EventSource, EventSourceRun, EventFlag } from '../../../domain/calendar/types';
import type { ViewerContext } from '../../../domain/access/policy';
import { collection, query, where, orderBy, limit as fbLimit, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '../../../services/firebaseApp';

export class FirebaseCalendarRepo {
  async listEvents(_viewer: ViewerContext, ecosystemId: string): Promise<CalendarEvent[]> {
    if (!ecosystemId) return [];
    return queryCollection<CalendarEvent>('events', [
      where('visible_in_ecosystems', 'array-contains', ecosystemId),
    ]);
  }

  async listSources(_viewer: ViewerContext, ecosystemId: string): Promise<EventSource[]> {
    if (!ecosystemId) return [];
    return queryCollection<EventSource>('event_sources', [whereEquals('ecosystem_id', ecosystemId)]);
  }

  async listRecentRuns(_viewer: ViewerContext, sourceId: string, lim = 10): Promise<EventSourceRun[]> {
    const db = getFirestoreDb();
    if (!db) return [];
    const q = query(
      collection(db, 'event_source_runs'),
      where('source_id', '==', sourceId),
      orderBy('started_at', 'desc'),
      fbLimit(lim),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as EventSourceRun);
  }

  async listOpenFlags(_viewer: ViewerContext, ecosystemId: string): Promise<EventFlag[]> {
    return queryCollection<EventFlag>('event_flags', [
      whereEquals('ecosystem_id', ecosystemId),
      whereEquals('status', 'open'),
    ]);
  }

  async upsertSource(source: EventSource): Promise<void> {
    await setDocument('event_sources', source.id, source);
  }

  async createEvent(event: CalendarEvent): Promise<void> {
    await setDocument('events', event.id, event);
  }

  async updateEventStatus(id: string, status: CalendarEvent['status'], reviewerId?: string): Promise<void> {
    await updateDocument<CalendarEvent>('events', id, {
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}
