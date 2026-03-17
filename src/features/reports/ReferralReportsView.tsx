
import React, { useEffect, useMemo, useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, InfoBanner } from '../../shared/ui/Components';
import { IconShare, IconRocket, IconBuilding, IconCheck } from '../../shared/ui/Icons';
import { loadEnums } from '../../domain/standards/loadStandards';
import type { Referral } from '../../domain/referrals/types';
import type { Organization } from '../../domain/organizations/types';
import type { Person } from '../../domain/people/types';

export const ReferralReportsView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    
    const enums = loadEnums();

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            const [nextReferrals, nextOrganizations, nextPeople] = await Promise.all([
                repos.referrals.getAll(viewer),
                repos.organizations.getAll(viewer, viewer.ecosystemId),
                repos.people.getAll(viewer.ecosystemId),
            ]);

            if (!cancelled) {
                setReferrals(nextReferrals);
                setOrganizations(nextOrganizations);
                setPeople(nextPeople);
            }
        };

        void loadData();
        return () => {
            cancelled = true;
        };
    }, [repos, viewer]);

    // --- Statistics Calculation ---
    const stats = useMemo(() => {
        const total = referrals.length;
        if (total === 0) return null;

        // 1. Status Counts
        const counts = {
            pending: 0,
            accepted: 0,
            rejected: 0,
            completed: 0
        };
        
        // 2. Velocity (Time to Close)
        let totalDaysToClose = 0;
        let closedCount = 0;

        // 3. Outcomes
        const outcomes: Record<string, number> = {};

        // 4. Leaderboards
        const senders: Record<string, number> = {};
        const receivers: Record<string, number> = {};
        const individualReferrers: Record<string, number> = {};

        referrals.forEach(r => {
            // Status
            if (counts[r.status] !== undefined) counts[r.status]++;

            // Velocity
            if (r.status === 'completed' && r.closed_at) {
                const start = new Date(r.date).getTime();
                const end = new Date(r.closed_at).getTime();
                const days = (end - start) / (1000 * 3600 * 24);
                totalDaysToClose += days;
                closedCount++;
            }

            // Outcomes
            if (r.status === 'completed' && r.outcome) {
                outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
            }

            // Leaderboards
            if (r.referring_org_id) senders[r.referring_org_id] = (senders[r.referring_org_id] || 0) + 1;
            if (r.receiving_org_id) receivers[r.receiving_org_id] = (receivers[r.receiving_org_id] || 0) + 1;
            if (r.referring_person_id) individualReferrers[r.referring_person_id] = (individualReferrers[r.referring_person_id] || 0) + 1;
        });

        const avgVelocity = closedCount > 0 ? Math.round(totalDaysToClose / closedCount) : 0;
        const completionRate = Math.round((counts.completed / total) * 100);

        // Sort Leaderboards
        const topSenders = Object.entries(senders)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([id, count]) => ({ id, count, name: organizations.find(o => o.id === id)?.name || 'Unknown' }));

        const topReceivers = Object.entries(receivers)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([id, count]) => ({ id, count, name: organizations.find(o => o.id === id)?.name || 'Unknown' }));

        const topIndividualReferrers = Object.entries(individualReferrers)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([id, count]) => {
                const p = people.find(person => person.id === id);
                const name = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown';
                const org = p?.primary_organization_id ? organizations.find(o => o.id === p.primary_organization_id)?.name ?? null : null;
                return { id, count, name, org };
            });

        return {
            total,
            counts,
            avgVelocity,
            completionRate,
            outcomes,
            topSenders,
            topReceivers,
            topIndividualReferrers,
        };
    }, [referrals, organizations, people]);

    if (!stats) {
        return (
            <div className="p-12 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <IconShare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900">No Referral Data</h3>
                <p className="text-gray-500">The ecosystem network hasn't made any referrals yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <InfoBanner title="Network Health Report">
                <p>This report analyzes the "Warm Handoffs" occurring within the ecosystem. It tracks how efficiently partners are connecting entrepreneurs to resources and the tangible outcomes of those connections.</p>
            </InfoBanner>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><IconShare className="w-5 h-5" /></div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Total Volume</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Referrals made all-time</div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600"><IconCheck className="w-5 h-5" /></div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Completion Rate</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{stats.completionRate}%</div>
                    <div className="text-xs text-gray-500 mt-1">{stats.counts.completed} successfully closed</div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><IconRocket className="w-5 h-5" /></div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Avg Velocity</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{stats.avgVelocity} <span className="text-base font-normal text-gray-500">days</span></div>
                    <div className="text-xs text-gray-500 mt-1">Time from Intro to Outcome</div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600"><IconBuilding className="w-5 h-5" /></div>
                        <span className="text-sm font-bold text-gray-500 uppercase">Active Pipeline</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{stats.counts.pending + stats.counts.accepted}</div>
                    <div className="text-xs text-gray-500 mt-1">Pending or In Progress</div>
                </div>
            </div>

            {/* Status Breakdown */}
            <Card title="Referral Pipeline Status">
                <div className="flex flex-col md:flex-row items-center justify-between text-center divide-y md:divide-y-0 md:divide-x divide-gray-100">
                    <div className="flex-1 p-4 w-full md:w-auto">
                        <div className="text-2xl font-bold text-yellow-600">{stats.counts.pending}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pending Review</div>
                    </div>
                    <div className="flex-1 p-4 w-full md:w-auto">
                        <div className="text-2xl font-bold text-blue-600">{stats.counts.accepted}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Accepted (In Progress)</div>
                    </div>
                    <div className="flex-1 p-4 w-full md:w-auto">
                        <div className="text-2xl font-bold text-green-600">{stats.counts.completed}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Completed</div>
                    </div>
                    <div className="flex-1 p-4 w-full md:w-auto">
                        <div className="text-2xl font-bold text-red-600">{stats.counts.rejected}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Declined</div>
                    </div>
                </div>
                <div className="mt-4 h-3 flex rounded-full overflow-hidden bg-gray-100">
                    {stats.counts.pending > 0 && <div style={{ width: `${(stats.counts.pending / stats.total) * 100}%` }} className="bg-yellow-400" title="Pending"></div>}
                    {stats.counts.accepted > 0 && <div style={{ width: `${(stats.counts.accepted / stats.total) * 100}%` }} className="bg-blue-500" title="Accepted"></div>}
                    {stats.counts.completed > 0 && <div style={{ width: `${(stats.counts.completed / stats.total) * 100}%` }} className="bg-green-500" title="Completed"></div>}
                    {stats.counts.rejected > 0 && <div style={{ width: `${(stats.counts.rejected / stats.total) * 100}%` }} className="bg-red-400" title="Rejected"></div>}
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Outcomes Breakdown */}
                <Card title="Impact Outcomes (Completed Referrals)">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">What happened as a result of these connections?</p>
                        {Object.keys(stats.outcomes).length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No completed outcomes recorded yet.</p>
                        ) : (
                            Object.entries(stats.outcomes).map(([key, count]) => {
                                const label = enums.ReferralOutcome.find(o => o.id === key)?.label || key;
                                const percent = Math.round((count / stats.counts.completed) * 100);
                                return (
                                    <div key={key}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-gray-700">{label}</span>
                                            <span className="text-gray-500">{count} ({percent}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Card>

                {/* Top Connectors */}
                <Card title="Top Ecosystem Connectors">
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">Top Referrers (Sources)</h4>
                            <ul className="space-y-3">
                                {stats.topSenders.map((org, i) => (
                                    <li key={i} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400 font-mono text-xs w-4">{i + 1}.</span>
                                            <span className="font-medium text-gray-900 truncate max-w-[120px]" title={org.name}>{org.name}</span>
                                        </div>
                                        <Badge color="blue">{org.count}</Badge>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 border-b pb-2">Top Receivers (Destinations)</h4>
                            <ul className="space-y-3">
                                {stats.topReceivers.map((org, i) => (
                                    <li key={i} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-400 font-mono text-xs w-4">{i + 1}.</span>
                                            <span className="font-medium text-gray-900 truncate max-w-[120px]" title={org.name}>{org.name}</span>
                                        </div>
                                        <Badge color="purple">{org.count}</Badge>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Individual Connector Leaderboard */}
            {stats.topIndividualReferrers.length > 0 && (
            <Card title="Individual Connector Leaderboard">
                <p className="text-sm text-gray-500 mb-4">Staff members who have made the most referrals, tracked from inbound emails where the sender is a known system user.</p>
                <ul className="divide-y divide-gray-100">
                    {stats.topIndividualReferrers.map((entry, i) => (
                        <li key={entry.id} className="flex items-center justify-between py-3 text-sm">
                            <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                                    {i + 1}
                                </span>
                                <div>
                                    <div className="font-medium text-gray-900">{entry.name}</div>
                                    {entry.org && <div className="text-xs text-gray-500">{entry.org}</div>}
                                </div>
                            </div>
                            <Badge color="blue">{entry.count} referral{entry.count === 1 ? '' : 's'}</Badge>
                        </li>
                    ))}
                </ul>
            </Card>
            )}
        </div>
    );
};
