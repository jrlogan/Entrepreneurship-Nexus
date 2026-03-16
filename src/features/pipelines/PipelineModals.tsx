
import React, { useState } from 'react';
import { PipelineDefinition } from '../../domain/pipelines/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS, FORM_SELECT_CLASS, Badge } from '../../shared/ui/Components';

interface ManageProcessModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSavePipeline: (pipeline: PipelineDefinition) => void;
    onSaveChecklist: (checklist: ChecklistTemplate) => void;
}

const PIPELINE_PRESETS = [
    { 
        id: 'simple', 
        label: 'Simple Stage Gate', 
        stages: [
            { name: 'To Do', description: 'Pending tasks' },
            { name: 'In Progress', description: 'Active work' },
            { name: 'Review', description: 'Quality check' },
            { name: 'Done', description: 'Completed' }
        ]
    },
    { 
        id: 'software', 
        label: 'Software Development', 
        stages: [
            { name: 'Backlog', description: 'Requirements gathering' },
            { name: 'Design', description: 'UI/UX and Arch' },
            { name: 'Development', description: 'Implementation' },
            { name: 'QA', description: 'Testing' },
            { name: 'Deployed', description: 'Live in production' }
        ]
    },
    { 
        id: 'grant', 
        label: 'Grant Lifecycle', 
        stages: [
            { name: 'Prospecting', description: 'Identify opportunity' },
            { name: 'LOI', description: 'Letter of Intent' },
            { name: 'Drafting', description: 'Writing proposal' },
            { name: 'Submitted', description: 'Awaiting decision' },
            { name: 'Awarded', description: 'Funds secured' }
        ]
    }
];

const CHECKLIST_PRESETS = [
    {
        id: 'onboarding',
        label: 'New Hire Onboarding',
        items: ['Sign Contract', 'Setup Email', 'Team Intro', 'First Week Review']
    },
    {
        id: 'compliance',
        label: 'Annual Compliance',
        items: ['File Annual Report', 'Renew Insurance', 'Update Cap Table', 'Board Meeting']
    }
];

export const ManageProcessModal = ({ isOpen, onClose, onSavePipeline, onSaveChecklist }: ManageProcessModalProps) => {
    const [type, setType] = useState<'pipeline' | 'checklist'>('pipeline');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [formError, setFormError] = useState('');
    
    // For Pipelines: Stages
    const [stages, setStages] = useState<{name: string, description: string}[]>([
        { name: 'Stage 1', description: '' }
    ]);

    // For Checklists: Items
    const [items, setItems] = useState<string[]>(['']);

    // Reset form when opened
    React.useEffect(() => {
        if (isOpen) {
            setName('');
            setDescription('');
            setStages([{ name: 'Stage 1', description: '' }]);
            setItems(['']);
        }
    }, [isOpen]);

    const handleApplyPreset = (presetId: string) => {
        if (type === 'pipeline') {
            const preset = PIPELINE_PRESETS.find(p => p.id === presetId);
            if (preset) {
                setStages(preset.stages.map(s => ({ ...s })));
            }
        } else {
            const preset = CHECKLIST_PRESETS.find(p => p.id === presetId);
            if (preset) {
                setItems([...preset.items]);
            }
        }
    };

    const handleAddStage = () => {
        setStages([...stages, { name: `Stage ${stages.length + 1}`, description: '' }]);
    };

    const handleUpdateStage = (idx: number, field: 'name' | 'description', value: string) => {
        const newStages = [...stages];
        newStages[idx] = { ...newStages[idx], [field]: value };
        setStages(newStages);
    };

    const handleRemoveStage = (idx: number) => {
        if (stages.length > 1) {
            setStages(stages.filter((_, i) => i !== idx));
        }
    };

    const handleAddItem = () => {
        setItems([...items, '']);
    };

    const handleUpdateItem = (idx: number, value: string) => {
        const newItems = [...items];
        newItems[idx] = value;
        setItems(newItems);
    };

    const handleRemoveItem = (idx: number) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== idx));
        }
    };

    const handleSave = () => {
        setFormError('');
        if (!name.trim()) {
            setFormError("Name is required");
            return;
        }

        if (type === 'pipeline') {
            const newPipeline: PipelineDefinition = {
                id: `pipeline_${Date.now()}`,
                name,
                description,
                context: 'venture', // Default context
                applicable_types: ['generic'],
                stages: stages.map((s, i) => ({
                    id: `s_${Date.now()}_${i}`,
                    name: s.name,
                    description: s.description
                }))
            };
            onSavePipeline(newPipeline);
        } else {
            const validItems = items.filter(i => i.trim() !== '');
            if (validItems.length === 0) {
                setFormError("Add at least one item");
                return;
            }
            const newChecklist: ChecklistTemplate = {
                id: `list_${Date.now()}`,
                name,
                description,
                items: validItems
            };
            onSaveChecklist(newChecklist);
        }
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Process">
            <div className="space-y-4">
                {/* Type Toggle */}
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setType('pipeline')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'pipeline' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Sequential Pipeline
                    </button>
                    <button
                        onClick={() => setType('checklist')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'checklist' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Flexible Checklist
                    </button>
                </div>

                {/* Common Fields */}
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className={FORM_LABEL_CLASS}>Name</label>
                        <input 
                            className={FORM_INPUT_CLASS} 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder={type === 'pipeline' ? "e.g. Clinical Trials Process" : "e.g. New Hire Onboarding"}
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Load Preset</label>
                        <select className={`${FORM_SELECT_CLASS} w-40`} onChange={(e) => handleApplyPreset(e.target.value)} value="">
                            <option value="">-- Select --</option>
                            {(type === 'pipeline' ? PIPELINE_PRESETS : CHECKLIST_PRESETS).map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Description</label>
                    <textarea 
                        className={FORM_TEXTAREA_CLASS} 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        placeholder="Explain the purpose and usage of this process..."
                        rows={2}
                    />
                </div>

                {type === 'pipeline' ? (
                    <>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Stages (Ordered)</label>
                            <div className="space-y-3 mt-2 max-h-60 overflow-y-auto pr-1">
                                {stages.map((stage, idx) => (
                                    <div key={idx} className="flex gap-2 items-start bg-gray-50 p-2 rounded border border-gray-200">
                                        <div className="mt-2 text-xs font-bold text-gray-400 w-6">{idx + 1}.</div>
                                        <div className="flex-1 space-y-2">
                                            <input 
                                                className={`${FORM_INPUT_CLASS} text-sm`} 
                                                placeholder="Stage Name"
                                                value={stage.name}
                                                onChange={e => handleUpdateStage(idx, 'name', e.target.value)}
                                            />
                                            <input 
                                                className={`${FORM_INPUT_CLASS} text-xs`} 
                                                placeholder="Description / Criteria"
                                                value={stage.description}
                                                onChange={e => handleUpdateStage(idx, 'description', e.target.value)}
                                            />
                                        </div>
                                        <button onClick={() => handleRemoveStage(idx)} className="text-gray-400 hover:text-red-500 mt-2">&times;</button>
                                    </div>
                                ))}
                                <button onClick={handleAddStage} className="text-xs text-indigo-600 font-bold hover:underline">+ Add Stage</button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Checklist Items (Any Order)</label>
                            <div className="space-y-2 mt-2 max-h-60 overflow-y-auto pr-1">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input type="checkbox" disabled className="text-gray-300" />
                                        <input 
                                            className={`${FORM_INPUT_CLASS} text-sm`} 
                                            placeholder="Action Item..."
                                            value={item}
                                            onChange={e => handleUpdateItem(idx, e.target.value)}
                                        />
                                        <button onClick={() => handleRemoveItem(idx)} className="text-gray-400 hover:text-red-500">&times;</button>
                                    </div>
                                ))}
                                <button onClick={handleAddItem} className="text-xs text-indigo-600 font-bold hover:underline ml-6">+ Add Item</button>
                            </div>
                        </div>
                    </>
                )}

                {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Save {type === 'pipeline' ? 'Pipeline' : 'Checklist'}</button>
                </div>
            </div>
        </Modal>
    );
};
