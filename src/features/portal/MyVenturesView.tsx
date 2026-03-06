
import React, { useState, useMemo } from 'react';
import { Person, Initiative, Organization, Interaction, Referral, PipelineDefinition } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { NEW_HAVEN_ECOSYSTEM, ALL_ECOSYSTEMS } from '../../data/mockData';
import { Card, Badge, Avatar, CompanyLogo, DemoLink } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { InitiativeDetailModal } from './InitiativeDetailModal';
import { ManageInitiativeModal } from '../directory/OrgModals';

interface MyVenturesProps {
    person: Person;
    initiatives: Initiative[];
    organizations: Organization[];
    people: Person[];
    interactions: Interaction[];
    referrals: Referral[];
    onAdvance: (i: Initiative) => void;
    onRefresh?: () => void;
}

export const MyVenturesView = ({ person, initiatives, organizations, people, interactions, referrals, onAdvance, onRefresh }: MyVenturesProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    
    // State for modal
    const [selectedInitiative, setSelectedInitiative] = useState<Initiative | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Get ecosystem config
    const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
    const pipelines = repos.pipelines.getPipelines(viewer.ecosystemId);
    const checklists = ecosystem?.checklist_templates || [];

    // 1. Organizations (My Context)
    const myOrg = organizations.find(o => o.id === person.organization_id);
    
    // Identify all organizations associated with this user (Primary + Secondary)
    const userOrgs = useMemo(() => {
        return organizations.filter(o => 
            o.id === person.organization_id || 
            (person.secondary_profile && o.id === person.secondary_profile.organization_id)
        );
    }, [organizations, person]);
    
    // 2. Employees (Team members in my org)
    const myTeam = people.filter(p => p.organization_id === myOrg?.id && p.id !== person.id);

    // 3. Initiatives (Active Projects)
    // Filter to show initiatives for ANY of the user's orgs
    const myInitiatives = initiatives.filter(i => userOrgs.some(o => o.id === i.organization_id));
    
    // 4. Support Network Logic (Dynamic based on Interactions & Referrals)
    const myNetwork = useMemo(() => {
        if (!myOrg) return { orgs: [], contacts: [] };

        // A. Organizations
        // 1. Explicitly managing (e.g. Incubator cohort)
        const managedIds = new Set(myOrg.managed_by_ids || []);
        // 2. Interacted with (Authors of notes about my org)
        const interactionIds = new Set(interactions.filter(i => i.organization_id === myOrg.id).map(i => i.author_org_id));
        // 3. Referral Partners (Sent me somewhere or Received me)
        const referralIds = new Set(referrals.filter(r => r.subject_org_id === myOrg.id).flatMap(r => [r.referring_org_id, r.receiving_org_id]));

        const allSupportOrgIds = Array.from(new Set([...managedIds, ...interactionIds, ...referralIds]))
            .filter(id => id !== myOrg.id); // Exclude self

        const supportOrgs = organizations.filter(o => allSupportOrgIds.includes(o.id));

        // B. People (Contacts)
        // Extract names from interaction logs (recorded_by, attendees)
        const contactNames = new Set<string>();
        interactions.filter(i => i.organization_id === myOrg.id).forEach(i => {
            if (i.recorded_by) contactNames.add(i.recorded_by.split(' (')[0]); 
            i.attendees?.forEach(a => contactNames.add(a));
        });

        // Filter people directory
        const contacts = people.filter(p => {
            if (p.organization_id === myOrg.id) return false; // Exclude own team
            const fullName = `${p.first_name} ${p.last_name}`;
            return contactNames.has(fullName) || contactNames.has(p.first_name);
        });

        return { orgs: supportOrgs, contacts };
    }, [myOrg, organizations, interactions, referrals, people]);

    // Extras
    const myReferrals = referrals.filter(r => r.subject_org_id === myOrg?.id);
    const incomingAccessRequests = referrals.filter(r => 
        r.receiving_org_id === myOrg?.id && 
        r.status === 'pending' && 
        (r.outcome_tags?.includes('Access Request') || r.outcome_tags?.includes('Connection Request'))
    );

    const [networkTab, setNetworkTab] = useState<'orgs' | 'people'>('orgs');

    const handleGrantAccess = (ref: Referral) => {
        if (!myOrg) return;
        if (confirm(`Grant access to ${organizations.find(o => o.id === ref.referring_org_id)?.name}?`)) {
            repos.referrals.accept(ref.id, "Access Granted via Portal");
            repos.consent.grantAccess(myOrg.id, ref.referring_org_id, 'read');
            onRefresh?.();
        }
    };

    const handleDenyAccess = (ref: Referral) => {
        if (confirm(`Deny access request from ${organizations.find(o => o.id === ref.referring_org_id)?.name}?`)) {
            repos.referrals.decline(ref.id, "Access Denied by User");
            onRefresh?.();
        }
    };

    const handleCreateInitiative = (initData: Partial<Initiative>) => {
        repos.pipelines.addInitiative({
            id: `init_${Date.now()}`,
            ecosystem_id: viewer.ecosystemId,
            ...initData
        } as Initiative);
        setIsCreateModalOpen(false);
        onRefresh?.();
    };

    const handleSavePipeline = (p: PipelineDefinition) => {
        repos.ecosystems.addPipeline(viewer.ecosystemId, p);
    };

    const handleSaveChecklist = (c: ChecklistTemplate) => {
        repos.ecosystems.addChecklistTemplate(viewer.ecosystemId, c);
    };

    // Helper to get pipeline def for selected initiative
    const getPipeline = (init: Initiative) => {
        return pipelines.find(p => p.id === init.pipeline_id);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Client Portal</h2>
            <div className="bg-indigo-900 text-white p-6 rounded-lg shadow-lg flex items-center justify-between">
                 <div>
                    <h3 className="text-xl font-bold">Welcome back, {person.first_name}!</h3>
                    <p className="text-indigo-200 mt-2">Manage your organization, team, and ecosystem support.</p>
                 </div>
                 <Avatar src={person.avatar_url} name={person.first_name} size="lg" className="border-4 border-indigo-800" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Main Column */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* 1. Organizations */}
                    <Card title="My Organization">
                        {myOrg ? (
                            <div>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <CompanyLogo src={myOrg.logo_url} name={myOrg.name} size="lg" />
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">{myOrg.name}</h3>
                                            <p className="text-gray-600 mt-1 text-sm">{myOrg.description}</p>
                                        </div>
                                    </div>
                                    <Badge color={myOrg.operational_visibility === 'open' ? 'green' : 'red'}>
                                        {myOrg.operational_visibility === 'open' ? 'Visible' : 'Private'}
                                    </Badge>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {myOrg.classification.industry_tags.map(tag => (
                                        <span key={tag} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded border border-gray-200">{tag}</span>
                                    ))}
                                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 font-mono">
                                        {myOrg.tax_status.replace('_', ' ').toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4 text-sm">
                                    {myOrg.url && <DemoLink href={myOrg.url} className="text-indigo-600 hover:underline">Website</DemoLink>}
                                    <button className="text-gray-500 hover:text-gray-800">Edit Profile</button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-500 italic">No primary organization associated.</p>
                        )}
                    </Card>

                    {/* 2. Initiatives */}
                    <Card title="Initiatives (Active Projects)">
                        {myInitiatives.length === 0 ? (
                            <div className="text-center p-4 bg-gray-50 rounded border border-dashed border-gray-300">
                                <p className="text-gray-500 text-sm">No active initiatives.</p>
                                <button 
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="mt-2 text-indigo-600 text-sm font-bold hover:underline"
                                >
                                    + Start New Initiative
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-right">
                                    <button 
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
                                    >
                                        + New Initiative
                                    </button>
                                </div>
                                {myInitiatives.map(init => (
                                    <div key={init.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-white transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-gray-900">{init.name}</span>
                                            {init.pipeline_id ? (
                                                <Badge color="blue">Stage {init.current_stage_index + 1}</Badge>
                                            ) : (
                                                <Badge color="green">Checklist</Badge>
                                            )}
                                        </div>
                                        {init.pipeline_id ? (
                                            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                                                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${(init.current_stage_index / 5) * 100}%` }}></div>
                                            </div>
                                        ) : (
                                            <div className="mb-2 text-xs text-gray-500">
                                                {init.checklists.length} task lists attached
                                            </div>
                                        )}
                                        <div className="text-right">
                                            <button 
                                                onClick={() => setSelectedInitiative(init)}
                                                className="text-xs text-indigo-600 font-bold hover:underline"
                                            >
                                                View Progress & Details
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* 3. Employees */}
                    <Card title="Employees">
                        {myTeam.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">You are the only member listed.</p>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {myTeam.map(employee => (
                                    <div key={employee.id} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                                        <div className="flex items-center gap-3">
                                            <Avatar src={employee.avatar_url} name={`${employee.first_name} ${employee.last_name}`} size="sm" />
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{employee.first_name} {employee.last_name}</div>
                                                <div className="text-xs text-gray-500">{employee.role}</div>
                                            </div>
                                        </div>
                                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{employee.email}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 pt-3 border-t border-gray-100">
                            <button className="text-sm text-indigo-600 font-bold hover:underline">+ Invite Team Member</button>
                        </div>
                    </Card>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    
                    {/* INCOMING REQUESTS */}
                    {incomingAccessRequests.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-in fade-in">
                            <div className="flex items-center gap-2 mb-3 text-amber-900 font-bold text-sm">
                                <span className="animate-pulse">🔒</span> Access Requests
                            </div>
                            <div className="space-y-3">
                                {incomingAccessRequests.map(req => (
                                    <div key={req.id} className="bg-white p-3 rounded border border-amber-100 shadow-sm">
                                        <p className="text-xs text-gray-600 mb-1">
                                            <strong>{organizations.find(o => o.id === req.referring_org_id)?.name}</strong> wants to view your data.
                                        </p>
                                        <div className="text-[10px] text-gray-400 mb-2">{new Date(req.date).toLocaleDateString()}</div>
                                        <div className="flex gap-2 justify-end">
                                            <button 
                                                onClick={() => handleDenyAccess(req)}
                                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                            >
                                                Deny
                                            </button>
                                            <button 
                                                onClick={() => handleGrantAccess(req)}
                                                className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 font-bold"
                                            >
                                                Grant Access
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 4. My Network (Dynamic) */}
                    <Card title="My Ecosystem Network" className="border-t-4 border-t-indigo-500">
                        <div className="flex gap-2 mb-3 border-b border-gray-100 pb-2">
                            <button 
                                onClick={() => setNetworkTab('orgs')}
                                className={`text-xs font-bold px-2 py-1 rounded ${networkTab === 'orgs' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Organizations ({myNetwork.orgs.length})
                            </button>
                            <button 
                                onClick={() => setNetworkTab('people')}
                                className={`text-xs font-bold px-2 py-1 rounded ${networkTab === 'people' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Key Contacts ({myNetwork.contacts.length})
                            </button>
                        </div>

                        {networkTab === 'orgs' ? (
                            myNetwork.orgs.length === 0 ? (
                                <p className="text-gray-500 text-sm italic">No interactions yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {myNetwork.orgs.map(org => {
                                        const count = interactions.filter(i => i.author_org_id === org.id).length;
                                        return (
                                            <div key={org.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center sm:justify-between">
                                                <div className="flex items-center gap-3">
                                                    <CompanyLogo src={org.logo_url} name={org.name} size="sm" />
                                                    <div>
                                                        <div className="font-medium text-gray-900 text-sm">{org.name}</div>
                                                        {count > 0 && <div className="text-[10px] text-gray-500">{count} interactions</div>}
                                                    </div>
                                                </div>
                                                {myOrg?.managed_by_ids?.includes(org.id) && <Badge color="green">Manager</Badge>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        ) : (
                            myNetwork.contacts.length === 0 ? (
                                <p className="text-gray-500 text-sm italic">No contacts found from interactions.</p>
                            ) : (
                                <div className="space-y-3">
                                    {myNetwork.contacts.map(contact => {
                                        const contactOrg = organizations.find(o => o.id === contact.organization_id);
                                        return (
                                            <div key={contact.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                                                <Avatar src={contact.avatar_url} name={`${contact.first_name} ${contact.last_name}`} size="sm" />
                                                <div className="overflow-hidden">
                                                    <div className="text-sm font-bold text-gray-900 truncate">{contact.first_name} {contact.last_name}</div>
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {contact.role} {contactOrg ? `@ ${contactOrg.name}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </Card>

                    <Card title="Referrals">
                         {myReferrals.length === 0 ? (
                             <p className="text-gray-500 text-sm">No active referrals.</p>
                         ) : (
                             <div className="space-y-3">
                                 {myReferrals.map(ref => (
                                     <div key={ref.id} className="p-3 border border-gray-200 rounded-lg">
                                         <div className="text-xs text-gray-500 mb-1">{new Date(ref.date).toLocaleDateString()}</div>
                                         <div className="font-medium text-sm text-gray-900">
                                             To: {organizations.find(o => o.id === ref.receiving_org_id)?.name}
                                         </div>
                                         <div className="mt-2">
                                             <Badge color={ref.status === 'pending' ? 'yellow' : 'green'}>{ref.status}</Badge>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         )}
                    </Card>

                    <Card title="Resources">
                        <div className="space-y-2">
                            {NEW_HAVEN_ECOSYSTEM.portal_links?.map(link => (
                                <DemoLink key={link.id} href={link.url} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 group transition-colors">
                                    <span className="text-xl grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">{link.icon}</span>
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600">{link.label}</span>
                                </DemoLink>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Detailed Initiative Modal */}
            {selectedInitiative && myOrg && (
                <InitiativeDetailModal 
                    initiative={selectedInitiative}
                    organization={myOrg}
                    pipeline={getPipeline(selectedInitiative)} // Pass undefined if not found
                    interactions={repos.interactions.listForInitiative(viewer, selectedInitiative.id)}
                    isOpen={!!selectedInitiative}
                    onClose={() => setSelectedInitiative(null)}
                    onRefresh={() => onRefresh?.()}
                />
            )}

            {/* Create Initiative Modal */}
            <ManageInitiativeModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateInitiative}
                pipelines={pipelines}
                checklists={checklists}
                onSavePipeline={handleSavePipeline}
                onSaveChecklist={handleSaveChecklist}
                organizations={userOrgs} // Pass only user's organizations
                orgId={userOrgs.length === 1 ? userOrgs[0].id : undefined} // Pre-select if only 1, otherwise let user choose (default managed by modal)
            />
        </div>
    );
};
