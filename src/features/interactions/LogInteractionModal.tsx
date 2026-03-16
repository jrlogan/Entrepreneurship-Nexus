
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { Organization, Interaction, InteractionType, MetricType } from '../../domain/types';
import { Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, Badge } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';
import { loadEnums } from '../../domain/standards/loadStandards';
import { base64ToBytes, decodeAudioData, createPcmBlob } from '../../utils';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface LogInteractionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    organizations: Organization[];
    defaultInitiativeId?: string; // New Prop
}

const updateDraftTool: FunctionDeclaration = {
    name: 'update_draft',
    description: 'Update the interaction draft based on user input.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            notes: { type: Type.STRING, description: "The content/summary of the meeting" },
            type: { type: Type.STRING, enum: ['meeting', 'email', 'call', 'event', 'note'] },
            note_confidential: { type: Type.BOOLEAN, description: "If true, note is private to author." },
            date: { type: Type.STRING, description: "ISO date string YYYY-MM-DD" },
            organization_name: { type: Type.STRING, description: "Name of the organization discussed" }
        }
    }
};

export const LogInteractionModal = ({ isOpen, onClose, onComplete, organizations, defaultInitiativeId }: LogInteractionModalProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const enums = loadEnums();
    const pipelines = repos.pipelines.getPipelines(viewer.ecosystemId);
    
    // Form State
    const [orgId, setOrgId] = useState('');
    const [type, setType] = useState<InteractionType>('meeting');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [noteConfidential, setNoteConfidential] = useState(false);
    const [notes, setNotes] = useState('');

    // Follow-up Actions State
    const [pendingTasks, setPendingTasks] = useState<{title: string, due: string}[]>([]);
    const [pendingReferrals, setPendingReferrals] = useState<{targetOrgId: string, notes: string}[]>([]);
    const [pendingInitiatives, setPendingInitiatives] = useState<{name: string, pipelineId: string}[]>([]);
    const [pendingMetrics, setPendingMetrics] = useState<{type: MetricType, value: number, note: string}[]>([]);
    
    // Mini-form state for actions
    const [actionType, setActionType] = useState<'task' | 'referral' | 'initiative' | 'metric' | null>(null);
    const [tempTask, setTempTask] = useState({title: '', due: ''});
    const [tempRef, setTempRef] = useState({targetOrgId: '', notes: ''});
    const [tempInit, setTempInit] = useState({name: '', pipelineId: ''});
    const [tempMetric, setTempMetric] = useState<{type: MetricType, value: string, note: string}>({type: 'revenue', value: '', note: ''});
    
    // Live API State
    const [isLive, setIsLive] = useState(false);
    const [formError, setFormError] = useState('');
    const [micError, setMicError] = useState('');
    
    // Refs for cleanup
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sessionRef = useRef<Promise<any> | null>(null);

    useEffect(() => {
        if (isOpen) {
            stopLiveSession();
            resetForm();
            // Pre-select org if we only have one (contextual usage)
            if (organizations.length === 1) {
                setOrgId(organizations[0].id);
            }
        }
    }, [isOpen, organizations]);

    const resetForm = () => {
        setOrgId('');
        setType('meeting');
        setDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setNoteConfidential(false);
        setPendingTasks([]);
        setPendingReferrals([]);
        setPendingInitiatives([]);
        setPendingMetrics([]);
        setActionType(null);
    };

    // Live API Implementation
    const startLiveSession = async () => {
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = audioCtx;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const orgNames = organizations.map(o => o.name).join(', ');

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: `You are a helpful assistant for an ESO staff member logging a client interaction.
                    Context: Available organizations are: ${orgNames}.
                    Current Date: ${new Date().toLocaleDateString()}.
                    Goal: Ask for details (Who, What, When) to fill the log. Call 'update_draft' when new info is provided.
                    Be brief.`,
                    tools: [{ functionDeclarations: [updateDraftTool] }]
                },
                callbacks: {
                    onopen: () => {
                        setIsLive(true);
                        // Setup input stream
                        const source = audioCtx.createMediaStreamSource(stream);
                        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
                        processor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcmBlob = createPcmBlob(inputData);
                            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(processor);
                        processor.connect(audioCtx.destination);
                        inputSourceRef.current = source;
                        processorRef.current = processor;
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        // Play Audio
                        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData) {
                            const bytes = base64ToBytes(audioData);
                            const buffer = await decodeAudioData(bytes, audioCtx);
                            const source = audioCtx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioCtx.destination);
                            source.start();
                        }
                        
                        // Handle Tool calls to update form
                        if (msg.toolCall) {
                            for (const fc of msg.toolCall.functionCalls) {
                                if (fc.name === 'update_draft') {
                                    const args = fc.args as any;
                                    if (args.notes) setNotes(args.notes);
                                    if (args.type) setType(args.type);
                                    if (args.note_confidential !== undefined) setNoteConfidential(args.note_confidential);
                                    if (args.date) setDate(args.date);
                                    if (args.organization_name) {
                                        const match = organizations.find(o => o.name.toLowerCase().includes(args.organization_name.toLowerCase()));
                                        if (match) setOrgId(match.id);
                                    }
                                    
                                    sessionPromise.then(session => session.sendToolResponse({
                                        functionResponses: {
                                            id: fc.id,
                                            name: fc.name,
                                            response: { result: 'Form updated.' }
                                        }
                                    }));
                                }
                            }
                        }
                    },
                    onclose: () => setIsLive(false),
                    onerror: () => {
                        setIsLive(false);
                    }
                }
            });
            sessionRef.current = sessionPromise;

        } catch (err) {
            console.error(err);
            setMicError("Microphone access failed.");
        }
    };

    const stopLiveSession = () => {
        if (inputSourceRef.current) {
            inputSourceRef.current.disconnect();
            inputSourceRef.current = null;
        }
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setIsLive(false);
    };

    // --- Action Handlers ---
    const addAction = (type: 'task' | 'referral' | 'initiative' | 'metric') => {
        setActionType(type);
        setTempTask({title: '', due: ''});
        setTempRef({targetOrgId: '', notes: ''});
        setTempInit({name: '', pipelineId: pipelines[0]?.id || ''});
        setTempMetric({type: 'revenue', value: '', note: ''});
    };

    const confirmAction = () => {
        if (actionType === 'task' && tempTask.title) {
            setPendingTasks([...pendingTasks, { ...tempTask }]);
        } else if (actionType === 'referral' && tempRef.targetOrgId) {
            setPendingReferrals([...pendingReferrals, { ...tempRef }]);
        } else if (actionType === 'initiative' && tempInit.name) {
            setPendingInitiatives([...pendingInitiatives, { ...tempInit }]);
        } else if (actionType === 'metric' && tempMetric.value) {
            setPendingMetrics([...pendingMetrics, { 
                type: tempMetric.type, 
                value: Number(tempMetric.value), 
                note: tempMetric.note 
            }]);
        }
        setActionType(null);
    };

    const handleSave = () => {
        setFormError('');
        if (!orgId || !notes) {
            setFormError("Please select an organization and enter notes.");
            return;
        }
        stopLiveSession();

        // 1. Save Interaction
        const interactionId = `int_${Date.now()}`;
        repos.interactions.add({
            id: interactionId,
            organization_id: orgId,
            initiative_id: defaultInitiativeId, // Link to project if provided
            date,
            type,
            note_confidential: noteConfidential,
            visibility: 'network_shared',
            notes,
            author_org_id: viewer.orgId,
            ecosystem_id: viewer.ecosystemId,
            recorded_by: "Me (Current User)"
        });

        // 2. Save Follow-up Tasks (Logic unchanged)
        pendingTasks.forEach(t => {
            repos.todos.add({
                id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                ecosystem_id: viewer.ecosystemId,
                owner_id: viewer.personId,
                title: t.title,
                status: 'pending',
                source: 'manual',
                created_at: new Date().toISOString(),
                created_by: viewer.personId,
                interaction_id: interactionId,
                due_date: t.due || undefined
            });
        });

        // 3. Save Referrals (Logic unchanged)
        pendingReferrals.forEach(r => {
            repos.referrals.add({
                id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                referring_org_id: viewer.orgId,
                receiving_org_id: r.targetOrgId,
                subject_org_id: orgId,
                subject_person_id: 'unknown',
                date: new Date().toISOString().split('T')[0],
                status: 'pending',
                notes: r.notes
            });
        });

        // 4. Save Initiatives (Logic unchanged)
        pendingInitiatives.forEach(i => {
            repos.pipelines.addInitiative({
                id: `init_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                organization_id: orgId,
                pipeline_id: i.pipelineId,
                name: i.name,
                current_stage_index: 0,
                status: 'active',
                ecosystem_id: viewer.ecosystemId,
                stage_history: [],
                checklists: []
            });
        });

        // 5. Save Metrics
        pendingMetrics.forEach(m => {
            repos.metrics.add({
                id: `met_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                organization_id: orgId,
                ecosystem_id: viewer.ecosystemId,
                date: date, // Use interaction date
                metric_type: m.type,
                value: m.value,
                source: 'interaction_log',
                interaction_id: interactionId,
                notes: m.note
            });
        });

        onComplete();
        onClose();
    };

    const orgOptions = organizations.map(o => ({ id: o.id, label: o.name, subLabel: o.email }));
    const esoOptions = organizations.filter(o => o.roles.includes('eso') && o.id !== viewer.orgId);

    return (
        <Modal isOpen={isOpen} onClose={() => { stopLiveSession(); onClose(); }} title="Log Interaction & Next Steps">
            <div className="space-y-4">
                {/* 1. Core Details */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <SearchableSelect 
                            label="Organization"
                            options={orgOptions}
                            value={orgId}
                            onChange={setOrgId}
                            placeholder="Type to search..."
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Type</label>
                        <select className={FORM_SELECT_CLASS} value={type} onChange={e => setType(e.target.value as InteractionType)}>
                            {enums.InteractionType.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="flex items-end">
                        <div className={`w-full flex items-center gap-2 p-2 border rounded transition-colors ${noteConfidential ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                            <input 
                                type="checkbox" 
                                id="private_toggle"
                                checked={noteConfidential}
                                onChange={e => setNoteConfidential(e.target.checked)}
                                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                            />
                            <label htmlFor="private_toggle" className={`text-sm font-medium cursor-pointer select-none ${noteConfidential ? 'text-amber-900' : 'text-gray-600'}`}>
                                Mark Confidential (Hide Content)
                            </label>
                        </div>
                    </div>
                </div>

                {/* AI Helper Section */}
                <div className={`p-4 rounded-lg border transition-colors ${isLive ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100'}`}>
                    <label className={`block text-xs font-bold mb-2 uppercase tracking-wide ${isLive ? 'text-red-800' : 'text-indigo-800'}`}>
                        {isLive ? '🔴 Live Dictation Active' : 'AI Assistant'}
                    </label>
                    <div className="flex gap-2 items-center">
                        {!isLive ? (
                            <button 
                                onClick={startLiveSession}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-md text-sm font-medium hover:bg-indigo-50 transition-colors"
                            >
                                <span>🎤</span> Start Dictation
                            </button>
                        ) : (
                            <button 
                                onClick={stopLiveSession}
                                className="flex items-center gap-2 px-3 py-2 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm font-medium hover:bg-red-200 transition-colors animate-pulse"
                            >
                                <span>⏹</span> Stop Recording
                            </button>
                        )}
                        <span className="text-gray-400 text-xs">OR</span>
                        <label className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-md text-sm font-medium hover:bg-indigo-50 transition-colors cursor-pointer disabled:opacity-50">
                            <span>📄</span> Upload Doc
                            <input type="file" className="hidden" accept="application/pdf,image/*,text/plain" disabled={isLive} />
                        </label>
                    </div>
                    {isLive && (
                        <p className="text-xs text-red-600 mt-2">Listening... Say "Set date to..." or "Notes are..."</p>
                    )}
                    {micError && <p className="text-sm text-red-600 mt-2">{micError}</p>}
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Notes / Summary</label>
                    <textarea 
                        className={FORM_TEXTAREA_CLASS} 
                        rows={4} 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Meeting summary..."
                    />
                </div>

                {/* Actions & Next Steps UI (Same as previous implementation) */}
                <div className="border-t border-gray-200 pt-4">
                    <label className="block text-sm font-bold text-gray-800 mb-2">Outcome & Next Steps</label>
                    
                    <div className="space-y-2 mb-3">
                        {pendingTasks.map((t, i) => (
                            <div key={i} className="flex justify-between items-center bg-gray-50 border border-gray-200 p-2 rounded text-sm">
                                <span className="flex items-center gap-2">✅ Task: <strong>{t.title}</strong></span>
                                <button onClick={() => setPendingTasks(pendingTasks.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">&times;</button>
                            </div>
                        ))}
                        {pendingReferrals.map((r, i) => (
                            <div key={i} className="flex justify-between items-center bg-purple-50 border border-purple-200 p-2 rounded text-sm">
                                <span className="flex items-center gap-2">📫 Referral to: <strong>{organizations.find(o => o.id === r.targetOrgId)?.name}</strong></span>
                                <button onClick={() => setPendingReferrals(pendingReferrals.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">&times;</button>
                            </div>
                        ))}
                        {pendingInitiatives.map((init, i) => (
                            <div key={i} className="flex justify-between items-center bg-green-50 border border-green-200 p-2 rounded text-sm">
                                <span className="flex items-center gap-2">🚀 Initiative: <strong>{init.name}</strong></span>
                                <button onClick={() => setPendingInitiatives(pendingInitiatives.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">&times;</button>
                            </div>
                        ))}
                        {pendingMetrics.map((m, i) => (
                            <div key={i} className="flex justify-between items-center bg-blue-50 border border-blue-200 p-2 rounded text-sm">
                                <span className="flex items-center gap-2">
                                    📈 {enums.MetricType.find(t => t.id === m.type)?.label}: <strong>{m.value}</strong>
                                </span>
                                <button onClick={() => setPendingMetrics(pendingMetrics.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">&times;</button>
                            </div>
                        ))}
                    </div>

                    {!actionType ? (
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={() => addAction('task')} className="px-3 py-1 bg-white border border-gray-300 text-gray-600 text-xs font-bold rounded hover:bg-gray-50">+ Task</button>
                            <button onClick={() => addAction('referral')} className="px-3 py-1 bg-white border border-gray-300 text-purple-600 text-xs font-bold rounded hover:bg-purple-50">+ Referral</button>
                            <button onClick={() => addAction('initiative')} className="px-3 py-1 bg-white border border-gray-300 text-green-600 text-xs font-bold rounded hover:bg-green-50">+ Initiative</button>
                            <button onClick={() => addAction('metric')} className="px-3 py-1 bg-white border border-gray-300 text-blue-600 text-xs font-bold rounded hover:bg-blue-50">+ Impact Metric</button>
                        </div>
                    ) : (
                        <div className="bg-gray-100 p-3 rounded border border-gray-200 animate-in fade-in zoom-in duration-150">
                            <div className="flex justify-between mb-2">
                                <span className="text-xs font-bold uppercase text-gray-500">New {actionType}</span>
                                <button onClick={() => setActionType(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                            
                            {actionType === 'task' && (
                                <div className="flex gap-2">
                                    <input className={`${FORM_INPUT_CLASS} text-sm`} placeholder="Task Title..." value={tempTask.title} onChange={e => setTempTask({...tempTask, title: e.target.value})} autoFocus />
                                    <input type="date" className={`${FORM_INPUT_CLASS} text-sm w-32`} value={tempTask.due} onChange={e => setTempTask({...tempTask, due: e.target.value})} />
                                </div>
                            )}

                            {actionType === 'referral' && (
                                <div className="space-y-2">
                                    <select className={`${FORM_SELECT_CLASS} text-sm`} value={tempRef.targetOrgId} onChange={e => setTempRef({...tempRef, targetOrgId: e.target.value})}>
                                        <option value="">Select Partner...</option>
                                        {esoOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                    <input className={`${FORM_INPUT_CLASS} text-sm`} placeholder="Intro note..." value={tempRef.notes} onChange={e => setTempRef({...tempRef, notes: e.target.value})} />
                                </div>
                            )}

                            {actionType === 'initiative' && (
                                <div className="space-y-2">
                                    <input className={`${FORM_INPUT_CLASS} text-sm`} placeholder="Initiative Name (e.g. Series A)" value={tempInit.name} onChange={e => setTempInit({...tempInit, name: e.target.value})} autoFocus />
                                    <select className={`${FORM_SELECT_CLASS} text-sm`} value={tempInit.pipelineId} onChange={e => setTempInit({...tempInit, pipelineId: e.target.value})}>
                                        {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {actionType === 'metric' && (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <select className={`${FORM_SELECT_CLASS} text-sm w-1/2`} value={tempMetric.type} onChange={e => setTempMetric({...tempMetric, type: e.target.value as MetricType})}>
                                            {enums.MetricType.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                        <input type="number" className={`${FORM_INPUT_CLASS} text-sm w-1/2`} placeholder="Value" value={tempMetric.value} onChange={e => setTempMetric({...tempMetric, value: e.target.value})} />
                                    </div>
                                    <input className={`${FORM_INPUT_CLASS} text-sm`} placeholder="Context (e.g. Q3 Report)" value={tempMetric.note} onChange={e => setTempMetric({...tempMetric, note: e.target.value})} />
                                </div>
                            )}

                            <div className="mt-2 text-right">
                                <button onClick={confirmAction} className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700">Add</button>
                            </div>
                        </div>
                    )}
                </div>

                {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => { stopLiveSession(); onClose(); }} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">Save Log & Actions</button>
                </div>
            </div>
        </Modal>
    );
};
