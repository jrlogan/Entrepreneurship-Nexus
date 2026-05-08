import type { CalendarEvent, EventSource, EventSourceRun, EventFlag } from '../../domain/calendar/types';
import type { ViewerContext } from '../../domain/access/policy';

// Mock-mode repository — empty by default. Demo data can be added if useful.
const MOCK_EVENTS: CalendarEvent[] = [];
const MOCK_SOURCES: EventSource[] = [];
const MOCK_RUNS: EventSourceRun[] = [];
const MOCK_FLAGS: EventFlag[] = [];

export class CalendarRepo {
  async listEvents(_viewer: ViewerContext, ecosystemId: string): Promise<CalendarEvent[]> {
    return MOCK_EVENTS.filter((e) => e.visible_in_ecosystems.includes(ecosystemId));
  }

  async listSources(_viewer: ViewerContext, ecosystemId: string): Promise<EventSource[]> {
    return MOCK_SOURCES.filter((s) => s.ecosystem_id === ecosystemId);
  }

  async listRecentRuns(_viewer: ViewerContext, sourceId: string, limit = 10): Promise<EventSourceRun[]> {
    return MOCK_RUNS.filter((r) => r.source_id === sourceId).slice(0, limit);
  }

  async listOpenFlags(_viewer: ViewerContext, ecosystemId: string): Promise<EventFlag[]> {
    return MOCK_FLAGS.filter((f) => f.ecosystem_id === ecosystemId && f.status === 'open');
  }

  async upsertSource(source: EventSource): Promise<void> {
    const i = MOCK_SOURCES.findIndex((s) => s.id === source.id);
    if (i >= 0) MOCK_SOURCES[i] = source;
    else MOCK_SOURCES.push(source);
  }

  async updateEventStatus(id: string, status: CalendarEvent['status'], reviewerId?: string): Promise<void> {
    const ev = MOCK_EVENTS.find((e) => e.id === id);
    if (ev) {
      ev.status = status;
      ev.reviewed_by = reviewerId;
      ev.reviewed_at = new Date().toISOString();
      ev.updated_at = new Date().toISOString();
    }
  }
}
