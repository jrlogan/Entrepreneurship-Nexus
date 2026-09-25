
import React, { useEffect, useState } from 'react';
import { Badge, InfoBanner } from '../../shared/ui/Components';
import { loadEnums } from '../../domain/standards/loadStandards';
import { EnumSelect } from '../../shared/EnumSelect';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { LogInteractionModal } from './LogInteractionModal';
import { InteractionDetailModal } from './InteractionDetailModal';
import { Interaction } from '../../domain/types';
import { notesHidden, isOwnRecord } from '../../domain/access/recordAccess';

export const InteractionsView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [organizations, setOrganizations] = useState<any[]>([]);

    const [filterType, setFilterType] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Force re-render
    
    const enums = loadEnums();

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            const [nextInteractions, nextOrganizations] = await Promise.all([
                repos.interactions.getAll(viewer),
                repos.organizations.getAll(viewer),
            ]);

            if (!cancelled) {
                setInteractions(nextInteractions);
                setOrganizations(nextOrganizations);
            }
        };

        void loadData();
        return () => {
            cancelled = true;
        };
    }, [repos, viewer, refreshTrigger]);

    const filteredInteractions = filterType === 'all'
        ? interactions
        : interactions.filter(int => int.type === filterType);

    const handleComplete = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Activity</h2>
                <div className="flex gap-2">
                    <EnumSelect 
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        options={enums.InteractionType}
                        includeAllOption
                        allLabel="All Types"
                        className="w-40"
                    />
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                        Log Activity
                    </button>
                </div>
            </div>

            <InfoBanner title="What partners see">
                <p>Your own activity appears in full. For people you also work with, you see that a partner met with them — which partner, what kind of activity, and when — so you can coordinate instead of duplicating. Partners' notes are never shared, and yours stay with your organization.</p>
            </InfoBanner>

            <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                {filteredInteractions.map((int, idx) => {
                    const subjectOrg = organizations.find(o => o.id === int.organization_id);
                    const authorOrg = organizations.find(o => o.id === int.author_org_id);
                    const isOurs = isOwnRecord(int);
                    const hideNotes = notesHidden(int);

                    return (
                        <div
                            key={int.id}
                            onClick={() => isOurs && setSelectedInteraction(int)}
                            className={`p-4 transition-colors ${isOurs ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ${idx !== filteredInteractions.length -1 ? 'border-b border-gray-100' : ''}`}
                        >
                            <div className="flex justify-between items-start gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge color={int.type === 'meeting' ? 'blue' : int.type === 'email' ? 'gray' : 'yellow'}>{int.type}</Badge>
                                    <span className="font-medium text-gray-900">{subjectOrg?.name || 'A venture'}</span>
                                    {isOurs && int.visibility === 'eso_private' && (
                                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 font-medium" title="Not shared with partners">
                                            Only visible to your organization
                                        </span>
                                    )}
                                </div>
                                <span className="text-sm text-gray-500 whitespace-nowrap">{int.date}</span>
                            </div>

                            {hideNotes ? (
                                <p className="mt-2 text-sm text-gray-600">
                                    Logged by <strong>{authorOrg?.name || 'a partner organization'}</strong>
                                    <span className="text-gray-400"> · notes stay with the recording organization</span>
                                </p>
                            ) : (
                                <>
                                    {int.notes && (
                                        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{int.notes.substring(0, 200)}{int.notes.length > 200 ? '...' : ''}</p>
                                    )}
                                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 items-center">
                                        <span>Logged by your organization</span>
                                        {int.recorded_by && <span>Recorded by: {int.recorded_by}</span>}
                                        <span>{int.visibility === 'network_shared' ? 'Partners who work with them can see this happened' : 'Private to your organization'}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
                {filteredInteractions.length === 0 && (
                    <div className="p-4 text-center text-gray-500">No activity found matching this filter.</div>
                )}
            </div>

            {/* Logging modal */}
            <LogInteractionModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onComplete={handleComplete}
                organizations={organizations}
            />

            {/* View Detail Modal */}
            <InteractionDetailModal 
                interaction={selectedInteraction}
                onClose={() => setSelectedInteraction(null)}
                organizations={organizations}
            />
        </div>
    );
};
