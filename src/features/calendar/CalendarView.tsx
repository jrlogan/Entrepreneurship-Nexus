import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Modal } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import type {
  CalendarEvent,
  EventSource,
  EventSourceType,
  EventStatus,
} from '../../domain/calendar/types';
import {
  DEFAULT_AUTO_APPROVE_THRESHOLD,
  DEFAULT_EVENT_TAGS,
} from '../../domain/calendar/types';

type CalendarTab = 'upcoming' | 'pending' | 'sources' | 'feed';

const STATUS_LABEL: Record<EventStatus, string> = {
  auto_approved: 'Auto-approved',
  approved: 'Approved',
  pending_review: 'Pending review',
  rejected: 'Rejected',
  archived: 'Archived',
};

const STATUS_COLOR: Record<EventStatus, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  auto_approved: 'green',
  approved: 'green',
  pending_review: 'yellow',
  rejected: 'red',
  archived: 'gray',
};

const formatEventDate = (iso: string, allDay?: boolean): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (allDay) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const generateRandomId = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 11)}`;

export const CalendarView: React.FC = () => {
  const repos = useRepos();
  const viewer = useViewer();
  const [activeTab, setActiveTab] = useState<CalendarTab>('upcoming');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sources, setSources] = useState<EventSource[]>([]);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin =
    viewer.role === 'platform_admin' ||
    viewer.role === 'ecosystem_manager' ||
    viewer.role === 'eso_admin' ||
    viewer.role === 'eso_staff' ||
    viewer.role === 'eso_coach';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const [evs, srcs] = await Promise.all([
        repos.calendar.listEvents(viewer, viewer.ecosystemId),
        repos.calendar.listSources(viewer, viewer.ecosystemId),
      ]);
      if (cancelled) return;
      setEvents(evs);
      setSources(srcs);
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [repos, viewer, viewer.ecosystemId]);

  const refreshSources = async () => {
    const srcs = await repos.calendar.listSources(viewer, viewer.ecosystemId);
    setSources(srcs);
  };

  const refreshEvents = async () => {
    const evs = await repos.calendar.listEvents(viewer, viewer.ecosystemId);
    setEvents(evs);
  };

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.status === 'auto_approved' || e.status === 'approved')
      .filter((e) => {
        const t = new Date(e.start_time).getTime();
        return !isNaN(t) && t >= now - 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [events]);

  const pendingEvents = useMemo(
    () => events.filter((e) => e.status === 'pending_review').sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    ),
    [events],
  );

  const feedUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const region = 'us-central1';
    // Best-effort guess: deployed Cloud Function URL pattern. Local dev users will substitute.
    return `https://${region}-${'PROJECT_ID'}.cloudfunctions.net/generateCalendarFeed?ecosystem=${encodeURIComponent(viewer.ecosystemId || '')}`;
  }, [viewer.ecosystemId]);

  const handleApprove = async (id: string) => {
    await repos.calendar.updateEventStatus(id, 'approved', viewer.personId);
    await refreshEvents();
  };
  const handleReject = async (id: string) => {
    await repos.calendar.updateEventStatus(id, 'rejected', viewer.personId);
    await refreshEvents();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Community Calendar</h1>
          <p className="text-sm text-gray-600 mt-1">
            Aggregated entrepreneurial events from your ecosystem's sources. AI-classified; high-confidence
            events auto-publish so you only review the uncertain ones.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsAddSourceOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            + Add source
          </button>
        )}
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 text-sm">
          {(['upcoming', 'pending', 'sources', 'feed'] as CalendarTab[]).map((tab) => {
            if ((tab === 'pending' || tab === 'sources') && !isAdmin) return null;
            const label =
              tab === 'upcoming'
                ? 'Upcoming'
                : tab === 'pending'
                ? `Pending review (${pendingEvents.length})`
                : tab === 'sources'
                ? 'Sources'
                : 'Subscribe';
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`pb-2 border-b-2 ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {!isLoading && activeTab === 'upcoming' && (
        <UpcomingList events={upcomingEvents} />
      )}
      {!isLoading && activeTab === 'pending' && isAdmin && (
        <PendingQueue events={pendingEvents} onApprove={handleApprove} onReject={handleReject} />
      )}
      {!isLoading && activeTab === 'sources' && isAdmin && (
        <SourceList sources={sources} repos={repos} viewer={viewer} onChange={refreshSources} />
      )}
      {!isLoading && activeTab === 'feed' && (
        <SubscribePanel feedUrl={feedUrl} />
      )}

      {isAdmin && (
        <AddSourceModal
          isOpen={isAddSourceOpen}
          onClose={() => setIsAddSourceOpen(false)}
          onSaved={async () => {
            setIsAddSourceOpen(false);
            await refreshSources();
          }}
          viewer={viewer}
          repos={repos}
        />
      )}
    </div>
  );
};

const UpcomingList: React.FC<{ events: CalendarEvent[] }> = ({ events }) => {
  if (!events.length) {
    return (
      <Card title="No upcoming events">
        <p className="text-sm text-gray-600">
          Add an iCal or RSS source to start aggregating events automatically.
        </p>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {events.map((ev) => (
        <Card key={ev.id} title={ev.title}>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
            <span>{formatEventDate(ev.start_time, ev.all_day)}</span>
            {ev.location?.text && <span>· {ev.location.text}</span>}
            {ev.organizer?.name && <span>· {ev.organizer.name}</span>}
            <Badge color={STATUS_COLOR[ev.status]}>{STATUS_LABEL[ev.status]}</Badge>
          </div>
          {ev.description && (
            <p className="text-sm text-gray-700 line-clamp-3">{ev.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {ev.tags.map((t) => (
              <Badge key={t} color="blue">{t}</Badge>
            ))}
          </div>
          {ev.url && (
            <a
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
            >
              View original →
            </a>
          )}
        </Card>
      ))}
    </div>
  );
};

const PendingQueue: React.FC<{
  events: CalendarEvent[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}> = ({ events, onApprove, onReject }) => {
  if (!events.length) {
    return (
      <Card title="Queue is clear">
        <p className="text-sm text-gray-600">
          Nothing waiting on you. Auto-approved and rejected events have already been routed.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {events.map((ev) => (
        <Card key={ev.id} title={ev.title}>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
            <span>{formatEventDate(ev.start_time, ev.all_day)}</span>
            {ev.location?.text && <span>· {ev.location.text}</span>}
            <Badge color="yellow">Confidence {(ev.ai_confidence * 100).toFixed(0)}%</Badge>
          </div>
          {ev.ai_reasoning && (
            <p className="text-xs text-gray-500 italic mb-2">AI: {ev.ai_reasoning}</p>
          )}
          {ev.description && (
            <p className="text-sm text-gray-700 line-clamp-4">{ev.description}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onApprove(ev.id)}
              className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onReject(ev.id)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
            >
              Reject
            </button>
            {ev.url && (
              <a
                href={ev.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs text-indigo-600 hover:underline"
              >
                Open original ↗
              </a>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
};

const SourceList: React.FC<{
  sources: EventSource[];
  repos: ReturnType<typeof useRepos>;
  viewer: ReturnType<typeof useViewer>;
  onChange: () => Promise<void>;
}> = ({ sources, repos, viewer, onChange }) => {
  if (!sources.length) {
    return (
      <Card title="No sources yet">
        <p className="text-sm text-gray-600">
          Add an iCal feed (best), RSS feed, or per-ecosystem inbound email address to start receiving events.
        </p>
      </Card>
    );
  }
  const toggleActive = async (source: EventSource) => {
    await repos.calendar.upsertSource({ ...source, active: !source.active, updated_at: new Date().toISOString() });
    await onChange();
  };
  const toggleFilterMode = async (source: EventSource) => {
    const next = source.filter_mode === 'trust' ? 'classify' : 'trust';
    await repos.calendar.upsertSource({ ...source, filter_mode: next, updated_at: new Date().toISOString() });
    await onChange();
  };
  return (
    <div className="space-y-3">
      {sources.map((s) => (
        <Card key={s.id} title={s.name}>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
            <Badge color={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Disabled'}</Badge>
            <Badge color="blue">{s.type}</Badge>
            <Badge color={s.filter_mode === 'trust' ? 'green' : 'yellow'}>
              {s.filter_mode === 'trust' ? 'Trust feed (no AI filter)' : 'AI-classified'}
            </Badge>
            {s.last_check_status && (
              <Badge color={s.last_check_status === 'success' ? 'green' : 'red'}>
                Last: {s.last_check_status}
              </Badge>
            )}
          </div>
          {s.url && <p className="text-xs text-gray-500 break-all">{s.url}</p>}
          {s.email_address && <p className="text-xs text-gray-500">→ {s.email_address}</p>}
          {s.last_checked_at && (
            <p className="text-xs text-gray-500 mt-1">Last checked {formatEventDate(s.last_checked_at)}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => toggleActive(s)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
            >
              {s.active ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={() => toggleFilterMode(s)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
              title="Trust mode auto-publishes every event from this feed without AI filtering."
            >
              Switch to {s.filter_mode === 'trust' ? 'AI-classify' : 'Trust'}
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
};

const SubscribePanel: React.FC<{ feedUrl: string }> = ({ feedUrl }) => (
  <Card title="Subscribe to this calendar">
    <p className="text-sm text-gray-700 mb-3">
      Add this URL to Google Calendar, Apple Calendar, or Outlook to keep events in sync. The feed updates
      whenever a new event clears classification.
    </p>
    <div className="bg-gray-100 rounded p-3 font-mono text-xs break-all">{feedUrl}</div>
    <p className="text-xs text-gray-500 mt-2">
      Replace <code>PROJECT_ID</code> with your deployed Firebase project ID; the actual function URL is
      printed by <code>firebase deploy --only functions:generateCalendarFeed</code>.
    </p>
  </Card>
);

const AddSourceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  viewer: ReturnType<typeof useViewer>;
  repos: ReturnType<typeof useRepos>;
}> = ({ isOpen, onClose, onSaved, viewer, repos }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<EventSourceType>('ical');
  const [filterMode, setFilterMode] = useState<'trust' | 'classify'>('classify');
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [defaultGeoTags, setDefaultGeoTags] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setUrl('');
    setType('ical');
    setFilterMode('classify');
    setDefaultTags([]);
    setDefaultGeoTags('');
  };

  const handleSave = async () => {
    if (!name || !url) return;
    setBusy(true);
    try {
      const id = generateRandomId('evtsrc');
      const now = new Date().toISOString();
      await repos.calendar.upsertSource({
        id,
        name,
        type,
        url,
        ecosystem_id: viewer.ecosystemId || '',
        active: true,
        check_interval_hours: 24,
        consecutive_failures: 0,
        filter_mode: filterMode,
        auto_approve_threshold: DEFAULT_AUTO_APPROVE_THRESHOLD,
        default_visibility: 'public',
        default_tags: defaultTags,
        default_geographic_tags: defaultGeoTags
          ? defaultGeoTags.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        created_by: viewer.personId || 'unknown',
        created_at: now,
        updated_at: now,
      });
      reset();
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add calendar source">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="CT Small Business Development Center"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Source type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventSourceType)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="ical">iCal feed (preferred)</option>
            <option value="rss">RSS feed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Feed URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="https://example.org/events.ics"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Filter mode</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'trust' | 'classify')}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="classify">AI-classify (recommended for noisy feeds)</option>
            <option value="trust">Trust feed (auto-publish all events)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Trust mode skips Gemini and publishes every event from the feed. Use when the source is already
            tightly scoped (e.g. an ESO's own event calendar).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Geographic tags (comma-separated)</label>
          <input
            type="text"
            value={defaultGeoTags}
            onChange={(e) => setDefaultGeoTags(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="CT, new-haven-metro"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Default tags</label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_EVENT_TAGS.map((tag) => {
              const selected = defaultTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDefaultTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                    )
                  }
                  className={`px-2 py-1 rounded text-xs border ${
                    selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name || !url || busy}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add source'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
