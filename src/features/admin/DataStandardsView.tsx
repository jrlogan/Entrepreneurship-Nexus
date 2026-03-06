
import React, { useState } from 'react';
import { DATA_DICTIONARY } from '../../domain/standards/dictionary';
import { ENUMS } from '../../domain/standards/enums';
import { Card, Badge, InfoBanner } from '../../shared/ui/Components';

export const DataStandardsView = () => {
    const [activeTab, setActiveTab] = useState<'schema' | 'taxonomy'>('schema');

    // Helper to find where an enum is used
    const getUsage = (enumName: string) => {
        const usage: string[] = [];
        DATA_DICTIONARY.forEach(entity => {
            entity.fields.forEach(field => {
                if (field.enumRef === enumName) {
                    usage.push(`${entity.name}.${field.name}`);
                }
            });
        });
        return usage;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Data Standards & Taxonomy</h2>
                <div className="flex bg-white rounded-md shadow-sm border border-gray-200 p-1">
                    <button
                        onClick={() => setActiveTab('schema')}
                        className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'schema' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Entity Schemas
                    </button>
                    <button
                        onClick={() => setActiveTab('taxonomy')}
                        className={`px-4 py-2 text-sm font-medium rounded ${activeTab === 'taxonomy' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Taxonomies (Dropdowns)
                    </button>
                </div>
            </div>

            <InfoBanner title="About the Ecosystem Data Standard">
                <p>This page defines the "Mental Model" of the platform. Changes here impact data collection across all portals.</p>
                <p>Use this view to facilitate discussions about <strong>what data we collect</strong> (Schema) and <strong>how we categorize it</strong> (Taxonomy).</p>
            </InfoBanner>

            {activeTab === 'schema' && (
                <div className="grid gap-8">
                    {DATA_DICTIONARY.map(entity => (
                        <div key={entity.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{entity.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1">{entity.description}</p>
                                </div>
                                <div className="text-xs font-mono bg-gray-200 text-gray-600 px-2 py-1 rounded">ID: {entity.id}</div>
                            </div>
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-64">Field Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-40">Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Description & Logic</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {entity.fields.map(field => (
                                        <tr key={field.name} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-mono text-indigo-600">
                                                {field.name}
                                                {field.required ? (
                                                    <span className="ml-2 text-red-500 font-bold" title="Required Field">*</span>
                                                ) : (
                                                    <span className="ml-2 text-gray-400 text-[10px] uppercase tracking-wide font-sans bg-gray-50 px-1 rounded border">Optional</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {field.enumRef ? (
                                                    <Badge color="purple">{field.enumRef}</Badge>
                                                ) : (
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium border border-gray-200">{field.type}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-700 leading-relaxed">
                                                {field.description}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'taxonomy' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(ENUMS).map(([key, options]) => (
                        <Card key={key} title={key} className="h-full flex flex-col">
                            <div className="mb-4">
                                <span className="text-xs font-bold text-gray-400 uppercase">Used In:</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {getUsage(key).map(u => <span key={u} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 font-mono">{u}</span>)}
                                </div>
                            </div>
                            <div className="border border-gray-100 rounded-md overflow-hidden flex-1">
                                <table className="min-w-full">
                                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-4 py-2 text-left w-1/3">ID</th>
                                            <th className="px-4 py-2 text-left">Label</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {options.map((opt: any) => (
                                            <tr key={opt.id}>
                                                <td className="px-4 py-2 text-xs font-mono text-gray-500 bg-gray-50/50">{opt.id}</td>
                                                <td className="px-4 py-2 text-sm font-medium text-gray-900">{opt.label}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
