
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FirebaseAdminAuditRepo } from '../../data/repos/firebase/adminAudit';
import { useViewer } from '../../data/AppDataContext';
import { useAdminReadLogger } from '../../data/useAdminReadLogger';
import type { AdminReadEvent, AdminReadSurface } from '../../domain/audit/types';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const repo = new FirebaseAdminAuditRepo();

const SURFACE_LABELS: Record<AdminReadSurface, string> = {
  org_detail: 'Org detail',
  interaction_detail: 'Interaction detail',
  people_detail: 'Person detail',
  admin_access_log_viewer: 'Audit log viewer',
};

const formatTime = (iso: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export const AdminAccessLogView: React.FC = () => {
  const viewer = useViewer();
  const [events, setEvents] = useState<AdminReadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'ecosystem' | 'all'>('ecosystem');
  const [surfaceFilter, setSurfaceFilter] = useState<AdminReadSurface | 'all'>('all');
  const [actorFilter, setActorFilter] = useState<string>('');

  // Audit the auditor: opening this view is itself a tier-5 read.
  useAdminReadLogger({
    resourceType: 'organization',
    resourceId: 'admin_access_log',
    surface: 'admin_access_log_viewer',
    active: true,
  });

  const isPlatformAdmin = viewer.role === 'platform_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts = scope === 'ecosystem'
        ? { ecosystemId: viewer.ecosystemId, limit: 500 }
        : { limit: 500 };
      const list = await repo.getRecent(opts);
      setEvents(list);
    } catch {
      setError('Could not load admin access log.');
    } finally {
      setLoading(false);
    }
  }, [scope, viewer.ecosystemId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (surfaceFilter !== 'all' && e.surface !== surfaceFilter) return false;
      if (actorFilter && !e.actor_name.toLowerCase().includes(actorFilter.toLowerCase())) return false;
      return true;
    });
  }, [events, surfaceFilter, actorFilter]);

  const distinctActors = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.actor_name, (m.get(e.actor_name) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [events]);

  if (!isFirebaseEnabled()) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Admin access log requires the Firebase backend. In demo mode, no reads are persisted.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Admin Access Log</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Tier-5 audit trail. Records every time a platform or ecosystem admin opens data they don't own.
            This makes admin trust observable rather than asserted — see the 5-tier privacy model.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Scope</label>
          <div className="inline-flex rounded border border-gray-300 overflow-hidden">
            <button
              onClick={() => setScope('ecosystem')}
              className={`px-3 py-1.5 text-xs ${scope === 'ecosystem' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              This ecosystem
            </button>
            {isPlatformAdmin && (
              <button
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 text-xs border-l border-gray-300 ${scope === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                All ecosystems
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Surface</label>
          <select
            value={surfaceFilter}
            onChange={(e) => setSurfaceFilter(e.target.value as AdminReadSurface | 'all')}
            className="border border-gray-300 rounded px-2 py-1.5 text-xs"
          >
            <option value="all">All surfaces</option>
            {(Object.keys(SURFACE_LABELS) as AdminReadSurface[]).map((s) => (
              <option key={s} value={s}>{SURFACE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Actor</label>
          <input
            type="text"
            placeholder="Filter by name…"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
        </div>
        <div className="text-xs text-gray-500">
          {filtered.length} of {events.length} events
        </div>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">When</th>
              <th className="text-left px-3 py-2 font-semibold">Actor</th>
              <th className="text-left px-3 py-2 font-semibold">Role</th>
              <th className="text-left px-3 py-2 font-semibold">Surface</th>
              <th className="text-left px-3 py-2 font-semibold">Resource</th>
              <th className="text-left px-3 py-2 font-semibold">Ecosystem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatTime(e.timestamp)}</td>
                <td className="px-3 py-2 text-gray-900">{e.actor_name}</td>
                <td className="px-3 py-2 text-gray-600 text-xs uppercase tracking-wide">{e.actor_role.replace('_', ' ')}</td>
                <td className="px-3 py-2 text-gray-700">{SURFACE_LABELS[e.surface] ?? e.surface}</td>
                <td className="px-3 py-2 text-gray-600 text-xs font-mono break-all">
                  <span className="text-gray-400 mr-1">{e.resource_type}:</span>
                  {e.resource_id}
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs font-mono">{e.ecosystem_id}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                  No admin reads recorded {scope === 'ecosystem' ? 'in this ecosystem' : 'on the platform'} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {distinctActors.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Top actors</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {distinctActors.slice(0, 12).map(([name, count]) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="text-gray-800 truncate">{name}</span>
                <span className="text-xs text-gray-500 ml-2">{count} read{count === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
