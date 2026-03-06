
import React, { useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { MetricDefinition, MetricSetDefinition, MetricScope, MetricAssignment } from '../../domain/metrics/reporting_types';
import { Card, Badge, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS, Modal } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';

export const MetricsManagerView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState<'sets' | 'assignments'>('sets');
    const [refresh, setRefresh] = useState(0);

    const metricSets = repos.flexibleMetrics.getMetricSets();
    const assignments = repos.flexibleMetrics.listAssignments(viewer);
    const definitions = repos.flexibleMetrics.getDefinitions();
    const organizations = repos.organizations.getAll(viewer, viewer.ecosystemId);

    // --- Create Set Modal State ---
    const [isCreateSetOpen, setIsCreateSetOpen] = useState(false);
    const [newSetName, setNewSetName] = useState('');
    const [newSetPeriod, setNewSetPeriod] = useState<string>('quarterly');
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

    // --- Create Assignment Modal State ---
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [assignSetId, setAssignSetId] = useState('');
    const [assignScopeType, setAssignScopeType] = useState<MetricScope>('organization');
    const [assignScopeId, setAssignScopeId] = useState('');
    const [assignDue, setAssignDue] = useState('');
    
    // Handlers
    const handleCreateSet = () => {
        if (!newSetName || selectedMetrics.length === 0) {
            alert("Name and at least one metric required.");
            return;
        }
        
        const newSet: MetricSetDefinition = {
            id: `set_custom_${Date.now()}`,
            name: newSetName,
            description: 'Custom metric set created by admin.',
            metric_ids: selectedMetrics,
            recommended_period: newSetPeriod as any,
            trigger_context: 'manual_admin'
        };
        
        repos.flexibleMetrics.createMetricSet(newSet);
        setIsCreateSetOpen(false);
        setNewSetName('');
        setSelectedMetrics([]);
        setRefresh(r => r + 1);
    };

    const handleCreateAssignment = () => {
        if (!assignSetId || !assignScopeId || !assignDue) {
            alert("Please fill all required fields.");
            return;
        }

        const set = metricSets.find(s => s.id === assignSetId);
        
        // Calculate default period based on recommended_period
        const now = new Date();
        let pStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]; // Jan 1 default
        let pEnd = assignDue; 

        if (set?.recommended_period === 'quarterly') {
            // Very rough approx for demo
            pStart = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
        }

        const assignment: MetricAssignment = {
            id: `assign_${Date.now()}`,
            metric_set_id: assignSetId,
            ecosystem_id: viewer.ecosystemId,
            scope_type: assignScopeType,
            scope_id: assignScopeId,
            assigned_by_id: viewer.personId,
            assigned_at: new Date().toISOString(),
            status: 'pending',
            due_date: assignDue,
            period_start: pStart,
            period_end: pEnd,
            as_of_date: pEnd // Default snapshot date to due date
        };

        repos.flexibleMetrics.createAssignment(assignment);
        setIsAssignOpen(false);
        setAssignScopeId('');
        setRefresh(r => r + 1);
    };

    const toggleMetric = (id: string) => {
        if (selectedMetrics.includes(id)) {
            setSelectedMetrics(selectedMetrics.filter(m => m !== id));
        } else {
            setSelectedMetrics([...selectedMetrics, id]);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Metrics Manager</h2>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setActiveTab('sets')}
                        className={`px-4 py-2 rounded text-sm font-bold ${activeTab === 'sets' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 border'}`}
                    >
                        Metric Sets
                    </button>
                    <button 
                        onClick={() => setActiveTab('assignments')}
                        className={`px-4 py-2 rounded text-sm font-bold ${activeTab === 'assignments' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 border'}`}
                    >
                        Assignments
                    </button>
                </div>
            </div>

            {activeTab === 'sets' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <button onClick={() => setIsCreateSetOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700">
                            + New Metric Set
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {metricSets.map(set => (
                            <Card key={set.id} title={set.name}>
                                <p className="text-sm text-gray-600 mb-4 h-10">{set.description}</p>
                                <div className="space-y-2">
                                    <div className="text-xs font-bold text-gray-500 uppercase">Metrics Included ({set.metric_ids.length})</div>
                                    <div className="flex flex-wrap gap-1">
                                        {set.metric_ids.slice(0, 3).map(mid => (
                                            <Badge key={mid} color="blue">{mid}</Badge>
                                        ))}
                                        {set.metric_ids.length > 3 && <span className="text-xs text-gray-400">+{set.metric_ids.length - 3} more</span>}
                                    </div>
                                    <div className="pt-3 flex justify-between items-center text-xs text-gray-500">
                                        <span>Freq: {set.recommended_period || 'Ad-hoc'}</span>
                                        <button onClick={() => { setAssignSetId(set.id); setActiveTab('assignments'); setIsAssignOpen(true); }} className="text-indigo-600 hover:underline">Assign This &rarr;</button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'assignments' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <button onClick={() => setIsAssignOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700">
                            + Create Assignment
                        </button>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Set Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Target Entity</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Due Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {assignments.map(assign => {
                                    const setName = metricSets.find(s => s.id === assign.metric_set_id)?.name || assign.metric_set_id;
                                    const entityName = organizations.find(o => o.id === assign.scope_id)?.name || assign.scope_id;
                                    return (
                                        <tr key={assign.id}>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{setName}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{entityName}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{assign.due_date}</td>
                                            <td className="px-6 py-4">
                                                <Badge color={assign.status === 'completed' ? 'green' : assign.status === 'overdue' ? 'red' : 'yellow'}>
                                                    {assign.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {assignments.length === 0 && (
                                    <tr><td colSpan={4} className="p-8 text-center text-gray-500 italic">No assignments active.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Set Modal */}
            <Modal isOpen={isCreateSetOpen} onClose={() => setIsCreateSetOpen(false)} title="Define Metric Set">
                <div className="space-y-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Set Name</label>
                        <input className={FORM_INPUT_CLASS} value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="e.g. Annual Impact Survey" />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Recommended Frequency</label>
                        <select className={FORM_SELECT_CLASS} value={newSetPeriod} onChange={e => setNewSetPeriod(e.target.value)}>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="annual">Annual</option>
                            <option value="ad_hoc">Ad-Hoc / One-off</option>
                        </select>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Select Metrics</label>
                        <div className="border border-gray-200 rounded max-h-60 overflow-y-auto p-2 space-y-1">
                            {definitions.map(def => (
                                <div key={def.id} className="flex items-start gap-2 p-1 hover:bg-gray-50 rounded">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedMetrics.includes(def.id)} 
                                        onChange={() => toggleMetric(def.id)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">{def.name}</div>
                                        <div className="text-xs text-gray-500">{def.kind} • {def.unit} • {def.source}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <button onClick={handleCreateSet} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700">Save Set</button>
                    </div>
                </div>
            </Modal>

            {/* Assign Modal */}
            <Modal isOpen={isAssignOpen} onClose={() => setIsAssignOpen(false)} title="Assign Collection Task">
                <div className="space-y-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Metric Set</label>
                        <select className={FORM_SELECT_CLASS} value={assignSetId} onChange={e => setAssignSetId(e.target.value)}>
                            <option value="">-- Select Set --</option>
                            {metricSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Target Scope</label>
                        <select className={FORM_SELECT_CLASS} value={assignScopeType} onChange={e => setAssignScopeType(e.target.value as MetricScope)}>
                            <option value="organization">Organization</option>
                            <option value="person">Person (Not available for aggregate sets)</option>
                        </select>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Target Entity</label>
                        <SearchableSelect 
                            options={organizations.map(o => ({ id: o.id, label: o.name }))} 
                            value={assignScopeId}
                            onChange={setAssignScopeId}
                            placeholder="Select Organization..."
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Due Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={assignDue} onChange={e => setAssignDue(e.target.value)} />
                    </div>
                    <div className="flex justify-end pt-2">
                        <button onClick={handleCreateAssignment} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm hover:bg-indigo-700">Assign Task</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
