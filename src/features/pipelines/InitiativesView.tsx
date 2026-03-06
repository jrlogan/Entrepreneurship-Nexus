
import React, { useState } from 'react';
import { Initiative, Organization, PipelineDefinition } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { calculatePipelineProgress } from '../../domain/logic';
import { Card, Badge, InfoBanner } from '../../shared/ui/Components';
import { ManageInitiativeModal } from '../directory/OrgModals';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { RESTRICTED_INITIATIVE_NAME, REDACTED_TEXT } from '../../domain/access/redaction';
import { ALL_ECOSYSTEMS } from '../../data/mockData';

interface InitiativesViewProps {
    initiatives: Initiative[];
    organizations: Organization[];
    pipelines: PipelineDefinition[];
    onNavigateToOrg?: (id: string) => void;
}

export const InitiativesView = ({ initiatives, organizations, pipelines, onNavigateToOrg }: InitiativesViewProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Get checklists
    const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
    const checklists = ecosystem?.checklist_templates || [];

    const handleSaveInitiative = (initData: Partial<Initiative>) => {
        repos.pipelines.addInitiative({
            id: `init_${Date.now()}`,
            ecosystem_id: viewer.ecosystemId,
            ...initData
        } as Initiative);
        setIsModalOpen(false);
    };

    const handleSavePipeline = (p: PipelineDefinition) => {
        repos.ecosystems.addPipeline(viewer.ecosystemId, p);
    };

    const handleSaveChecklist = (c: ChecklistTemplate) => {
        repos.ecosystems.addChecklistTemplate(viewer.ecosystemId, c);
    };

    const handleRequestAccess = () => {
        alert("Request for access sent to organization owner.");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Initiatives</h2>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                    New Initiative
                </button>
            </div>

            <InfoBanner title="What are Initiatives?">
                <p>Initiatives track specific, long-term goals for an organization, such as "Series A Fundraising," "Product Launch," or "Real Estate Expansion."</p>
                <p>Unlike simple tasks, Initiatives move through <strong>defined stages</strong> (Pipelines) or comprehensive <strong>Checklists</strong>, allowing ESOs to track velocity and bottlenecks across the entire ecosystem.</p>
            </InfoBanner>
            
            <div className="grid gap-4">
                {initiatives.map(init => {
                    const org = organizations.find(o => o.id === init.organization_id);
                    const pipeline = pipelines.find(p => p.id === init.pipeline_id);
                    const currentStage = pipeline?.stages[init.current_stage_index];
                    const progress = pipeline ? calculatePipelineProgress(init, pipeline) : 0;
                    
                    const isRestricted = init.name === RESTRICTED_INITIATIVE_NAME;

                    if (isRestricted) {
                        return (
                            <div key={init.id} className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-6 flex items-center justify-between opacity-75">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-gray-500 italic flex items-center gap-2">
                                            <span>🔒</span> {RESTRICTED_INITIATIVE_NAME}
                                        </h3>
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        Organization: <span className="font-medium text-gray-600">{org?.name || 'Unknown'}</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleRequestAccess}
                                    className="px-3 py-1 bg-white border border-gray-300 text-gray-600 text-xs font-bold rounded hover:bg-gray-50"
                                >
                                    Request Access
                                </button>
                            </div>
                        );
                    }

                    return (
                        <Card key={init.id} title={init.name}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div>
                                    <div className="text-sm text-gray-600 mb-1">
                                        Organization: 
                                        <button 
                                            onClick={() => org && onNavigateToOrg?.(org.id)}
                                            className="font-semibold text-indigo-600 hover:underline ml-1"
                                        >
                                            {org?.name || 'Unknown'}
                                        </button>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {pipeline ? `Pipeline: ${pipeline.name}` : 'Checklist Project'}
                                    </div>
                                    {init.description && <p className="text-xs text-gray-500 mt-2 italic">{init.description}</p>}
                                    {init.target_end_date && <p className="text-xs text-gray-400 mt-1">Target: {new Date(init.target_end_date).toLocaleDateString()}</p>}
                                </div>
                                <Badge color={init.status === 'active' ? 'green' : init.status === 'abandoned' ? 'red' : 'gray'}>{init.status.toUpperCase()}</Badge>
                            </div>
                            
                            {pipeline ? (
                                <>
                                    <div className="mb-2 flex justify-between text-xs text-gray-500 uppercase font-bold">
                                        <span>Current Stage: {currentStage?.name}</span>
                                        <span>{progress}% Complete</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-gray-50 p-2 rounded text-xs text-gray-500 border border-gray-200">
                                    Tasks: {init.checklists.length > 0 ? init.checklists[0].template_id : 'None'}
                                </div>
                            )}
                            
                            <div className="mt-4 pt-4 border-t border-gray-50 flex justify-end gap-2">
                                <button className="text-sm text-indigo-600 font-medium hover:underline">Update Stage</button>
                                <span className="text-gray-300">|</span>
                                <button className="text-sm text-gray-600 hover:text-gray-900">View History</button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <ManageInitiativeModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveInitiative}
                pipelines={pipelines}
                checklists={checklists}
                onSavePipeline={handleSavePipeline}
                onSaveChecklist={handleSaveChecklist}
                organizations={organizations} // Pass all orgs for global creation
            />
        </div>
    );
};
