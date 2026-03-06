
import React, { useState, useEffect } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { MetricAssignment, MetricObservation } from '../../domain/metrics/reporting_types';
import { Card, Badge, FORM_LABEL_CLASS, FORM_INPUT_CLASS, InfoBanner } from '../../shared/ui/Components';

// --- TASK LIST VIEW ---

export const MyMetricsTasksView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [assignments, setAssignments] = useState<MetricAssignment[]>([]);
    const [selectedAssignment, setSelectedAssignment] = useState<MetricAssignment | null>(null);

    useEffect(() => {
        setAssignments(repos.flexibleMetrics.listAssignments(viewer));
    }, [repos, viewer]);

    const handleComplete = () => {
        setAssignments(repos.flexibleMetrics.listAssignments(viewer));
        setSelectedAssignment(null);
    };

    if (selectedAssignment) {
        return (
            <DataConfirmationTaskView 
                assignment={selectedAssignment} 
                onBack={() => setSelectedAssignment(null)}
                onComplete={handleComplete}
            />
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">My Data Updates</h2>
            
            <InfoBanner title="Help Us Tell Your Story">
                <p>We automatically track your interactions and referrals. Periodically, we ask you to <strong>confirm</strong> this data and supplement it with key impact numbers (Jobs, Revenue) to help us secure funding for the ecosystem.</p>
            </InfoBanner>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assignments.map(assign => {
                    const set = repos.flexibleMetrics.getMetricSet(assign.metric_set_id);
                    const isOverdue = new Date(assign.due_date) < new Date() && assign.status !== 'completed';
                    
                    return (
                        <Card key={assign.id} title={set?.name || 'Data Request'}>
                            <div className="space-y-4">
                                <div className="text-sm text-gray-600">
                                    <div className="mb-1"><strong>Due:</strong> {assign.due_date}</div>
                                    <div className="mb-1 text-xs">{set?.description}</div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <Badge color={assign.status === 'completed' ? 'green' : isOverdue ? 'red' : 'yellow'}>
                                        {assign.status === 'completed' ? 'Submitted' : isOverdue ? 'Overdue' : 'Pending'}
                                    </Badge>
                                    {assign.status !== 'completed' && (
                                        <button 
                                            onClick={() => setSelectedAssignment(assign)}
                                            className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 shadow-sm"
                                        >
                                            Review & Submit &rarr;
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    );
                })}
                {assignments.length === 0 && (
                    <div className="col-span-full p-12 text-center bg-gray-50 border border-dashed rounded text-gray-500">
                        <div className="text-4xl mb-2">✅</div>
                        <p>You're all caught up! No data updates required.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- CONFIRMATION FORM VIEW ---

export interface TaskProps {
    assignment: MetricAssignment;
    onBack: () => void;
    onComplete: () => void;
}

export const DataConfirmationTaskView = ({ assignment, onBack, onComplete }: TaskProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const set = repos.flexibleMetrics.getMetricSet(assignment.metric_set_id);
    const definitions = repos.flexibleMetrics.getDefinitions();
    
    // State
    const [values, setValues] = useState<Record<string, any>>({});
    
    useEffect(() => {
        if (!set) return;

        // 1. Load existing stored observations (drafts)
        const existingObs = repos.flexibleMetrics.getObservationsForAssignment(assignment.id);
        const initialVals: Record<string, any> = {};
        existingObs.forEach(o => initialVals[o.metric_id] = o.value);

        // 2. Compute derived values for ANY derived metrics not already stored
        set.metric_ids.forEach(mid => {
            if (initialVals[mid] !== undefined) return; // Skip if already loaded

            const def = definitions.find(d => d.id === mid);
            if (def && (def.source === 'event_derived' || def.source === 'computed')) {
                const val = repos.flexibleMetrics.calculateDerived(mid, {
                    ecosystem_id: assignment.ecosystem_id,
                    scope_type: assignment.scope_type,
                    scope_id: assignment.scope_id,
                    period_start: assignment.period_start,
                    period_end: assignment.period_end
                });
                initialVals[mid] = val; // Pre-fill with system calc
            }
        });
        
        setValues(initialVals);
    }, [assignment.id, set]);

    const handleSubmit = () => {
        if (!set) return;
        
        // Save ALL values (both manual inputs and confirmed derived values)
        set.metric_ids.forEach(mid => {
            const val = values[mid];
            if (val === undefined || val === '') return;

            const obs: MetricObservation = {
                id: `obs_${Date.now()}_${mid}`,
                metric_id: mid,
                ecosystem_id: assignment.ecosystem_id,
                scope_type: assignment.scope_type,
                scope_id: assignment.scope_id,
                timestamp: new Date().toISOString(),
                value: val,
                context_id: assignment.id,
                source_record_refs: [] // In future, link to activity IDs if derived
            };
            repos.flexibleMetrics.saveObservation(obs);
        });

        repos.flexibleMetrics.updateAssignmentStatus(assignment.id, 'completed', viewer.personId);
        onComplete();
    };

    if (!set) return <div>Error loading task.</div>;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="text-gray-500 hover:text-gray-800">← Back</button>
                <h2 className="text-2xl font-bold text-gray-800">{set.name}</h2>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-8">
                {set.metric_ids.map(mid => {
                    const def = definitions.find(d => d.id === mid);
                    if (!def) return null;
                    const isDerived = def.source === 'event_derived' || def.source === 'computed';

                    return (
                        <div key={mid} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <label className="block text-lg font-bold text-gray-900">{def.name}</label>
                                    <p className="text-sm text-gray-500">{def.description}</p>
                                </div>
                                <Badge color={isDerived ? 'purple' : 'blue'}>{isDerived ? 'Auto-Calculated' : 'Input Needed'}</Badge>
                            </div>

                            {isDerived ? (
                                <div className="bg-purple-50 p-4 rounded-lg flex justify-between items-center border border-purple-100">
                                    <div>
                                        <div className="text-sm text-purple-800 font-medium">System Calculation</div>
                                        <div className="text-xs text-purple-600 mt-1">Based on tracked activity. Submitting will confirm this value.</div>
                                    </div>
                                    <div className="text-2xl font-mono font-bold text-purple-900">
                                        {values[mid] ?? 0} {def.unit !== 'number' ? def.unit : ''}
                                    </div>
                                    {/* Implicit confirmation by submitting the form */}
                                </div>
                            ) : (
                                <div className="mt-2">
                                    {def.unit === 'enum' && def.options ? (
                                        <div className="flex flex-wrap gap-2">
                                            {def.options.map(opt => (
                                                <button
                                                    key={opt}
                                                    onClick={() => setValues({...values, [mid]: opt})}
                                                    className={`px-3 py-2 text-sm rounded border ${values[mid] === opt ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="number" 
                                                className={`${FORM_INPUT_CLASS} text-lg font-mono max-w-[200px]`}
                                                value={values[mid] || ''}
                                                onChange={e => setValues({...values, [mid]: Number(e.target.value)})}
                                                placeholder="0"
                                            />
                                            <span className="text-sm text-gray-500 font-medium uppercase">{def.unit}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end pt-4">
                <button 
                    onClick={handleSubmit}
                    className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                    <span>✓</span> Confirm & Submit
                </button>
            </div>
        </div>
    );
};
