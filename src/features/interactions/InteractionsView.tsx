
import React, { useState } from 'react';
import { Badge, InfoBanner } from '../../shared/ui/Components';
import { loadEnums } from '../../domain/standards/loadStandards';
import { EnumSelect } from '../../shared/EnumSelect';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { explainInteractionAccess } from '../../domain/access/policy';
import { LogInteractionModal } from './LogInteractionModal';
import { InteractionDetailModal } from './InteractionDetailModal';
import { Interaction } from '../../domain/types';
import { REDACTED_TEXT } from '../../domain/access/redaction';

export const InteractionsView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const interactions = repos.interactions.getAll(viewer); // Now filtered by permission
    const organizations = repos.organizations.getAll(viewer);

    const [filterType, setFilterType] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // Force re-render
    
    const enums = loadEnums();

    const filteredInteractions = filterType === 'all'
        ? interactions
        : interactions.filter(int => int.type === filterType);

    const handleComplete = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleRequestAccess = (e: React.MouseEvent) => {
        e.stopPropagation();
        alert("Access request sent for restricted note.");
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Interactions Log</h2>
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
                        Log Interaction
                    </button>
                </div>
            </div>

            <InfoBanner title="Smart Logging with AI">
                <p>This log captures every touchpoint with a client to ensure continuity of care. You don't need to type everything manually.</p>
                <p>Click <strong>"Log Interaction"</strong> to try our <strong>AI Dictation</strong> feature. It listens to your voice, summarizes the meeting, and extracts key data (Dates, Follow-ups) automatically.</p>
            </InfoBanner>

            <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                {filteredInteractions.map((int, idx) => {
                    const subjectOrg = organizations.find(o => o.id === int.organization_id);
                    const authorOrg = organizations.find(o => o.id === int.author_org_id);
                    const access = subjectOrg ? explainInteractionAccess(viewer, int, subjectOrg) : { visible: true, reason: 'N/A' };
                    const isRedacted = int.notes === REDACTED_TEXT;
                    const isConfidential = int.note_confidential;
                    
                    return (
                        <div 
                            key={int.id} 
                            onClick={() => !isRedacted && setSelectedInteraction(int)}
                            className={`p-4 transition-colors ${!isRedacted ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default bg-gray-50/30'} ${idx !== filteredInteractions.length -1 ? 'border-b border-gray-100' : ''}`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <Badge color={int.type === 'meeting' ? 'blue' : int.type === 'email' ? 'gray' : 'yellow'}>{int.type}</Badge>
                                    <span className="font-medium text-gray-900">{subjectOrg?.name || 'Unknown Org'}</span>
                                    {isConfidential && !isRedacted && (
                                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 font-medium flex items-center gap-1" title="Confidential">
                                            <span>🔒</span> Confidential
                                        </span>
                                    )}
                                </div>
                                <span className="text-sm text-gray-500">{int.date}</span>
                            </div>
                            
                            {isRedacted ? (
                                <div className="mt-3">
                                    <div className="flex gap-4 text-xs text-gray-600 mb-3 pl-1">
                                        <span><strong>Recorded by:</strong> {authorOrg?.name || int.recorded_by}</span>
                                        <span><strong>Visibility:</strong> {int.visibility}</span>
                                    </div>

                                    <div className="border-2 border-dashed border-gray-300 rounded-md p-4 bg-gray-50 flex flex-col items-center gap-2">
                                        <div className="text-sm font-bold text-gray-500 flex items-center gap-2">
                                            <span>🔒</span> Content Restricted
                                        </div>
                                        <div className="text-xs text-gray-400">Attendees: Details hidden</div>
                                        
                                        <button 
                                            onClick={handleRequestAccess}
                                            className="mt-1 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 text-xs font-bold rounded shadow-sm hover:bg-indigo-50 transition-colors"
                                        >
                                            Request Access
                                        </button>
                                    </div>
                                    
                                    <p className="text-center text-[10px] text-gray-400 mt-2">
                                        Activity is logged for ecosystem transparency. Request access to view details.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{int.notes.substring(0, 200)}{int.notes.length > 200 ? '...' : ''}</p>
                                    <div className="mt-2 flex gap-4 text-xs text-gray-500 items-center">
                                        <span>Recorded by: {int.recorded_by}</span>
                                        <span>Attendees: {int.attendees?.join(', ')}</span>
                                        <span>Visibility: {int.visibility}</span>
                                        <span className="text-gray-400">|</span>
                                        <span className="text-gray-400">Access: {access.reason}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
                {filteredInteractions.length === 0 && (
                    <div className="p-4 text-center text-gray-500">No interactions found matching filter.</div>
                )}
            </div>

            {/* AI-Enabled Logging Modal */}
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
