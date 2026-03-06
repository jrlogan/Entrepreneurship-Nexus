
import React, { useState } from 'react';
import { Initiative, PipelineDefinition, Interaction, Organization } from '../../domain/types';
import { Modal, Badge, FORM_LABEL_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { LogInteractionModal } from '../interactions/LogInteractionModal';
import { ALL_ECOSYSTEMS } from '../../data/mockData';

interface InitiativeDetailModalProps {
    initiative: Initiative;
    pipeline?: PipelineDefinition; // Optional now
    organization: Organization;
    interactions: Interaction[];
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export const InitiativeDetailModal = ({ 
    initiative, 
    pipeline, 
    organization,
    interactions, 
    isOpen, 
    onClose,
    onRefresh 
}: InitiativeDetailModalProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
    
    // Edit State
    const [isEditingNarrative, setIsEditingNarrative] = useState(false);
    const [narrative, setNarrative] = useState(initiative.description || '');
    
    // Interaction State
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);

    // Get ecosystem templates for checklist options
    const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
    const checklistTemplates = ecosystem?.checklist_templates || [];

    // Stage Update
    const handleStageClick = (index: number) => {
        if (!pipeline) return;
        if (index === initiative.current_stage_index) return;
        
        const stageName = pipeline.stages[index].name;
        if (confirm(`Move project to stage "${stageName}"?`)) {
            // 1. Log previous stage exit
            const now = new Date().toISOString();
            const currentHistory = [...initiative.stage_history];
            
            // Find current stage entry and mark exited
            const currentEntryIndex = currentHistory.findIndex(h => h.stage_index === initiative.current_stage_index && !h.exited_at);
            if (currentEntryIndex >= 0) {
                currentHistory[currentEntryIndex].exited_at = now;
            }

            // Add new stage entry
            currentHistory.push({
                stage_index: index,
                stage_id: pipeline.stages[index].id,
                entered_at: now
            });

            // 2. Update Initiative
            repos.pipelines.addInitiative({ // This repo mock method pushes/updates ref
                ...initiative,
                current_stage_index: index,
                stage_history: currentHistory
            });

            // 3. Log an automatic interaction for the record
            repos.interactions.add({
                id: `int_auto_${Date.now()}`,
                organization_id: organization.id,
                initiative_id: initiative.id,
                ecosystem_id: viewer.ecosystemId,
                author_org_id: viewer.orgId,
                date: now.split('T')[0],
                type: 'note',
                visibility: 'network_shared',
                note_confidential: false,
                notes: `Project "${initiative.name}" moved to stage: ${stageName}`,
                recorded_by: 'System'
            });

            onRefresh();
        }
    };

    const handleSaveNarrative = () => {
        repos.pipelines.addInitiative({
            ...initiative,
            description: narrative
        });
        setIsEditingNarrative(false);
        onRefresh();
    };

    // Checklist Management
    const toggleChecklistItem = (templateId: string, item: string) => {
        const newChecklists = initiative.checklists.map(list => {
            if (list.template_id !== templateId) return list;
            return {
                ...list,
                items_checked: {
                    ...list.items_checked,
                    [item]: !list.items_checked[item]
                }
            };
        });

        repos.pipelines.addInitiative({
            ...initiative,
            checklists: newChecklists
        });
        onRefresh();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initiative.name}>
            <div className="space-y-6">
                
                {/* Header Context */}
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                    <div>
                        <span className="text-xs text-gray-500 uppercase font-bold">Process</span>
                        <div className="text-sm font-medium text-gray-900">{pipeline ? pipeline.name : 'Checklist Project'}</div>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase font-bold">Status</span>
                        <div className="mt-1"><Badge color={initiative.status === 'active' ? 'green' : 'gray'}>{initiative.status}</Badge></div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`whitespace-nowrap pb-3 border-b-2 font-medium text-sm ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Progress & Narrative
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`whitespace-nowrap pb-3 border-b-2 font-medium text-sm ${activeTab === 'history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            History & Notes
                        </button>
                    </nav>
                </div>

                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Interactive Pipeline Stepper - Only if pipeline exists */}
                        {pipeline && (
                            <div>
                                <label className={FORM_LABEL_CLASS}>Stage Progression</label>
                                <div className="relative flex flex-col gap-2 mt-2">
                                    {pipeline.stages.map((stage, idx) => {
                                        const isCompleted = idx < initiative.current_stage_index;
                                        const isCurrent = idx === initiative.current_stage_index;
                                        
                                        return (
                                            <div 
                                                key={stage.id} 
                                                onClick={() => handleStageClick(idx)}
                                                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${isCurrent ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}
                                            >
                                                <div className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                    {isCompleted ? '✓' : idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <div className={`text-sm font-medium ${isCurrent ? 'text-indigo-900' : 'text-gray-900'}`}>{stage.name}</div>
                                                    <div className="text-xs text-gray-500">{stage.description}</div>
                                                </div>
                                                {isCurrent && <Badge color="blue">Current</Badge>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Checklists Section */}
                        <div className={pipeline ? "pt-4 border-t border-gray-100" : ""}>
                            <div className="flex justify-between items-center mb-3">
                                <label className={FORM_LABEL_CLASS}>Project Tasks</label>
                            </div>

                            {initiative.checklists.length === 0 ? (
                                <p className="text-gray-400 text-sm italic">No checklists assigned.</p>
                            ) : (
                                <div className="space-y-4">
                                    {initiative.checklists.map(checklist => {
                                        const template = checklistTemplates.find(t => t.id === checklist.template_id);
                                        if (!template) return null;

                                        const total = template.items.length;
                                        const checkedCount = Object.values(checklist.items_checked).filter(Boolean).length;
                                        const percent = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

                                        return (
                                            <div key={checklist.template_id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-bold text-sm text-gray-800">{template.name}</span>
                                                    <span className="text-xs font-medium text-gray-500">{checkedCount} / {total}</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                                                    <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                                                </div>
                                                <div className="space-y-1">
                                                    {template.items.map(item => {
                                                        const isChecked = !!checklist.items_checked[item];
                                                        return (
                                                            <div key={item} className="flex items-center">
                                                                <input 
                                                                    type="checkbox" 
                                                                    id={`${checklist.template_id}_${item}`}
                                                                    checked={isChecked}
                                                                    onChange={() => toggleChecklistItem(checklist.template_id, item)}
                                                                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                                                                />
                                                                <label 
                                                                    htmlFor={`${checklist.template_id}_${item}`}
                                                                    className={`ml-2 text-sm cursor-pointer select-none ${isChecked ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                                                                >
                                                                    {item}
                                                                </label>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Narrative Editor */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-bold text-gray-700">Project Narrative</label>
                                {!isEditingNarrative ? (
                                    <button onClick={() => setIsEditingNarrative(true)} className="text-xs text-indigo-600 font-medium hover:underline">Edit Narrative</button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button onClick={() => setIsEditingNarrative(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                        <button onClick={handleSaveNarrative} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">Save</button>
                                    </div>
                                )}
                            </div>
                            
                            {isEditingNarrative ? (
                                <textarea 
                                    className={FORM_TEXTAREA_CLASS} 
                                    rows={6} 
                                    value={narrative} 
                                    onChange={e => setNarrative(e.target.value)} 
                                    placeholder="Describe the goals, challenges, and details of this initiative..."
                                />
                            ) : (
                                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed min-h-[4rem]">
                                    {narrative || <span className="text-gray-400 italic">No narrative provided yet.</span>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-gray-800 text-sm">Activity Log</h4>
                            <button 
                                onClick={() => setIsLogModalOpen(true)}
                                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 shadow-sm"
                            >
                                + Add Project Note
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Combine Stage History and Interactions if simpler, or just list interactions */}
                            {interactions.length === 0 && <p className="text-center text-gray-500 text-sm py-4">No activity logged for this project.</p>}
                            
                            {interactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(int => (
                                <div key={int.id} className="flex gap-3 text-sm">
                                    <div className="flex-col items-center hidden sm:flex">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold border border-gray-200">
                                            {int.type[0].toUpperCase()}
                                        </div>
                                        <div className="h-full w-0.5 bg-gray-100 my-1"></div>
                                    </div>
                                    <div className="flex-1 bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-gray-900">{int.date}</span>
                                            <Badge color="gray">{int.type}</Badge>
                                        </div>
                                        <p className="text-gray-700 whitespace-pre-wrap">{int.notes}</p>
                                        <div className="mt-2 text-xs text-gray-400">
                                            Logged by: {int.recorded_by}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <LogInteractionModal 
                isOpen={isLogModalOpen} 
                onClose={() => setIsLogModalOpen(false)}
                onComplete={() => { onRefresh(); setIsLogModalOpen(false); }}
                organizations={[organization]} // Constrain to this org context
                defaultInitiativeId={initiative.id} // Link to this project
            />
        </Modal>
    );
};
