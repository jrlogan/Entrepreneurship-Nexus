
import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode } from '../../app/types';
import { getDocs, collection, orderBy, query, doc, updateDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../../services/firebaseApp';
import { callHttpFunction } from '../../services/httpFunctionClient';

interface Tool {
  view: ViewMode;
  label: string;
  description: string;
  icon: string;
  scope: 'platform' | 'ecosystem';
}

const PLATFORM_TOOLS: Tool[] = [
  {
    view: 'ecosystem_config',
    label: 'Ecosystem Config',
    description: 'Manage ecosystem settings, feature flags, portal links, and AI advisor configuration for any ecosystem.',
    icon: '⚙️',
    scope: 'ecosystem',
  },
  {
    view: 'user_management',
    label: 'User Management',
    description: 'View, invite, and manage user accounts and role assignments across the platform.',
    icon: '👥',
    scope: 'platform',
  },
  {
    view: 'inbound_intake',
    label: 'Inbound Intake',
    description: 'Review inbound email and referral submissions. Manage routing rules that map email addresses to ecosystems.',
    icon: '📥',
    scope: 'platform',
  },
  {
    view: 'data_quality',
    label: 'Data Quality',
    description: 'Detect and merge duplicate organizations. Review data completeness and flag records needing attention.',
    icon: '🔍',
    scope: 'ecosystem',
  },
  {
    view: 'metrics_manager',
    label: 'Metrics Manager',
    description: 'Define metric sets, assign metrics to organizations, and manage reporting templates.',
    icon: '📊',
    scope: 'platform',
  },
  {
    view: 'data_standards',
    label: 'Data Standards',
    description: 'Configure taxonomy, tag vocabularies, and field validation rules used across all ecosystems.',
    icon: '📋',
    scope: 'platform',
  },
  {
    view: 'api_console',
    label: 'API Console',
    description: 'Explore and test the internal API. Inspect Firestore documents and run diagnostic queries.',
    icon: '🖥️',
    scope: 'platform',
  },
];

interface Props {
  onNavigate: (view: ViewMode) => void;
}

interface FeedbackItem {
  _id: string;
  created_at: string;
  person_name: string | null;
  role: string | null;
  org_name: string | null;
  current_view: string | null;
  text: string;
  url: string | null;
  resolved?: boolean;
  person_id?: string | null;
  org_id?: string | null;
  ecosystem_id?: string | null;
  user_agent?: string | null;
  screen_width?: number | null;
  screen_height?: number | null;
}

const downloadFeedbackCsv = (items: FeedbackItem[]) => {
  const cols = ['created_at', 'person_name', 'role', 'org_name', 'current_view', 'text', 'url', 'resolved', 'screen_width', 'screen_height', 'person_id', 'org_id', 'ecosystem_id', 'user_agent'];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...items.map(r => cols.map(c => escape((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

type BulkResult = { id: string; name: string; status: string };

const EsoProfileGenerator = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [error, setError] = useState('');
  const [force, setForce] = useState(false);

  const run = async () => {
    setRunning(true);
    setError('');
    setResults(null);
    try {
      const res = await callHttpFunction<{ bulk: boolean; force: boolean }, { ok: boolean; results: BulkResult[] }>(
        'generateEsoProfile', { bulk: true, force }
      );
      setResults(res.results);
    } catch (e: any) {
      setError(e?.message || 'Generation failed.');
    } finally {
      setRunning(false);
    }
  };

  const statusColor = (s: string) =>
    s === 'generated' ? 'text-green-700' :
    s === 'skipped_manual' ? 'text-gray-400' :
    s === 'skipped_already_generated' ? 'text-indigo-400' :
    'text-red-600';

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">ESO Profile Generator</h2>
          <p className="text-xs text-gray-400 mt-0.5">Uses AI to generate markdown descriptions for ESOs from their websites. Manual descriptions are preserved.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} className="rounded" />
            Force regenerate all
          </label>
          <button
            onClick={() => void run()}
            disabled={running}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40"
          >
            {running ? '⏳ Running…' : '✨ Generate ESO Profiles'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {results && (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {results.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-gray-800">{r.name}</span>
              <span className={`text-xs font-medium ${statusColor(r.status)}`}>{r.status.replace(/_/g, ' ')}</span>
            </div>
          ))}
          <div className="px-4 py-2 text-xs text-gray-400">
            {results.filter(r => r.status === 'generated').length} generated ·{' '}
            {results.filter(r => r.status.startsWith('skipped')).length} skipped ·{' '}
            {results.filter(r => r.status.startsWith('failed')).length} failed
          </div>
        </div>
      )}
    </section>
  );
};

export const PlatformAdminView = ({ onNavigate }: Props) => {
  const platformTools = PLATFORM_TOOLS.filter(t => t.scope === 'platform');
  const ecosystemTools = PLATFORM_TOOLS.filter(t => t.scope === 'ecosystem');
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    const db = getFirestoreDb();
    if (!db) { setFeedbackError('Not available in demo mode.'); return; }
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      const snap = await getDocs(query(collection(db, 'feedback'), orderBy('created_at', 'desc')));
      setFeedback(snap.docs.map(d => ({ _id: d.id, ...d.data() } as FeedbackItem)));
    } catch {
      setFeedbackError('Error loading feedback.');
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  useEffect(() => { void loadFeedback(); }, [loadFeedback]);

  const handleResolve = async (item: FeedbackItem) => {
    const db = getFirestoreDb();
    if (!db) return;
    setResolvingId(item._id);
    try {
      await updateDoc(doc(db, 'feedback', item._id), { resolved: !item.resolved });
      setFeedback(prev => prev.map(f => f._id === item._id ? { ...f, resolved: !f.resolved } : f));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Administration</h1>
        <p className="mt-1 text-sm text-gray-500">
          System-wide tools and settings. Changes here affect all ecosystems unless scoped otherwise.
        </p>
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Platform-Wide</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {platformTools.map(tool => (
            <button
              key={tool.view}
              onClick={() => onNavigate(tool.view)}
              className="text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-400 hover:shadow-sm transition group"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{tool.icon}</span>
                <div>
                  <div className="font-semibold text-gray-900 group-hover:text-indigo-700 transition">{tool.label}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{tool.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Per-Ecosystem</h2>
        <p className="text-xs text-gray-400 mb-3">
          Use the ecosystem switcher in the sidebar to target a specific ecosystem before opening these tools.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ecosystemTools.map(tool => (
            <button
              key={tool.view}
              onClick={() => onNavigate(tool.view)}
              className="text-left p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-400 hover:shadow-sm transition group"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{tool.icon}</span>
                <div>
                  <div className="font-semibold text-gray-900 group-hover:text-indigo-700 transition">{tool.label}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{tool.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <EsoProfileGenerator />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">User Feedback</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
              Show resolved
            </label>
            <button
              onClick={() => downloadFeedbackCsv(feedback)}
              disabled={feedback.length === 0}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Download CSV
            </button>
            <button
              onClick={() => void loadFeedback()}
              disabled={feedbackLoading}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              {feedbackLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {feedbackError && <p className="text-sm text-red-600 mb-2">{feedbackError}</p>}

        {(() => {
          const visible = feedback.filter(f => showResolved || !f.resolved);
          const resolvedCount = feedback.filter(f => f.resolved).length;
          if (feedbackLoading && feedback.length === 0) {
            return <p className="text-sm text-gray-400 text-center py-6">Loading feedback…</p>;
          }
          if (feedback.length === 0) {
            return <p className="text-sm text-gray-400 text-center py-6">No feedback submitted yet.</p>;
          }
          if (visible.length === 0) {
            return <p className="text-sm text-gray-400 text-center py-6">All {resolvedCount} item{resolvedCount !== 1 ? 's' : ''} resolved. Check "Show resolved" to review them.</p>;
          }
          return (
            <div className="space-y-2">
              {resolvedCount > 0 && !showResolved && (
                <p className="text-xs text-gray-400">{resolvedCount} resolved item{resolvedCount !== 1 ? 's' : ''} hidden.</p>
              )}
              {visible.map(item => (
                <div
                  key={item._id}
                  className={`bg-white rounded-lg border px-4 py-3 flex gap-4 items-start transition-opacity ${item.resolved ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mb-1">
                      <span className="font-medium text-gray-700">{item.person_name || 'Unknown'}</span>
                      {item.role && <span>· {item.role.replace(/_/g, ' ')}</span>}
                      {item.org_name && <span>· {item.org_name}</span>}
                      {item.current_view && <span>· view: {item.current_view}</span>}
                      <span>· {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.text}</p>
                  </div>
                  <button
                    onClick={() => void handleResolve(item)}
                    disabled={resolvingId === item._id}
                    title={item.resolved ? 'Mark as open' : 'Mark as resolved'}
                    className={`shrink-0 mt-0.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                      item.resolved
                        ? 'border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-600'
                        : 'border-green-300 text-green-700 hover:bg-green-50'
                    } disabled:opacity-50`}
                  >
                    {resolvingId === item._id ? '…' : item.resolved ? 'Reopen' : '✓ Resolve'}
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
};
