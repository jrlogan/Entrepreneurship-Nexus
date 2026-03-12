
import React, { useState, useMemo } from 'react';
import { Organization, OrganizationRole } from '../../domain/types';
import { Card, Badge, CompanyLogo } from '../../shared/ui/Components';
import { IconEye, IconLock } from '../../shared/ui/Icons';
import { useViewer, useRepos } from '../../data/AppDataContext';

// Extend Organization type to include the _access property injected by the repo
type ExtendedOrganization = Organization & { _access?: { level: 'basic' | 'detailed', reason: string } };

interface DirectoryViewProps {
    organizations: ExtendedOrganization[];
    onSelect: (id: string) => void;
    onAdd: () => void;
}

export const DirectoryView = ({ organizations, onSelect, onAdd }: DirectoryViewProps) => {
    const viewer = useViewer();
    const repos = useRepos();
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [scopeFilter, setScopeFilter] = useState<string>('all');

    const filteredOrganizations = useMemo(() => {
        return organizations.filter(org => {
            // 1. Type Filter
            if (typeFilter !== 'all') {
                if (!org.roles.includes(typeFilter as OrganizationRole)) return false;
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
    }, [organizations, typeFilter, scopeFilter, viewer.orgId, repos]);

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Organization Directory</h2>
                
                <div className="flex flex-wrap items-center gap-3">
                    {/* Type Filter */}
                    <div className="flex items-center bg-white border border-gray-300 rounded-md px-3 py-1.5 shadow-sm">
                        <span className="text-xs text-gray-500 font-bold mr-2 uppercase">Type:</span>
                        <select 
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="text-sm bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer outline-none"
                        >
                            <option value="all">All Types</option>
                            <option value="startup">Startups</option>
                            <option value="small_business">Small Businesses</option>
                            <option value="nonprofit">Nonprofits</option>
                            <option value="government">Government</option>
                            <option value="education">Education</option>
                            <option value="service_provider">Service Providers</option>
                            <option value="workspace">Workspaces / Labs</option>
                            <option value="community_org">Community Organizations</option>
                            <option value="anchor_institution">Anchor Institutions</option>
                            <option value="eso">Support Orgs (ESOs)</option>
                            <option value="funder">Funders</option>
                        </select>
                    </div>

                    {/* Scope Filter */}
                    <div className="flex items-center bg-white border border-gray-300 rounded-md px-3 py-1.5 shadow-sm">
                        <span className="text-xs text-gray-500 font-bold mr-2 uppercase">View:</span>
                        <select 
                            value={scopeFilter}
                            onChange={(e) => setScopeFilter(e.target.value)}
                            className="text-sm bg-transparent border-none focus:ring-0 text-gray-700 cursor-pointer outline-none"
                        >
                            <option value="all">Everything</option>
                            <option value="my_clients">My Managed Clients</option>
                            <option value="access">Accessible Data (Unlocked)</option>
                            <option value="consented">Explicit Consent Only</option>
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
                                            CLIENT
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
                                                {org.roles.map(r => <Badge key={r} color="gray">{r}</Badge>)}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-3 mb-2">{org.description}</p>
                                </div>
                                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 rounded-b-lg flex justify-between items-center text-xs text-gray-500">
                                    <span className="font-medium text-gray-600">{org.classification.industry_tags[0] || 'General Industry'}</span>
                                    {isPrivate ? (
                                        <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                            Private
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                            Public
                                        </span>
                                    )}
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
