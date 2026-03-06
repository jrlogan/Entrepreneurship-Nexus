
import React, { useState, useEffect } from 'react';
import { Ecosystem } from '../../domain/types';
import { AdvisorConfig, AdvisorResource } from '../../domain/advisor/types';
import { Card, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, Badge, DemoLink } from '../../shared/ui/Components';
import { useRepos } from '../../data/AppDataContext';

export const EcosystemConfigView = ({ ecosystem }: { ecosystem: Ecosystem }) => {
    const repos = useRepos();
    const [advisorConfig, setAdvisorConfig] = useState<AdvisorConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Form State for Resources
    const [newResTitle, setNewResTitle] = useState('');
    const [newResUrl, setNewResUrl] = useState('');
    const [newResNote, setNewResNote] = useState('');

    // State for Tags
    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');

    useEffect(() => {
        loadConfig();
        setTags(ecosystem.tags || []);
    }, [ecosystem.id]);

    const loadConfig = () => {
        setIsLoading(true);
        const config = repos.advisor.getConfig(ecosystem.id);
        setAdvisorConfig(config ? { ...config } : null); // Clone to avoid direct mutation
        setIsLoading(false);
    };

    const handleSaveConfig = () => {
        if (advisorConfig) {
            repos.advisor.updateConfig(ecosystem.id, advisorConfig);
            alert("AI Advisor settings updated successfully.");
        }
    };

    const toggleFeature = (field: 'enable_advisor_suggestions' | 'enable_referral_suggestions') => {
        if (!advisorConfig) return;
        setAdvisorConfig({ ...advisorConfig, [field]: !advisorConfig[field] });
    };

    const updatePrompt = (val: string) => {
        if (!advisorConfig) return;
        setAdvisorConfig({ ...advisorConfig, system_instruction_template: val });
    };

    const addResource = () => {
        if (!advisorConfig || !newResTitle || !newResUrl) return;
        const newResource: AdvisorResource = {
            id: `res_${Date.now()}`,
            title: newResTitle,
            url: newResUrl,
            note: newResNote
        };
        setAdvisorConfig({
            ...advisorConfig,
            resources: [...advisorConfig.resources, newResource]
        });
        setNewResTitle('');
        setNewResUrl('');
        setNewResNote('');
    };

    const removeResource = (id: string) => {
        if (!advisorConfig) return;
        setAdvisorConfig({
            ...advisorConfig,
            resources: advisorConfig.resources.filter(r => r.id !== id)
        });
    };

    // --- Tag Management ---
    const handleAddTag = () => {
        if (!newTag.trim()) return;
        if (!tags.includes(newTag.trim())) {
            const updatedTags = [...tags, newTag.trim()];
            setTags(updatedTags);
            repos.ecosystems.update(ecosystem.id, { tags: updatedTags });
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        const updatedTags = tags.filter(t => t !== tagToRemove);
        setTags(updatedTags);
        repos.ecosystems.update(ecosystem.id, { tags: updatedTags });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Ecosystem Configuration: {ecosystem.name}</h2>
                <button onClick={handleSaveConfig} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm font-medium">Save Changes</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card title="General Settings">
                     <div className="space-y-4">
                         <div>
                             <label className={FORM_LABEL_CLASS}>Ecosystem Name</label>
                             <input className={FORM_INPUT_CLASS} defaultValue={ecosystem.name} />
                         </div>
                         <div>
                             <label className={FORM_LABEL_CLASS}>Region / Scope</label>
                             <input className={FORM_INPUT_CLASS} defaultValue={ecosystem.region} />
                         </div>
                         <div>
                             <label className={FORM_LABEL_CLASS}>Default Privacy</label>
                             <select className={FORM_SELECT_CLASS} defaultValue={ecosystem.settings.interaction_privacy_default}>
                                 <option value="network_shared">Network Shared</option>
                                 <option value="eso_private">ESO Private</option>
                             </select>
                         </div>
                     </div>
                 </Card>
                 <Card title="Entity Tags">
                     <div className="space-y-4">
                         <p className="text-sm text-gray-500">Define standardized tags that Staff and Coaches can apply to People and Organizations.</p>
                         <div className="flex flex-wrap gap-2 mb-4">
                             {tags.map(tag => (
                                 <div key={tag} className="inline-flex items-center bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm border border-gray-200">
                                     {tag}
                                     <button onClick={() => handleRemoveTag(tag)} className="ml-2 text-gray-400 hover:text-red-500 font-bold">&times;</button>
                                 </div>
                             ))}
                             {tags.length === 0 && <span className="text-gray-400 text-sm italic">No tags defined.</span>}
                         </div>
                         <div className="flex gap-2">
                             <input 
                                className={`${FORM_INPUT_CLASS} text-sm`} 
                                placeholder="New Tag Name..." 
                                value={newTag} 
                                onChange={e => setNewTag(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                             />
                             <button onClick={handleAddTag} className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-bold text-sm">Add</button>
                         </div>
                     </div>
                 </Card>
            </div>

            {/* AI Advisor Section */}
            <Card title="AI Advisor Configuration" className="border-t-4 border-t-purple-500">
                {isLoading ? <p className="text-gray-500 p-4">Loading configuration...</p> : advisorConfig ? (
                    <div className="space-y-6">
                        {/* Toggles */}
                        <div className="flex gap-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => toggleFeature('enable_advisor_suggestions')}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${advisorConfig.enable_advisor_suggestions ? 'bg-purple-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${advisorConfig.enable_advisor_suggestions ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-sm font-medium text-gray-900">Enable Suggestions</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => toggleFeature('enable_referral_suggestions')}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${advisorConfig.enable_referral_suggestions ? 'bg-purple-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${advisorConfig.enable_referral_suggestions ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                                <span className="text-sm font-medium text-gray-900">Allow Automated Referrals</span>
                            </div>
                        </div>

                        {/* System Prompt */}
                        <div>
                            <label className={FORM_LABEL_CLASS}>System Instruction / Persona</label>
                            <p className="text-xs text-gray-500 mb-1">Define how the AI should behave and what it should prioritize for this ecosystem.</p>
                            <textarea 
                                className={`${FORM_TEXTAREA_CLASS} font-mono text-sm`} 
                                rows={5}
                                value={advisorConfig.system_instruction_template}
                                onChange={(e) => updatePrompt(e.target.value)}
                            />
                        </div>

                        {/* Key Resources */}
                        <div>
                            <label className={FORM_LABEL_CLASS}>Knowledge Base: Key Resources</label>
                            <p className="text-xs text-gray-500 mb-2">Add external links or resources the Advisor should know about and recommend.</p>
                            
                            <div className="border border-gray-200 rounded-md overflow-hidden mb-3">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Context Note</th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {advisorConfig.resources.map(res => (
                                            <tr key={res.id}>
                                                <td className="px-3 py-2 text-sm text-gray-900 font-medium">{res.title}</td>
                                                <td className="px-3 py-2 text-sm text-indigo-600 truncate max-w-[150px]">
                                                    <DemoLink href={res.url} title={res.title}>{res.url}</DemoLink>
                                                </td>
                                                <td className="px-3 py-2 text-sm text-gray-500">{res.note}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button onClick={() => removeResource(res.id)} className="text-red-600 hover:text-red-900 text-xs font-bold">Remove</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {advisorConfig.resources.length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-400 italic">No custom resources added.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Add Resource Form */}
                            <div className="bg-gray-50 p-3 rounded border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                                <div className="md:col-span-1">
                                    <input className={FORM_INPUT_CLASS} placeholder="Title" value={newResTitle} onChange={e => setNewResTitle(e.target.value)} />
                                </div>
                                <div className="md:col-span-1">
                                    <input className={FORM_INPUT_CLASS} placeholder="https://..." value={newResUrl} onChange={e => setNewResUrl(e.target.value)} />
                                </div>
                                <div className="md:col-span-1">
                                    <input className={FORM_INPUT_CLASS} placeholder="Short note for AI..." value={newResNote} onChange={e => setNewResNote(e.target.value)} />
                                </div>
                                <div>
                                    <button 
                                        onClick={addResource} 
                                        disabled={!newResTitle || !newResUrl}
                                        className="w-full px-3 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        + Add Resource
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-red-500">Failed to load configuration.</div>
                )}
            </Card>

            <Card title="Portal Quick Links (Resource Hub)">
                 <div className="space-y-2">
                     {ecosystem.portal_links?.map(link => (
                         <div key={link.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                             <div className="flex items-center gap-2">
                                 <span className="text-xl">{link.icon}</span>
                                 <div>
                                     <div className="text-sm font-bold">{link.label}</div>
                                     <div className="text-xs text-gray-500">{link.url}</div>
                                 </div>
                             </div>
                             <button className="text-xs text-indigo-600">Edit</button>
                         </div>
                     ))}
                     <button className="w-full text-center py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded hover:border-indigo-500 hover:text-indigo-600 text-sm font-bold">
                         + Add Link
                     </button>
                 </div>
            </Card>
        </div>
    );
};
