
import React, { useState, useMemo } from 'react';
import { Person, Initiative, Organization, Interaction, Referral, PipelineDefinition, Service } from '../../domain/types';
import { ChecklistTemplate } from '../../domain/ecosystems/types';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { Card, Badge, Avatar, CompanyLogo, DemoLink, Modal } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { InitiativeDetailModal } from './InitiativeDetailModal';
import { EditOrgModal, ManageInitiativeModal } from '../directory/OrgModals';
import { getActiveOrganizationAffiliations } from '../../domain/people/affiliations';
import { ENUMS } from '../../domain/standards/enums';

interface MyVenturesProps {
    person: Person;
    initiatives: Initiative[];
    organizations: Organization[];
    people: Person[];
    interactions: Interaction[];
    referrals: Referral[];
    services: Service[];
    actingOrgId?: string;
    onAdvance: (i: Initiative) => void;
    onRefresh?: () => void;
    onSelectOrganization?: (id: string) => void;
    onCreateOrganization?: () => void;
}

export const MyVenturesView = ({ person, initiatives, organizations, people, interactions, referrals, services, actingOrgId, onAdvance, onRefresh, onSelectOrganization, onCreateOrganization }: MyVenturesProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    
    // State for modal
    const [selectedInitiative, setSelectedInitiative] = useState<Initiative | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
    const [isEditOrgModalOpen, setIsEditOrgModalOpen] = useState(false);
    const [selectedNetworkOrgId, setSelectedNetworkOrgId] = useState<string | null>(null);
    const [selectedSupportOrgId, setSelectedSupportOrgId] = useState('');
    const [supportSearch, setSupportSearch] = useState('');
    const [supportNeedFilter, setSupportNeedFilter] = useState<string>('all');
    const [supportRequestNotes, setSupportRequestNotes] = useState('');
    const [isSubmittingSupportRequest, setIsSubmittingSupportRequest] = useState(false);
    const [confirmingRefId, setConfirmingRefId] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<'grant' | 'deny' | null>(null);

    // Get ecosystem config
    const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
    const featureFlags = ecosystem?.settings?.feature_flags || {};
    const canAccessAdvancedWorkflows = featureFlags.advanced_workflows === true;
    const canAccessInitiatives = canAccessAdvancedWorkflows || featureFlags.initiatives === true;
    const canAccessTasksAdvice = canAccessAdvancedWorkflows || featureFlags.tasks_advice === true;
    const pipelines = repos.pipelines.getPipelines(viewer.ecosystemId);
    const checklists = ecosystem?.checklist_templates || [];
    const supportSearchTerm = supportSearch.trim().toLowerCase();

    // 1. Organizations (My Context)
    const activeAffiliations = useMemo(() => getActiveOrganizationAffiliations(person, viewer.ecosystemId), [person, viewer.ecosystemId]);
    const myOrg = organizations.find(o => o.id === (actingOrgId || activeAffiliations[0]?.organization_id || person.organization_id));
    const personEmailDomain = person.email.split('@')[1]?.toLowerCase() || '';
    const suggestedOrganizations = useMemo(() => {
        if (myOrg || !personEmailDomain) {
            return [];
        }
        const extractDomain = (value?: string) => {
            if (!value) return null;
            try {
                const normalized = value.startsWith('http') ? value : `https://${value}`;
                return new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
            } catch {
                return value.replace(/^www\./, '').toLowerCase();
            }
        };
        return organizations.filter((org) => {
            const orgEmailDomain = org.email?.split('@')[1]?.toLowerCase() || null;
            const orgWebsiteDomain = extractDomain(org.url);
            return orgEmailDomain === personEmailDomain || orgWebsiteDomain === personEmailDomain;
        });
    }, [myOrg, organizations, personEmailDomain]);
    
    // Identify all organizations associated with this user (Primary + Secondary)
    const userOrgs = useMemo(() => {
        const affiliationOrgIds = new Set(activeAffiliations.map((affiliation) => affiliation.organization_id));
        return organizations.filter((org) => affiliationOrgIds.has(org.id));
    }, [activeAffiliations, organizations]);
    
    // 2. Employees (Team members in my org)
    const myTeam = people.filter(p => p.id !== person.id && myOrg && (
        p.organization_id === myOrg.id ||
        p.organization_affiliations?.some(a => a.organization_id === myOrg.id && a.status !== 'revoked')
    ));

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
    const availableEsoOrgs = useMemo(() => {
        return organizations
            .filter((org) =>
                org.id !== myOrg?.id &&
                org.ecosystem_ids.includes(viewer.ecosystemId) &&
                org.roles.includes('eso')
            )
            .filter((org) => {
                if (!supportSearchTerm) return true;
                return org.name.toLowerCase().includes(supportSearchTerm)
                    || org.description.toLowerCase().includes(supportSearchTerm)
                    || org.classification.industry_tags.some((tag) => tag.toLowerCase().includes(supportSearchTerm));
            })
            .filter((org) => {
                if (supportNeedFilter === 'all') return true;
                return (org.support_offerings || []).includes(supportNeedFilter as any);
            })
            .sort((left, right) => {
                const leftManaged = myOrg?.managed_by_ids?.includes(left.id) ? 1 : 0;
                const rightManaged = myOrg?.managed_by_ids?.includes(right.id) ? 1 : 0;
                return rightManaged - leftManaged || left.name.localeCompare(right.name);
            });
    }, [organizations, myOrg, supportNeedFilter, supportSearchTerm, viewer.ecosystemId]);
    const incomingAccessRequests = referrals.filter(r => 
        r.receiving_org_id === myOrg?.id && 
        r.status === 'pending' && 
        (r.intake_type === 'access_request' || r.outcome_tags?.includes('Access Request') || r.outcome_tags?.includes('Connection Request'))
    );
    const myParticipations = useMemo(() => {
        if (!myOrg) return [];
        return services
            .filter((service) =>
                service.recipient_org_id === myOrg.id ||
                service.recipient_person_id === person.id
            )
            .sort((left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime());
    }, [myOrg, person.id, services]);
    const selectedNetworkOrg = selectedNetworkOrgId ? organizations.find((org) => org.id === selectedNetworkOrgId) || null : null;
    const networkInteractions = useMemo(() => {
        if (!myOrg || !selectedNetworkOrg) return [];
        return interactions
            .filter((interaction) => interaction.organization_id === myOrg.id && interaction.author_org_id === selectedNetworkOrg.id)
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    }, [interactions, myOrg, selectedNetworkOrg]);
    const networkContactsForSelectedOrg = useMemo(() => {
        if (!selectedNetworkOrg) return [];
        const contactNames = new Set<string>();
        networkInteractions.forEach((interaction) => {
            if (interaction.recorded_by) contactNames.add(interaction.recorded_by.split(' (')[0]);
            interaction.attendees?.forEach((attendee) => contactNames.add(attendee));
        });
        return people.filter((person) => {
            if (person.organization_id !== selectedNetworkOrg.id) return false;
            const fullName = `${person.first_name} ${person.last_name}`;
            return contactNames.has(fullName) || contactNames.has(person.first_name);
        });
    }, [networkInteractions, people, selectedNetworkOrg]);
    const networkReferrals = useMemo(() => {
        if (!myOrg || !selectedNetworkOrg) return [];
        return referrals
            .filter((referral) => referral.subject_org_id === myOrg.id)
            .filter((referral) =>
                referral.referring_org_id === selectedNetworkOrg.id ||
                referral.receiving_org_id === selectedNetworkOrg.id
            )
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    }, [myOrg, referrals, selectedNetworkOrg]);

    const [networkTab, setNetworkTab] = useState<'orgs' | 'people'>('orgs');

    const handleGrantAccess = (ref: Referral) => {
        if (!myOrg) return;
        setConfirmingRefId(ref.id);
        setConfirmAction('grant');
    };

    const handleDenyAccess = (ref: Referral) => {
        setConfirmingRefId(ref.id);
        setConfirmAction('deny');
    };

    const doGrantAccess = (ref: Referral) => {
        if (!myOrg) return;
        repos.referrals.accept(ref.id, "Access Granted via Portal");
        repos.consent.grantAccess(myOrg.id, ref.referring_org_id, 'read');
        setConfirmingRefId(null);
        setConfirmAction(null);
        onRefresh?.();
    };

    const doDenyAccess = (ref: Referral) => {
        repos.referrals.decline(ref.id, "Access Denied by User");
        setConfirmingRefId(null);
        setConfirmAction(null);
        onRefresh?.();
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

    const handleSaveOrganizationProfile = (updates: Partial<Organization>) => {
        if (!myOrg) return;
        repos.organizations.update(myOrg.id, updates);
        onRefresh?.();
    };

    const handleRequestSupport = async () => {
        if (!myOrg || !selectedSupportOrgId || !supportRequestNotes.trim()) {
            return;
        }
        setIsSubmittingSupportRequest(true);
        try {
            await repos.referrals.add({
                id: `ref_${Date.now()}`,
                ecosystem_id: viewer.ecosystemId,
                referring_org_id: myOrg.id,
                receiving_org_id: selectedSupportOrgId,
                subject_person_id: person.id,
                subject_org_id: myOrg.id,
                date: new Date().toISOString(),
                status: 'pending',
                intake_type: 'self_introduction',
                notes: supportRequestNotes.trim(),
                source: 'manual_ui'
            } as Referral);
            setSelectedSupportOrgId('');
            setSupportSearch('');
            setSupportRequestNotes('');
            onRefresh?.();
        } finally {
            setIsSubmittingSupportRequest(false);
        }
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

    const getCaseTypeLabel = (ref: Referral) => {
        if (ref.intake_type === 'self_introduction') return 'Self-introduction';
        if (ref.intake_type === 'access_request') return 'Access request';
        return 'Partner referral';
    };

    const getCaseStatusLabel = (ref: Referral) => {
        if (ref.status === 'pending') {
            if (ref.owner_id) return 'assigned for review';
            return 'awaiting intake review';
        }
        if (ref.status === 'accepted') return 'accepted / in progress';
        if (ref.status === 'rejected') return 'closed without match';
        return 'completed';
    };

    const getCaseStatusColor = (ref: Referral) => {
        if (ref.status === 'pending') return 'yellow' as const;
        if (ref.status === 'accepted') return 'green' as const;
        if (ref.status === 'rejected') return 'red' as const;
        return 'blue' as const;
    };

    const getCaseTimeline = (ref: Referral) => {
        const entries: { label: string; timestamp?: string }[] = [];
        const senderName = organizations.find(o => o.id === ref.referring_org_id)?.name || 'Partner';
        const receiverName = organizations.find(o => o.id === ref.receiving_org_id)?.name || 'Partner';
        entries.push({
            label: `${senderName} sent ${myOrg?.name || 'your business'} to ${receiverName}`,
            timestamp: ref.date || ref.delivered_at,
        });
        if (ref.accepted_at) {
            entries.push({
                label: `${receiverName} accepted this case`,
                timestamp: ref.accepted_at,
            });
        }
        if (ref.owner_id) {
            const owner = people.find(p => p.id === ref.owner_id);
            entries.push({
                label: owner ? `Assigned to ${owner.first_name} ${owner.last_name}` : 'Assigned to a receiving staff member',
                timestamp: ref.accepted_at || ref.delivered_at || ref.date,
            });
        }
        if (ref.follow_up_date) {
            entries.push({
                label: `Next follow-up scheduled for ${new Date(ref.follow_up_date).toLocaleDateString()}`,
                timestamp: ref.follow_up_date,
            });
        }
        if (ref.closed_at) {
            entries.push({
                label: ref.status === 'completed' ? 'Support case completed' : 'Support case closed',
                timestamp: ref.closed_at,
            });
        }
        return entries;
    };

    const formatParticipationWindow = (service: Service) => {
        const start = new Date(service.start_date).toLocaleDateString();
        if (!service.end_date) {
            return `${start} - ongoing`;
        }
        return `${start} - ${new Date(service.end_date).toLocaleDateString()}`;
    };

    const getParticipationStatusLabel = (service: Service) => {
        if (service.status === 'applied') return 'Application submitted';
        if (service.status === 'waitlisted') return 'Waitlisted';
        if (service.status === 'past') return 'Completed / past';
        return 'Active';
    };

    const getParticipationStatusColor = (service: Service) => {
        if (service.status === 'applied') return 'blue' as const;
        if (service.status === 'waitlisted') return 'yellow' as const;
        if (service.status === 'past') return 'gray' as const;
        return 'green' as const;
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Client Portal</h2>
            <div className="bg-indigo-900 text-white p-6 rounded-lg shadow-lg flex items-center justify-between">
                 <div>
                    <h3 className="text-xl font-bold">Welcome back, {person.first_name}!</h3>
                    <p className="text-indigo-200 mt-2">Manage your organization, team, and ecosystem support.</p>
                 </div>
                 <Avatar src={person.avatar_url} name={person.first_name} size="lg" className="border-4 border-indigo-800" enlargeable />
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
                                    <button
                                        type="button"
                                        onClick={() => setIsEditOrgModalOpen(true)}
                                        className="text-gray-500 hover:text-gray-800"
                                    >
                                        Manage business profile
                                    </button>
                                    {onCreateOrganization && (
                                        <button
                                            type="button"
                                            onClick={onCreateOrganization}
                                            className="text-gray-500 hover:text-gray-800"
                                        >
                                            Add another business
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-gray-600">This account does not have a primary organization linked yet.</p>
                                {suggestedOrganizations.length > 0 ? (
                                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                                        <div className="text-sm font-semibold text-indigo-900">Suggested organization matches</div>
                                        <p className="mt-1 text-sm text-indigo-800">
                                            We found organizations in this ecosystem that match your email domain <strong>{personEmailDomain}</strong>.
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {suggestedOrganizations.map((org) => (
                                                <div key={org.id} className="flex items-center justify-between rounded border border-indigo-100 bg-white px-3 py-2">
                                                    <div>
                                                        <div className="font-medium text-gray-900">{org.name}</div>
                                                        <div className="text-xs text-gray-500">{org.url || org.email || 'No domain on file'}</div>
                                                    </div>
                                                    {onSelectOrganization && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectOrganization(org.id)}
                                                            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                                                        >
                                                            Review organization
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        No matching organization was found from your email domain. You can create a new organization profile to get started.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                    {onCreateOrganization && (
                                        <button
                                            type="button"
                                            onClick={onCreateOrganization}
                                            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                        >
                                            Create organization profile
                                        </button>
                                    )}
                                    <span className="self-center text-sm text-gray-500">
                                        Once linked, your business profile, initiatives, and team tools will unlock here.
                                    </span>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* 2. Initiatives */}
                    {canAccessInitiatives && (
                    <Card title="Initiatives (Active Projects)">
                        {!myOrg ? (
                            <p className="text-gray-500 text-sm italic">Link or create an organization before starting initiatives.</p>
                        ) : myInitiatives.length === 0 ? (
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
                    )}

                    <Card title="Request Support">
                        {!myOrg ? (
                            <div className="space-y-3">
                                <p className="text-gray-600 text-sm">
                                    Create or link your business profile before you introduce your company to an ESO.
                                </p>
                                <p className="text-sm text-gray-500">
                                    Once your organization is linked, you can choose from the ecosystem’s entrepreneur support organizations and send a short self-introduction.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="font-medium text-gray-900">Find support from ecosystem partners</div>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Open the support finder to browse ESOs, see recommended partners, and send a self-introduction.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsSupportModalOpen(true)}
                                    className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                >
                                    Open support finder
                                </button>
                            </div>
                        )}
                    </Card>

                    {/* 3. Employees */}
                    <Card title="Employees">
                        {!myOrg ? (
                            <p className="text-gray-500 text-sm italic">Link or create an organization before inviting team members.</p>
                        ) : myTeam.length === 0 ? (
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
                        {myOrg && (
                            <div className="mt-4 pt-3 border-t border-gray-100">
                                <div className="text-sm text-gray-500">
                                    Team invitations are not enabled in the entrepreneur portal yet.
                                </div>
                            </div>
                        )}
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
                                        {confirmingRefId === req.id ? (
                                            <div className="mt-2 text-xs text-gray-700">
                                                Confirm {confirmAction === 'grant' ? 'grant' : 'deny'} access from <strong>{organizations.find(o => o.id === req.referring_org_id)?.name}</strong>?{' '}
                                                <button
                                                    onClick={() => confirmAction === 'grant' ? doGrantAccess(req) : doDenyAccess(req)}
                                                    className="font-bold underline text-amber-700 mr-2"
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    onClick={() => { setConfirmingRefId(null); setConfirmAction(null); }}
                                                    className="text-gray-500 underline"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
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
                                        )}
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
                                            <button
                                                key={org.id}
                                                type="button"
                                                onClick={() => setSelectedNetworkOrgId(org.id)}
                                                className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center justify-center sm:justify-between text-left hover:bg-white transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <CompanyLogo src={org.logo_url} name={org.name} size="sm" />
                                                    <div>
                                                        <div className="font-medium text-indigo-700 text-sm hover:underline">{org.name}</div>
                                                        {count > 0 && <div className="text-[10px] text-gray-500">{count} interactions</div>}
                                                    </div>
                                                </div>
                                                {myOrg?.managed_by_ids?.includes(org.id) && <Badge color="green">Manager</Badge>}
                                            </button>
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

                    <Card title="Support Cases">
                         {myReferrals.length === 0 ? (
                             <p className="text-gray-500 text-sm">No support cases yet.</p>
                         ) : (
                             <div className="space-y-3">
                                 {myReferrals.map(ref => {
                                     const receivingOrg = organizations.find(o => o.id === ref.receiving_org_id);
                                     const referringOrg = organizations.find(o => o.id === ref.referring_org_id);
                                     const timeline = getCaseTimeline(ref);
                                     return (
                                     <div key={ref.id} className="p-3 border border-gray-200 rounded-lg">
                                         <div className="flex items-start justify-between gap-3">
                                             <div>
                                                 <div className="text-xs text-gray-500 mb-1">{new Date(ref.date).toLocaleString()}</div>
                                                 <div className="font-medium text-sm text-gray-900">
                                                     {referringOrg?.name || 'Partner'} → {receivingOrg?.name || 'Partner'}
                                                 </div>
                                                 <div className="mt-1 text-xs text-gray-500">
                                                     {getCaseTypeLabel(ref)}
                                                 </div>
                                             </div>
                                             <Badge color={getCaseStatusColor(ref)}>
                                                 {getCaseStatusLabel(ref)}
                                             </Badge>
                                         </div>
                                         <p className="mt-3 text-sm text-gray-600">{ref.notes}</p>
                                         <div className="mt-3 rounded border border-gray-100 bg-gray-50 px-3 py-2">
                                             <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tracking</div>
                                             <div className="mt-2 space-y-2">
                                                 {timeline.map((entry, index) => (
                                                     <div key={`${ref.id}_timeline_${index}`} className="text-sm text-gray-700">
                                                         <div>{entry.label}</div>
                                                         {entry.timestamp && (
                                                             <div className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</div>
                                                         )}
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                         {ref.response_notes && (
                                             <div className="mt-3 text-sm text-gray-600">
                                                 <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest Response</div>
                                                 <p className="mt-1">{ref.response_notes}</p>
                                             </div>
                                         )}
                                     </div>
                                     );
                                 })}
                             </div>
                         )}
                    </Card>

                    {myParticipations.length > 0 && (
                    <Card title="Participation">
                        <div className="space-y-3">
                            {myParticipations.map((service) => {
                                const provider = organizations.find((org) => org.id === service.provider_org_id);
                                return (
                                    <div key={service.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{service.name}</div>
                                                <div className="mt-1 text-xs text-gray-500">
                                                    {ENUMS.ServiceParticipationType?.find(o => o.id === service.participation_type)?.label ?? service.participation_type?.replace(/_/g, ' ') ?? 'program'} with {provider?.name || 'Partner organization'}
                                                </div>
                                            </div>
                                            <Badge color={getParticipationStatusColor(service)}>
                                                {getParticipationStatusLabel(service)}
                                            </Badge>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-500">{formatParticipationWindow(service)}</div>
                                        {service.description && (
                                            <div className="mt-2 text-sm text-gray-600">{service.description}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                    )}

                    {canAccessTasksAdvice && (ecosystem?.portal_links?.length || 0) > 0 && (
                    <Card title="Resources">
                        <div className="space-y-2">
                            {ecosystem?.portal_links?.map(link => (
                                <DemoLink key={link.id} href={link.url} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 group transition-colors">
                                    <span className="text-xl grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">{link.icon}</span>
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600">{link.label}</span>
                                </DemoLink>
                            ))}
                        </div>
                    </Card>
                    )}
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

            {myOrg && (
                <EditOrgModal
                    org={myOrg}
                    isOpen={isEditOrgModalOpen}
                    onClose={() => setIsEditOrgModalOpen(false)}
                    onSave={handleSaveOrganizationProfile}
                />
            )}

            <Modal
                isOpen={!!selectedNetworkOrg}
                onClose={() => setSelectedNetworkOrgId(null)}
                title={selectedNetworkOrg ? `${selectedNetworkOrg.name} Relationship History` : 'Relationship History'}
            >
                {selectedNetworkOrg && (
                    <div className="space-y-5">
                        <div className="rounded border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center gap-3">
                                <CompanyLogo src={selectedNetworkOrg.logo_url} name={selectedNetworkOrg.name} size="sm" />
                                <div>
                                    <div className="font-semibold text-gray-900">{selectedNetworkOrg.name}</div>
                                    <div className="text-sm text-gray-500">{selectedNetworkOrg.description}</div>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedNetworkOrg.org_type && <Badge key="type" color="blue">{selectedNetworkOrg.org_type.replace(/_/g, ' ')}</Badge>}
                                {selectedNetworkOrg.roles.map((role) => (
                                    <Badge key={role} color="indigo">{role}</Badge>
                                ))}
                                {myOrg?.managed_by_ids?.includes(selectedNetworkOrg.id) && <Badge color="green">Manager</Badge>}
                            </div>
                            <div className="mt-3 flex gap-3 text-sm">
                                {onSelectOrganization && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelectOrganization(selectedNetworkOrg.id);
                                            setSelectedNetworkOrgId(null);
                                        }}
                                        className="text-indigo-600 hover:underline"
                                    >
                                        Open organization profile
                                    </button>
                                )}
                                {selectedNetworkOrg.url && (
                                    <DemoLink href={selectedNetworkOrg.url} className="text-indigo-600 hover:underline">
                                        Website
                                    </DemoLink>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-semibold text-gray-900">Shared interaction history</div>
                            {networkInteractions.length === 0 ? (
                                <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                    No shared interactions with this organization yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {networkInteractions.map((interaction) => (
                                        <div key={interaction.id} className="rounded border border-gray-200 bg-white p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-medium text-gray-900">{interaction.type}</div>
                                                <div className="text-xs text-gray-500">{new Date(interaction.date).toLocaleString()}</div>
                                            </div>
                                            <div className="mt-2 text-sm text-gray-600">{interaction.notes}</div>
                                            {(interaction.recorded_by || interaction.attendees?.length) && (
                                                <div className="mt-2 text-xs text-gray-500">
                                                    {interaction.recorded_by && <span>Recorded by {interaction.recorded_by}</span>}
                                                    {interaction.recorded_by && interaction.attendees?.length ? ' · ' : ''}
                                                    {interaction.attendees?.length ? <span>Attendees: {interaction.attendees.join(', ')}</span> : null}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-semibold text-gray-900">Known contacts at this organization</div>
                            {networkContactsForSelectedOrg.length === 0 ? (
                                <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                    No specific contacts have been captured from shared interactions yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {networkContactsForSelectedOrg.map((contact) => (
                                        <div key={contact.id} className="flex items-center gap-3 rounded border border-gray-200 bg-white p-3">
                                            <Avatar src={contact.avatar_url} name={`${contact.first_name} ${contact.last_name}`} size="sm" />
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{contact.first_name} {contact.last_name}</div>
                                                <div className="text-xs text-gray-500">{contact.role}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-semibold text-gray-900">Support cases and referrals</div>
                            {networkReferrals.length === 0 ? (
                                <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                    No support cases involving {selectedNetworkOrg.name} have been tracked for {myOrg?.name || 'this business'} yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {networkReferrals.map((referral) => {
                                        const counterpartRole = referral.receiving_org_id === selectedNetworkOrg.id ? 'Receiving organization' : 'Referring organization';
                                        return (
                                            <div key={referral.id} className="rounded border border-gray-200 bg-white p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{getCaseTypeLabel(referral)}</div>
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            {counterpartRole} · {new Date(referral.date).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <Badge color={getCaseStatusColor(referral)}>
                                                        {getCaseStatusLabel(referral)}
                                                    </Badge>
                                                </div>
                                                <p className="mt-2 text-sm text-gray-600">{referral.notes}</p>
                                                {referral.response_notes && (
                                                    <div className="mt-2 text-xs text-gray-500">
                                                        Latest response: {referral.response_notes}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} title="Request Support">
                {!myOrg ? (
                    <div className="space-y-3 text-sm text-gray-600">
                        <p>Create or link your business profile before sending a self-introduction to an ESO.</p>
                        <p>Once your organization is linked, this tool will help you match with support organizations in your ecosystem.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Find a support organization
                            </label>
                            <input
                                type="text"
                                value={supportSearch}
                                onChange={(event) => setSupportSearch(event.target.value)}
                                placeholder="Search ESOs by name, focus, or description"
                                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Filter by support type
                            </label>
                            <select
                                value={supportNeedFilter}
                                onChange={(event) => setSupportNeedFilter(event.target.value)}
                                className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                            >
                                <option value="all">All support types</option>
                                {ENUMS.SupportNeed.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {availableEsoOrgs.map((org) => {
                                const isSelected = selectedSupportOrgId === org.id;
                                const isRecommended = myOrg.managed_by_ids?.includes(org.id);
                                return (
                                    <button
                                        key={org.id}
                                        type="button"
                                        onClick={() => setSelectedSupportOrgId(org.id)}
                                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                            isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="font-medium text-gray-900">{org.name}</div>
                                                <div className="mt-1 text-sm text-gray-600 line-clamp-2">{org.description}</div>
                                            </div>
                                            {isRecommended && <Badge color="green">Recommended</Badge>}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {(org.support_offerings || []).slice(0, 3).map((offering) => (
                                                <span key={offering} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100">
                                                    {ENUMS.SupportNeed?.find(o => o.id === offering)?.label ?? offering.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {org.classification.industry_tags.slice(0, 2).map((tag) => (
                                                <span key={tag} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded border border-gray-200">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                            {onSelectOrganization && (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectOrganization(org.id);
                                                        setIsSupportModalOpen(false);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        onSelectOrganization(org.id);
                                                        setIsSupportModalOpen(false);
                                                    }}
                                                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                                                >
                                                    View profile
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                            {availableEsoOrgs.length === 0 && (
                                <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                    No support organizations match your search yet.
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Self-introduction
                            </label>
                            <textarea
                                value={supportRequestNotes}
                                onChange={(event) => setSupportRequestNotes(event.target.value)}
                                placeholder="Explain what your business does, what kind of support you need, and any urgency or context."
                                rows={5}
                                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <p className="text-xs text-gray-500">
                                This sends a self-introduction to the selected ESO. It is tracked separately from a third-party referral, even though it uses the same intake record type behind the scenes.
                            </p>
                            <button
                                type="button"
                                onClick={() => void handleRequestSupport()}
                                disabled={!selectedSupportOrgId || !supportRequestNotes.trim() || isSubmittingSupportRequest}
                                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmittingSupportRequest ? 'Sending...' : 'Send self-introduction'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
