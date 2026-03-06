
import React, { useState, useEffect } from 'react';
import { Organization, Person, Initiative, PipelineDefinition } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, Badge } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';
import { ManageProcessModal } from '../pipelines/PipelineModals';
import { useViewer } from '../../data/AppDataContext';

// --- Edit Org Modal ---
interface EditOrgModalProps {
    org: Organization;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<Organization>) => void;
}

export const EditOrgModal = ({ org, isOpen, onClose, onSave }: EditOrgModalProps) => {
    const [name, setName] = useState(org.name);
    const [description, setDescription] = useState(org.description);
    const [url, setUrl] = useState(org.url || '');
    const [industryTags, setIndustryTags] = useState(org.classification.industry_tags.join(', '));

    useEffect(() => {
        if (isOpen) {
            setName(org.name);
            setDescription(org.description);
            setUrl(org.url || '');
            setIndustryTags(org.classification.industry_tags.join(', '));
        }
    }, [isOpen, org]);

    const handleSave = () => {
        onSave({
            name,
            description,
            url,
            classification: {
                ...org.classification,
                industry_tags: industryTags.split(',').map(s => s.trim()).filter(Boolean)
            }
        });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Organization Profile">
            <div className="space-y-4">
                <div>
                    <label className={FORM_LABEL_CLASS}>Name</label>
                    <input className={FORM_INPUT_CLASS} value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Website</label>
                    <input className={FORM_INPUT_CLASS} value={url} onChange={e => setUrl(e.target.value)} />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Description</label>
                    <textarea className={FORM_TEXTAREA_CLASS} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Industry Tags (comma separated)</label>
                    <input className={FORM_INPUT_CLASS} value={industryTags} onChange={e => setIndustryTags(e.target.value)} />
                </div>
                <div className="flex justify-end pt-2 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Save Changes</button>
                </div>
            </div>
        </Modal>
    );
};

// --- Manage Person Modal ---
interface ManagePersonModalProps {
    person?: Person; // If null, we are adding
    orgId?: string; // Optional if adding global
    organizations?: Organization[]; // needed if orgId is null
    isOpen: boolean;
    onClose: () => void;
    onSave: (person: Partial<Person>) => void;
}

export const ManagePersonModal = ({ person, orgId, organizations, isOpen, onClose, onSave }: ManagePersonModalProps) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [selectedOrgId, setSelectedOrgId] = useState('');

    useEffect(() => {
        if (isOpen) {
            setFirstName(person?.first_name || '');
            setLastName(person?.last_name || '');
            setEmail(person?.email || '');
            setRole(person?.role || '');
            setSelectedOrgId(orgId || person?.organization_id || '');
        }
    }, [isOpen, person, orgId]);

    const handleSave = () => {
        if (!orgId && !selectedOrgId) {
            alert("Please select an organization.");
            return;
        }

        onSave({
            id: person?.id, // Keep ID if editing
            first_name: firstName,
            last_name: lastName,
            email,
            role,
            organization_id: orgId || selectedOrgId
        });
        onClose();
    };

    const orgOptions = organizations?.map(o => ({ id: o.id, label: o.name })) || [];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={person ? "Edit Person" : "Add Person"}>
            <div className="space-y-4">
                {/* Org Selector if Global Create */}
                {!orgId && (
                    <SearchableSelect 
                        label="Organization"
                        options={orgOptions}
                        value={selectedOrgId}
                        onChange={setSelectedOrgId}
                        placeholder="Search for organization..."
                    />
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>First Name</label>
                        <input className={FORM_INPUT_CLASS} value={firstName} onChange={e => setFirstName(e.target.value)} />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Last Name</label>
                        <input className={FORM_INPUT_CLASS} value={lastName} onChange={e => setLastName(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Email</label>
                    <input className={FORM_INPUT_CLASS} value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Job Title / Role</label>
                    <input className={FORM_INPUT_CLASS} value={role} onChange={e => setRole(e.target.value)} />
                </div>
                <div className="flex justify-end pt-2 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Save Person</button>
                </div>
            </div>
        </Modal>
    );
};

// --- Manage Initiative Modal ---
interface ManageInitiativeModalProps {
    initiative?: Initiative;
    orgId?: string; // Optional if selecting org. If provided, sets default.
    organizations?: Organization[]; // needed if orgId is null
    isOpen: boolean;
    onClose: () => void;
    onSave: (init: Partial<Initiative>) => void;
    
    // Process Data & Callbacks
    pipelines: PipelineDefinition[];
    checklists: ChecklistTemplate[];
    onSavePipeline: (p: PipelineDefinition) => void;
    onSaveChecklist: (c: ChecklistTemplate) => void;
}

export const ManageInitiativeModal = ({ 
    initiative, 
    orgId, 
    organizations, 
    isOpen, 
    onClose, 
    onSave, 
    pipelines,
    checklists,
    onSavePipeline,
    onSaveChecklist
}: ManageInitiativeModalProps) => {
    const viewer = useViewer();
    const isEntrepreneur = viewer.role === 'entrepreneur';

    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [status, setStatus] = useState('active');
    
    // Process Mode: 'pipeline' or 'checklist'
    const [processMode, setProcessMode] = useState<'pipeline' | 'checklist'>('pipeline');
    
    const [pipelineId, setPipelineId] = useState('');
    const [selectedChecklistId, setSelectedChecklistId] = useState('');
    
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [targetEndDate, setTargetEndDate] = useState('');
    
    // Process Creation
    const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(initiative?.name || '');
            setDesc(initiative?.description || '');
            setStatus(initiative?.status || 'active');
            
            // Determine Mode based on initiative data
            if (initiative) {
                if (initiative.pipeline_id) {
                    setProcessMode('pipeline');
                    setPipelineId(initiative.pipeline_id);
                    setSelectedChecklistId('');
                } else if (initiative.checklists.length > 0) {
                    setProcessMode('checklist');
                    setPipelineId('');
                    setSelectedChecklistId(initiative.checklists[0].template_id);
                } else {
                    setProcessMode('pipeline'); // Default fallback
                }
                setSelectedOrgId(initiative.organization_id);
            } else {
                // Default for new
                setProcessMode('pipeline');
                setPipelineId(pipelines[0]?.id || '');
                setSelectedChecklistId(checklists[0]?.id || '');
                
                // Smart Org Defaulting
                if (orgId) {
                    // 1. Contextual passed ID
                    setSelectedOrgId(orgId);
                } else if (organizations && organizations.length === 1) {
                    // 2. Only one option available
                    setSelectedOrgId(organizations[0].id);
                } else {
                    // 3. Multiple options (Admin/Dual Role) -> Force explicit selection (No default)
                    setSelectedOrgId('');
                }
            }
            
            setStartDate(initiative?.start_date || new Date().toISOString().split('T')[0]);
            setTargetEndDate(initiative?.target_end_date || '');
        }
    }, [isOpen, initiative, pipelines, checklists, orgId, organizations]);

    const handleSave = () => {
        if (!selectedOrgId) {
            alert('Please select an organization.');
            return;
        }
        
        let finalPipelineId: string | undefined = undefined;
        let finalChecklists: any[] = [];

        if (processMode === 'pipeline') {
            if (!pipelineId) {
                alert("Please select a pipeline.");
                return;
            }
            finalPipelineId = pipelineId;
            finalChecklists = [];
        } else {
            if (!selectedChecklistId) {
                alert("Please select a checklist.");
                return;
            }
            finalPipelineId = undefined;
            // Persist existing progress if editing and ID matches, otherwise create new
            const existing = initiative?.checklists.find(c => c.template_id === selectedChecklistId);
            finalChecklists = [existing || { template_id: selectedChecklistId, items_checked: {} }];
        }

        onSave({
            id: initiative?.id,
            name,
            description: desc,
            status: status as any,
            pipeline_id: finalPipelineId,
            organization_id: selectedOrgId,
            current_stage_index: initiative?.current_stage_index || 0,
            stage_history: initiative?.stage_history || [],
            start_date: startDate,
            target_end_date: targetEndDate,
            checklists: finalChecklists
        });
        onClose();
    };

    const handleCreatePipeline = (p: PipelineDefinition) => {
        onSavePipeline(p);
        setPipelineId(p.id);
        setProcessMode('pipeline');
    };

    const handleCreateChecklist = (c: ChecklistTemplate) => {
        onSaveChecklist(c);
        setSelectedChecklistId(c.id);
        setProcessMode('checklist');
    };

    const orgOptions = organizations?.map(o => ({ id: o.id, label: o.name })) || [];
    const activeOrgName = organizations?.find(o => o.id === selectedOrgId)?.name || 'Unknown';
    
    // Show org selector if:
    // 1. Not editing an existing initiative
    // 2. AND (Multiple organizations exist OR No pre-defined context was passed)
    const showOrgSelector = !initiative && (organizations && organizations.length > 1 || !orgId);

    // Helpers for preview
    const selectedPipelineDef = pipelines.find(p => p.id === pipelineId);
    const selectedChecklistDef = checklists.find(c => c.id === selectedChecklistId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initiative ? "Edit Initiative" : "New Initiative"}>
            <div className="space-y-4">
                {/* Org Selector */}
                <div className={`p-3 rounded border ${showOrgSelector ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                    {showOrgSelector ? (
                        <SearchableSelect 
                            label="Lead Organization"
                            options={orgOptions}
                            value={selectedOrgId}
                            onChange={setSelectedOrgId}
                            placeholder="Select the entity executing this initiative..."
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 font-medium">Creating for:</span>
                            <span className="text-sm font-bold text-gray-900">{activeOrgName}</span>
                        </div>
                    )}
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Initiative Name</label>
                    <input className={FORM_INPUT_CLASS} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Series A Fundraising" />
                </div>
                
                <div>
                    <label className={FORM_LABEL_CLASS}>Description</label>
                    <textarea className={FORM_TEXTAREA_CLASS} rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Goals and objectives..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Start Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Target End Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} />
                    </div>
                </div>

                {/* PROCESS SELECTION */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-gray-800">Process Definition</h4>
                        {/* Only Admins/Staff can create NEW process definitions */}
                        {!isEntrepreneur && (
                            <button 
                                onClick={() => setIsProcessModalOpen(true)}
                                className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-1"
                            >
                                + Define New Process
                            </button>
                        )}
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex p-1 bg-gray-200 rounded">
                        <button
                            onClick={() => setProcessMode('pipeline')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded ${processMode === 'pipeline' ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Sequential Pipeline
                        </button>
                        <button
                            onClick={() => setProcessMode('checklist')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded ${processMode === 'checklist' ? 'bg-white shadow text-indigo-700' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Checklist Only
                        </button>
                    </div>

                    {processMode === 'pipeline' ? (
                        <div>
                            <label className={FORM_LABEL_CLASS}>Select Pipeline</label>
                            <select className={FORM_SELECT_CLASS} value={pipelineId} onChange={e => setPipelineId(e.target.value)} disabled={!!initiative}>
                                <option value="">-- Select Stage-Gate Pipeline --</option>
                                {pipelines.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {initiative ? (
                                <p className="text-xs text-gray-500 mt-1">Pipeline cannot be changed once started.</p>
                            ) : selectedPipelineDef ? (
                                <div className="mt-3 bg-white p-4 rounded-md border border-indigo-100 shadow-sm animate-in fade-in">
                                    <div className="mb-3 pb-2 border-b border-gray-100">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">About this Pipeline</div>
                                        <div className="text-sm text-gray-700">{selectedPipelineDef.description || "No description provided."}</div>
                                    </div>
                                    
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{selectedPipelineDef.stages.length} Stages</div>
                                    <div className="space-y-0 relative">
                                        {/* Connecting line */}
                                        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />
                                        
                                        {selectedPipelineDef.stages.map((stage, idx) => (
                                            <div key={stage.id} className="relative flex items-center gap-3 py-1">
                                                <div className="w-6 h-6 rounded-full bg-white border-2 border-indigo-200 text-indigo-600 flex items-center justify-center text-[10px] font-bold z-10 shadow-sm">
                                                    {idx + 1}
                                                </div>
                                                <div className="text-sm text-gray-800">{stage.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div>
                            <label className={FORM_LABEL_CLASS}>Select Checklist</label>
                            <select className={FORM_SELECT_CLASS} value={selectedChecklistId} onChange={e => setSelectedChecklistId(e.target.value)}>
                                <option value="">-- Select Checklist Template --</option>
                                {checklists.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {selectedChecklistDef ? (
                                <div className="mt-3 bg-white p-4 rounded-md border border-indigo-100 shadow-sm animate-in fade-in">
                                    <div className="mb-3 pb-2 border-b border-gray-100">
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">About this Checklist</div>
                                        <div className="text-sm text-gray-700">{selectedChecklistDef.description || "No description provided."}</div>
                                    </div>

                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{selectedChecklistDef.items.length} Tasks</div>
                                    <div className="space-y-1.5">
                                        {selectedChecklistDef.items.slice(0, 5).map((item, idx) => (
                                            <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                                <span className="text-gray-400 mt-0.5">☐</span>
                                                <span>{item}</span>
                                            </div>
                                        ))}
                                        {selectedChecklistDef.items.length > 5 && (
                                            <div className="text-xs text-gray-500 pl-6 italic">
                                                + {selectedChecklistDef.items.length - 5} more items...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 mt-1">Flexible list of tasks without enforced stages.</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Save Initiative</button>
                </div>
            </div>

            {/* Nested Modal for creating processes on the fly */}
            <ManageProcessModal 
                isOpen={isProcessModalOpen}
                onClose={() => setIsProcessModalOpen(false)}
                onSavePipeline={handleCreatePipeline}
                onSaveChecklist={handleCreateChecklist}
            />
        </Modal>
    );
};
