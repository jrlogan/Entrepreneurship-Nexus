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
import type { Ecosystem } from '../../domain/ecosystems/types';
import type { InboundRoute } from '../../domain/inbound/types';
import { firebaseConfig, isEmulatorMode } from '../../services/firebaseConfig';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { getDocument, queryCollection, setDocument } from '../../services/firestoreClient';

type CalendarTab = 'upcoming' | 'pending' | 'sources' | 'feed' | 'settings';

const INBOUND_DOMAIN = 'incoming.entrepreneurship.nexus';

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
  const [isManualEventOpen, setIsManualEventOpen] = useState(false);
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
    const projectId = firebaseConfig.projectId || 'your-firebase-project';
    return `https://${region}-${projectId}.cloudfunctions.net/generateCalendarFeed?ecosystem=${encodeURIComponent(viewer.ecosystemId || '')}`;
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsManualEventOpen(true)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
            >
              + Add event
            </button>
            <button
              type="button"
              onClick={() => setIsAddSourceOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              + Add source
            </button>
          </div>
        )}
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 text-sm">
          {(['upcoming', 'pending', 'sources', 'feed', 'settings'] as CalendarTab[]).map((tab) => {
            if ((tab === 'pending' || tab === 'sources' || tab === 'settings') && !isAdmin) return null;
            const label =
              tab === 'upcoming'
                ? 'Upcoming'
                : tab === 'pending'
                ? `Pending review (${pendingEvents.length})`
                : tab === 'sources'
                ? 'Sources'
                : tab === 'settings'
                ? 'Settings'
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
      {!isLoading && activeTab === 'settings' && isAdmin && (
        <SettingsPanel
          viewer={viewer}
          onAddSource={() => setIsAddSourceOpen(true)}
          onAddEvent={() => setIsManualEventOpen(true)}
        />
      )}

      {isAdmin && (
        <>
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
          <ManualEventModal
            isOpen={isManualEventOpen}
            onClose={() => setIsManualEventOpen(false)}
            onSaved={async () => {
              setIsManualEventOpen(false);
              await refreshEvents();
            }}
            viewer={viewer}
            repos={repos}
          />
        </>
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

const SettingsPanel: React.FC<{
  viewer: ReturnType<typeof useViewer>;
  onAddSource: () => void;
  onAddEvent: () => void;
}> = ({ viewer, onAddSource, onAddEvent }) => {
  const repos = useRepos();
  const ecosystemId = viewer.ecosystemId;
  const ecosystem = repos.ecosystems.getById(ecosystemId);

  const [geoState, setGeoState] = useState(ecosystem?.settings.geo_state || '');
  const [geoMetros, setGeoMetros] = useState((ecosystem?.settings.geo_metros || []).join(', '));
  const [geoAdjacent, setGeoAdjacent] = useState((ecosystem?.settings.geo_adjacent || []).join(', '));
  const [threshold, setThreshold] = useState(
    typeof ecosystem?.settings.calendar_auto_approve_threshold === 'number'
      ? ecosystem.settings.calendar_auto_approve_threshold
      : DEFAULT_AUTO_APPROVE_THRESHOLD,
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [routeStatus, setRouteStatus] = useState<'unknown' | 'exists' | 'missing'>('unknown');
  const [routeBusy, setRouteBusy] = useState(false);
  const inboundAddress = `events+${ecosystemId}@${INBOUND_DOMAIN}`;

  // Load saved overlay (Firestore wins over in-memory) so reloads don't lose values.
  useEffect(() => {
    let cancelled = false;
    const loadOverlay = async () => {
      try {
        const raw = localStorage.getItem(`eco_override_${ecosystemId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Ecosystem>;
          if (cancelled) return;
          if (parsed.settings?.geo_state !== undefined) setGeoState(parsed.settings.geo_state || '');
          if (parsed.settings?.geo_metros) setGeoMetros(parsed.settings.geo_metros.join(', '));
          if (parsed.settings?.geo_adjacent) setGeoAdjacent(parsed.settings.geo_adjacent.join(', '));
          if (typeof parsed.settings?.calendar_auto_approve_threshold === 'number') {
            setThreshold(parsed.settings.calendar_auto_approve_threshold);
          }
        }
      } catch {}
      if (isFirebaseEnabled() && !isEmulatorMode) {
        try {
          const saved = await getDocument<Partial<Ecosystem>>('ecosystems', ecosystemId);
          if (cancelled || !saved) return;
          if (saved.settings?.geo_state !== undefined) setGeoState(saved.settings.geo_state || '');
          if (saved.settings?.geo_metros) setGeoMetros(saved.settings.geo_metros.join(', '));
          if (saved.settings?.geo_adjacent) setGeoAdjacent(saved.settings.geo_adjacent.join(', '));
          if (typeof saved.settings?.calendar_auto_approve_threshold === 'number') {
            setThreshold(saved.settings.calendar_auto_approve_threshold);
          }
        } catch {}
      }
    };
    void loadOverlay();
    return () => { cancelled = true; };
  }, [ecosystemId]);

  // Detect whether a calendar inbound route already exists for this ecosystem.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!isFirebaseEnabled() || isEmulatorMode) {
        setRouteStatus('missing');
        return;
      }
      try {
        const routes = await queryCollection<InboundRoute>('inbound_routes');
        if (cancelled) return;
        const has = routes.some(
          (r) => r.ecosystem_id === ecosystemId && r.activity_type === 'calendar' && r.is_active,
        );
        setRouteStatus(has ? 'exists' : 'missing');
      } catch {
        if (!cancelled) setRouteStatus('unknown');
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [ecosystemId]);

  useEffect(() => {
    if (!saveMessage && !saveError) return;
    const id = window.setTimeout(() => { setSaveMessage(null); setSaveError(null); }, 3500);
    return () => window.clearTimeout(id);
  }, [saveMessage, saveError]);

  const parseList = (s: string): string[] =>
    s.split(',').map((t) => t.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!ecosystem) return;
    setSaveBusy(true);
    setSaveError(null);
    setSaveMessage(null);
    const updatedSettings = {
      ...ecosystem.settings,
      geo_state: geoState.trim() || undefined,
      geo_metros: parseList(geoMetros),
      geo_adjacent: parseList(geoAdjacent),
      calendar_auto_approve_threshold: threshold,
    };
    const payload: Partial<Ecosystem> = {
      id: ecosystem.id,
      name: ecosystem.name,
      region: ecosystem.region,
      portal_links: ecosystem.portal_links,
      tags: ecosystem.tags,
      settings: updatedSettings,
    };
    try {
      repos.ecosystems.update(ecosystem.id, { settings: updatedSettings });
      localStorage.setItem(`eco_override_${ecosystem.id}`, JSON.stringify(payload));
      if (isFirebaseEnabled() && !isEmulatorMode) {
        await setDocument('ecosystems', ecosystem.id, payload, true);
      }
      setSaveMessage('Calendar settings saved.');
    } catch (err: any) {
      setSaveError(err?.message || 'Unable to save calendar settings.');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleCreateRoute = async () => {
    if (routeStatus === 'exists') return;
    if (!isFirebaseEnabled() || isEmulatorMode) {
      setSaveError('Inbound route creation requires production Firebase (not emulator/demo).');
      return;
    }
    setRouteBusy(true);
    setSaveError(null);
    try {
      const id = `inbound_route_calendar_${ecosystemId}`;
      const route: InboundRoute = {
        id,
        route_address: inboundAddress,
        ecosystem_id: ecosystemId,
        activity_type: 'calendar',
        allowed_sender_domains: [],
        is_active: true,
      };
      await setDocument('inbound_routes', id, route);
      setRouteStatus('exists');
      setSaveMessage('Inbound calendar route created.');
    } catch (err: any) {
      setSaveError(err?.message || 'Unable to create inbound route.');
    } finally {
      setRouteBusy(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setSaveMessage('Copied to clipboard.');
    }
  };

  if (!ecosystem) {
    return (
      <Card title="Settings unavailable">
        <p className="text-sm text-gray-600">Could not load the active ecosystem.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {saveMessage && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {saveMessage}
        </div>
      )}
      {saveError && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {saveError}
        </div>
      )}

      <Card title="Geographic profile">
        <p className="text-sm text-gray-600 mb-3">
          Used for cross-ecosystem routing of state and national events. State and national events from other ecosystems
          land in this ecosystem's pending review queue when their geographic tags overlap with the values below.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">State (2-letter code)</label>
            <input
              type="text"
              value={geoState}
              maxLength={2}
              onChange={(e) => setGeoState(e.target.value.toUpperCase())}
              className="w-32 px-3 py-2 border border-gray-300 rounded text-sm uppercase"
              placeholder="CT"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Metro areas (comma-separated)</label>
            <input
              type="text"
              value={geoMetros}
              onChange={(e) => setGeoMetros(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              placeholder="new-haven-metro, hartford-metro"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adjacent regions (comma-separated)</label>
            <input
              type="text"
              value={geoAdjacent}
              onChange={(e) => setGeoAdjacent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              placeholder="MA, NY, RI"
            />
          </div>
        </div>
      </Card>

      <Card title="Auto-approve threshold">
        <p className="text-sm text-gray-600 mb-3">
          Default confidence threshold for AI-classified events. Above this score, events publish automatically.
          Between 0.5 and this threshold, they go to pending review. Per-source overrides take precedence.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="font-mono text-sm w-16 text-right">{threshold.toFixed(2)}</span>
        </div>
      </Card>

      <Card title="Sources to monitor">
        <p className="text-sm text-gray-600 mb-3">
          Add iCal or RSS feeds (or per-source URLs) the calendar should poll. Sources are managed in detail on the{' '}
          <strong>Sources</strong> tab; this is a quick add for setup.
        </p>
        <button
          type="button"
          onClick={onAddSource}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          + Add URL to monitor
        </button>
      </Card>

      <Card title="Manual event entry">
        <p className="text-sm text-gray-600 mb-3">
          Add a one-off event directly to the calendar. Skips the AI ingest pipeline and publishes immediately.
        </p>
        <button
          type="button"
          onClick={onAddEvent}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          + Add event manually
        </button>
      </Card>

      <Card title="Inbound email submissions">
        <p className="text-sm text-gray-600 mb-3">
          Forward newsletters and event announcements to the address below. Each message is parsed by the existing
          Postmark webhook and dispatched into the calendar pipeline.
        </p>
        <div className="bg-gray-100 rounded p-3 font-mono text-xs break-all flex items-center gap-2">
          <span className="flex-1">{inboundAddress}</span>
          <button
            type="button"
            onClick={() => copyToClipboard(inboundAddress)}
            className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
          >
            Copy
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {routeStatus === 'exists' ? (
            <Badge color="green">Route active</Badge>
          ) : routeStatus === 'missing' ? (
            <>
              <Badge color="yellow">Route not configured</Badge>
              <button
                type="button"
                onClick={handleCreateRoute}
                disabled={routeBusy}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {routeBusy ? 'Creating…' : 'Create route'}
              </button>
            </>
          ) : (
            <Badge color="gray">Route status unknown</Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          The wildcard catch-all at <code>*@{INBOUND_DOMAIN}</code> must be configured in Postmark for this address to
          receive messages.
        </p>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveBusy}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {saveBusy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
};

const ManualEventModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  viewer: ReturnType<typeof useViewer>;
  repos: ReturnType<typeof useRepos>;
}> = ({ isOpen, onClose, onSaved, viewer, repos }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setStartTime('');
    setEndTime('');
    setAllDay(false);
    setLocationText('');
    setOrganizerName('');
    setTags([]);
    setError(null);
  };

  const handleSave = async () => {
    if (!title || !startTime) {
      setError('Title and start time are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = generateRandomId('evt');
      const now = new Date().toISOString();
      const startIso = new Date(startTime).toISOString();
      const endIso = endTime ? new Date(endTime).toISOString() : undefined;
      const event: CalendarEvent = {
        id,
        title,
        description,
        url: url || undefined,
        start_time: startIso,
        end_time: endIso,
        all_day: allDay,
        location: locationText ? { text: locationText } : undefined,
        organizer: organizerName ? { name: organizerName } : undefined,
        tags,
        scope: 'local',
        geographic_tags: [],
        source_type: 'manual',
        submitted_by: viewer.personId,
        fingerprint: `manual_${id}`,
        ai_confidence: 1,
        ai_flags: [],
        status: 'approved',
        visibility: 'public',
        source_ecosystem_id: viewer.ecosystemId,
        visible_in_ecosystems: [viewer.ecosystemId],
        reviewed_by: viewer.personId,
        reviewed_at: now,
        created_at: now,
        updated_at: now,
        open_flag_count: 0,
      };
      await repos.calendar.createEvent(event);
      reset();
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'Unable to create event.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add event manually">
      <div className="space-y-3">
        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="Founder pitch night"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">End (optional)</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All-day event
        </label>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="MakeHaven, 770 Chapel St, New Haven CT"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Organizer</label>
          <input
            type="text"
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Registration URL (optional)</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_EVENT_TAGS.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTags((prev) =>
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
            disabled={!title || !startTime || busy}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add event'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
