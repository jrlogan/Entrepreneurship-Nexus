import React, { useEffect, useMemo, useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import type { NetworkStats, StatsWindow } from '../../data/networkStats';
import { suppressSmall, SMALL_CELL_THRESHOLD } from '../../../functions/src/metrics/networkStats';
import { Card } from '../../shared/ui/Components';

/**
 * Network statistics — what the partners achieve together, anonymous and
 * aggregate. A byproduct of the referrals, participation and activity partners
 * already record; no separate reporting.
 *
 * "Publication view" hides counts of entrepreneurs below five, for sharing
 * outside the network (funders, the state) without small cells that could
 * point to an individual.
 */

type Preset = '90d' | 'year' | 'all';

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const windowFor = (preset: Preset): StatsWindow => {
  if (preset === '90d') return { from: isoDaysAgo(90) };
  if (preset === 'year') return { from: `${new Date().getFullYear()}-01-01` };
  return {};
};

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const days = (value: number | null) => (value === null ? '—' : `${value} day${value === 1 ? '' : 's'}`);

export const NetworkStatsView = () => {
  const repos = useRepos();
  const viewer = useViewer();
  const [preset, setPreset] = useState<Preset>('all');
  const [publication, setPublication] = useState(false);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [error, setError] = useState('');

  const window = useMemo(() => windowFor(preset), [preset]);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError('');
    repos.networkStats.get(viewer, window)
      .then((next) => { if (!cancelled) setStats(next); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Could not load network statistics.'); });
    return () => { cancelled = true; };
  }, [repos, viewer, window]);

  /** People counts — suppressed in publication view. Referral/program counts are about records, not people. */
  const people = (value: number) => {
    if (!publication) return value.toLocaleString();
    const shown = suppressSmall(value);
    return shown === null ? `<${SMALL_CELL_THRESHOLD}` : shown.toLocaleString();
  };

  const downloadCsv = () => {
    if (!stats) return;
    const rows: Array<[string, string]> = [
      ['Window', `${window.from || 'all time'} to ${window.to || 'today'}`],
      ['Entrepreneurs served (counted once)', people(stats.entrepreneurs.served)],
      ['Served by two or more partners', people(stats.entrepreneurs.served_by_two_or_more)],
      ['Referrals sent', String(stats.referrals.sent)],
      ['Referral acceptance rate', pct(stats.referrals.acceptance_rate)],
      ['Referral completion rate', pct(stats.referrals.completion_rate)],
      ['Median days to response', days(stats.referrals.median_days_to_response)],
      ['Active program participation', String(stats.participation.active)],
      ['Shared activity', String(stats.activity.shared_facts)],
    ];
    const csv = rows.map(([k, v]) => `"${k}","${v}"`).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `network-stats-${viewer.ecosystemId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm" role="group" aria-label="Time range">
          {([['90d', 'Last 90 days'], ['year', 'This year'], ['all', 'All time']] as Array<[Preset, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              aria-pressed={preset === id}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${preset === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={publication} onChange={(e) => setPublication(e.target.checked)} />
            Publication view (hide counts under {SMALL_CELL_THRESHOLD})
          </label>
          <button type="button" onClick={downloadCsv} disabled={!stats} className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Download CSV
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
      {!stats && !error && <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow-sm">Loading…</div>}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Entrepreneurs served" value={people(stats.entrepreneurs.served)}
              note={`Each counted once. Adding up partners' own counts would say ${people(stats.entrepreneurs.naive_sum_across_partners)}.`} />
            <Tile label="Served by 2+ partners" value={people(stats.entrepreneurs.served_by_two_or_more)}
              note="Entrepreneurs more than one partner supported — collaboration, measured." />
            <Tile label="Referral acceptance" value={pct(stats.referrals.acceptance_rate)}
              note={`${stats.referrals.sent} sent · ${stats.referrals.completed} completed · ${stats.referrals.declined} declined`} />
            <Tile label="Time to first answer" value={days(stats.referrals.median_days_to_response)}
              note={stats.referrals.waiting_over_14_days ? `${stats.referrals.waiting_over_14_days} waiting more than 14 days` : 'Median, sent to accepted or declined'} />
          </div>

          <Card title="Referrals between partners">
            {stats.referrals.by_org_pair.length === 0 ? (
              <p className="text-sm text-gray-500">No referrals in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="py-2 pr-4 font-medium">From</th>
                      <th className="py-2 pr-4 font-medium">To</th>
                      <th className="py-2 pr-4 text-right font-medium">Sent</th>
                      <th className="py-2 pr-4 text-right font-medium">Accepted</th>
                      <th className="py-2 text-right font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {stats.referrals.by_org_pair.map((row) => (
                      <tr key={`${row.from_org_id}>${row.to_org_id}`} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-gray-900">{row.from_org_name}</td>
                        <td className="py-2 pr-4 text-gray-900">{row.to_org_name}</td>
                        <td className="py-2 pr-4 text-right text-gray-700">{row.sent}</td>
                        <td className="py-2 pr-4 text-right text-gray-700">{row.accepted}</td>
                        <td className="py-2 text-right text-gray-700">{row.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Median time to close a completed referral: {days(stats.referrals.median_days_to_close)} · completion rate of decided referrals: {pct(stats.referrals.completion_rate)}.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Program participation">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-gray-600">Active now</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{stats.participation.active}</dd>
                <dt className="text-gray-600">Started in this period</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{stats.participation.started_in_window}</dd>
                <dt className="text-gray-600">Completed in this period</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{stats.participation.completed_in_window}</dd>
                {Object.entries(stats.participation.by_type).map(([type, count]) => (
                  <React.Fragment key={type}>
                    <dt className="pl-3 capitalize text-gray-500">{type} (active)</dt>
                    <dd className="text-right tabular-nums text-gray-700">{count}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </Card>
            <Card title="Shared activity">
              <p className="mb-3 text-sm text-gray-600">Meetings and sessions partners chose to share as facts. Private activity is not counted.</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-gray-600">Total</dt><dd className="text-right font-semibold tabular-nums text-gray-900">{stats.activity.shared_facts}</dd>
                {Object.entries(stats.activity.by_type).map(([type, count]) => (
                  <React.Fragment key={type}>
                    <dt className="pl-3 capitalize text-gray-500">{type}</dt>
                    <dd className="text-right tabular-nums text-gray-700">{count}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </Card>
          </div>

          <Card title="By partner">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-4 font-medium">Partner</th>
                    <th className="py-2 pr-4 text-right font-medium">Entrepreneurs served</th>
                    <th className="py-2 pr-4 text-right font-medium">Referrals sent</th>
                    <th className="py-2 pr-4 text-right font-medium">Received</th>
                    <th className="py-2 text-right font-medium">Answered</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {stats.partners.map((row) => (
                    <tr key={row.org_id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-gray-900">{row.org_name}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{people(row.entrepreneurs_served)}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{row.referrals_sent}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{row.referrals_received}</td>
                      <td className="py-2 text-right text-gray-700">{pct(row.referrals_answered_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Network results belong to the network — the membership agreement asks that no partner present them as solely its own.
            </p>
          </Card>
        </>
      )}
    </div>
  );
};

const Tile = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
    <div className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{value}</div>
    <div className="mt-2 text-xs text-gray-500">{note}</div>
  </div>
);
