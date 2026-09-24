
import React, { useEffect, useMemo, useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, DemoLink } from '../../shared/ui/Components';
import type { Organization } from '../../domain/organizations/types';
import type { Interaction } from '../../domain/interactions/types';
import type { Referral } from '../../domain/referrals/types';
import type { Ecosystem } from '../../domain/ecosystems/types';

/**
 * Staff landing page: what needs attention, and what the network has been
 * doing with the people you work with.
 *
 * Activity from other organizations is shown as a fact — who, what kind, when
 * — never with its notes. Notes stay with the organization that wrote them.
 */
export const DashboardView = ({ ecosystem, onOpenReferrals }: { ecosystem: Ecosystem | null; onOpenReferrals?: () => void }) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [referrals, setReferrals] = useState<Referral[]>([]);

    const portalLinks = useMemo(() => {
        return (ecosystem?.portal_links || []).filter(link =>
            link.audience === 'all' || link.audience === 'eso'
        );
    }, [ecosystem]);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            const [nextOrganizations, nextInteractions, nextReferrals] = await Promise.all([
                repos.organizations.getAll(viewer, viewer.ecosystemId).catch(() => []),
                repos.interactions.getAll(viewer, viewer.ecosystemId).catch(() => []),
                repos.referrals.getAll(viewer).catch(() => []),
            ]);

            if (!cancelled) {
                setOrganizations(nextOrganizations);
                setInteractions(nextInteractions);
                setReferrals(nextReferrals);
            }
        };

        void loadData();
        return () => {
            cancelled = true;
        };
    }, [repos, viewer]);

    const isNetworkOperator = ['platform_admin', 'ecosystem_manager'].includes(viewer.role);
    const orgName = (id?: string | null) => organizations.find(o => o.id === id)?.name || 'A partner organization';

    const stats = useMemo(() => {
        const incomingPending = referrals.filter(r => r.receiving_org_id === viewer.orgId && r.status === 'pending');
        const outgoingOpen = referrals.filter(r => r.referring_org_id === viewer.orgId && (r.status === 'pending' || r.status === 'accepted'));
        const loggedByUs = interactions.filter(i => i.author_org_id === viewer.orgId);
        const loggedByOthers = interactions.filter(i => i.author_org_id !== viewer.orgId);

        if (isNetworkOperator) {
            return {
                incomingPending,
                cards: [
                    { label: 'Organizations', value: organizations.length },
                    { label: 'Open referrals', value: referrals.filter(r => r.status === 'pending' || r.status === 'accepted').length },
                    { label: 'Referrals completed', value: referrals.filter(r => r.status === 'completed').length },
                    { label: 'Activity logged', value: interactions.length },
                ],
            };
        }

        return {
            incomingPending,
            cards: [
                { label: 'Referrals awaiting your answer', value: incomingPending.length },
                { label: 'Your open referrals out', value: outgoingOpen.length },
                { label: 'Activity you logged', value: loggedByUs.length },
                { label: 'Partner activity visible to you', value: loggedByOthers.length },
            ],
        };
    }, [organizations, interactions, referrals, viewer.orgId, isNetworkOperator]);

    const recentActivity = useMemo(
        () => [...interactions]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 8),
        [interactions]
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {stats.cards.map((m) => (
                    <div key={m.label} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <div className="text-sm font-medium text-gray-500 uppercase" title={m.label}>{m.label}</div>
                        <div className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{m.value}</div>
                    </div>
                ))}
            </div>

            {stats.incomingPending.length > 0 && (
                <Card title="Referrals waiting on you">
                    <div className="space-y-3">
                        {stats.incomingPending.slice(0, 5).map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-4 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                                <div className="text-sm">
                                    <div className="font-medium text-gray-900">From {orgName(r.referring_org_id)}</div>
                                    <div className="text-xs text-gray-500">Sent {new Date(r.date).toLocaleDateString()}</div>
                                </div>
                                {onOpenReferrals && (
                                    <button type="button" onClick={onOpenReferrals} className="text-sm font-semibold text-indigo-600 hover:underline">
                                        Review
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {portalLinks.length > 0 && (
                <Card title="Quick Links & Resources">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {portalLinks.map(link => (
                            <DemoLink key={link.id} href={link.url} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 group transition-all">
                                <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">{link.icon}</span>
                                <div>
                                    <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-700">{link.label}</div>
                                    {link.description && <div className="text-[10px] text-gray-500 line-clamp-1">{link.description}</div>}
                                </div>
                            </DemoLink>
                        ))}
                    </div>
                </Card>
            )}

            <Card title="Recent activity across the network">
                <div className="space-y-4">
                    {recentActivity.length === 0 ? (
                        <p className="text-gray-500 text-sm">No activity yet. Activity appears here as partners log meetings, programs, and referrals for the people you both work with.</p>
                    ) : (
                        recentActivity.map(int => {
                            const isOurs = int.author_org_id === viewer.orgId;
                            return (
                                <div key={int.id} className="flex items-start pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                        {int.type[0].toUpperCase()}
                                    </div>
                                    <div className="ml-4 min-w-0">
                                        <p className="text-sm text-gray-900 font-medium">
                                            {isOurs ? 'Your organization' : orgName(int.author_org_id)} logged a {int.type} with {orgName(int.organization_id)}
                                        </p>
                                        {isOurs && int.notes && (
                                            <p className="text-sm text-gray-600 mt-0.5 truncate">{int.notes}</p>
                                        )}
                                        <p className="text-xs text-gray-500 mt-1">
                                            {new Date(int.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {!isOurs && ' · notes stay with the recording organization'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>
        </div>
    );
};
