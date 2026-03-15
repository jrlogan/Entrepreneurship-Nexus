
import React, { useState, useEffect } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { MetricScope, ReportResult } from '../../domain/metrics/reporting_types';
import { Card, Badge, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_INPUT_CLASS } from '../../shared/ui/Components';
import type { Organization } from '../../domain/organizations/types';

export const MetricsPreviewView = () => {
    const repos = useRepos();
    const viewer = useViewer();

    // Configuration Data
    const metricSets = repos.flexibleMetrics.getMetricSets();
    const [organizations, setOrganizations] = useState<Organization[]>([]);

    // Form State
    const [selectedSetId, setSelectedSetId] = useState(metricSets[0]?.id || '');
    const [scopeType, setScopeType] = useState<MetricScope>('organization');
    const [scopeId, setScopeId] = useState<string>('');
    
    // Date State (Defaults)
    const [dates, setDates] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1 current year
        end: new Date().toISOString().split('T')[0], // Today
        asOf: new Date().toISOString().split('T')[0] // Today
    });

    // Result State
    const [report, setReport] = useState<ReportResult | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadOrganizations = async () => {
            const nextOrganizations = await repos.organizations.getAll(viewer, viewer.ecosystemId);
            if (!cancelled) {
                setOrganizations(nextOrganizations);
            }
        };

        void loadOrganizations();
        return () => {
            cancelled = true;
        };
    }, [repos, viewer]);

    // Smart default for scopeId
    useEffect(() => {
        if (scopeType === 'organization' && organizations.length > 0 && !scopeId) {
            setScopeId(organizations[0].id);
        } else if (scopeType === 'ecosystem') {
            setScopeId(''); // Ecosystem scope usually implies global aggregation
        }
    }, [scopeType, organizations]);

    const handleRunReport = () => {
        if (!selectedSetId) return;

        try {
            const result = repos.flexibleMetrics.getReport(selectedSetId, {
                ecosystem_id: viewer.ecosystemId,
                scope_type: scopeType,
                scope_id: scopeId || undefined,
                period_start: dates.start,
                period_end: dates.end,
                as_of: dates.asOf
            });
            setReport(result);
        } catch (e) {
            console.error(e);
            alert("Failed to run report. Check console.");
        }
    };

    return (
        <div className="space-y-6">
            {/* COMMITTEE EXPLAINER PANEL */}
            <div className="bg-slate-900 text-slate-100 p-6 rounded-lg shadow-md border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4">Architecture Explainer: The Flexible Metrics Model</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm leading-relaxed">
                    <div>
                        <h4 className="font-bold text-indigo-400 mb-2 uppercase text-xs">Core Concepts</h4>
                        <ul className="list-disc list-outside ml-4 space-y-2 text-slate-300">
                            <li><strong>Metric Definitions:</strong> Metadata defining <em>what</em> we measure (e.g., 'Full Time Jobs', 'Interactions'). Configured centrally, not hardcoded in columns.</li>
                            <li><strong>Metric Sets:</strong> Groupings of metrics for specific contexts (e.g., 'Annual Survey', 'Quarterly Check-in'). Allows tailored collection forms.</li>
                            <li><strong>Observations:</strong> The atomic data point. Stores <code>value</code>, <code>timestamp</code>, and <code>scope_id</code>. Can be a point-in-time (Snapshot) or cover a duration (Interval).</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-green-400 mb-2 uppercase text-xs">Data Flow & Integrity</h4>
                        <ul className="list-disc list-outside ml-4 space-y-2 text-slate-300">
                            <li><strong>Hybrid Collection:</strong> Logic seamlessly blends <strong>Auto-Derived</strong> stats (from activity logs) with <strong>Manual</strong> inputs.</li>
                            <li><strong>Confirmation Loop:</strong> Derived metrics can be presented to users for "Confirmation", saving a frozen snapshot that overrides live calculations for historical accuracy.</li>
                            <li><strong>API-First Readiness:</strong> The <code>FlexibleMetricsRepo</code> mimics a query engine (e.g., GraphQL/SQL), accepting time-ranges and scopes, readying the frontend for a real backend switch.</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <Card title="Report Configuration">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={FORM_LABEL_CLASS}>Metric Set (Bundle)</label>
                            <select 
                                className={FORM_SELECT_CLASS} 
                                value={selectedSetId} 
                                onChange={e => setSelectedSetId(e.target.value)}
                            >
                                {metricSets.map(set => (
                                    <option key={set.id} value={set.id}>{set.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {metricSets.find(s => s.id === selectedSetId)?.description}
                            </p>
                        </div>

                        <div>
                            <label className={FORM_LABEL_CLASS}>Scope Type</label>
                            <select 
                                className={FORM_SELECT_CLASS} 
                                value={scopeType} 
                                onChange={e => setScopeType(e.target.value as MetricScope)}
                            >
                                <option value="organization">Organization</option>
                                <option value="person">Person</option>
                                <option value="initiative">Initiative</option>
                                <option value="ecosystem">Ecosystem (Global)</option>
                            </select>
                        </div>

                        <div>
                            <label className={FORM_LABEL_CLASS}>Target Entity</label>
                            {scopeType === 'organization' ? (
                                <select 
                                    className={FORM_SELECT_CLASS}
                                    value={scopeId}
                                    onChange={e => setScopeId(e.target.value)}
                                >
                                    <option value="">-- Select Organization --</option>
                                    {organizations.map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <input 
                                    className={FORM_INPUT_CLASS} 
                                    value={scopeId} 
                                    onChange={e => setScopeId(e.target.value)}
                                    placeholder={scopeType === 'ecosystem' ? 'Global (Leave Empty)' : 'Entity ID...'}
                                    disabled={scopeType === 'ecosystem'}
                                />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                        <div>
                            <label className={FORM_LABEL_CLASS}>Period Start</label>
                            <input type="date" className={FORM_INPUT_CLASS} value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} />
                            <span className="text-[10px] text-gray-400">For Interval Metrics</span>
                        </div>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Period End</label>
                            <input type="date" className={FORM_INPUT_CLASS} value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} />
                            <span className="text-[10px] text-gray-400">For Interval Metrics</span>
                        </div>
                        <div>
                            <label className={FORM_LABEL_CLASS}>As Of Date</label>
                            <input type="date" className={FORM_INPUT_CLASS} value={dates.asOf} onChange={e => setDates({...dates, asOf: e.target.value})} />
                            <span className="text-[10px] text-gray-400">For Snapshot Metrics</span>
                        </div>
                        <div className="flex items-end">
                            <button 
                                onClick={handleRunReport}
                                className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-md font-bold"
                            >
                                Run Report
                            </button>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Results Table */}
            {report && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800">Results: {metricSets.find(s => s.id === report.metric_set_id)?.name}</h3>
                        <div className="text-xs text-gray-500">
                            Generated for: <span className="font-mono font-bold text-gray-700">{report.scope_id || 'Ecosystem Wide'}</span>
                        </div>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kind</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Obs. Count</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {report.results.map((res, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{res.metric.name}</div>
                                        <div className="text-xs text-gray-500">{res.metric.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Badge color={res.metric.kind === 'snapshot' ? 'purple' : 'blue'}>
                                            {res.metric.kind}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {res.status === 'auto' && <Badge color="purple">Auto</Badge>}
                                        {res.status === 'confirmed' && <Badge color="green">Confirmed</Badge>}
                                        {res.status === 'reported' && <Badge color="gray">Reported</Badge>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="text-lg font-mono font-bold text-gray-900">
                                            {String(res.value)}
                                        </span>
                                        <span className="ml-1 text-xs text-gray-500">{res.metric.unit}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {res.observation_count ?? '-'}
                                    </td>
                                </tr>
                            ))}
                            {report.results.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">
                                        No metrics found for this configuration.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
