
import React, { useEffect, useState } from 'react';
import { SotsService, SotsBusiness } from '../../services/sotsService';
import { Card, Badge, InfoBanner } from '../../shared/ui/Components';
import { Organization } from '../../domain/types';

export const VentureScoutView = ({ onImport }: { onImport?: (org: Organization) => void }) => {
    const [recentBusinesses, setRecentBusinesses] = useState<SotsBusiness[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await SotsService.getRecentRegistrations(30);
            setRecentBusinesses(data);
        } catch (err) {
            setError('Failed to load recent registrations from data.ct.gov');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">New Venture Scout</h2>
                </div>
                <button 
                    onClick={loadData}
                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded hover:bg-gray-50"
                >
                    ↻ Refresh Data
                </button>
            </div>

            <InfoBanner title="About Venture Scout">
                <p>Proactively identify new entrepreneurs before they even ask for help. This tool monitors external data sources (like the <strong>Secretary of State Business Registry</strong>) to detect new business formations in real-time.</p>
                <p>ESOs use this list to reach out to founders early in their journey ("We noticed you just registered 'Shoreline Robotics'—need help with a business plan?").</p>
            </InfoBanner>

            {loading ? (
                <div className="p-12 text-center text-gray-500">
                    <span className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 mb-4"></span>
                    <p>Scouting state registry for new startups...</p>
                </div>
            ) : error ? (
                <div className="p-6 bg-red-50 text-red-700 border border-red-200 rounded-lg">
                    {error}
                </div>
            ) : recentBusinesses.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded border border-dashed border-gray-300">
                    <p className="text-gray-500">No new active registrations found in the last 30 days.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {recentBusinesses.map(biz => (
                        <div key={biz.business_alei} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-indigo-300 transition-colors">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-gray-900 text-lg">{biz.business_name}</h3>
                                        <Badge color="green">New</Badge>
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        Registered: {new Date(biz.date_of_registration).toLocaleDateString()} • {biz.business_type}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                                        <span className="text-gray-400">📍</span> 
                                        {biz.business_address || biz.principal_business_address_city || 'Address Not Listed'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-mono text-gray-400 mb-2">ID: {biz.business_alei}</div>
                                    <button className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded hover:bg-indigo-100 border border-indigo-100">
                                        + Add to Pipeline
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            <div className="bg-blue-50 p-4 rounded-lg text-xs text-blue-800 border border-blue-100 flex gap-2">
                <span>ℹ️</span>
                <div>
                    <strong>Data Latency Note:</strong> The state portal is updated nightly. 
                    If an entrepreneur registers their business today at 10:00 AM, they likely won't appear here until tomorrow morning.
                </div>
            </div>
        </div>
    );
};
