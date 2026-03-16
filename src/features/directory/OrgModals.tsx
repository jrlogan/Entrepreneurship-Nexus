
import React, { useState, useEffect } from 'react';
import { Organization, Person, Initiative, PipelineDefinition } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, Badge } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';
import { ManageProcessModal } from '../pipelines/PipelineModals';
import { useViewer } from '../../data/AppDataContext';
import { uploadImageFile } from '../../services/storageUploads';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { queryCollection, setDocument, whereEquals } from '../../services/firestoreClient';
import type { AuthorizedSenderDomain } from '../../domain/inbound/types';

// --- Edit Org Modal ---
interface EditOrgModalProps {
    org: Organization;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: Partial<Organization>) => void | Promise<void>;
}

export const EditOrgModal = ({ org, isOpen, onClose, onSave }: EditOrgModalProps) => {
    const viewer = useViewer();
    const [name, setName] = useState(org.name);
    const [description, setDescription] = useState(org.description);
    const [url, setUrl] = useState(org.url || '');
    const [taxStatus, setTaxStatus] = useState(org.tax_status);
    const [industryTags, setIndustryTags] = useState<string[]>(org.classification.industry_tags || []);
    const [supportOfferings, setSupportOfferings] = useState((org.support_offerings || []).join(', '));
    const [minorityOwned, setMinorityOwned] = useState(org.demographics.minority_owned);
    const [womanOwned, setWomanOwned] = useState(org.demographics.woman_owned);
    const [veteranOwned, setVeteranOwned] = useState(org.demographics.veteran_owned);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // ESO Domain State
    const [esoDomains, setEsoDomains] = useState<string[]>([]);
    const [domainInput, setDomainInput] = useState('');
    const isEso = org.roles.includes('eso');
    const ecosystemTagOptions = Array.from(new Set(
        ALL_ECOSYSTEMS
            .filter((ecosystem) => org.ecosystem_ids.includes(ecosystem.id) || ecosystem.id === viewer.ecosystemId)
            .flatMap((ecosystem) => ecosystem.tags || [])
    ));

    useEffect(() => {
        if (isOpen) {
            setName(org.name);
            setDescription(org.description);
            setUrl(org.url || '');
            setTaxStatus(org.tax_status);
            setIndustryTags(org.classification.industry_tags || []);
            setSupportOfferings((org.support_offerings || []).join(', '));
            setMinorityOwned(org.demographics.minority_owned);
            setWomanOwned(org.demographics.woman_owned);
            setVeteranOwned(org.demographics.veteran_owned);
            setLogoFile(null);
            setSaveError('');
            setIsSaving(false);
            setDomainInput('');

            if (isEso) {
                queryCollection<AuthorizedSenderDomain>('authorized_sender_domains', [whereEquals('organization_id', org.id)])
                    .then(records => setEsoDomains(records.map(r => r.domain)))
                    .catch(() => setEsoDomains([]));
            }
        }
    }, [isOpen, org, isEso]);

    const addDomain = () => {
        const d = domainInput.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (d && !esoDomains.includes(d)) setEsoDomains(prev => [...prev, d]);
        setDomainInput('');
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError('');
        try {
            const resolvedLogoUrl = logoFile
                ? await uploadImageFile(logoFile, ['organizations', org.id, 'logo'])
                : org.logo_url || undefined;
            await onSave({
                name,
                description,
                url,
                logo_url: resolvedLogoUrl,
                tax_status: taxStatus,
                demographics: {
                    minority_owned: minorityOwned,
                    woman_owned: womanOwned,
                    veteran_owned: veteranOwned,
                },
                classification: {
                    ...org.classification,
                    industry_tags: industryTags
                },
                support_offerings: supportOfferings.split(',').map(s => s.trim()).filter(Boolean) as Organization['support_offerings']
            });

            if (isEso && esoDomains.length > 0) {
                const now = new Date().toISOString();
                await Promise.all(esoDomains.flatMap(domain => [
                    setDocument('authorized_sender_domains', `asd_${org.id}_${domain.replace(/\./g, '_')}`, {
                        id: `asd_${org.id}_${domain.replace(/\./g, '_')}`,
                        ecosystem_id: viewer.ecosystemId,
                        organization_id: org.id,
                        domain,
                        is_active: true,
                        access_policy: 'approved',
                        allow_sender_affiliation: true,
                        allow_auto_acknowledgement: true,
                        allow_invite_prompt: true,
                        created_at: now,
                    }),
                    setDocument('organization_aliases', `alias_${domain.replace(/\./g, '_')}`, {
                        id: `alias_${domain.replace(/\./g, '_')}`,
                        organization_id: org.id,
                        domain,
                        created_at: now,
                    }),
                ]));
            }

            onClose();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Unable to save organization profile.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Organization Profile" wide>
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
                    <label className={FORM_LABEL_CLASS}>Upload Logo</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={e => setLogoFile(e.target.files?.[0] || null)}
                        className={FORM_INPUT_CLASS}
                    />
                    <div className="mt-1 text-xs text-gray-500">
                        Uploaded files go to Firebase Storage and replace the logo URL above when saved.
                    </div>
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Description</label>
                    <textarea className={FORM_TEXTAREA_CLASS} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Tax Status</label>
                    <select className={FORM_SELECT_CLASS} value={taxStatus} onChange={e => setTaxStatus(e.target.value as Organization['tax_status'])}>
                        <option value="for_profit">For Profit</option>
                        <option value="non_profit">Non Profit</option>
                        <option value="government">Government</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div>
                    <label className={FORM_LABEL_CLASS}>Industry Tags</label>
                    <div className="flex flex-wrap gap-2 rounded border border-gray-200 bg-gray-50 p-3">
                        {ecosystemTagOptions.map((tag) => {
                            const isSelected = industryTags.includes(tag);
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setIndustryTags((current) => (
                                        isSelected ? current.filter((entry) => entry !== tag) : [...current, tag]
                                    ))}
                                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${isSelected ? 'border-indigo-300 bg-indigo-100 text-indigo-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                        {ecosystemTagOptions.length === 0 && (
                            <span className="text-sm text-gray-500">No standardized tags are configured for this ecosystem yet.</span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                        Tags come from the ecosystem configuration so entrepreneurs are choosing from a shared vocabulary.
                    </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 font-medium text-gray-900">Demographics</div>
                    <div className="space-y-2 text-sm text-gray-700">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={minorityOwned} onChange={e => setMinorityOwned(e.target.checked)} />
                            Minority owned
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={womanOwned} onChange={e => setWomanOwned(e.target.checked)} />
                            Woman owned
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={veteranOwned} onChange={e => setVeteranOwned(e.target.checked)} />
                            Veteran owned
                        </label>
                    </div>
                </div>
                {isEso && (
                    <div>
                        <label className={FORM_LABEL_CLASS}>Support Offerings (comma separated)</label>
                        <input
                            className={FORM_INPUT_CLASS}
                            value={supportOfferings}
                            onChange={e => setSupportOfferings(e.target.value)}
                            placeholder="funding, business_coaching, networking"
                        />
                    </div>
                )}
                {isEso && (
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mb-1">Email Domains</label>
                            <p className="text-xs text-indigo-600">Domains this organization sends from and receives at — used for automatic inbound email recognition.</p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="block w-full rounded-md border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                                value={domainInput}
                                onChange={e => setDomainInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                                placeholder="e.g. makehaven.org"
                            />
                            <button type="button" onClick={addDomain} disabled={!domainInput.trim()} className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 flex-shrink-0">
                                Add
                            </button>
                        </div>
                        {esoDomains.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {esoDomains.map(d => (
                                    <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-indigo-200 text-xs font-medium text-indigo-800">
                                        {d}
                                        <button type="button" onClick={() => setEsoDomains(prev => prev.filter(x => x !== d))} className="text-indigo-400 hover:text-red-500 font-bold leading-none">×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {esoDomains.length === 0 && (
                            <p className="text-xs text-indigo-400 italic">No domains registered yet.</p>
                        )}
                    </div>
                )}
                {saveError && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {saveError}
                    </div>
                )}
                <div className="flex justify-end pt-2 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={() => void handleSave()} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
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
    const [formError, setFormError] = useState('');

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
        setFormError('');
        if (!orgId && !selectedOrgId) {
            setFormError("Please select an organization.");
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
                {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
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
    const safeOrganizations = Array.isArray(organizations) ? organizations : [];
    const safePipelines = Array.isArray(pipelines) ? pipelines : [];
    const safeChecklists = Array.isArray(checklists) ? checklists : [];

    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [status, setStatus] = useState('active');
    const [formError, setFormError] = useState('');
    
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
                } else if ((initiative.checklists || []).length > 0) {
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
                setPipelineId(safePipelines[0]?.id || '');
                setSelectedChecklistId(safeChecklists[0]?.id || '');
                
                // Smart Org Defaulting
                if (orgId) {
                    // 1. Contextual passed ID
                    setSelectedOrgId(orgId);
                } else if (safeOrganizations.length === 1) {
                    // 2. Only one option available
                    setSelectedOrgId(safeOrganizations[0].id);
                } else {
                    // 3. Multiple options (Admin/Dual Role) -> Force explicit selection (No default)
                    setSelectedOrgId('');
                }
            }
            
            setStartDate(initiative?.start_date || new Date().toISOString().split('T')[0]);
            setTargetEndDate(initiative?.target_end_date || '');
        }
    }, [isOpen, initiative, safePipelines, safeChecklists, orgId, safeOrganizations]);

    const handleSave = () => {
        setFormError('');
        if (!selectedOrgId) {
            setFormError('Please select an organization.');
            return;
        }

        let finalPipelineId: string | undefined = undefined;
        let finalChecklists: any[] = [];

        if (processMode === 'pipeline') {
            if (!pipelineId) {
                setFormError("Please select a pipeline.");
                return;
            }
            finalPipelineId = pipelineId;
            finalChecklists = [];
        } else {
            if (!selectedChecklistId) {
                setFormError("Please select a checklist.");
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

    const orgOptions = safeOrganizations.map(o => ({ id: o.id, label: o.name }));
    const activeOrgName = safeOrganizations.find(o => o.id === selectedOrgId)?.name || 'Unknown';
    
    // Show org selector if:
    // 1. Not editing an existing initiative
    // 2. AND (Multiple organizations exist OR No pre-defined context was passed)
    const showOrgSelector = !initiative && (safeOrganizations.length > 1 || !orgId);

    // Helpers for preview
    const selectedPipelineDef = safePipelines.find(p => p.id === pipelineId);
    const selectedChecklistDef = safeChecklists.find(c => c.id === selectedChecklistId);

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
                                {safePipelines.map(p => (
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
                                {safeChecklists.map(c => (
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

                {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
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
