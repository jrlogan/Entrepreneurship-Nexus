
import React, { useState, useMemo } from 'react';
import { Interaction, Organization } from '../../domain/types';
import { Card, Badge, CompanyLogo } from '../../shared/ui/Components';
import { IconEye, IconLock } from '../../shared/ui/Icons';
import { useViewer, useRepos } from '../../data/AppDataContext';

// Extend Organization type to include the _access property injected by the repo
type ExtendedOrganization = Organization & {
    _access?: { level: 'basic' | 'detailed', reason: string };
    updated_at?: string;
    created_at?: string;
};

interface DirectoryViewProps {
    organizations: ExtendedOrganization[];
    interactions: Interaction[];
    onSelect: (id: string) => void;
    onAdd: () => void;
    onRefresh: () => void;
}

export const DirectoryView = ({ organizations, interactions, onSelect, onAdd, onRefresh }: DirectoryViewProps) => {
    const viewer = useViewer();
    const repos = useRepos();
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [scopeFilter, setScopeFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'activity' | 'name'>('activity');
    const [togglingClientId, setTogglingClientId] = useState<string | null>(null);

    const handleToggleClient = async (e: React.MouseEvent, org: ExtendedOrganization) => {
        e.stopPropagation();
        setTogglingClientId(org.id);
        const isClient = org.managed_by_ids?.includes(viewer.orgId);
        const next = isClient
            ? (org.managed_by_ids || []).filter(id => id !== viewer.orgId)
            : [...(org.managed_by_ids || []), viewer.orgId];
        await repos.organizations.update(org.id, { managed_by_ids: next });
        setTogglingClientId(null);
        onRefresh();
    };

    const activityByOrganizationId = useMemo(() => {
        const next = new Map<string, string>();

        interactions.forEach((interaction) => {
            const current = next.get(interaction.organization_id);
            if (!current || new Date(interaction.date).getTime() > new Date(current).getTime()) {
                next.set(interaction.organization_id, interaction.date);
            }
        });

        organizations.forEach((organization) => {
            if (next.has(organization.id)) {
                return;
            }

            const fallback = organization.updated_at || organization.created_at;
            if (fallback) {
                next.set(organization.id, fallback);
            }
        });

        return next;
    }, [interactions, organizations]);

    const formatRelativeActivity = (timestamp?: string) => {
        if (!timestamp) {
            return 'No activity yet';
        }

        const then = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - then.getTime();
        if (Number.isNaN(then.getTime()) || diffMs < 0) {
            return 'Activity date unavailable';
        }

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            return 'Active today';
        }
        if (diffDays === 1) {
            return 'Active 1 day ago';
        }
        if (diffDays < 30) {
            return `Active ${diffDays} days ago`;
        }

        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths === 1) {
            return 'Active 1 month ago';
        }
        if (diffMonths < 12) {
            return `Active ${diffMonths} months ago`;
        }

        const diffYears = Math.floor(diffMonths / 12);
        return diffYears === 1 ? 'Active 1 year ago' : `Active ${diffYears} years ago`;
    };

    const filteredOrganizations = useMemo(() => {
        const visibleOrganizations = organizations.filter(org => {
            // 1. Type Filter
            if (typeFilter !== 'all') {
                const functionalRoles = ['eso', 'funder', 'resource'];
                if (functionalRoles.includes(typeFilter)) {
                    if (!org.roles.includes(typeFilter as Organization['roles'][number])) return false;
                } else {
                    if (org.org_type !== typeFilter) return false;
                }
            }

            // 2. Scope/Relationship Filter
            if (scopeFilter === 'my_clients') {
                // "My Clients" = Managed by my Org
                if (!org.managed_by_ids?.includes(viewer.orgId)) return false;
            }
            if (scopeFilter === 'access') {
                // "Has Permission" = Detailed access available
                if (org._access?.level !== 'detailed') return false;
            }
            if (scopeFilter === 'consented') {
                // Explicit consent given (Private but shared)
                const hasExplicitConsent = repos.consent.hasOperationalAccess(viewer.orgId, org.id);
                // We only care about consent if it's restricted, otherwise it's just 'open'
                if (!hasExplicitConsent || org.operational_visibility === 'open') return false;
            }

            return true;
        });

        return visibleOrganizations.sort((left, right) => {
            if (sortBy === 'name') {
                return left.name.localeCompare(right.name);
            }

            const leftActivity = activityByOrganizationId.get(left.id);
            const rightActivity = activityByOrganizationId.get(right.id);
            const leftTime = leftActivity ? new Date(leftActivity).getTime() : 0;
            const rightTime = rightActivity ? new Date(rightActivity).getTime() : 0;
            return rightTime - leftTime || left.name.localeCompare(right.name);
        });
    }, [organizations, typeFilter, scopeFilter, sortBy, viewer.orgId, repos, activityByOrganizationId]);

    // Helpers for UI indicators
    const getAccessIndicator = (org: ExtendedOrganization) => {
        if (org._access?.level === 'detailed') {
            return (
                <div className="flex items-center gap-1 bg-white/90 text-green-700 px-2 py-1 rounded-full border border-green-200 shadow-sm backdrop-blur-sm transition-transform group-hover:scale-105" title={`Access Granted: ${org._access.reason}`}>
                    <IconEye className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Full Access</span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-1 bg-white/90 text-gray-500 px-2 py-1 rounded-full border border-gray-200 shadow-sm backdrop-blur-sm cursor-help" title="You can see this organization's public profile and activity history, but detailed notes and metrics require access approval.">
                <IconLock className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Directory Only</span>
            </div>
        );
    };

    const clientCount = organizations.filter(o => o.managed_by_ids?.includes(viewer.orgId)).length;
    const consentedCount = organizations.filter(o =>
        repos.consent.hasOperationalAccess(viewer.orgId, o.id) && o.operational_visibility === 'restricted'
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Organizations</h2>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Scope pills — same pattern as People view */}
                    <div className="inline-flex rounded-md shadow-sm" role="group">
                        <button type="button" onClick={() => { setScopeFilter('all'); setTypeFilter('all'); }}
                            className={`px-4 py-2 text-sm font-medium border border-gray-200 rounded-l-lg hover:bg-gray-100 ${scopeFilter === 'all' && typeFilter === 'all' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}>
                            All
                        </button>
                        <button type="button" onClick={() => { setScopeFilter('my_clients'); setTypeFilter('all'); }}
                            className={`px-4 py-2 text-sm font-medium border-t border-b border-gray-200 hover:bg-gray-100 ${scopeFilter === 'my_clients' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}>
                            Our Clients {clientCount > 0 && <span className="ml-1 text-xs opacity-60">({clientCount})</span>}
                        </button>
                        <button type="button" onClick={() => { setScopeFilter('all'); setTypeFilter('funder'); }}
                            className={`px-4 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-100 ${typeFilter === 'funder' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}>
                            Funders
                        </button>
                        <button type="button" onClick={() => { setScopeFilter('consented'); setTypeFilter('all'); }}
                            className={`px-4 py-2 text-sm font-medium border border-gray-200 rounded-r-lg hover:bg-gray-100 ${scopeFilter === 'consented' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}>
                            Consented {consentedCount > 0 && <span className="ml-1 text-xs opacity-60">({consentedCount})</span>}
                        </button>
                    </div>

                    {/* Type + Sort — compact dropdowns */}
                    <div className="flex items-center bg-white border border-gray-300 rounded-md px-3 py-1.5 shadow-sm">
                        <span className="text-xs text-gray-500 font-bold mr-2 uppercase">Type:</span>
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                            className="text-sm bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer outline-none">
                            <option value="all">All</option>
                            <optgroup label="Entity Type">
                                <option value="startup">Startups</option>
                                <option value="small_business">Small Businesses</option>
                                <option value="business">Businesses / Companies</option>
                                <option value="nonprofit">Nonprofits</option>
                                <option value="government_agency">Government</option>
                                <option value="other">Other</option>
                            </optgroup>
                            <optgroup label="Functional Role">
                                <option value="eso">Support Orgs (ESOs)</option>
                                <option value="funder">Funders</option>
                                <option value="workspace">Workspaces / Labs</option>
                            </optgroup>
                        </select>
                    </div>

                    <div className="flex items-center bg-white border border-gray-300 rounded-md px-3 py-1.5 shadow-sm">
                        <span className="text-xs text-gray-500 font-bold mr-2 uppercase">Sort:</span>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'activity' | 'name')}
                            className="text-sm bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer outline-none">
                            <option value="activity">Recent Activity</option>
                            <option value="name">Name</option>
                        </select>
                    </div>

                    <button onClick={onAdd} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm text-sm font-bold transition-colors">
                        + Add Org
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrganizations.map(org => {
                    const isClient = org.managed_by_ids?.includes(viewer.orgId);
                    const hasExplicitConsent = repos.consent.hasOperationalAccess(viewer.orgId, org.id);
                    const isPrivate = org.operational_visibility === 'restricted';
                    const lastActivity = activityByOrganizationId.get(org.id);

                    return (
                        <div 
                            key={org.id} 
                            onClick={() => onSelect(org.id)}
                            className="cursor-pointer h-full group"
                        >
                            <div className={`bg-white border rounded-lg shadow-sm hover:shadow-md transition-all h-full flex flex-col relative overflow-hidden ${isClient ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-gray-200'}`}>
                                
                                {/* Status Indicators (Top Right) */}
                                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                                    {isClient && (
                                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full border border-indigo-200 shadow-sm">
                                            OUR CLIENT
                                        </span>
                                    )}
                                    {hasExplicitConsent && isPrivate && (
                                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full border border-green-200 shadow-sm" title="You have been granted access to view operational details">
                                            CONSENT
                                        </span>
                                    )}
                                    {getAccessIndicator(org)}
                                </div>

                                <div className="p-6 flex-1">
                                    <div className="flex items-start gap-4 mb-4">
                                        <CompanyLogo src={org.logo_url} name={org.name} size="md" className="mt-1" />
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <h3 className="font-bold text-gray-900 text-lg leading-snug group-hover:text-indigo-600 transition-colors truncate pr-16">{org.name}</h3>
                                            <div className="flex gap-1 flex-wrap mt-2">
                                                {org.org_type && <Badge key="type" color="blue">{org.org_type.replace(/_/g, ' ')}</Badge>}
                                                {org.roles.map(r => <Badge key={r} color="indigo">{r}</Badge>)}
                                                {org.verified && <Badge color="blue">Verified</Badge>}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-3 mb-2">{org.description}</p>
                                    <div className="mt-4 text-xs text-gray-500">
                                        {formatRelativeActivity(lastActivity)}
                                        {lastActivity && (
                                            <span className="ml-1 text-gray-400">
                                                · {new Date(lastActivity).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 rounded-b-lg flex justify-between items-center text-xs text-gray-500">
                                    <span className="font-medium text-gray-600">{org.classification.industry_tags[0] || 'General Industry'}</span>
                                    <button
                                        type="button"
                                        onClick={(e) => handleToggleClient(e, org)}
                                        disabled={togglingClientId === org.id}
                                        className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                                            isClient
                                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                                        }`}
                                    >
                                        {isClient ? '★ Our Client' : '+ Add as Client'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                
                {filteredOrganizations.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-gray-50 border border-dashed border-gray-300 rounded-lg text-gray-500">
                        <div className="text-4xl mb-2">🔍</div>
                        <p>No organizations found matching your filters.</p>
                        <button 
                            onClick={() => { setTypeFilter('all'); setScopeFilter('all'); }}
                            className="mt-2 text-indigo-600 font-medium hover:underline text-sm"
                        >
                            Clear Filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
