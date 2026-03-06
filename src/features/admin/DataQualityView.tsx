
import React, { useMemo, useState } from 'react';
import { Organization, DuplicateMatch } from '../../domain/types';
import { detectDuplicates } from '../../domain/logic';
import { Badge, Modal, InfoBanner } from '../../shared/ui/Components';
import { useRepos } from '../../data/AppDataContext';

interface MergeReviewModalProps {
    orgA: Organization;
    orgB: Organization;
    confidence: number;
    onClose: () => void;
    onMerge: (winnerId: string) => void;
}

const MergeReviewModal = ({ orgA, orgB, confidence, onClose, onMerge }: MergeReviewModalProps) => {
    const [selectedId, setSelectedId] = useState<string>(orgA.id);

    // Calculate what would happen
    const winner = selectedId === orgA.id ? orgA : orgB;
    const loser = selectedId === orgA.id ? orgB : orgA;
    const newRefsCount = loser.external_refs.filter(r => !winner.external_refs.some(wr => wr.source === r.source && wr.id === r.id)).length;

    return (
        <Modal isOpen={true} onClose={onClose} title="Review Duplicate Record">
            <div className="space-y-6">
                <div className="bg-yellow-50 p-4 rounded border border-yellow-200 text-sm text-yellow-800 flex gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                        <div className="font-bold mb-1">High Confidence Match ({confidence}%)</div>
                        <p>These two records appear to represent the same entity. Please select the <strong>Primary Record</strong> to keep. The other record will be archived, and its external references (Salesforce, HubSpot IDs) will be moved to the primary.</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm border border-gray-200 rounded-lg overflow-hidden">
                    {/* Headers */}
                    <div className="bg-gray-50 p-3 font-bold text-gray-500 uppercase text-xs flex items-center">Field</div>
                    <div 
                        className={`p-3 cursor-pointer border-b-4 transition-colors ${selectedId === orgA.id ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-transparent hover:bg-gray-50'}`}
                        onClick={() => setSelectedId(orgA.id)}
                    >
                        <div className="font-bold text-gray-900 flex justify-between items-center">
                            Record A
                            {selectedId === orgA.id && <span className="text-indigo-600">✓ Keep</span>}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-1">{orgA.id}</div>
                    </div>
                    <div 
                        className={`p-3 cursor-pointer border-b-4 transition-colors ${selectedId === orgB.id ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-transparent hover:bg-gray-50'}`}
                        onClick={() => setSelectedId(orgB.id)}
                    >
                        <div className="font-bold text-gray-900 flex justify-between items-center">
                            Record B
                            {selectedId === orgB.id && <span className="text-indigo-600">✓ Keep</span>}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-1">{orgB.id}</div>
                    </div>

                    {/* Name */}
                    <div className="p-3 text-gray-600 border-t border-gray-100 bg-gray-50">Name</div>
                    <div className="p-3 border-t border-gray-100">{orgA.name}</div>
                    <div className="p-3 border-t border-gray-100">{orgB.name}</div>

                    {/* Website */}
                    <div className="p-3 text-gray-600 border-t border-gray-100 bg-gray-50">Website</div>
                    <div className="p-3 border-t border-gray-100 text-indigo-600 truncate">{orgA.url || '-'}</div>
                    <div className="p-3 border-t border-gray-100 text-indigo-600 truncate">{orgB.url || '-'}</div>

                    {/* Roles */}
                    <div className="p-3 text-gray-600 border-t border-gray-100 bg-gray-50">Roles</div>
                    <div className="p-3 border-t border-gray-100">{orgA.roles.join(', ')}</div>
                    <div className="p-3 border-t border-gray-100">{orgB.roles.join(', ')}</div>

                    {/* Refs */}
                    <div className="p-3 text-gray-600 border-t border-gray-100 bg-gray-50">External IDs</div>
                    <div className="p-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1">
                            {orgA.external_refs.map(r => <Badge key={r.source + r.id} color="gray">{r.source}</Badge>)}
                        </div>
                    </div>
                    <div className="p-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1">
                            {orgB.external_refs.map(r => <Badge key={r.source + r.id} color="gray">{r.source}</Badge>)}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="text-xs text-gray-500 italic">
                        {newRefsCount > 0 
                            ? `Note: ${newRefsCount} unique external reference(s) will be transferred to the winner.` 
                            : 'No new external references to transfer.'}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50">Cancel</button>
                        <button 
                            onClick={() => onMerge(selectedId)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm font-bold"
                        >
                            Merge Records
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export const DataQualityView = ({ organizations, onRefresh }: { organizations: Organization[], onRefresh?: () => void }) => {
    const repos = useRepos();
    const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
    const [resolvedCount, setResolvedCount] = useState(0);
    const [mergeCandidate, setMergeCandidate] = useState<{ orgA: Organization, orgB: Organization, confidence: number } | null>(null);

    const duplicates = useMemo(() => {
        return detectDuplicates(organizations).filter(d => !ignoredIds.includes(d.primary_id + d.duplicate_id));
    }, [organizations, ignoredIds]);

    const handleMergeConfirm = (winnerId: string) => {
        if (!mergeCandidate) return;
        const loserId = winnerId === mergeCandidate.orgA.id ? mergeCandidate.orgB.id : mergeCandidate.orgA.id;
        
        const winner = organizations.find(o => o.id === winnerId);
        const loser = organizations.find(o => o.id === loserId);

        if (winner && loser) {
            // 1. Transfer External Refs logic
            const combinedRefs = [...winner.external_refs];
            loser.external_refs.forEach(ref => {
                // Only add if source+id combo doesn't exist
                if (!combinedRefs.some(r => r.source === ref.source && r.id === ref.id)) {
                    combinedRefs.push(ref);
                }
            });
            
            // 2. Perform Updates
            repos.organizations.update(winnerId, { external_refs: combinedRefs });
            repos.organizations.update(loserId, { status: 'archived' }); // Soft delete logic
            
            setResolvedCount(prev => prev + 1);
            if (onRefresh) onRefresh();
        }
        setMergeCandidate(null);
    };

    const handleIgnore = (match: DuplicateMatch) => {
        setIgnoredIds(prev => [...prev, match.primary_id + match.duplicate_id]);
        setResolvedCount(prev => prev + 1);
    };
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Data Quality & Deduplication</h2>
                <div className="flex gap-2">
                    <Badge color="blue">Resolved Session: {resolvedCount}</Badge>
                </div>
            </div>
            
            <InfoBanner title="Automated Deduplication Engine">
                <p>The system constantly monitors the federation for duplicate records based on name similarity, website URL, and tax IDs. Merging records preserves all external references (Salesforce, HubSpot IDs) ensuring no system loses track of the entity.</p>
            </InfoBanner>

            {/* Pending Duplicates Section */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-gray-800">Pending Duplicates</h3>
                    <Badge color={duplicates.length > 0 ? 'red' : 'green'}>{duplicates.length} Issues Found</Badge>
                </div>
                
                {duplicates.length === 0 ? (
                     <div className="text-center py-12 bg-gray-50 rounded border border-dashed border-gray-300">
                        <div className="text-4xl mb-3">🎉</div>
                        <h4 className="text-gray-900 font-bold">All Clear!</h4>
                        <p className="text-gray-500 text-sm mt-1">No duplicate organizations found in the current dataset.</p>
                     </div>
                ) : (
                    <div className="space-y-4">
                        {duplicates.map((match, i) => {
                            const orgA = organizations.find(o => o.id === match.primary_id);
                            const orgB = organizations.find(o => o.id === match.duplicate_id);
                            if (!orgA || !orgB) return null;
                            
                            return (
                                <div key={i} className="border border-red-200 bg-red-50 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4 transition-shadow hover:shadow-md">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="font-bold text-gray-900 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm">{orgA.name}</div>
                                            <span className="text-red-400 font-bold text-sm bg-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm">vs</span>
                                            <div className="font-bold text-gray-900 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm">{orgB.name}</div>
                                        </div>
                                        <div className="text-xs text-red-700 flex flex-wrap gap-4 items-center mt-3">
                                            <span className="font-bold bg-red-100 px-2 py-0.5 rounded text-red-800 border border-red-200">Confidence: {match.confidence_score}%</span>
                                            <span>Detected via: <strong>{match.match_reason.join(', ')}</strong></span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleIgnore(match)}
                                            className="px-3 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
                                        >
                                            Not a Duplicate
                                        </button>
                                        <button 
                                            onClick={() => setMergeCandidate({ orgA, orgB, confidence: match.confidence_score })}
                                            className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded shadow-sm hover:bg-red-700 flex items-center gap-2 transition-colors"
                                        >
                                            <span>⚡</span> Merge Records
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {mergeCandidate && (
                <MergeReviewModal 
                    orgA={mergeCandidate.orgA}
                    orgB={mergeCandidate.orgB}
                    confidence={mergeCandidate.confidence}
                    onClose={() => setMergeCandidate(null)}
                    onMerge={handleMergeConfirm}
                />
            )}
        </div>
    );
};
