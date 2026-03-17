
import React, { useState } from 'react';
import { ViewMode } from '../../app/types';
import { getDocs, collection, orderBy, query } from 'firebase/firestore';
import { getFirestoreDb } from '../../services/firebaseApp';

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

const downloadFeedback = async (setStatus: (s: string) => void) => {
  const db = getFirestoreDb();
  if (!db) { setStatus('Not available in demo mode.'); return; }
  setStatus('Fetching…');
  try {
    const snap = await getDocs(query(collection(db, 'feedback'), orderBy('created_at', 'desc')));
    const rows = snap.docs.map(d => d.data());
    if (rows.length === 0) { setStatus('No feedback yet.'); return; }

    // Build CSV
    const cols = ['created_at', 'person_name', 'role', 'org_name', 'current_view', 'text', 'url', 'screen_width', 'screen_height', 'person_id', 'org_id', 'ecosystem_id', 'user_agent'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => escape((r as Record<string, unknown>)[c])).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${rows.length} entries.`);
    setTimeout(() => setStatus(''), 3000);
  } catch (e) {
    setStatus('Error fetching feedback.');
  }
};

export const PlatformAdminView = ({ onNavigate }: Props) => {
  const platformTools = PLATFORM_TOOLS.filter(t => t.scope === 'platform');
  const ecosystemTools = PLATFORM_TOOLS.filter(t => t.scope === 'ecosystem');
  const [feedbackStatus, setFeedbackStatus] = useState('');

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

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">User Feedback</h2>
        <div className="p-4 bg-white rounded-lg border border-gray-200 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-gray-900">Download Feedback Log</div>
            <div className="text-sm text-gray-500 mt-0.5">Export all submitted feedback as a CSV for review.</div>
            {feedbackStatus && <div className="text-xs text-indigo-600 mt-1">{feedbackStatus}</div>}
          </div>
          <button
            onClick={() => void downloadFeedback(setFeedbackStatus)}
            className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition"
          >
            Download CSV
          </button>
        </div>
      </section>
    </div>
  );
};
