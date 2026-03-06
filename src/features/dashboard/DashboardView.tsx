
import React, { useMemo } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, DemoLink } from '../../shared/ui/Components';
import { MetricLog } from '../../domain/metrics/types';
import { IconChart } from '../../shared/ui/Icons';

export const DashboardView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    
    // Fetch Data (scoped by repo policies)
    const organizations = repos.organizations.getAll(viewer, viewer.ecosystemId);
    const people = repos.people.getAll(viewer.ecosystemId);
    const interactions = repos.interactions.getAll(viewer, viewer.ecosystemId);
    // Updated to use viewer-aware method
    const initiatives = repos.pipelines.getInitiativesForViewer(viewer, viewer.ecosystemId);
    const referrals = repos.referrals.getAll(viewer); 
    const metricsLogs = repos.metrics.getAll(viewer);

    // Role Logic
    const isEcoManager = ['platform_admin', 'ecosystem_manager'].includes(viewer.role);
    const isEso = ['eso_admin', 'eso_staff', 'eso_coach'].includes(viewer.role);
    const isEntrepreneur = viewer.role === 'entrepreneur';

    // Metrics Calculation
    const metrics = useMemo(() => {
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        if (isEcoManager) {
            return [
                { label: "Total Organizations", value: organizations.length, color: "text-indigo-600" },
                { label: "Network Participants", value: people.length, color: "text-green-600" },
                { label: "Total Interactions", value: interactions.length, color: "text-blue-600" },
                { label: "Active Projects", value: initiatives.filter(i => i.status === 'active').length, color: "text-purple-600" }
            ];
        }

        if (isEso) {
            // ESO Context: Focus on served clients and output
            const myClients = organizations.filter(o => o.managed_by_ids?.includes(viewer.orgId));
            const recentInteractions = interactions.filter(i => 
                i.author_org_id === viewer.orgId && 
                new Date(i.date) >= oneYearAgo
            );
            const pendingReferrals = referrals.filter(r => r.receiving_org_id === viewer.orgId && r.status === 'pending');
            
            // Projects belonging to my clients
            const clientProjectIds = new Set(myClients.map(c => c.id));
            const activeClientProjects = initiatives.filter(i => clientProjectIds.has(i.organization_id) && i.status === 'active');

            return [
                { label: "Active Clients Served", value: myClients.length, color: "text-indigo-600" },
                { label: "Interactions (Last 12m)", value: recentInteractions.length, color: "text-blue-600" },
                { label: "Pending Referrals", value: pendingReferrals.length, color: "text-orange-600" },
                { label: "Client Projects", value: activeClientProjects.length, color: "text-purple-600" }
            ];
        }

        if (isEntrepreneur) {
            // Entrepreneur Context: Focus on my stuff
            const myVentures = initiatives.filter(i => i.organization_id === viewer.orgId);
            const myTeam = people.filter(p => p.organization_id === viewer.orgId);
            const myOrg = organizations.find(o => o.id === viewer.orgId);
            const supportOrgsCount = myOrg?.managed_by_ids?.length || 0;
            const myInteractions = interactions.filter(i => i.organization_id === viewer.orgId);

            return [
                { label: "Active Initiatives", value: myVentures.filter(i => i.status === 'active').length, color: "text-indigo-600" },
                { label: "Team Size", value: myTeam.length, color: "text-green-600" },
                { label: "Supporting ESOs", value: supportOrgsCount, color: "text-blue-600" },
                { label: "Interactions Logged", value: myInteractions.length, color: "text-gray-600" }
            ];
        }
        
        return [];
    }, [organizations, people, interactions, initiatives, referrals, viewer, isEcoManager, isEso, isEntrepreneur]);

    // Aggregate Impact Logic
    const impactStats = useMemo(() => {
        // Group by Org -> Metric Type -> Latest Log
        const latestValues: Record<string, Record<string, MetricLog>> = {};

        metricsLogs.forEach(log => {
            if (!latestValues[log.organization_id]) {
                latestValues[log.organization_id] = {};
            }
            const current = latestValues[log.organization_id][log.metric_type];
            // Simple logic: Take the one with the latest date
            if (!current || new Date(log.date) > new Date(current.date)) {
                latestValues[log.organization_id][log.metric_type] = log;
            }
        });

        let totalJobs = 0;
        let totalRevenue = 0;
        let totalCapital = 0;
        let verifiedCount = 0;
        let selfReportedCount = 0;

        Object.values(latestValues).forEach(orgMetrics => {
            // Jobs (FT + PT if desired, currently just FT per prompt implication of "Jobs created")
            if (orgMetrics['jobs_ft']) totalJobs += Number(orgMetrics['jobs_ft'].value);
            
            // Revenue
            if (orgMetrics['revenue']) totalRevenue += Number(orgMetrics['revenue'].value);
            
            // Capital
            if (orgMetrics['capital_raised']) totalCapital += Number(orgMetrics['capital_raised'].value);
            
            // Source Breakdown
            Object.values(orgMetrics).forEach(m => {
                if (['jobs_ft', 'revenue', 'capital_raised'].includes(m.metric_type)) {
                    if (m.source === 'verified') verifiedCount++;
                    else selfReportedCount++;
                }
            });
        });

        return { 
            totalJobs, 
            totalRevenue, 
            totalCapital, 
            verifiedCount, 
            selfReportedCount,
            totalSources: verifiedCount + selfReportedCount
        };
    }, [metricsLogs]);

    // Filter Activity List for Relevance
    const recentActivity = useMemo(() => {
        let filtered = interactions;
        if (isEso) {
            // Show interactions authored by my ESO or about my clients
             const myClientIds = organizations.filter(o => o.managed_by_ids?.includes(viewer.orgId)).map(o => o.id);
             filtered = interactions.filter(i => i.author_org_id === viewer.orgId || myClientIds.includes(i.organization_id));
        } else if (isEntrepreneur) {
            // Only about me/my org
            filtered = interactions.filter(i => i.organization_id === viewer.orgId);
        }
        
        return filtered.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    }, [interactions, viewer, isEso, isEntrepreneur, organizations]);

    // Entrepreneur Relationship Data
    const myRelationships = useMemo(() => {
        if (!isEntrepreneur) return null;
        const myOrg = organizations.find(o => o.id === viewer.orgId);
        const supportingOrgs = organizations.filter(o => myOrg?.managed_by_ids?.includes(o.id));
        return { myOrg, supportingOrgs };
    }, [isEntrepreneur, organizations, viewer.orgId]);

    const activityTitle = isEntrepreneur ? "My Recent Activity" : isEso ? "My Organization's Activity" : "Recent Network Activity";

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {metrics.map((m, i) => (
                    <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="text-sm font-medium text-gray-500 uppercase truncate" title={m.label}>{m.label}</div>
                        <div className={`mt-2 text-3xl font-bold ${m.color}`}>{m.value}</div>
                    </div>
                ))}
            </div>

            {/* Ecosystem Impact Card (Admin/ESO only) */}
            {(isEcoManager || isEso) && (
                <Card title={isEcoManager ? "Ecosystem Impact" : "Portfolio Impact"}>
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">
                        <div className="flex-1 p-4 text-center">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Total Jobs Created</div>
                            <div className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
                                {impactStats.totalJobs}
                                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">↑ 12%</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">Full-Time Equivalents</div>
                        </div>
                        <div className="flex-1 p-4 text-center">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Total Revenue</div>
                            <div className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
                                ${(impactStats.totalRevenue / 1000).toFixed(1)}k
                                <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">↑ 5%</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">Annual Recurring</div>
                        </div>
                        <div className="flex-1 p-4 text-center">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-1">Capital Raised</div>
                            <div className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
                                ${(impactStats.totalCapital / 1000).toFixed(1)}k
                                <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded font-medium">-</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">Equity & Grants</div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-b-lg border-t border-gray-100 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-600">Data Confidence:</span>
                            <span className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                                {impactStats.verifiedCount} Verified
                            </span>
                            <span className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                {impactStats.selfReportedCount} Self-Reported
                            </span>
                        </div>
                        <DemoLink href="/reports" className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                            <IconChart className="w-3 h-3" /> Full Metrics Report
                        </DemoLink>
                    </div>
                </Card>
            )}

            {/* Entrepreneur Context: Relationships Overview */}
            {isEntrepreneur && myRelationships && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card title="My Primary Venture">
                        {myRelationships.myOrg ? (
                             <div>
                                <h4 className="text-xl font-bold text-gray-900">{myRelationships.myOrg.name}</h4>
                                <p className="text-sm text-gray-500 mb-3">{myRelationships.myOrg.description}</p>
                                <div className="flex flex-wrap gap-2">
                                     <Badge color="purple">My Workplace</Badge>
                                     {myRelationships.myOrg.roles.map(r => <Badge key={r} color="gray">{r}</Badge>)}
                                </div>
                             </div>
                        ) : <p className="text-gray-500 text-sm">No primary organization found.</p>}
                    </Card>
                    <Card title="My Support Network (ESOs)">
                        {myRelationships.supportingOrgs.length > 0 ? (
                            <div className="space-y-3">
                                {myRelationships.supportingOrgs.map(eso => (
                                    <div key={eso.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                                        <div>
                                            <div className="font-bold text-gray-900 text-sm">{eso.name}</div>
                                            <div className="text-xs text-gray-500">Providing Support</div>
                                        </div>
                                        <Badge color="green">Active</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-gray-500 text-sm italic">You are not currently connected to any support organizations.</p>
                                <button className="mt-2 text-indigo-600 text-sm font-medium hover:underline">Browse Directory</button>
                            </div>
                        )}
                    </Card>
                </div>
            )}
            
            <Card title={activityTitle}>
                <div className="space-y-4">
                    {recentActivity.length === 0 ? (
                        <p className="text-gray-500 text-sm">No recent activity found.</p>
                    ) : (
                        recentActivity.map(int => (
                            <div key={int.id} className="flex items-start pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                    {int.type[0].toUpperCase()}
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm text-gray-900 font-medium">
                                        {int.notes.length > 80 ? int.notes.substring(0, 80) + '...' : int.notes}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {int.date} • {organizations.find(o => o.id === int.organization_id)?.name} • Recorded by {int.recorded_by}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
};
