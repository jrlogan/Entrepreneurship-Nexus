
import React, { useState, useEffect, useMemo } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, CodeBlock, DemoLink, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { ApiKey, Webhook } from '../../domain/types';
import { detectDuplicates } from '../../domain/logic';

const WEBHOOK_EVENTS = [
    'organization.created',
    'organization.updated',
    'referral.received',
    'referral.updated',
    'interaction.logged',
    'initiative.created'
];

const API_ENDPOINTS = [
    { method: 'GET', path: '/api/v1/organizations', desc: 'List all visible orgs' },
    { method: 'POST', path: '/api/v1/organizations/resolve', desc: 'Match/Dedupe org' },
    { method: 'POST', path: '/api/v1/organizations', desc: 'Create/Sync org' },
    { method: 'GET', path: '/api/v1/people', desc: 'List ecosystem people' },
    { method: 'POST', path: '/api/v1/people', desc: 'Add/Sync person' },
    { method: 'GET', path: '/api/v1/interactions', desc: 'Fetch history' },
    { method: 'POST', path: '/api/v1/interactions', desc: 'Log interaction' },
    { method: 'GET', path: '/api/v1/initiatives', desc: 'Active projects' },
    { method: 'GET', path: '/api/v1/referrals', desc: 'Incoming/Outgoing refs' },
    { method: 'POST', path: '/api/v1/referrals', desc: 'Create referral' },
    { method: 'GET', path: '/api/v1/metrics', desc: 'Impact stats' }
];

const SCHEMAS = {
    organization: `{
  "id": "string (uuid)",
  "name": "string",
  "version": "integer",
  "description": "string",
  "url": "string (uri)",
  "tax_status": "non_profit" | "for_profit",
  "external_refs": [
    { "source": "salesforce", "id": "001..." }
  ],
  "roles": ["eso", "workspace"],
  "classification": {
    "naics_code": "541511",
    "industry_tags": ["Tech", "SaaS"]
  }
}`,
    person: `{
  "id": "string (uuid)",
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "organization_id": "string (uuid)",
  "system_role": "entrepreneur" | "eso_staff",
  "tags": ["Mentor", "Alumni"]
}`,
    interaction: `{
  "organization_id": "string (uuid)",
  "date": "2023-11-25",
  "type": "meeting" | "call" | "email",
  "notes": "Discussed Series A funding strategy.",
  "visibility": "network_shared" | "eso_private",
  "attendees": ["Sarah Connor"]
}`,
    referral: `{
  "referring_org_id": "string (uuid)",
  "receiving_org_id": "string (uuid)",
  "subject_org_id": "string (uuid)",
  "notes": "Needs wet lab space.",
  "status": "pending" | "accepted" | "rejected"
}`,
    initiative: `{
  "id": "string (uuid)",
  "organization_id": "string (uuid)",
  "name": "Series A Fundraising",
  "status": "active" | "completed",
  "pipeline_id": "pipeline_venture_01",
  "current_stage_index": 2,
  "start_date": "2023-01-01"
}`,
    metric: `{
  "organization_id": "string (uuid)",
  "date": "2023-12-31",
  "metric_type": "revenue" | "jobs_ft" | "capital_raised",
  "value": 100000,
  "source": "verified" | "self_reported"
}`
};

const SYNC_WORKFLOWS = {
    search: {
        title: "Step 1: Resolution & Match",
        desc: "Don't assume. Check if the entity exists in the federation before creating.",
        code: `POST /api/v1/organizations/resolve
{
  "name": "DarkStar Marine",
  "url": "darkstarmarine.com",
  "email": "contact@darkstarmarine.com"
}

// Response (200 OK)
{
  "match_found": true,
  "confidence": 0.95,
  "entity": {
    "id": "org_darkstar_001",
    "version": 3,
    "name": "DarkStar Marine"
  }
}`
    },
    safe_update: {
        title: "Step 2: Safe Update (Optimistic Locking)",
        desc: "Use the 'version' field to prevent overwriting newer data from another system.",
        code: `PATCH /api/v1/organizations/org_darkstar_001
If-Match: "3"
Content-Type: application/json

{
  "description": "Updated from Salesforce CRM",
  "external_refs": [
    { "source": "salesforce", "id": "SF_12345" }
  ]
}

// Response (409 Conflict) if version changed on server
// Response (200 OK) -> returns new version: 4`
    }
};

const WEBHOOK_PAYLOADS = {
    full: `{
  "event": "organization.updated",
  "id": "evt_12345",
  "timestamp": "2023-11-30T10:00:00Z",
  "data": {
    "id": "org_darkstar_001",
    "version": 4,
    "name": "DarkStar Marine",
    "description": "Updated description...",
    "url": "..."
  }
}`,
    delta: `{
  "event": "organization.updated",
  "id": "evt_12345",
  "timestamp": "2023-11-30T10:00:00Z",
  "resource_id": "org_darkstar_001",
  "version": 4,
  "changes": {
    "description": {
      "old": "Old description",
      "new": "Updated description..."
    }
  }
}`
};

const TEST_PAYLOADS = {
    create: {
        "source": "Salesforce",
        "name": "New Venture X",
        "external_id": "sf_new_001",
        "url": "https://newventurex.com",
        "description": "Imported from CRM"
    },
    update: {
        "source": "Salesforce",
        "name": "DarkStar Marine",
        "external_id": "0015f00000G7x9A", // Matches existing mock data
        "description": "Updated via API Console simulation. Raised Series A.",
        "tax_status": "for_profit"
    },
    conflict: {
        "source": "HubSpot",
        "name": "Dark Star Tech",
        "external_id": "hb_dup_999", // New external ID
        "url": "https://darkstarmarine.com", // Matches existing URL -> should trigger Data Quality Flag
        "description": "Duplicate record entering the system."
    }
};

interface LogEntry {
    timestamp: string;
    msg: string;
    type: 'info' | 'success' | 'error' | 'warn';
}

interface DeliveryLogEntry {
    id: string;
    timestamp: string;
    url: string;
    status: string;
    payload: string;
}

export const APIConsoleView = () => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState<'overview' | 'simulator' | 'sync_guide' | 'webhooks' | 'docs'>('overview');
    const [organizations, setOrganizations] = useState<any[]>([]);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const manageableEsoOrganizations = useMemo(() => {
        if (viewer.role === 'platform_admin') {
            return organizations.filter(org => org.roles.includes('eso'));
        }

        if (viewer.role === 'ecosystem_manager') {
            return organizations.filter(org => org.roles.includes('eso') && org.ecosystem_ids.includes(viewer.ecosystemId));
        }

        const ownOrg = organizations.find(org => org.id === viewer.orgId);
        return ownOrg && ownOrg.roles.includes('eso') ? [ownOrg] : [];
    }, [organizations, viewer.ecosystemId, viewer.orgId, viewer.role]);

    const loadOrganizations = async () => {
        const nextOrganizations = await repos.organizations.getAll(viewer);
        setOrganizations(Array.isArray(nextOrganizations) ? nextOrganizations : []);
    };

    useEffect(() => {
        let cancelled = false;

        const loadVisibleOrganizations = async () => {
            const nextOrganizations = await repos.organizations.getAll(viewer);
            if (!cancelled) {
                setOrganizations(Array.isArray(nextOrganizations) ? nextOrganizations : []);
            }
        };

        void loadVisibleOrganizations();
        return () => {
            cancelled = true;
        };
    }, [repos.organizations, viewer.ecosystemId, viewer.orgId, viewer.role]);
    
    // Key Management State
    const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
    const [newKeyLabel, setNewKeyLabel] = useState('');
    const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
    const [keyCreateError, setKeyCreateError] = useState<string | null>(null);
    const [selectedIntegrationOrgId, setSelectedIntegrationOrgId] = useState('');

    // Confirm states for destructive actions
    const [confirmRevokeKeyId, setConfirmRevokeKeyId] = useState<string | null>(null);
    const [confirmDeleteWebhookId, setConfirmDeleteWebhookId] = useState<string | null>(null);

    // Webhook Management State
    const [isCreateWebhookModalOpen, setIsCreateWebhookModalOpen] = useState(false);
    const [newWebhookUrl, setNewWebhookUrl] = useState('');
    const [newWebhookDesc, setNewWebhookDesc] = useState('');
    const [newWebhookFormat, setNewWebhookFormat] = useState<'full_resource' | 'delta'>('full_resource');
    const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);

    // Simulator State
    const [simPayload, setSimPayload] = useState(JSON.stringify(TEST_PAYLOADS.update, null, 2));
    const [simLog, setSimLog] = useState<LogEntry[]>([]);
    const [deliveryLog, setDeliveryLog] = useState<DeliveryLogEntry[]>([]);

    // Sync Status State
    const [syncStatus, setSyncStatus] = useState<Record<string, string>>({
        'Salesforce': new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        'HubSpot': new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        'Quickbooks': new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    });

    const sourceStats = useMemo(() => {
        const stats: Record<string, number> = { 'Salesforce': 0, 'HubSpot': 0, 'Quickbooks': 0 };
        organizations.forEach(org => {
            org.external_refs?.forEach(ref => {
                stats[ref.source] = (stats[ref.source] || 0) + 1;
            });
        });
        return stats;
    }, [organizations]);

    const esoIntegrationStats = useMemo(() => {
        if (viewer.role !== 'ecosystem_manager') {
            return [];
        }

        return organizations
            .filter(org => org.roles.includes('eso'))
            .map(org => {
                const apiKeysForOrg = Array.isArray(org.api_keys) ? org.api_keys : [];
                const webhooksForOrg = Array.isArray(org.webhooks) ? org.webhooks : [];
                const activeApiKeys = apiKeysForOrg.filter(key => key.status === 'active').length;
                const activeWebhooks = webhooksForOrg.filter(hook => hook.status === 'active').length;
                const syncedSources = new Set((org.external_refs || []).map(ref => ref.source)).size;
                const lastWebhookDelivery = webhooksForOrg
                    .map(hook => hook.last_delivery)
                    .filter(Boolean)
                    .sort()
                    .reverse()[0];

                return {
                    org,
                    activeApiKeys,
                    activeWebhooks,
                    syncedSources,
                    activityLabel: activeApiKeys > 0 || activeWebhooks > 0 || syncedSources > 0 ? 'Active' : 'Not configured',
                    lastActivity: lastWebhookDelivery || null,
                };
            })
            .sort((a, b) => {
                const aScore = a.activeApiKeys + a.activeWebhooks + a.syncedSources;
                const bScore = b.activeApiKeys + b.activeWebhooks + b.syncedSources;
                return bScore - aScore;
            });
    }, [organizations, viewer.role]);

    const conflicts = useMemo(() => detectDuplicates(organizations), [organizations]);
    const showFederatedSyncStatus = viewer.role === 'platform_admin' || viewer.role === 'ecosystem_manager';

    const handleSync = (source: string) => {
        setSyncStatus(prev => ({ ...prev, [source]: new Date().toISOString() }));
    };

    useEffect(() => {
        const fallbackOrgId = manageableEsoOrganizations[0]?.id || viewer.orgId;
        setSelectedIntegrationOrgId(current => (
            manageableEsoOrganizations.some(org => org.id === current) ? current : fallbackOrgId
        ));
    }, [manageableEsoOrganizations, viewer.orgId]);

    useEffect(() => {
        let cancelled = false;

        const loadIntegrationConfig = async () => {
            if (!selectedIntegrationOrgId) {
                if (!cancelled) {
                    setApiKeys([]);
                    setWebhooks([]);
                }
                return;
            }

            const [nextApiKeys, nextWebhooks] = await Promise.all([
                repos.organizations.getApiKeys(selectedIntegrationOrgId),
                repos.organizations.getWebhooks(selectedIntegrationOrgId),
            ]);

            if (!cancelled) {
                setApiKeys(Array.isArray(nextApiKeys) ? nextApiKeys : []);
                setWebhooks(Array.isArray(nextWebhooks) ? nextWebhooks : []);
            }
        };

        void loadIntegrationConfig();
        return () => {
            cancelled = true;
        };
    }, [selectedIntegrationOrgId, repos.organizations, isCreateKeyModalOpen, isCreateWebhookModalOpen]); 

    // --- API Key Handlers ---
    const handleCreateKey = async () => {
        if (!selectedIntegrationOrgId) {
            return;
        }
        setKeyCreateError(null);
        try {
            const key = await repos.organizations.generateApiKey(selectedIntegrationOrgId, newKeyLabel || 'New API Key');
            if (!key) {
                setKeyCreateError('Unable to create API key for the selected organization.');
                return;
            }
            setCreatedKeySecret(key.prefix); 
            await loadOrganizations();
            const nextApiKeys = await repos.organizations.getApiKeys(selectedIntegrationOrgId);
            setApiKeys(Array.isArray(nextApiKeys) ? nextApiKeys : []);
        } catch (error: any) {
            setKeyCreateError(error?.message || 'Unable to create API key.');
        }
    };

    const handleRevokeKey = (id: string) => {
        setConfirmRevokeKeyId(id);
    };

    const doRevokeKey = async (id: string) => {
        await repos.organizations.revokeApiKey(selectedIntegrationOrgId, id);
        const nextApiKeys = await repos.organizations.getApiKeys(selectedIntegrationOrgId);
        setApiKeys(Array.isArray(nextApiKeys) ? nextApiKeys : []);
        await loadOrganizations();
        setConfirmRevokeKeyId(null);
    };

    const closeCreateKeyModal = () => {
        setIsCreateKeyModalOpen(false);
        setCreatedKeySecret(null);
        setNewKeyLabel('');
        setKeyCreateError(null);
    };

    // --- Webhook Handlers ---
    const handleCreateWebhook = async () => {
        if (!newWebhookUrl || !selectedIntegrationOrgId) return;
        await repos.organizations.addWebhook(selectedIntegrationOrgId, {
            url: newWebhookUrl,
            description: newWebhookDesc,
            events: newWebhookEvents,
            payload_format: newWebhookFormat
        });
        const nextWebhooks = await repos.organizations.getWebhooks(selectedIntegrationOrgId);
        setWebhooks(Array.isArray(nextWebhooks) ? nextWebhooks : []);
        await loadOrganizations();
        setIsCreateWebhookModalOpen(false);
        setNewWebhookUrl('');
        setNewWebhookDesc('');
        setNewWebhookEvents([]);
        setNewWebhookFormat('full_resource');
    };

    const handleDeleteWebhook = (id: string) => {
        setConfirmDeleteWebhookId(id);
    };

    const doDeleteWebhook = async (id: string) => {
        await repos.organizations.deleteWebhook(selectedIntegrationOrgId, id);
        const nextWebhooks = await repos.organizations.getWebhooks(selectedIntegrationOrgId);
        setWebhooks(Array.isArray(nextWebhooks) ? nextWebhooks : []);
        await loadOrganizations();
        setConfirmDeleteWebhookId(null);
    };

    const toggleWebhookEvent = (event: string) => {
        if (newWebhookEvents.includes(event)) {
            setNewWebhookEvents(newWebhookEvents.filter(e => e !== event));
        } else {
            setNewWebhookEvents([...newWebhookEvents, event]);
        }
    };

    // --- Simulator Handlers ---
    const logSim = (msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
        setSimLog(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), msg, type }]);
    };

    const handleSimulateIngest = () => {
        try {
            const payload = JSON.parse(simPayload);
            const source = payload.source || 'Unknown';
            
            logSim(`Received payload from ${source}...`, 'info');
            
            const result = repos.organizations.upsertFromExternal(source, payload);
            
            let eventType = '';

            if (result.status === 'created') {
                eventType = 'organization.created';
                logSim(`SUCCESS: Created new record (ID: ${result.entity.id}).`, 'success');
            } else if (result.status === 'updated') {
                eventType = 'organization.updated';
                logSim(`SUCCESS: Updated existing record (ID: ${result.entity.id}). Version bumped to v${result.entity.version}.`, 'success');
            } else {
                logSim(`WARNING: Operation returned status ${result.status}`, 'warn');
            }

            if (payload.name && (payload.name.includes('Duplicate') || payload.name.includes('Conflict'))) {
                 logSim(`DATA QUALITY ALERT: High confidence fuzzy match detected with existing record. Added to "Data Quality" review queue.`, 'warn');
            }

            // --- Outbound Trigger Logic ---
            if (eventType) {
                const matchingHooks = webhooks.filter(w => w.events.includes(eventType));
                
                if (matchingHooks.length > 0) {
                    logSim(`Event '${eventType}' emitted. Triggering ${matchingHooks.length} subscriber(s)...`, 'info');
                    
                    matchingHooks.forEach(hook => {
                        // Create realistic mock payload based on format preference
                        const outboundPayload = hook.payload_format === 'delta' 
                            ? {
                                event: eventType,
                                id: `evt_${Date.now()}`,
                                timestamp: new Date().toISOString(),
                                resource_id: result.entity.id,
                                changes: { 
                                    description: { 
                                        old: "Previous description...", 
                                        new: result.entity.description 
                                    } 
                                }
                              }
                            : {
                                event: eventType,
                                id: `evt_${Date.now()}`,
                                timestamp: new Date().toISOString(),
                                data: result.entity
                              };

                        // Simulate network delay and logging
                        setTimeout(() => {
                            const newLogEntry: DeliveryLogEntry = {
                                id: `del_${Date.now()}_${Math.random()}`,
                                timestamp: new Date().toLocaleTimeString(),
                                url: hook.url,
                                status: '200 OK',
                                payload: JSON.stringify(outboundPayload, null, 2)
                            };
                            setDeliveryLog(prev => [newLogEntry, ...prev]);
                            logSim(`-> Delivered to ${hook.url}`, 'success');
                        }, 800); // 800ms delay for realism
                    });
                } else {
                    logSim(`Event '${eventType}' emitted. No subscribers found.`, 'info');
                }
            }

        } catch (e) {
            logSim(`ERROR: Invalid JSON payload.`, 'error');
        }
    };

    const loadPreset = (type: 'create' | 'update' | 'conflict') => {
        setSimPayload(JSON.stringify(TEST_PAYLOADS[type], null, 2));
        setSimLog([]); // Clear logs on new preset
        setDeliveryLog([]);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Developer API Console</h2>
                    <p className="text-gray-500 text-sm mt-1">Integrate Entrepreneurship Nexus into your agency's backend workflows.</p>
                </div>
                <div className="flex items-center gap-2">
                     {manageableEsoOrganizations.length > 0 && (
                        <select
                            className={`${FORM_SELECT_CLASS} min-w-[240px]`}
                            value={selectedIntegrationOrgId}
                            onChange={(event) => setSelectedIntegrationOrgId(event.target.value)}
                        >
                            {manageableEsoOrganizations.map((organization) => (
                                <option key={organization.id} value={organization.id}>{organization.name}</option>
                            ))}
                        </select>
                     )}
                     <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded">Role: {viewer.role}</span>
                     <DemoLink href="/help/api" className="text-indigo-600 text-sm hover:underline" title="Documentation Center">Help</DemoLink>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button onClick={() => setActiveTab('overview')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Overview
                    </button>
                    <button onClick={() => setActiveTab('simulator')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'simulator' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Webhook Simulator
                    </button>
                    <button onClick={() => setActiveTab('sync_guide')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'sync_guide' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Best Practices
                    </button>
                    <button onClick={() => setActiveTab('webhooks')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'webhooks' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Webhooks
                    </button>
                    <button onClick={() => setActiveTab('docs')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'docs' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Reference
                    </button>
                </nav>
            </div>

            {/* Content Areas */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    <Card title="Sync Status">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {viewer.role === 'ecosystem_manager' ? esoIntegrationStats.map(({ org, activeApiKeys, activeWebhooks, syncedSources, activityLabel, lastActivity }) => (
                                <div key={org.id} className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-gray-700 text-sm">{org.name}</span>
                                            <Badge color={activityLabel === 'Active' ? 'green' : 'gray'}>{activityLabel}</Badge>
                                        </div>
                                        <div className="space-y-1 text-sm text-gray-600">
                                            <div>{activeApiKeys} active API key{activeApiKeys === 1 ? '' : 's'}</div>
                                            <div>{activeWebhooks} active webhook{activeWebhooks === 1 ? '' : 's'}</div>
                                            <div>{syncedSources} data source{syncedSources === 1 ? '' : 's'} linked</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-200 text-[11px] text-gray-500">
                                        {lastActivity ? `Last webhook activity: ${new Date(lastActivity).toLocaleString()}` : 'No webhook deliveries recorded yet'}
                                    </div>
                                </div>
                            )) : showFederatedSyncStatus ? Object.entries(sourceStats).map(([source, count]) => (
                                <div key={source} className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-gray-700 text-sm">{source}</span>
                                            <Badge color="green">Active</Badge>
                                        </div>
                                        <div className="text-2xl font-bold text-indigo-600 mb-1">{count}</div>
                                        <div className="text-xs text-gray-500">Records Synced</div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                                        <div className="text-[10px] text-gray-400">
                                            Last: {new Date(syncStatus[source] || new Date().toISOString()).toLocaleTimeString()}
                                        </div>
                                        <button 
                                            onClick={() => handleSync(source)}
                                            className="text-xs text-indigo-600 font-bold hover:underline"
                                        >
                                            Sync Now
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="md:col-span-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                    <div className="font-bold text-gray-900 text-sm">Organization API Workspace</div>
                                    <div className="mt-1 text-sm text-gray-500">
                                        Cross-organization sync status is hidden for ESO admins. This workspace is limited to your organization&apos;s API keys, webhooks, and integration tooling.
                                    </div>
                                </div>
                            )}
                            {/* Data Quality Warning */}
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex flex-col justify-between border-l-4 border-l-yellow-400">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-yellow-900 text-sm">Data Quality</span>
                                        {conflicts.length > 0 && <span className="animate-pulse">⚠️</span>}
                                    </div>
                                    <div className="text-2xl font-bold text-yellow-700 mb-1">{conflicts.length}</div>
                                    <div className="text-xs text-yellow-800">Pending Conflicts</div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-yellow-200">
                                    <button className="text-xs text-yellow-900 font-bold hover:underline w-full text-right">
                                        View Queue &rarr;
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title="Your API Keys">
                        <div className="space-y-4">
                            {selectedIntegrationOrgId && (
                                <div className="text-xs text-gray-500">
                                    Managing keys for <span className="font-semibold text-gray-700">{organizations.find((organization) => organization.id === selectedIntegrationOrgId)?.name || selectedIntegrationOrgId}</span>
                                </div>
                            )}
                            {apiKeys.length === 0 && <p className="text-gray-500 italic">No active API keys.</p>}
                            {apiKeys.map(key => (
                                <div key={key.id} className={`flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded ${key.status === 'revoked' ? 'opacity-60' : ''}`}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <div className="font-bold text-sm text-gray-800">{key.label}</div>
                                            <div className="font-mono text-xs text-gray-500 bg-white px-1 border rounded">{key.prefix}</div>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">Created: {new Date(key.created_at).toLocaleDateString()}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge color={key.status === 'active' ? 'green' : 'red'}>{key.status}</Badge>
                                        {key.status === 'active' && (
                                            confirmRevokeKeyId === key.id ? (
                                                <span className="text-xs text-red-700">
                                                    Revoke this key?{' '}
                                                    <button onClick={() => void doRevokeKey(key.id)} className="font-bold underline mr-1">Yes</button>
                                                    <button onClick={() => setConfirmRevokeKeyId(null)} className="text-gray-500 underline">Cancel</button>
                                                </span>
                                            ) : (
                                                <button onClick={() => handleRevokeKey(key.id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                                            )
                                        )}
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setIsCreateKeyModalOpen(true)} className="text-sm text-indigo-600 font-bold hover:underline disabled:opacity-50" disabled={!selectedIntegrationOrgId}>+ Generate New Key</button>
                        </div>
                    </Card>
                    <Card title="Quick Start">
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">Authenticate requests by providing your key in the HTTP Header:</p>
                            <CodeBlock code={`Authorization: Bearer sk_live_...`} />
                            <p className="text-sm text-gray-600 mt-4">Example Request (Fetch Organizations):</p>
                            <CodeBlock code={`curl https://api.nexus.org/v1/organizations \\
  -H "Authorization: Bearer sk_live_..."`} />
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'simulator' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[700px]">
                    {/* Left: Input */}
                    <div className="flex flex-col space-y-4">
                        <Card title="Mock Incoming Payload" className="flex-1 flex flex-col">
                            <div className="flex gap-2 mb-3">
                                <button onClick={() => loadPreset('update')} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded border">Load: Update Existing</button>
                                <button onClick={() => loadPreset('create')} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded border">Load: Create New</button>
                                <button onClick={() => loadPreset('conflict')} className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded border border-amber-200">Load: Conflict</button>
                            </div>
                            <textarea 
                                className="w-full flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded p-4 resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={simPayload}
                                onChange={(e) => setSimPayload(e.target.value)}
                            />
                            <div className="mt-4 flex justify-end">
                                <button 
                                    onClick={handleSimulateIngest}
                                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded shadow-sm hover:bg-indigo-700 flex items-center gap-2"
                                >
                                    <span>▶</span> Execute Webhook
                                </button>
                            </div>
                        </Card>
                    </div>

                    {/* Right: Logs (System & Delivery) */}
                    <div className="flex flex-col gap-4 h-full">
                        {/* System Log */}
                        <div className="flex-1 bg-slate-900 text-green-400 font-mono text-sm p-4 rounded-lg shadow-inner overflow-y-auto border border-slate-800">
                            <div className="border-b border-slate-700 pb-2 mb-2 text-slate-500 text-xs uppercase font-bold sticky top-0 bg-slate-900">System Processing Log</div>
                            {simLog.length === 0 && <span className="text-slate-600 italic">Waiting for event...</span>}
                            {simLog.map((entry, i) => (
                                <div key={i} className="mb-1">
                                    <span className="text-slate-500 mr-2">[{entry.timestamp}]</span>
                                    <span className={entry.type === 'error' ? 'text-red-400' : entry.type === 'warn' ? 'text-yellow-400' : entry.type === 'success' ? 'text-green-300' : 'text-slate-300'}>
                                        {entry.msg}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Webhook Delivery Log */}
                        <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
                            <div className="bg-gray-50 border-b border-gray-200 p-3 flex justify-between items-center">
                                <span className="font-bold text-xs text-gray-500 uppercase">Outbound Delivery Log</span>
                                {deliveryLog.length > 0 && (
                                    <button onClick={() => setDeliveryLog([])} className="text-xs text-gray-400 hover:text-red-500 font-medium">Clear Log</button>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-0">
                                {deliveryLog.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm italic">
                                        No outbound events triggered yet.<br/>
                                        Try executing a payload that matches your Webhook configuration.
                                    </div>
                                ) : (
                                    <table className="min-w-full text-xs text-left">
                                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                            <tr>
                                                <th className="px-3 py-2 w-20">Time</th>
                                                <th className="px-3 py-2">Target URL</th>
                                                <th className="px-3 py-2 w-20">Status</th>
                                                <th className="px-3 py-2">Payload</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {deliveryLog.map(entry => (
                                                <tr key={entry.id} className="group hover:bg-gray-50">
                                                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top">{entry.timestamp}</td>
                                                    <td className="px-3 py-2 font-mono text-indigo-600 truncate max-w-[200px] align-top" title={entry.url}>{entry.url}</td>
                                                    <td className="px-3 py-2 text-green-600 font-bold align-top">{entry.status}</td>
                                                    <td className="px-3 py-2 align-top">
                                                        <details className="cursor-pointer">
                                                            <summary className="text-gray-400 hover:text-gray-600 focus:outline-none">View JSON</summary>
                                                            <pre className="mt-1 p-2 bg-slate-800 text-slate-300 rounded overflow-x-auto text-[10px] shadow-inner font-mono max-h-32">
                                                                {entry.payload}
                                                            </pre>
                                                        </details>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'sync_guide' && (
                <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                        <h4 className="font-bold text-blue-900 text-sm mb-2">Syncing Data with External Systems</h4>
                        <p className="text-sm text-blue-800">
                            To maintain data integrity across the federation, always <strong>Resolve</strong> before you create, and <strong>Lock</strong> before you update.
                        </p>
                    </div>

                    <Card title={SYNC_WORKFLOWS.search.title}>
                        <p className="text-sm text-gray-600 mb-4">{SYNC_WORKFLOWS.search.desc}</p>
                        <CodeBlock code={SYNC_WORKFLOWS.search.code} language="json" />
                    </Card>

                    <Card title={SYNC_WORKFLOWS.safe_update.title}>
                        <p className="text-sm text-gray-600 mb-4">{SYNC_WORKFLOWS.safe_update.desc}</p>
                        <CodeBlock code={SYNC_WORKFLOWS.safe_update.code} language="http" />
                    </Card>
                </div>
            )}

            {activeTab === 'webhooks' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <p className="text-gray-600 text-sm">Subscribe to real-time events in the ecosystem.</p>
                        <button onClick={() => setIsCreateWebhookModalOpen(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700">
                            + Add Endpoint
                        </button>
                    </div>

                    <div className="grid gap-4">
                        {webhooks.length === 0 && (
                            <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-300 rounded text-gray-500">
                                No webhooks configured. Add one to start listening for events.
                            </div>
                        )}
                        {webhooks.map(hook => (
                            <Card key={hook.id} title={hook.url} className="border-l-4 border-l-purple-500">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="text-sm text-gray-600">{hook.description || 'No description provided.'}</div>
                                        <div className="flex gap-2">
                                            <Badge color="purple">{hook.payload_format === 'delta' ? 'Delta (Diffs Only)' : 'Full Resource'}</Badge>
                                            <Badge color={hook.status === 'active' ? 'green' : 'red'}>{hook.status}</Badge>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Subscribed Events</span>
                                        <div className="flex flex-wrap gap-2">
                                            {hook.events.map(e => (
                                                <span key={e} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100 font-mono">
                                                    {e}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-gray-100 p-2 rounded text-xs font-mono text-gray-600 flex justify-between items-center">
                                        <span>Secret: {hook.secret.substring(0, 12)}...</span>
                                        <button className="text-indigo-600 hover:underline">Reveal</button>
                                    </div>

                                    <div className="pt-2 border-t border-gray-100 flex justify-end gap-3 items-center">
                                        <button className="text-xs text-gray-500 hover:text-gray-900">View Logs</button>
                                        {confirmDeleteWebhookId === hook.id ? (
                                            <span className="text-xs text-red-700">
                                                Delete this webhook?{' '}
                                                <button onClick={() => void doDeleteWebhook(hook.id)} className="font-bold underline mr-1">Yes</button>
                                                <button onClick={() => setConfirmDeleteWebhookId(null)} className="text-gray-500 underline">Cancel</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => handleDeleteWebhook(hook.id)} className="text-xs text-red-600 hover:text-red-900 font-bold">Delete</button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'docs' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-4">
                         <h3 className="font-bold text-gray-700">Endpoints</h3>
                         <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                             {API_ENDPOINTS.map((ep, idx) => (
                                 <div key={idx} className="p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer flex justify-between items-center">
                                     <div className="flex items-center gap-2">
                                         <Badge color={ep.method === 'GET' ? 'blue' : 'green'}>{ep.method}</Badge>
                                         <span className="font-mono text-xs text-gray-700">{ep.path}</span>
                                     </div>
                                     <span className="text-xs text-gray-400 hidden sm:block">{ep.desc}</span>
                                 </div>
                             ))}
                         </div>
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                         <Card title="Organization Object">
                             <CodeBlock code={SCHEMAS.organization} language="json" />
                         </Card>
                         <Card title="Person Object">
                             <CodeBlock code={SCHEMAS.person} language="json" />
                         </Card>
                         <Card title="Interaction Object">
                             <CodeBlock code={SCHEMAS.interaction} language="json" />
                         </Card>
                         <Card title="Referral Object">
                             <CodeBlock code={SCHEMAS.referral} language="json" />
                         </Card>
                         <Card title="Initiative Object">
                             <CodeBlock code={SCHEMAS.initiative} language="json" />
                         </Card>
                         <Card title="Metric Object">
                             <CodeBlock code={SCHEMAS.metric} language="json" />
                         </Card>
                    </div>
                </div>
            )}

            {/* Modals */}
            <Modal isOpen={isCreateKeyModalOpen} onClose={closeCreateKeyModal} title="Create API Key">
                {!createdKeySecret ? (
                    <div className="space-y-4">
                        <div>
                            <label className={FORM_LABEL_CLASS}>Assign To ESO Organization</label>
                            <select className={FORM_SELECT_CLASS} value={selectedIntegrationOrgId} onChange={(e) => setSelectedIntegrationOrgId(e.target.value)}>
                                {manageableEsoOrganizations.map((organization) => (
                                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={FORM_LABEL_CLASS}>Key Label</label>
                            <input 
                                className={FORM_INPUT_CLASS} 
                                placeholder="e.g. Production Server" 
                                value={newKeyLabel}
                                onChange={e => setNewKeyLabel(e.target.value)}
                            />
                        </div>
                        <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 border border-yellow-200">
                            <strong>Note:</strong> You will only be shown the secret key once.
                        </div>
                        {keyCreateError && (
                            <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                                {keyCreateError}
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={closeCreateKeyModal} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                            <button onClick={handleCreateKey} disabled={!newKeyLabel || !selectedIntegrationOrgId} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50">Create</button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-center text-green-600 text-xl mb-2">✓ Key Created</div>
                        <p className="text-sm text-gray-600">Please copy your key immediately. It will not be shown again.</p>
                        <CodeBlock code={createdKeySecret} />
                        <button onClick={closeCreateKeyModal} className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 mt-2">Done</button>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isCreateWebhookModalOpen} onClose={() => setIsCreateWebhookModalOpen(false)} title="Add Webhook Endpoint">
                <div className="space-y-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>Endpoint URL</label>
                        <input 
                            className={FORM_INPUT_CLASS} 
                            placeholder="https://api.yoursite.com/webhooks/nexus" 
                            value={newWebhookUrl}
                            onChange={e => setNewWebhookUrl(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Description</label>
                        <input 
                            className={FORM_INPUT_CLASS} 
                            placeholder="e.g. Sync new startups to CRM" 
                            value={newWebhookDesc}
                            onChange={e => setNewWebhookDesc(e.target.value)}
                        />
                    </div>
                    
                    <div>
                        <label className={FORM_LABEL_CLASS}>Payload Format</label>
                        <select 
                            className={FORM_SELECT_CLASS} 
                            value={newWebhookFormat} 
                            onChange={e => setNewWebhookFormat(e.target.value as any)}
                        >
                            <option value="full_resource">Full Resource (Complete Record)</option>
                            <option value="delta">Delta (Changes Only)</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {newWebhookFormat === 'delta' 
                                ? "Payload will contain only the fields that changed (old vs new values)." 
                                : "Payload will contain the entire entity snapshot after the change."}
                        </p>
                    </div>

                    {/* Preview of Payload Type */}
                    <div className="bg-slate-900 rounded p-3 text-xs font-mono text-slate-300">
                        <div className="uppercase text-slate-500 mb-1 font-bold">Payload Preview</div>
                        <pre className="whitespace-pre-wrap">
                            {newWebhookFormat === 'full_resource' ? WEBHOOK_PAYLOADS.full : WEBHOOK_PAYLOADS.delta}
                        </pre>
                    </div>

                    <div>
                        <label className={FORM_LABEL_CLASS}>Events to Subscribe</label>
                        <div className="grid grid-cols-1 gap-2 mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                            {WEBHOOK_EVENTS.map(event => (
                                <label key={event} className="flex items-center gap-2 text-sm p-1 hover:bg-gray-50 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={newWebhookEvents.includes(event)}
                                        onChange={() => toggleWebhookEvent(event)}
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-mono text-gray-700 text-xs">{event}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={() => setIsCreateWebhookModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                        <button onClick={handleCreateWebhook} disabled={!newWebhookUrl || newWebhookEvents.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm disabled:opacity-50">Create Endpoint</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
