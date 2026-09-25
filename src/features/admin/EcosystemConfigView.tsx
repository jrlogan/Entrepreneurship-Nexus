
import React, { useState, useEffect } from 'react';
import { Ecosystem } from '../../domain/types';
import { Card, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, Badge, DemoLink, Modal } from '../../shared/ui/Components';
import { useRepos } from '../../data/AppDataContext';
import { PortalLink } from '../../domain/ecosystems/types';
import { getDocument, setDocument } from '../../services/firestoreClient';
import { isFirebaseEnabled } from '../../services/firebaseApp';

interface Props {
    ecosystem: Ecosystem;
    allEcosystems: Ecosystem[];
    viewerRole: string;
}

export const EcosystemConfigView = ({ ecosystem, allEcosystems, viewerRole }: Props) => {
    const repos = useRepos();
    const isPlatformAdmin = viewerRole === 'platform_admin';

    // --- Ecosystem selector (platform_admin can configure any ecosystem) ---
    const [activeEcoId, setActiveEcoId] = useState(ecosystem.id);
    const activeEco = allEcosystems.find(e => e.id === activeEcoId) || ecosystem;

    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // --- General settings (controlled) ---
    const [ecoName, setEcoName] = useState(activeEco.name);
    const [ecoRegion, setEcoRegion] = useState(activeEco.region);
    const [ecoPrivacy, setEcoPrivacy] = useState<'network_shared' | 'eso_private'>(
        activeEco.settings.interaction_privacy_default
    );

    // --- Tags ---
    const [tags, setTags] = useState<string[]>(activeEco.tags || []);
    const [newTag, setNewTag] = useState('');

    // --- Portal Links ---
    const [portalLinks, setPortalLinks] = useState<PortalLink[]>(activeEco.portal_links || []);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [editingLink, setEditingLink] = useState<PortalLink | null>(null);
    const [linkFormData, setLinkFormData] = useState<Omit<PortalLink, 'id'>>({
        label: '', url: '', icon: '🔗', description: '', audience: 'all',
    });

    // --- Feature flags ---
    const [featureFlags, setFeatureFlags] = useState({
        dashboard: activeEco.settings.feature_flags?.dashboard ?? true,
        interactions: activeEco.settings.feature_flags?.interactions ?? true,
        reports: activeEco.settings.feature_flags?.reports ?? true,
        api_console: activeEco.settings.feature_flags?.api_console ?? true,
        data_standards: activeEco.settings.feature_flags?.data_standards ?? true,
        data_quality: activeEco.settings.feature_flags?.data_quality ?? false,
        inbound_intake: activeEco.settings.feature_flags?.inbound_intake ?? false,
        notify_entrepreneurs: activeEco.settings.feature_flags?.notify_entrepreneurs ?? false,
    });

    // --- Add Ecosystem modal ---
    const [isAddEcoModalOpen, setIsAddEcoModalOpen] = useState(false);
    const [newEcoName, setNewEcoName] = useState('');
    const [newEcoRegion, setNewEcoRegion] = useState('');
    const [isCreatingEco, setIsCreatingEco] = useState(false);

    // Reset all state when the active ecosystem changes
    useEffect(() => {
        setEcoName(activeEco.name);
        setEcoRegion(activeEco.region);
        setEcoPrivacy(activeEco.settings.interaction_privacy_default);
        setTags(activeEco.tags || []);
        setPortalLinks(activeEco.portal_links || []);
        setFeatureFlags({
            dashboard: activeEco.settings.feature_flags?.dashboard ?? true,
            interactions: activeEco.settings.feature_flags?.interactions ?? true,
            reports: activeEco.settings.feature_flags?.reports ?? true,
            api_console: activeEco.settings.feature_flags?.api_console ?? true,
            data_standards: activeEco.settings.feature_flags?.data_standards ?? true,
            data_quality: activeEco.settings.feature_flags?.data_quality ?? false,
            inbound_intake: activeEco.settings.feature_flags?.inbound_intake ?? false,
            notify_entrepreneurs: activeEco.settings.feature_flags?.notify_entrepreneurs ?? false,
        });

        // Overlay with saved data — localStorage first (instant, all envs), then Firestore if available
        const applyOverlay = (saved: Partial<Ecosystem>) => {
            if (saved.portal_links) setPortalLinks(saved.portal_links);
            if (saved.name) setEcoName(saved.name);
            if (saved.region) setEcoRegion(saved.region);
            if (saved.settings?.interaction_privacy_default) setEcoPrivacy(saved.settings.interaction_privacy_default);
            if (saved.tags) setTags(saved.tags);
            if (saved.settings?.feature_flags) {
                setFeatureFlags(prev => ({ ...prev, ...saved.settings!.feature_flags }));
            }
        };
        try {
            const raw = localStorage.getItem(`eco_override_${activeEcoId}`);
            if (raw) applyOverlay(JSON.parse(raw));
        } catch {}
        if (isFirebaseEnabled()) {
            getDocument<Partial<Ecosystem>>('ecosystems', activeEcoId).then(saved => {
                if (saved) applyOverlay(saved);
            }).catch((error) => {
                console.error('Failed to load saved ecosystem settings', error);
            });
        }
    }, [activeEcoId]);

    useEffect(() => {
        if (!saveMessage && !saveError) return;
        const id = window.setTimeout(() => { setSaveMessage(null); setSaveError(null); }, 3500);
        return () => window.clearTimeout(id);
    }, [saveMessage, saveError]);

    // --- Save all settings ---
    const handleSaveAll = async () => {
        // Save in-memory (repo)
        repos.ecosystems.update(activeEcoId, {
            name: ecoName,
            region: ecoRegion,
            portal_links: portalLinks,
            tags,
            settings: { ...activeEco.settings, interaction_privacy_default: ecoPrivacy, feature_flags: featureFlags },
        });

        const payload = {
            id: activeEcoId,
            name: ecoName,
            region: ecoRegion,
            portal_links: portalLinks,
            tags,
            settings: { ...activeEco.settings, interaction_privacy_default: ecoPrivacy, feature_flags: featureFlags },
        };
        // localStorage keeps settings across reloads in demo mode (and as a
        // fast local overlay elsewhere).
        localStorage.setItem(`eco_override_${activeEcoId}`, JSON.stringify(payload));

        // Persist to Firestore whenever we're Firebase-backed. This previously
        // skipped emulator mode, which meant local/e2e runs read ecosystem
        // config from a different source than production.
        if (isFirebaseEnabled()) {
            try {
                await setDocument('ecosystems', activeEcoId, payload, true);
            } catch (error) {
                console.error('Failed to persist ecosystem settings', error);
                setSaveError('Saved locally, but could not persist to the server.');
                return;
            }
        }
        setSaveMessage('Ecosystem settings saved. Reload the page to see nav changes.');
    };

    // --- Tags ---
    const handleAddTag = () => {
        if (!newTag.trim() || tags.includes(newTag.trim())) return;
        setTags(prev => [...prev, newTag.trim()]);
        setNewTag('');
    };

    // --- Portal Links ---
    const handleAddLink = () => {
        setEditingLink(null);
        setLinkFormData({ label: '', url: '', icon: '🔗', description: '', audience: 'all' });
        setIsLinkModalOpen(true);
    };

    const handleEditLink = (link: PortalLink) => {
        setEditingLink(link);
        setLinkFormData({ label: link.label, url: link.url, icon: link.icon || '🔗', description: link.description || '', audience: link.audience || 'all' });
        setIsLinkModalOpen(true);
    };

    const handleSaveLink = () => {
        const updatedLinks = editingLink
            ? portalLinks.map(l => l.id === editingLink.id ? { ...linkFormData, id: l.id } : l)
            : [...portalLinks, { ...linkFormData, id: `link_${Date.now()}` }];
        setPortalLinks(updatedLinks);
        setIsLinkModalOpen(false);
    };

    const handleRemoveLink = (id: string) => {
        setPortalLinks(prev => prev.filter(l => l.id !== id));
    };

    // --- Feature flags ---
    const toggleWorkspaceFeature = (field: keyof typeof featureFlags) => {
        setFeatureFlags(prev => ({ ...prev, [field]: !prev[field] }));
    };

    // --- Add Ecosystem ---
    const handleCreateEcosystem = async () => {
        if (!newEcoName.trim()) return;
        setIsCreatingEco(true);
        const id = `eco_${newEcoName.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        const newEco: Ecosystem = {
            id,
            name: newEcoName.trim(),
            region: newEcoRegion.trim(),
            settings: { interaction_privacy_default: 'network_shared' },
        };
        try {
            await setDocument('ecosystems', id, newEco, false);
            repos.ecosystems.update(id, newEco); // Add to in-memory list
            // Push to allEcosystems so the selector sees it immediately
            allEcosystems.push(newEco);
            setActiveEcoId(id);
            setIsAddEcoModalOpen(false);
            setNewEcoName('');
            setNewEcoRegion('');
        } catch (err: any) {
            setSaveError(err?.message || 'Could not create ecosystem.');
        } finally {
            setIsCreatingEco(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-800">Ecosystem Config</h2>
                    {isPlatformAdmin ? (
                        <select
                            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white shadow-sm"
                            value={activeEcoId}
                            onChange={e => setActiveEcoId(e.target.value)}
                        >
                            {allEcosystems.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                        </select>
                    ) : (
                        <span className="text-lg text-gray-500">{activeEco.name}</span>
                    )}
                    {isPlatformAdmin && (
                        <button
                            onClick={() => setIsAddEcoModalOpen(true)}
                            className="rounded border border-dashed border-indigo-400 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                        >
                            + New Ecosystem
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {saveMessage && (
                        <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                            {saveMessage}
                        </span>
                    )}
                    {saveError && (
                        <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                            {saveError}
                        </span>
                    )}
                    <button onClick={handleSaveAll} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm font-medium">
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="General Settings">
                    <div className="space-y-4">
                        <div>
                            <label className={FORM_LABEL_CLASS}>Ecosystem Name</label>
                            <input className={FORM_INPUT_CLASS} value={ecoName} onChange={e => setEcoName(e.target.value)} />
                        </div>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Region / Scope</label>
                            <input className={FORM_INPUT_CLASS} value={ecoRegion} onChange={e => setEcoRegion(e.target.value)} />
                        </div>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Default Privacy</label>
                            <select className={FORM_SELECT_CLASS} value={ecoPrivacy} onChange={e => setEcoPrivacy(e.target.value as any)}>
                                <option value="network_shared">Network Shared</option>
                                <option value="eso_private">ESO Private</option>
                            </select>
                        </div>
                    </div>
                </Card>
                <Card title="Entity Tags">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500">Standardized tags that staff can apply to people and organizations.</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {tags.map(tag => (
                                <div key={tag} className="inline-flex items-center bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm border border-gray-200">
                                    {tag}
                                    <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="ml-2 text-gray-400 hover:text-red-500 font-bold">&times;</button>
                                </div>
                            ))}
                            {tags.length === 0 && <span className="text-gray-400 text-sm italic">No tags defined.</span>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className={`${FORM_INPUT_CLASS} text-sm`}
                                placeholder="New tag..."
                                value={newTag}
                                onChange={e => setNewTag(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                            />
                            <button onClick={handleAddTag} className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-bold text-sm">Add</button>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Portal Links */}
            <Card title="Portal Quick Links (Resource Hub)">
                <div className="space-y-2">
                    {portalLinks.map(link => (
                        <div key={link.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{link.icon}</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-bold text-gray-900">{link.label}</div>
                                        <Badge color={link.audience === 'all' ? 'blue' : link.audience === 'entrepreneur' ? 'green' : 'purple'}>
                                            {link.audience}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-xs">{link.url}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEditLink(link)} className="text-xs font-medium text-indigo-600 hover:text-indigo-900">Edit</button>
                                <button onClick={() => handleRemoveLink(link.id)} className="text-xs font-medium text-red-600 hover:text-red-900">Remove</button>
                            </div>
                        </div>
                    ))}
                    {portalLinks.length === 0 && (
                        <div className="py-4 text-center text-sm text-gray-400 italic bg-gray-50 rounded border border-dashed border-gray-200">
                            No portal links configured.
                        </div>
                    )}
                    <button onClick={handleAddLink} className="w-full text-center py-3 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-indigo-500 hover:text-indigo-600 text-sm font-bold transition-colors">
                        + Add Link
                    </button>
                </div>
            </Card>

            {/* Workspace Features */}
            <Card title="Workspace Features">
                <div className="divide-y divide-gray-100">
                    {([
                        { key: 'dashboard', label: 'Dashboard', description: 'Staff landing page: referrals waiting, recent partner activity.' },
                        { key: 'interactions', label: 'Activity', description: 'Log meetings and support, and see the facts partners share about people you both work with.' },
                        { key: 'reports', label: 'Reports', description: 'Referral follow-through and anonymous network statistics.' },
                        { key: 'api_console', label: 'API Keys & Webhooks', description: 'Let ESO admins issue their organization API keys and register webhooks.' },
                        { key: 'data_standards', label: 'Data Standards', description: 'Let staff read the shared field standard and vocabularies they map onto.' },
                        { key: 'data_quality', label: 'Data Quality for ESO admins', description: 'Let ESO admins review duplicate records. Network operators always can.' },
                        { key: 'inbound_intake', label: 'Inbound Intake for ecosystem managers', description: 'Review inbound referral emails (BCC intake).' },
                        { key: 'notify_entrepreneurs', label: 'Notify Entrepreneurs', description: 'Email entrepreneurs about referral decisions.' },
                    ] as Array<{ key: keyof typeof featureFlags, label: string, description: string }>).map(({ key, label, description }) => (
                        <div key={key} className="flex items-center justify-between py-3">
                            <div>
                                <div className="text-sm font-medium text-gray-800">{label}</div>
                                <div className="text-xs text-gray-500">{description}</div>
                            </div>
                            <button
                                onClick={() => toggleWorkspaceFeature(key)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${featureFlags[key] ? 'bg-indigo-600' : 'bg-gray-200'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${featureFlags[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Portal Link Modal */}
            <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title={editingLink ? 'Edit Portal Link' : 'Add Portal Link'}>
                <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1">
                            <label className={FORM_LABEL_CLASS}>Icon</label>
                            <input className={FORM_INPUT_CLASS} value={linkFormData.icon} onChange={e => setLinkFormData({ ...linkFormData, icon: e.target.value })} placeholder="Emoji" />
                        </div>
                        <div className="col-span-3">
                            <label className={FORM_LABEL_CLASS}>Label</label>
                            <input className={FORM_INPUT_CLASS} value={linkFormData.label} onChange={e => setLinkFormData({ ...linkFormData, label: e.target.value })} placeholder="Link Title" />
                        </div>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>URL</label>
                        <input className={FORM_INPUT_CLASS} value={linkFormData.url} onChange={e => setLinkFormData({ ...linkFormData, url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Description (Optional)</label>
                        <input className={FORM_INPUT_CLASS} value={linkFormData.description} onChange={e => setLinkFormData({ ...linkFormData, description: e.target.value })} placeholder="Short description..." />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Target Audience</label>
                        <select className={FORM_SELECT_CLASS} value={linkFormData.audience} onChange={e => setLinkFormData({ ...linkFormData, audience: e.target.value as any })}>
                            <option value="all">Everyone</option>
                            <option value="entrepreneur">Entrepreneurs Only</option>
                            <option value="eso">ESO Staff Only</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setIsLinkModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button onClick={handleSaveLink} disabled={!linkFormData.label || !linkFormData.url} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {editingLink ? 'Update Link' : 'Add Link'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Add Ecosystem Modal */}
            <Modal isOpen={isAddEcoModalOpen} onClose={() => setIsAddEcoModalOpen(false)} title="Create New Ecosystem">
                <div className="space-y-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Ecosystem Name</label>
                        <input className={FORM_INPUT_CLASS} value={newEcoName} onChange={e => setNewEcoName(e.target.value)} placeholder="e.g. Greater Bridgeport" />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Region / Scope</label>
                        <input className={FORM_INPUT_CLASS} value={newEcoRegion} onChange={e => setNewEcoRegion(e.target.value)} placeholder="e.g. Bridgeport, CT" />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setIsAddEcoModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button onClick={handleCreateEcosystem} disabled={!newEcoName.trim() || isCreatingEco} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {isCreatingEco ? 'Creating...' : 'Create Ecosystem'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
