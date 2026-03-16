
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Chat } from "@google/genai";
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, FORM_TEXTAREA_CLASS, Avatar, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS } from '../../shared/ui/Components';
import { IconMicrophone, IconStop, IconSpeaker, IconCheck, IconShare, IconChat, IconDatabase } from '../../shared/ui/Icons';
import { Todo } from '../../domain/todos/types';
import { Referral } from '../../domain/types';
import { MetricAssignment } from '../../domain/metrics/reporting_types';
import { DataConfirmationTaskView } from '../metrics/MetricsCollectionViews';
import { buildAdvisorContext } from '../../domain/advisor/logic';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { base64ToBytes, decodeAudioData, createPcmBlob } from '../../utils';

interface SuggestionItem {
    title: string;
    description: string;
    type: 'action' | 'referral';
    priority: 'high' | 'medium' | 'low';
    target_org_name?: string; // For referrals
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const suggestionTool: FunctionDeclaration = {
    name: 'propose_suggestions',
    description: 'Propose concrete actionable suggestions or referrals for the user based on their needs.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            suggestions: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['action', 'referral'] },
                        priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                        target_org_name: { type: Type.STRING, description: "Name of organization to refer to" }
                    },
                    required: ['title', 'description', 'type']
                }
            }
        },
        required: ['suggestions']
    }
};

export const TodosView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [statusFilter, setStatusFilter] = useState<'active' | 'completed'>('active');
    
    // View Mode for ESO/Coaches
    const [viewMode, setViewMode] = useState<'mine' | 'assigned'>('mine');
    
    const [todos, setTodos] = useState<Todo[]>([]);
    const [assignedTodos, setAssignedTodos] = useState<Todo[]>([]);
    
    // Metric Assignments Integration
    const [metricAssignments, setMetricAssignments] = useState<MetricAssignment[]>([]);
    const [selectedMetricTask, setSelectedMetricTask] = useState<MetricAssignment | null>(null);

    // Data Loading
    const [people, setPeople] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);

    // Advisor State
    const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);
    const [mode, setMode] = useState<'voice' | 'text'>('text');
    const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionItem[]>([]);
    
    // Voice State
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    // Chat State
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isTextLoading, setIsTextLoading] = useState(false);

    // New Task State
    const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
    const [newTask, setNewTask] = useState<{title: string, description: string, due: string}>({ title: '', description: '', due: '' });

    // Inline feedback state
    const [referralSuccessMsg, setReferralSuccessMsg] = useState('');
    const [liveSessionError, setLiveSessionError] = useState('');
    const [audioError, setAudioError] = useState('');
    
    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const chatSessionRef = useRef<Chat | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const isClient = viewer.role === 'entrepreneur';

    // Clean up on unmount
    useEffect(() => {
        void loadData();
        return () => {
            disconnectLiveSession();
        };
    }, [repos, viewer, statusFilter]); // Refresh on filter change

    const loadData = async () => {
        setTodos(repos.todos.getAll(viewer.personId, viewer.ecosystemId));
        setMetricAssignments(repos.flexibleMetrics.listAssignments(viewer));
        const [nextPeople, nextOrgs] = await Promise.all([
            repos.people.getAll(viewer.ecosystemId),
            repos.organizations.getAll(viewer, viewer.ecosystemId),
        ]);
        setPeople(nextPeople);
        setOrgs(nextOrgs);
        if (!isClient) {
            setAssignedTodos(repos.todos.getAssignedBy(viewer.personId, viewer.ecosystemId));
        }
    };

    // Auto-scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Handle Data Task Detail View
    if (selectedMetricTask) {
        return (
            <DataConfirmationTaskView 
                assignment={selectedMetricTask} 
                onBack={() => setSelectedMetricTask(null)}
                onComplete={() => {
                    loadData();
                    setSelectedMetricTask(null);
                }}
            />
        );
    }

    // Determine which list to show
    const currentList = viewMode === 'mine' ? todos : assignedTodos;

    // Unified Filtering for Todos
    const filteredTodos = currentList.filter(t => {
        if (statusFilter === 'active') return t.status === 'pending' || t.status === 'in_progress';
        if (statusFilter === 'completed') return t.status === 'completed' || t.status === 'dismissed';
        return true;
    });

    // Unified Filtering for Metrics (only show in 'mine' view for now)
    const filteredMetrics = viewMode === 'mine' ? metricAssignments.filter(a => {
        if (statusFilter === 'active') return a.status === 'pending' || a.status === 'overdue';
        if (statusFilter === 'completed') return a.status === 'completed';
        return true;
    }) : [];

    // Create Unified Sortable List
    const unifiedList = [
        ...filteredTodos.map(t => ({ type: 'todo' as const, item: t, date: t.created_at })),
        ...filteredMetrics.map(m => ({ type: 'metric' as const, item: m, date: m.assigned_at }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleComplete = (id: string) => {
        repos.todos.setStatus(id, 'completed');
        loadData();
    };

    const handleDismiss = (id: string) => {
        repos.todos.setStatus(id, 'dismissed');
        loadData();
    };

    const handleCreateTask = () => {
        if (!newTask.title) return;
        
        repos.todos.add({
            id: `todo_${Date.now()}`,
            ecosystem_id: viewer.ecosystemId,
            owner_id: viewer.personId,
            title: newTask.title,
            description: newTask.description,
            status: 'pending',
            source: 'manual',
            created_at: new Date().toISOString(),
            created_by: viewer.personId,
            due_date: newTask.due
        });
        
        setNewTask({ title: '', description: '', due: '' });
        setIsCreateTaskOpen(false);
        loadData();
    };

    const handleAcceptSuggestion = async (suggestion: SuggestionItem, index: number) => {
        if (suggestion.type === 'referral') {
            const allOrgs = await repos.organizations.getAll(viewer);
            const targetName = suggestion.target_org_name || suggestion.title;
            const targetOrg = allOrgs.find(o => o.name.toLowerCase().includes(targetName.toLowerCase()));

            const newReferral: Referral = {
                id: `ref_${Date.now()}`,
                referring_org_id: viewer.orgId,
                receiving_org_id: targetOrg?.id || 'unknown_org_id',
                subject_person_id: viewer.personId,
                subject_org_id: viewer.orgId,
                date: new Date().toISOString().split('T')[0],
                status: 'pending',
                notes: suggestion.description || `AI suggested referral to ${targetName}`
            };
            repos.referrals.add(newReferral);
            setReferralSuccessMsg(`Referral request to ${targetOrg?.name || targetName} created!`);
            setTimeout(() => setReferralSuccessMsg(''), 3000);
        } else {
            repos.todos.add({
                id: `todo_${Date.now()}_${Math.random()}`,
                ecosystem_id: viewer.ecosystemId,
                owner_id: viewer.personId,
                title: suggestion.title,
                description: suggestion.description,
                status: 'pending',
                source: 'advisor',
                created_at: new Date().toISOString(),
                created_by: 'system_advisor'
            });
        }

        const newPending = [...pendingSuggestions];
        newPending.splice(index, 1);
        setPendingSuggestions(newPending);
        
        if (suggestion.type !== 'referral') {
            void loadData();
        }
    };

    // --- Context Building Helper ---
    const getContext = () => {
        const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId)!;
        const user = people.find((person) => person.id === viewer.personId)!;
        const org = orgs.find((organization) => organization.id === viewer.orgId);
        const esos = repos.advisor.getAvailableESOs(viewer.ecosystemId);
        const resources = repos.advisor.getResources(viewer.ecosystemId);
        return buildAdvisorContext(ecosystem, esos, resources, user, org);
    };

    // --- Live API Logic (Voice) ---

    const disconnectLiveSession = () => {
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
        setIsConnected(false);
        setIsSpeaking(false);
    };

    const startLiveSession = async () => {
        try {
            const contextText = getContext();

            // Initialize Audio
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = audioCtx;
            nextStartTimeRef.current = audioCtx.currentTime;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
            
            // Connect to Gemini
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            
            // Create Session
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: `You are an expert ecosystem advisor. 
                    Context: ${contextText}. 
                    Listen to the user's needs. Be concise and conversational.
                    When you have a concrete suggestion or referral, call the 'propose_suggestions' tool.`,
                    tools: [{ functionDeclarations: [suggestionTool] }]
                },
                callbacks: {
                    onopen: () => {
                        console.log("Live session connected");
                        setIsConnected(true);
                        
                        // Setup Audio Input Streaming
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
                        // Handle Audio Output
                        const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData) {
                            setIsSpeaking(true);
                            const bytes = base64ToBytes(audioData);
                            const buffer = await decodeAudioData(bytes, audioCtx);
                            
                            const source = audioCtx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioCtx.destination);
                            
                            const startTime = Math.max(audioCtx.currentTime, nextStartTimeRef.current);
                            source.start(startTime);
                            nextStartTimeRef.current = startTime + buffer.duration;
                            
                            source.onended = () => {
                                sourcesRef.current.delete(source);
                                if (sourcesRef.current.size === 0) setIsSpeaking(false);
                            };
                            sourcesRef.current.add(source);
                        }

                        // Handle Tool Calls
                        if (msg.toolCall) {
                            for (const fc of msg.toolCall.functionCalls) {
                                if (fc.name === 'propose_suggestions') {
                                    const args = fc.args as any;
                                    if (args.suggestions) {
                                        setPendingSuggestions(prev => [...prev, ...args.suggestions]);
                                    }
                                    
                                    // Respond to tool call
                                    sessionPromise.then(session => session.sendToolResponse({
                                        functionResponses: {
                                            id: fc.id,
                                            name: fc.name,
                                            response: { result: 'Suggestions received and displayed to user.' }
                                        }
                                    }));
                                }
                            }
                        }
                    },
                    onclose: () => {
                        console.log("Live session closed");
                        disconnectLiveSession();
                    },
                    onerror: (err) => {
                        console.error("Live session error", err);
                        disconnectLiveSession();
                        setLiveSessionError("Connection lost. Please try again.");
                        setTimeout(() => setLiveSessionError(''), 5000);
                    }
                }
            });

        } catch (err) {
            console.error("Failed to start live session", err);
            setAudioError("Could not start audio session. Check permissions.");
            setTimeout(() => setAudioError(''), 5000);
        }
    };

    // --- Chat API Logic (Text) ---

    const handleSendText = async () => {
        if (!inputText.trim()) return;
        
        const userMsg = inputText;
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setInputText('');
        setIsTextLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            
            // Initialize Chat Session if needed
            if (!chatSessionRef.current) {
                 const contextText = getContext();
                 
                 chatSessionRef.current = ai.chats.create({
                    model: 'gemini-2.5-flash-preview',
                    config: {
                        systemInstruction: `You are an expert ecosystem advisor. 
                        Context: ${contextText}. 
                        Be concise and helpful. 
                        When you have a concrete suggestion or referral, call the 'propose_suggestions' tool.`,
                        tools: [{ functionDeclarations: [suggestionTool] }]
                    }
                 });
            }

            const response = await chatSessionRef.current.sendMessage({ message: userMsg });
            
            // Handle Model Text
            const modelText = response.text || '';
            if (modelText) {
                setChatMessages(prev => [...prev, { role: 'model', text: modelText }]);
            }

            // Handle Function Calls
            const calls = response.functionCalls; 
            if (calls && calls.length > 0) {
                 let hasSuggestions = false;
                 
                 // Process calls (just collecting args for UI in this demo)
                 for (const call of calls) {
                     if (call.name === 'propose_suggestions') {
                         const args = call.args as any;
                         if (args.suggestions) {
                             setPendingSuggestions(prev => [...prev, ...args.suggestions]);
                             hasSuggestions = true;
                         }
                     }
                 }

                 // If we got suggestions but no text, add a helpful message
                 if (hasSuggestions && !modelText) {
                     setChatMessages(prev => [...prev, { role: 'model', text: "I've added some suggestions to your action plan below." }]);
                 }
            }

        } catch (e) {
            console.error(e);
            setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error connecting to the advisor." }]);
        } finally {
            setIsTextLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    {viewMode === 'mine' ? 'My Action Plan' : 'Tasks Assigned by Me'}
                </h2>
                
                <div className="flex gap-3">
                    {/* Manual Task Creation Button */}
                    <button 
                        onClick={() => setIsCreateTaskOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded font-bold text-sm shadow-sm hover:bg-gray-50 transition-colors"
                    >
                        <span>+</span> New Task
                    </button>

                    {/* View Toggle for Non-Clients (Coaches/ESO) */}
                    {!isClient && (
                        <div className="flex bg-gray-200 rounded-lg p-1">
                            <button 
                                onClick={() => setViewMode('mine')}
                                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${viewMode === 'mine' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                My Tasks
                            </button>
                            <button 
                                onClick={() => setViewMode('assigned')}
                                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${viewMode === 'assigned' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                Assigned by Me
                            </button>
                        </div>
                    )}

                    <button 
                        onClick={() => setIsAdvisorOpen(!isAdvisorOpen)}
                        className={`flex items-center gap-2 px-4 py-2 rounded font-bold text-sm transition-colors ${isAdvisorOpen ? 'bg-gray-200 text-gray-800' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'}`}
                    >
                        {isAdvisorOpen ? 'Hide Advisor' : '✨ Get AI Advice'}
                    </button>
                </div>
            </div>

            {/* Collapsible Advisor Panel */}
            {isAdvisorOpen && (
                <div className="border border-indigo-100 rounded-xl overflow-hidden bg-indigo-50/50 mb-8 animate-in fade-in slide-in-from-top-4">
                    <div className="p-4 bg-white border-b border-indigo-100 flex justify-between items-center">
                        <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                            <span>🤖</span> AI Ecosystem Advisor
                        </h3>
                        <div className="flex bg-gray-100 rounded-md p-0.5">
                            <button
                                onClick={() => { setMode('text'); disconnectLiveSession(); }}
                                className={`px-3 py-1 text-xs font-bold rounded ${mode === 'text' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                Chat
                            </button>
                            <button
                                onClick={() => setMode('voice')}
                                className={`px-3 py-1 text-xs font-bold rounded ${mode === 'voice' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                Voice
                            </button>
                        </div>
                    </div>

                    <div className="p-6">
                        {mode === 'voice' ? (
                            <div className={`rounded-lg p-6 text-white shadow-lg transition-colors duration-500 ${isConnected ? 'bg-gradient-to-r from-red-600 to-pink-600' : 'bg-gradient-to-r from-indigo-600 to-purple-600'}`}>
                                <div className="text-center">
                                    <h2 className="text-lg font-bold mb-2 flex justify-center items-center gap-2">
                                        {isConnected ? <span className="animate-pulse">🔴 Live Advisor Active</span> : <span>Microphone Ready</span>}
                                    </h2>
                                    <p className="text-indigo-100 text-xs mb-4">
                                        {isConnected 
                                            ? "I'm listening. Ask about funding or resources." 
                                            : "Start a voice session to get real-time advice."}
                                    </p>
                                    
                                    <div className="flex justify-center mb-4">
                                        {!isConnected ? (
                                            <button
                                                onClick={startLiveSession}
                                                className="p-4 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all transform hover:scale-105 shadow-xl border-2 border-transparent hover:border-white/40"
                                            >
                                                <IconMicrophone className="w-8 h-8" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={disconnectLiveSession}
                                                className="px-4 py-2 bg-white text-red-600 font-bold rounded-full hover:bg-gray-100 shadow-md flex items-center gap-2 text-sm"
                                            >
                                                <IconStop className="w-4 h-4" /> End
                                            </button>
                                        )}
                                    </div>
                                    {isConnected && (
                                        <div className="flex justify-center items-end gap-1 h-8">
                                            {[...Array(5)].map((_, i) => (
                                                <div key={i} className={`w-1 bg-white rounded-full transition-all duration-100 ${isSpeaking ? 'animate-bounce' : 'h-1'}`} style={{ height: isSpeaking ? `${Math.random() * 20 + 5}px` : '2px', animationDelay: `${i * 0.1}s` }} />
                                            ))}
                                        </div>
                                    )}
                                    {liveSessionError && <p className="text-sm text-red-200 mt-2 text-center">{liveSessionError}</p>}
                                    {audioError && <p className="text-sm text-red-200 mt-2 text-center">{audioError}</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-[300px]">
                                <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatContainerRef}>
                                    {chatMessages.length === 0 && (
                                        <div className="text-center text-gray-400 mt-12 text-sm">
                                            <p>Example: "Who can help me with prototyping?"</p>
                                        </div>
                                    )}
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] rounded-lg p-2 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {isTextLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-100 rounded-lg p-2 text-xs text-gray-500 italic">Thinking...</div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                                    <div className="flex gap-2">
                                        <input 
                                            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="Type message..."
                                            value={inputText}
                                            onChange={e => setInputText(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSendText()}
                                            disabled={isTextLoading}
                                        />
                                        <button 
                                            onClick={handleSendText}
                                            disabled={isTextLoading || !inputText.trim()}
                                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-md font-medium text-xs hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            Send
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {referralSuccessMsg && <p className="text-sm text-green-600 mt-2">{referralSuccessMsg}</p>}

            {/* AI Proposed Suggestions (Visible even if advisor closed, until dismissed/accepted) */}
            {pendingSuggestions.length > 0 && (
                <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm uppercase tracking-wide">
                        <span>💡</span> New Suggestions Available
                    </div>
                    {pendingSuggestions.map((sugg, idx) => (
                        <div key={idx} className="bg-white border-l-4 border-indigo-500 rounded shadow-sm p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-gray-900">{sugg.title}</h4>
                                    <Badge color={sugg.priority === 'high' ? 'red' : 'blue'}>{sugg.type === 'referral' ? 'Referral' : 'Advice'}</Badge>
                                </div>
                                <p className="text-sm text-gray-600">{sugg.description}</p>
                            </div>
                            <button 
                                onClick={() => handleAcceptSuggestion(sugg, idx)}
                                className={`px-4 py-2 rounded text-white font-bold text-sm shadow-sm flex items-center gap-2 ${sugg.type === 'referral' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                                {sugg.type === 'referral' ? <><IconShare className="w-4 h-4"/> Create Referral</> : <><IconCheck className="w-4 h-4"/> Add to List</>}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Standard Task List */}
            <div className="flex justify-end mb-2">
                <div className="flex bg-gray-100 rounded-lg p-1">
                    <button 
                        onClick={() => setStatusFilter('active')}
                        className={`px-3 py-1 text-xs font-bold rounded transition-colors ${statusFilter === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Active
                    </button>
                    <button 
                        onClick={() => setStatusFilter('completed')}
                        className={`px-3 py-1 text-xs font-bold rounded transition-colors ${statusFilter === 'completed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Completed
                    </button>
                </div>
            </div>

            <div className="grid gap-3">
                {unifiedList.length === 0 ? (
                    <div className="text-center p-8 bg-gray-50 rounded border border-dashed text-gray-400 text-sm">
                        {statusFilter === 'active' ? 'No active tasks found.' : 'No completed items yet.'}
                    </div>
                ) : (
                    unifiedList.map((entry, idx) => {
                        // Standard Todo Rendering
                        if (entry.type === 'todo') {
                            const todo = entry.item as Todo;
                            // For assigned view, resolve the owner name
                            const assignee = viewMode === 'assigned' 
                                ? people.find(p => p.id === todo.owner_id) 
                                : null;
                            const assigneeName = assignee ? `${assignee.first_name} ${assignee.last_name}` : 'Unknown';
                            const orgName = assignee ? orgs.find(o => o.id === assignee.organization_id)?.name : '';

                            return (
                                <div key={todo.id} className={`bg-white border rounded-lg p-4 shadow-sm flex flex-col md:flex-row justify-between gap-4 ${todo.status === 'completed' ? 'opacity-75 bg-gray-50' : 'border-gray-200'}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className={`font-bold text-base ${todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>{todo.title}</h3>
                                            {todo.source === 'advisor' && <Badge color="purple">AI Advice</Badge>}
                                            {todo.due_date && <Badge color="red">Due: {new Date(todo.due_date).toLocaleDateString()}</Badge>}
                                            {viewMode === 'assigned' && (
                                                <Badge color="blue">Assigned</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600">{todo.description}</p>
                                        
                                        {/* Assigned To Metadata (Only in Assigned View) */}
                                        {viewMode === 'assigned' && assignee && (
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                                                <Avatar src={assignee.avatar_url} name={assigneeName} size="xs" />
                                                <div className="text-xs text-gray-500">
                                                    Assigned to <strong>{assigneeName}</strong> {orgName && `(${orgName})`}
                                                </div>
                                            </div>
                                        )}

                                        {todo.action_url && (
                                            <a href={todo.action_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-sm text-indigo-600 hover:underline font-medium">
                                                Open Link →
                                            </a>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2 self-start md:self-center">
                                        {viewMode === 'mine' ? (
                                            statusFilter === 'active' && (
                                                <>
                                                    <button 
                                                        onClick={() => handleDismiss(todo.id)}
                                                        className="px-3 py-1 text-xs font-bold text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                                                    >
                                                        Dismiss
                                                    </button>
                                                    <button 
                                                        onClick={() => handleComplete(todo.id)}
                                                        className="px-3 py-1 text-xs font-bold text-white bg-green-600 rounded hover:bg-green-700 shadow-sm"
                                                    >
                                                        ✓ Mark Done
                                                    </button>
                                                </>
                                            )
                                        ) : (
                                            // Read-only status for tasks assigned to others
                                            <Badge color={todo.status === 'completed' ? 'green' : 'yellow'}>
                                                {todo.status === 'completed' ? 'Completed by User' : 'Pending User Action'}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            );
                        } else {
                            // Metric Assignment Rendering
                            const metric = entry.item as MetricAssignment;
                            const set = repos.flexibleMetrics.getMetricSet(metric.metric_set_id);
                            return (
                                <div key={metric.id} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <IconDatabase className="w-4 h-4 text-indigo-700" />
                                            <h3 className="font-bold text-base text-indigo-900">{set?.name || 'Data Request'}</h3>
                                            <Badge color="indigo">Data Request</Badge>
                                            {metric.due_date && <Badge color={new Date(metric.due_date) < new Date() ? 'red' : 'gray'}>Due: {new Date(metric.due_date).toLocaleDateString()}</Badge>}
                                        </div>
                                        <p className="text-sm text-indigo-800">{set?.description || 'Periodic data collection update.'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 self-start md:self-center">
                                        {statusFilter === 'active' ? (
                                            <button 
                                                onClick={() => setSelectedMetricTask(metric)}
                                                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                                            >
                                                Review & Submit &rarr;
                                            </button>
                                        ) : (
                                            <Badge color="green">Submitted</Badge>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                    })
                )}
            </div>

            {/* Manual Task Creation Modal */}
            <Modal isOpen={isCreateTaskOpen} onClose={() => setIsCreateTaskOpen(false)} title="Create New Task">
                <div className="space-y-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Task Title</label>
                        <input className={FORM_INPUT_CLASS} value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} autoFocus placeholder="e.g. Review Pitch Deck" />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Description</label>
                        <textarea className={FORM_TEXTAREA_CLASS} value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} placeholder="Optional details..." rows={3} />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Due Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={newTask.due} onChange={e => setNewTask({...newTask, due: e.target.value})} />
                    </div>
                    <div className="flex justify-end pt-2 gap-2">
                        <button onClick={() => setIsCreateTaskOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                        <button onClick={handleCreateTask} disabled={!newTask.title} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50">Save Task</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
