
import React, { useState } from 'react';
import { PipelineDefinition } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { Card, Badge, InfoBanner } from '../../shared/ui/Components';
import { ManageProcessModal } from './PipelineModals';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { ALL_ECOSYSTEMS } from '../../data/mockData';

export const PipelinesView = ({ pipelines }: { pipelines: PipelineDefinition[] }) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Get checklists from current ecosystem
    const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
    const checklists = ecosystem?.checklist_templates || [];

    const handleSavePipeline = (pipeline: PipelineDefinition) => {
        repos.ecosystems.addPipeline(viewer.ecosystemId, pipeline);
        // Force refresh logic would ideally be here via context
    };

    const handleSaveChecklist = (checklist: ChecklistTemplate) => {
        repos.ecosystems.addChecklistTemplate(viewer.ecosystemId, checklist);
    };

    return (
        <div className="space-y-8">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Processes & Workflows</h2>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium shadow-sm"
                >
                    + New Process
                </button>
            </div>

            <InfoBanner title="Standardizing Success">
                <p>Define the journeys for your ecosystem. Use <strong>Pipelines</strong> for sequential, stage-gated progress (e.g. Fundraising, Product Dev). Use <strong>Checklists</strong> for flexible sets of tasks (e.g. Legal Setup, Safety Audit).</p>
            </InfoBanner>

            {/* Sequential Pipelines Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 p-1 rounded text-xs">TYPE</span>
                    Sequential Pipelines
                </h3>
                <div className="grid gap-6">
                    {pipelines.map(pipeline => (
                        <Card key={pipeline.id} title={pipeline.name}>
                            {pipeline.description && (
                                <p className="text-sm text-gray-600 mb-4">{pipeline.description}</p>
                            )}
                            <div className="mb-4">
                                <span className="text-xs font-bold text-gray-500 uppercase mr-2">Context:</span>
                                <Badge color="purple">{pipeline.context}</Badge>
                            </div>
                            <div className="relative">
                                <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gray-200"></div>
                                <div className="space-y-6">
                                    {pipeline.stages.map((stage, idx) => (
                                        <div key={stage.id} className="relative pl-10">
                                            <div className="absolute left-2.5 top-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full transform -translate-x-1/2"></div>
                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900">Stage {idx + 1}: {stage.name}</h4>
                                                <p className="text-sm text-gray-500 mt-1">{stage.description}</p>
                                                {stage.criteria && (
                                                    <ul className="mt-2 space-y-1">
                                                        {stage.criteria.map((c, i) => (
                                                            <li key={i} className="text-xs text-gray-500 flex items-center">
                                                                <span className="mr-2 text-green-500">✓</span> {c}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Checklists Section */}
            <div className="space-y-4 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span className="bg-green-100 text-green-700 p-1 rounded text-xs">TYPE</span>
                    Flexible Checklists
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {checklists.map(list => (
                        <div key={list.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                            <h4 className="font-bold text-gray-900 mb-3">{list.name}</h4>
                            {list.description && <p className="text-sm text-gray-600 mb-3">{list.description}</p>}
                            <ul className="space-y-2">
                                {list.items.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                        <input type="checkbox" disabled className="mt-1" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {checklists.length === 0 && (
                        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded border border-dashed">
                            No checklist templates defined.
                        </div>
                    )}
                </div>
            </div>

            <ManageProcessModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSavePipeline={handleSavePipeline}
                onSaveChecklist={handleSaveChecklist}
            />
        </div>
    );
};
