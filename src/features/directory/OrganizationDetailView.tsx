
import React, { useState, useEffect } from 'react';
import { Organization, Person, Initiative, Interaction, Referral, Service } from '../../domain/types';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, CompanyLogo, InfoBanner, Modal, FORM_TEXTAREA_CLASS, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { METRIC_SETS } from '../../domain/metrics/reporting_config';
import { MetricAssignment } from '../../domain/metrics/reporting_types';
import { viewerHasCapability, canViewOperationalDetails } from '../../domain/access/policy';
import { RESTRICTED_INITIATIVE_NAME, REDACTED_TEXT } from '../../domain/access/redaction';
import { EditOrgModal, ManagePersonModal } from './OrgModals';
import { CreateReferralModal } from '../referrals/CreateReferralModal';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';

interface OrganizationDetailViewProps {
    org: Organization;
    organizations: Organization[];
    people: Person[];
    initiatives: Initiative[];
    interactions: Interaction[];
    referrals: Referral[];
    services: Service[];
    onBack: () => void;
    onRefresh?: () => void;
    initialTab?: string;
    onTabChange?: (tab: string) => void;
    onSelectPerson?: (id: string) => void;
    onSelectOrganization?: (id: string, tab?: string) => void;
    onNavigateToReferrals?: () => void;
}

export const OrganizationDetailView = ({ 
    org, 
    organizations, 
    people, 
    initiatives, 
    interactions, 
    referrals, 
    services,
    onBack,
    onRefresh,
    initialTab,
    onTabChange,
    onSelectPerson,
    onSelectOrganization,
    onNavigateToReferrals,
}: OrganizationDetailViewProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [activeTab, setActiveTab] = useState(initialTab || 'overview');
    const [showAllEvents, setShowAllEvents] = useState(false);
    const [showPrivacyHelp, setShowPrivacyHelp] = useState(false);
    const [isUpdatingReferral, setIsUpdatingReferral] = useState<string | null>(null);
    const [showCreateReferral, setShowCreateReferral] = useState(false);
    const [referralJustCreated, setReferralJustCreated] = useState(false);
    const [selectedPartnerOrgId, setSelectedPartnerOrgId] = useState('');
    const [selectedAccessLevel, setSelectedAccessLevel] = useState<'read' | 'write' | 'admin'>('read');
    const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
    const [editAffiliationPerson, setEditAffiliationPerson] = useState<{ id: string; name: string; roleTitle: string; relationshipType: string; status: string } | null>(null);
    const [isEditOrgOpen, setIsEditOrgOpen] = useState(false);
    const [isSupportRequestOpen, setIsSupportRequestOpen] = useState(false);
    const [supportRequestNotes, setSupportRequestNotes] = useState('');
    const [isSubmittingSupportRequest, setIsSubmittingSupportRequest] = useState(false);
    const [dataRequestMsg, setDataRequestMsg] = useState('');
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
    const [accessRequestSent, setAccessRequestSent] = useState(false);
    const [orgTemplateDrafts, setOrgTemplateDrafts] = useState<Array<{id: string; name: string; subject?: string; body: string}>>(org.referral_templates || []);
    const [isSavingOrgTemplates, setIsSavingOrgTemplates] = useState(false);
    const [orgTemplatesSavedAt, setOrgTemplatesSavedAt] = useState<number | null>(null);
    const [pendingAction, setPendingAction] = useState<'remove_ecosystem' | 'archive' | 'delete' | null>(null);
    useEffect(() => { setOrgTemplateDrafts(org.referral_templates || []); }, [org.referral_templates]);

    React.useEffect(() => {
        if (initialTab && initialTab !== activeTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const isFounderLikeRole = (role?: string) => {
        const normalized = (role || '').toLowerCase();
        return normalized.includes('founder')
            || normalized.includes('owner')
            || normalized.includes('ceo')
            || normalized.includes('president')
            || normalized.includes('executive director');
    };

    const orgPeople = people.filter(p =>
      p.organization_id === org.id ||
      p.organization_affiliations?.some(a => a.organization_id === org.id && a.status !== 'revoked')
    );
    const orgInitiatives = initiatives.filter(i => i.organization_id === org.id);
    const orgInteractions = interactions.filter(i => i.organization_id === org.id);
    const orgReferrals = referrals.filter(r => r.referring_org_id === org.id || r.receiving_org_id === org.id || r.subject_org_id === org.id);
    const orgParticipations = services
        .filter((service) => service.recipient_org_id === org.id)
        .sort((left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime());
    const viewerOrgMembership = orgPeople.find((person) => person.id === viewer.personId);
    const isOrgOwner = !!viewerOrgMembership && (viewer.role === 'entrepreneur' || isFounderLikeRole(viewerOrgMembership.role));
    const isOwnOrganization = viewer.orgId === org.id || isOrgOwner;
    const isEntrepreneurViewer = viewer.role === 'entrepreneur';
    const ecosystem = ALL_ECOSYSTEMS.find((candidate) => candidate.id === viewer.ecosystemId);
    const featureFlags = ecosystem?.settings?.feature_flags || {};
    const canAccessAdvancedWorkflows = featureFlags.advanced_workflows === true;
    const canAccessInitiatives = canAccessAdvancedWorkflows || featureFlags.initiatives === true;
    const canAccessMetrics = canAccessAdvancedWorkflows || featureFlags.dashboard === true || featureFlags.metrics_manager === true;
    const canRequestSupport = isEntrepreneurViewer && org.roles.includes('eso') && !isOwnOrganization;
    const actingOrganization = organizations.find((candidate) => candidate.id === viewer.orgId) || null;

    React.useEffect(() => {
        if (activeTab === 'metrics' && !canAccessMetrics) {
            setActiveTab('overview');
            onTabChange?.('overview');
        }
        if (activeTab === 'initiatives' && !canAccessInitiatives) {
            setActiveTab('overview');
            onTabChange?.('overview');
        }
    }, [activeTab, canAccessInitiatives, canAccessMetrics, onTabChange]);

    // Metrics Data
    const canRequestUpdate = viewerHasCapability(viewer, 'metrics.assign_request');
    const metricSetId = METRIC_SETS[0].id; // Default to first set 'set_org_overview'
    
    const metricReport = repos.flexibleMetrics.getReport(metricSetId, {
        scope_type: 'organization',
        scope_id: org.id
    });

    // Privacy Data
    const activePolicies = repos.consent.getPoliciesForEntity(org.id);
    const consentEvents = repos.consent.getEventsForEntity(org.id);
    const visibleEvents = showAllEvents ? consentEvents : consentEvents.slice(0, 10);
    const isManageable = isOwnOrganization || viewer.role === 'platform_admin' || viewer.role === 'ecosystem_manager';
    const availablePartnerOrgs = organizations.filter((candidate) =>
        candidate.id !== org.id &&
        candidate.ecosystem_ids.includes(viewer.ecosystemId) &&
        candidate.roles.includes('eso') &&
        !activePolicies.some((policy) => policy.viewerId === candidate.id)
    );

    // Access Control Check
    const hasConsent = repos.consent.hasOperationalAccess(viewer.orgId, org.id);
    const canViewDetails = isOwnOrganization || canViewOperationalDetails(viewer, org, hasConsent);

    // Restricted View Logic for People
    const isRestricted = !canViewDetails;
    const visiblePeople = isRestricted 
        ? orgPeople.filter(p => {
            return isFounderLikeRole(p.role);
        })
        : orgPeople;
    const hiddenPeopleCount = orgPeople.length - visiblePeople.length;

    // Check for pending access request
    const pendingRequest = orgReferrals.find(r => 
        r.referring_org_id === viewer.orgId && 
        r.receiving_org_id === org.id && 
        r.status === 'pending' &&
        r.outcome_tags?.includes('Access Request')
    );
    const canManageIncomingReferral = (ref: Referral) => canViewDetails && ref.receiving_org_id === viewer.orgId;
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

    const isPlatformAdmin = viewer.role === 'platform_admin';
    const isEcosystemAdmin = viewer.role === 'ecosystem_manager' || viewer.role === 'eso_admin';

    const handleConfirmAction = async () => {
        if (!pendingAction) return;
        if (pendingAction === 'remove_ecosystem') {
            const updatedIds = (org.ecosystem_ids || []).filter(id => id !== viewer.ecosystemId);
            const removedIds = [...(org.removed_from_ecosystem_ids || []), viewer.ecosystemId];
            await repos.organizations.update(org.id, { ecosystem_ids: updatedIds, removed_from_ecosystem_ids: removedIds });
        } else if (pendingAction === 'archive') {
            await repos.organizations.update(org.id, { status: 'archived' });
        } else if (pendingAction === 'delete') {
            await repos.organizations.delete(org.id);
        }
        setPendingAction(null);
        onRefresh?.();
        onBack();
    };

    const updateReferralStatus = async (ref: Referral, action: 'accept' | 'complete') => {
        setIsUpdatingReferral(ref.id);
        try {
            if (action === 'accept') {
                await repos.referrals.accept(ref.id, 'Accepted from organization detail view');
            } else {
                await repos.referrals.close(ref.id, 'service_delivered', [], 'Completed from organization detail view');
            }
            onRefresh?.();
        } finally {
            setIsUpdatingReferral(null);
        }
    };

    const handleAssignUpdate = () => {
        const assignment: MetricAssignment = {
            id: `assign_${Date.now()}`,
            metric_set_id: metricSetId,
            ecosystem_id: viewer.ecosystemId,
            scope_type: 'organization',
            scope_id: org.id,
            assigned_by_id: viewer.personId,
            assigned_at: new Date().toISOString(),
            status: 'pending',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        };
        repos.flexibleMetrics.createAssignment(assignment);
        setDataRequestMsg('Data update request sent to organization admins.');
        setTimeout(() => setDataRequestMsg(''), 3000);
    };

    const handleToggleVisibility = () => {
        if (!isManageable) return;
        const newVisibility = org.operational_visibility === 'open' ? 'restricted' : 'open';
        repos.organizations.update(org.id, { operational_visibility: newVisibility });
        if (onRefresh) onRefresh();
    };

    const handleRevokeConsent = (policyId: string) => {
        if (!isManageable) return;
        setConfirmRevokeId(policyId);
    };

    const doRevokeConsent = (policyId: string) => {
        const policy = activePolicies.find(p => p.id === policyId);
        if (policy) {
            policy.isActive = false;
            repos.consent.logEvent({
                id: `evt_revoke_${Date.now()}`,
                timestamp: new Date().toISOString(),
                actorId: viewer.personId,
                action: 'revoked',
                resourceId: org.id,
                viewerId: policy.viewerId,
                reason: 'User revoked via Privacy Dashboard'
            });
            if (onRefresh) onRefresh();
        }
        setConfirmRevokeId(null);
    };

    const handleGrantConsent = () => {
        if (!isManageable || !selectedPartnerOrgId) return;
        repos.consent.grantAccess(org.id, selectedPartnerOrgId, selectedAccessLevel);
        setSelectedPartnerOrgId('');
        setSelectedAccessLevel('read');
        onRefresh?.();
    };

    const handleSaveOrgProfile = async (updates: Partial<Organization>) => {
        await repos.organizations.update(org.id, updates);
        onRefresh?.();
    };

    const handleLinkPerson = async (personId: string, roleTitle: string, relationshipType: string) => {
        const target = people.find(p => p.id === personId);
        if (!target) return;
        type RelType = 'founder' | 'owner' | 'employee' | 'advisor' | 'board' | 'other';
        const existingAffiliations = target.organization_affiliations || [];
        const alreadyLinked = existingAffiliations.some(a => a.organization_id === org.id);
        if (alreadyLinked) return;
        await repos.people.update(personId, {
            organization_affiliations: [
                ...existingAffiliations,
                {
                    organization_id: org.id,
                    role_title: roleTitle || null,
                    relationship_type: ((relationshipType || 'employee') as RelType),
                    status: 'active' as const,
                    can_self_manage: false,
                },
            ],
        });
        onRefresh?.();
    };

    const handleUpdateAffiliation = async (personId: string, updates: { role_title: string; relationship_type: string; status: string }) => {
        const target = people.find(p => p.id === personId);
        if (!target) return;
        type RelType = 'founder' | 'owner' | 'employee' | 'advisor' | 'board' | 'other';
        type StatusType = 'active' | 'pending' | 'revoked';
        const relType = (updates.relationship_type as RelType) || 'employee';
        const statusType = (updates.status as StatusType) || 'active';
        const existingAffiliations = target.organization_affiliations || [];
        const hasAffiliation = existingAffiliations.some(a => a.organization_id === org.id);
        const updatedAffiliations = hasAffiliation
            ? existingAffiliations.map(a =>
                a.organization_id === org.id
                    ? { ...a, role_title: updates.role_title || null, relationship_type: relType, status: statusType }
                    : a
              )
            : [...existingAffiliations, { organization_id: org.id, role_title: updates.role_title || null, relationship_type: relType, status: statusType, can_self_manage: false }];
        await repos.people.update(personId, { organization_affiliations: updatedAffiliations });
        onRefresh?.();
    };

    const handleAddPerson = async (personUpdates: Partial<Person>) => {
        const id = personUpdates.id || `person_${Date.now()}`;
        await repos.people.add({
            id,
            first_name: personUpdates.first_name || '',
            last_name: personUpdates.last_name || '',
            email: personUpdates.email || '',
            avatar_url: personUpdates.avatar_url,
            role: personUpdates.role || '',
            system_role: personUpdates.system_role || 'entrepreneur',
            organization_id: org.id,
            ecosystem_id: viewer.ecosystemId,
            tags: personUpdates.tags || [],
            external_refs: personUpdates.external_refs || [],
            links: personUpdates.links || [],
            memberships: personUpdates.memberships || [],
            secondary_profile: personUpdates.secondary_profile,
        } as Person);
        onRefresh?.();
    };

    const handleRequestAccess = () => {
        if (isOwnOrganization) {
            return;
        }
        const viewerOrgName = organizations.find(o => o.id === viewer.orgId)?.name || 'Partner Org';
        repos.referrals.add({
            id: `ref_access_${Date.now()}`,
            referring_org_id: viewer.orgId,
            receiving_org_id: org.id,
            subject_person_id: viewer.personId,
            subject_org_id: viewer.orgId,
            date: new Date().toISOString().split('T')[0],
            status: 'pending',
            intake_type: 'access_request',
            notes: `Access Request from ${viewerOrgName}`,
            outcome_tags: ['Access Request']
        });
        setAccessRequestSent(true);
        setTimeout(() => setAccessRequestSent(false), 3000);
        if (onRefresh) onRefresh();
    };

    const handleRequestSupport = async () => {
        if (!actingOrganization || !supportRequestNotes.trim()) {
            return;
        }

        setIsSubmittingSupportRequest(true);
        try {
            await repos.referrals.add({
                id: `ref_support_${Date.now()}`,
                ecosystem_id: viewer.ecosystemId,
                referring_org_id: actingOrganization.id,
                receiving_org_id: org.id,
                subject_person_id: viewer.personId,
                subject_org_id: actingOrganization.id,
                date: new Date().toISOString(),
                status: 'pending',
                intake_type: 'self_introduction',
                notes: supportRequestNotes.trim(),
                source: 'manual_ui',
            } as Referral);
            setSupportRequestNotes('');
            setIsSupportRequestOpen(false);
            onRefresh?.();
        } finally {
            setIsSubmittingSupportRequest(false);
        }
    };

    return (
        <div className="space-y-6">
           {/* Header */}
           <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">
                   <span className="sr-only">Back</span>
                   ←
                </button>
                <CompanyLogo src={org.logo_url} name={org.name} size="lg" enlargeable />
                <div>
                   <h1 className="text-2xl font-bold text-gray-900 leading-none">{org.name}</h1>
                   <div className="flex items-center gap-2 mt-2 flex-wrap">
                     {org.alternate_name && <span className="text-sm text-gray-500 mr-2">aka {org.alternate_name}</span>}
                     <Badge color={org.operational_visibility === 'open' ? 'green' : 'red'}>{org.operational_visibility === 'open' ? 'Network Visible' : 'Restricted'}</Badge>
                     {org.roles.map(r => <Badge key={r} color="gray">{r}</Badge>)}
                     {org.verified && <Badge color="blue">Verified</Badge>}
                   </div>
                </div>
              </div>
              <div className="flex gap-2">
                 {canRequestSupport && (
                     <button
                        onClick={() => setIsSupportRequestOpen(true)}
                        className="px-4 py-2 border border-indigo-300 bg-white text-indigo-700 text-sm font-medium rounded hover:bg-indigo-50 shadow-sm"
                     >
                        Request Support
                     </button>
                 )}
                 {isManageable && (
                     <>
                         <button
                            onClick={() => setIsEditOrgOpen(true)}
                            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded hover:bg-gray-50"
                         >
                            Edit Profile
                         </button>
                         <button
                            onClick={() => {
                                setActiveTab('privacy');
                                onTabChange?.('privacy');
                            }}
                            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded hover:bg-gray-50"
                         >
                            Privacy Settings
                         </button>
                     </>
                 )}
                 {(isPlatformAdmin || isEcosystemAdmin) && (
                    <div className="flex gap-2 border-l border-gray-200 pl-2 ml-1">
                        {isEcosystemAdmin && !isPlatformAdmin && (
                            <button
                                onClick={() => setPendingAction('remove_ecosystem')}
                                className="px-3 py-2 border border-orange-200 bg-white text-orange-600 text-xs font-medium rounded hover:bg-orange-50"
                                title="Remove this organization from your ecosystem only"
                            >
                                Remove from Ecosystem
                            </button>
                        )}
                        {isPlatformAdmin && (
                            <>
                                <button
                                    onClick={() => setPendingAction('archive')}
                                    className="px-3 py-2 border border-orange-200 bg-white text-orange-600 text-xs font-medium rounded hover:bg-orange-50"
                                >
                                    Archive
                                </button>
                                <button
                                    onClick={() => setPendingAction('delete')}
                                    className="px-3 py-2 border border-red-200 bg-white text-red-600 text-xs font-medium rounded hover:bg-red-50"
                                >
                                    Delete
                                </button>
                            </>
                        )}
                    </div>
                 )}
                 {!canViewDetails && !isOwnOrganization && (
                     <>
                         <button
                            onClick={handleRequestAccess}
                            disabled={!!pendingRequest}
                            className={`px-4 py-2 border text-sm font-medium rounded transition-colors ${pendingRequest ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50 shadow-sm'}`}
                         >
                            {pendingRequest ? 'Request Pending' : 'Request Access'}
                         </button>
                         {accessRequestSent && <p className="text-sm text-green-600">Access request sent.</p>}
                     </>
                 )}
                 {canViewDetails && !isEntrepreneurViewer && (
                     <button
                        onClick={() => setActiveTab('interactions')}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                     >
                        View Interactions
                     </button>
                 )}
              </div>
           </div>

           {/* Inline confirmation banner */}
           {pendingAction && (
               <div className={`rounded-lg border px-5 py-4 flex items-center justify-between gap-4 ${pendingAction === 'delete' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                   <div>
                       <p className={`font-medium text-sm ${pendingAction === 'delete' ? 'text-red-800' : 'text-orange-800'}`}>
                           {pendingAction === 'remove_ecosystem' && `Remove "${org.name}" from this ecosystem? It will remain in any other ecosystems it belongs to.`}
                           {pendingAction === 'archive' && `Archive "${org.name}"? It will be hidden from all directories but the record is preserved.`}
                           {pendingAction === 'delete' && `Permanently delete "${org.name}"? This cannot be undone.`}
                       </p>
                   </div>
                   <div className="flex gap-2 flex-shrink-0">
                       <button
                           onClick={() => setPendingAction(null)}
                           className="px-3 py-1.5 text-sm border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50"
                       >
                           Cancel
                       </button>
                       <button
                           onClick={handleConfirmAction}
                           className={`px-3 py-1.5 text-sm font-medium text-white rounded ${pendingAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
                       >
                           {pendingAction === 'remove_ecosystem' && 'Remove from Ecosystem'}
                           {pendingAction === 'archive' && 'Archive'}
                           {pendingAction === 'delete' && 'Delete Permanently'}
                       </button>
                   </div>
               </div>
           )}

           <Modal isOpen={isSupportRequestOpen} onClose={() => setIsSupportRequestOpen(false)} title={`Request Support from ${org.name}`}>
               <div className="space-y-4">
                   {actingOrganization ? (
                       <>
                           <div className="text-sm text-gray-600">
                               This sends a self-introduction from <strong>{actingOrganization.name}</strong> to <strong>{org.name}</strong>.
                           </div>
                           <div>
                               <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                                   Self-introduction
                               </label>
                               <textarea
                                   value={supportRequestNotes}
                                   onChange={(event) => setSupportRequestNotes(event.target.value)}
                                   rows={5}
                                   placeholder="Explain what your business does, what support you need, and any urgency or context."
                                   className={FORM_TEXTAREA_CLASS}
                               />
                           </div>
                           <div className="flex justify-end gap-2">
                               <button onClick={() => setIsSupportRequestOpen(false)} className="rounded border px-4 py-2 text-sm hover:bg-gray-50">
                                   Cancel
                               </button>
                               <button
                                   onClick={() => void handleRequestSupport()}
                                   disabled={!supportRequestNotes.trim() || isSubmittingSupportRequest}
                                   className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                               >
                                   {isSubmittingSupportRequest ? 'Sending...' : 'Send self-introduction'}
                               </button>
                           </div>
                       </>
                   ) : (
                       <div className="space-y-3 text-sm text-gray-600">
                           <p>You need an active business context before you can request support from an ESO.</p>
                           <p>Create or link your business profile first, then come back here to send a self-introduction.</p>
                       </div>
                   )}
               </div>
           </Modal>

           {/* Restricted Access Banner */}
           {!canViewDetails && !isOwnOrganization && (
               <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                   <div className="flex items-start gap-4">
                       <div className="flex-shrink-0 mt-1">
                           <span className="text-2xl">ℹ️</span>
                       </div>
                       <div className="flex-1">
                           <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">You have Basic Access</h3>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm mb-4">
                               <div>
                                   <span className="font-bold text-slate-700 block mb-2 border-b border-slate-200 pb-1">VISIBLE TO YOU</span>
                                   <ul className="list-disc list-outside ml-4 text-slate-600 space-y-1.5">
                                       <li>Directory profile (Name, Description, Industry)</li>
                                       <li>Activity metadata (Dates, Types, Authors)</li>
                                       <li>Referral status (Incoming/Outgoing)</li>
                                   </ul>
                               </div>
                               <div>
                                   <span className="font-bold text-slate-700 block mb-2 border-b border-slate-200 pb-1">RESTRICTED</span>
                                   <ul className="list-disc list-outside ml-4 text-slate-500 space-y-1.5">
                                       <li>Meeting notes and interaction content</li>
                                       <li>Specific metrics and financials</li>
                                       <li>Initiative details and progress</li>
                                       <li>Full team directory and contact info</li>
                                   </ul>
                               </div>
                           </div>

                           <div className="pt-2">
                               <button 
                                   onClick={handleRequestAccess}
                                   disabled={!!pendingRequest}
                                   className={`px-4 py-2 text-sm font-bold rounded shadow-sm flex items-center gap-2 transition-colors ${pendingRequest ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                               >
                                   {pendingRequest ? (
                                       <><span>⏳</span> Access Request Pending</>
                                   ) : (
                                       <><span>🔓</span> Request Full Access</>
                                   )}
                               </button>
                           </div>
                       </div>
                   </div>
               </div>
           )}
    
           {/* Tabs Navigation */}
           <div className="bg-white border-b border-gray-200 px-6">
             <nav className="-mb-px flex space-x-6 overflow-x-auto">
               {[
                 { id: 'overview', label: 'Overview' },
                 ...(canAccessMetrics ? [{ id: 'metrics', label: 'Data & Metrics' }] : []),
                 { id: 'people', label: `People (${isRestricted ? visiblePeople.length : orgPeople.length})` },
                 { id: 'participation', label: `Participation (${orgParticipations.length})` },
                 ...(canAccessInitiatives ? [{ id: 'initiatives', label: `Initiatives (${orgInitiatives.length})` }] : []),
                 { id: 'interactions', label: `Interactions (${orgInteractions.length})` },
                 { id: 'referrals', label: `Referrals (${orgReferrals.length})` },
                 { id: 'privacy', label: 'Privacy' },
                 ...(isManageable && org.roles.includes('eso') ? [{ id: 'settings', label: 'Settings' }] : []),
               ].map(tab => {
                 const isLocked = !canViewDetails && ['metrics', 'initiatives', 'interactions', 'referrals'].includes(tab.id);
                 return (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setActiveTab(tab.id);
                            onTabChange?.(tab.id);
                        }}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${
                            activeTab === tab.id
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        {tab.label}
                        {isLocked && <span className="ml-2 text-xs opacity-60" title="Restricted Content">🔒</span>}
                    </button>
                 );
               })}
             </nav>
           </div>
    
           {/* Tab Content */}
           <div className="grid grid-cols-1 gap-6">
              
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   <div className="lg:col-span-2 space-y-6">
                     {isManageable && (
                        <InfoBanner title="Privacy and Sharing">
                            <div className="space-y-2 text-sm text-gray-700">
                                <p>
                                    Your current visibility is <strong>{org.operational_visibility === 'open' ? 'Open' : 'Restricted'}</strong>.
                                    Use <strong>Privacy Settings</strong> to control whether ecosystem partners can see operational details like initiatives,
                                    metrics, interactions, and the broader team directory.
                                </p>
                                <p className="text-xs text-gray-500">
                                    Directory basics such as your name, website, and core profile remain discoverable even when operational data is restricted.
                                </p>
                            </div>
                        </InfoBanner>
                     )}
                     <Card title="About">
                        {isManageable && (
                            <div className="mb-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsEditOrgOpen(true)}
                                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Edit overview details
                                </button>
                            </div>
                        )}
                        <div className="prose prose-sm text-gray-600 max-w-none">
                          <p>{org.description}</p>
                        </div>
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Website</span>
                             <a href={org.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{org.url || 'N/A'}</a>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Inc. Year</span>
                             <span className="text-gray-900">{org.year_incorporated || 'N/A'}</span>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">Tax Status</span>
                             <Badge color="gray">{org.tax_status}</Badge>
                           </div>
                           <div>
                             <span className="block text-xs font-bold text-gray-500 uppercase">EIN</span>
                             <span className="text-gray-900 font-mono">{org.ein || 'N/A'}</span>
                           </div>
                        </div>
                        {isEcosystemAdmin && (
                          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!org.verified}
                                onChange={async (e) => {
                                  const isVerified = e.target.checked;
                                  await repos.organizations.update(org.id, {
                                    verified: isVerified,
                                    verified_at: isVerified ? new Date().toISOString() : undefined,
                                    verified_by: isVerified ? viewer.personId : undefined,
                                  });
                                  onRefresh?.();
                                }}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-medium text-gray-700">Mark as Verified</span>
                            </label>
                            {org.verified && (
                              <span className="text-xs text-gray-400">
                                Verified {org.verified_at ? new Date(org.verified_at).toLocaleDateString() : ''}
                              </span>
                            )}
                          </div>
                        )}
                     </Card>
                   </div>
                   <div className="space-y-6">
                      <Card title="Classification">
                         <div className="space-y-4">
                            {org.roles.includes('eso') && (
                               <div>
                                  <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Support Offerings</span>
                                  <div className="flex flex-wrap gap-2">
                                     {(org.support_offerings || []).length > 0 ? (
                                        (org.support_offerings || []).map((offering) => (
                                            <span key={offering} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100">
                                                {offering.replace(/_/g, ' ')}
                                            </span>
                                        ))
                                     ) : (
                                        <span className="text-sm text-gray-500">No support offerings listed yet.</span>
                                     )}
                                  </div>
                               </div>
                            )}
                            <div>
                               <span className="block text-xs font-bold text-gray-500 uppercase mb-1">NAICS Code</span>
                               <span className="text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded border">{org.classification.naics_code || 'N/A'}</span>
                            </div>
                            <div>
                               <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Industry Tags</span>
                               <div className="flex flex-wrap gap-2">
                                  {org.classification.industry_tags.map(t => <span key={t} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{t}</span>)}
                               </div>
                            </div>
                         </div>
                      </Card>
                      {(org.demographics.minority_owned || org.demographics.woman_owned || org.demographics.veteran_owned) && (
                        <Card title="Characteristics">
                          <div className="flex flex-wrap gap-2">
                            {org.demographics.minority_owned && <Badge color="purple">Minority Owned</Badge>}
                            {org.demographics.woman_owned && <Badge color="indigo">Woman Owned</Badge>}
                            {org.demographics.veteran_owned && <Badge color="green">Veteran Owned</Badge>}
                          </div>
                        </Card>
                      )}
                   </div>
                </div>
              )}

              {activeTab === 'metrics' && (
                  <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {metricReport.results.map((res, i) => (
                                <div key={i} className="bg-white p-4 rounded border border-gray-200 text-center relative overflow-hidden group">
                                    <div className="text-xs text-gray-500 uppercase font-bold truncate mb-1">{res.metric.name}</div>
                                    <div className={`text-2xl font-bold ${res.status === 'auto' ? 'text-purple-600' : res.status === 'confirmed' ? 'text-green-700' : 'text-gray-900'}`}>
                                        {res.metric.unit === 'currency' ? '$' : ''}{Number(res.value).toLocaleString()}
                                    </div>
                                    
                                    {res.status === 'auto' && (
                                        <div className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-bl font-bold">Auto</div>
                                    )}
                                    {res.status === 'confirmed' && (
                                        <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded-bl font-bold">Confirmed</div>
                                    )}
                                    {res.status === 'reported' && (
                                        <div className="absolute top-0 right-0 bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-bl">Reported</div>
                                    )}
                                </div>
                            ))}
                            
                            {canRequestUpdate && (
                                <>
                                    <button
                                        onClick={handleAssignUpdate}
                                        className="bg-gray-50 p-4 rounded border border-dashed border-gray-300 flex flex-col items-center justify-center text-indigo-600 hover:bg-gray-100 transition-colors"
                                    >
                                        <span className="text-lg font-bold">Request Update</span>
                                        <span className="text-[10px]">Send Task to Client</span>
                                    </button>
                                    {dataRequestMsg && <p className="text-sm text-green-600 mt-2">{dataRequestMsg}</p>}
                                </>
                            )}
                        </div>

                        <InfoBanner title="Data Confidence Legend">
                            <ul className="flex gap-4 text-xs">
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> <strong>Auto:</strong> Calculated live from system events.</li>
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> <strong>Confirmed:</strong> Auto-calc verified by user.</li>
                                <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500"></span> <strong>Reported:</strong> Manually entered by user.</li>
                            </ul>
                        </InfoBanner>
                  </div>
              )}

              {activeTab === 'people' && (
                  <div className="space-y-4">
                      {isManageable && !isRestricted && (
                          <div className="flex justify-end">
                              <button
                                  type="button"
                                  onClick={() => setIsAddPersonOpen(true)}
                                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                              >
                                  Add Person
                              </button>
                          </div>
                      )}
                      {isRestricted && (
                          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md">
                              <div className="flex">
                                  <div className="flex-shrink-0">
                                      <span className="text-amber-400">🔒</span>
                                  </div>
                                  <div className="ml-3">
                                      <p className="text-sm text-amber-700">
                                          This organization has restricted visibility. Only primary public contacts are shown.
                                      </p>
                                      {hiddenPeopleCount > 0 && (
                                          <p className="text-xs font-bold text-amber-800 mt-1">
                                              + {hiddenPeopleCount} other team members hidden.
                                          </p>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                      
                      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                           <table className="min-w-full divide-y divide-gray-200">
                               <thead className="bg-gray-50">
                                   <tr>
                                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role / Title</th>
                                       {isRestricted && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Visibility</th>}
                                       {isManageable && !isRestricted && <th className="px-6 py-3" />}
                                   </tr>
                               </thead>
                               <tbody className="bg-white divide-y divide-gray-200">
                                   {visiblePeople.map(p => {
                                       const affiliation = p.organization_affiliations?.find(a => a.organization_id === org.id);
                                       const displayRole = affiliation?.role_title || p.role || '';
                                       const displayRelationship = affiliation?.relationship_type || '';
                                       return (
                                       <tr key={p.id}>
                                           <td className="px-6 py-4 text-sm font-medium text-indigo-600">
                                               {onSelectPerson ? (
                                                   <button onClick={() => onSelectPerson(p.id)} className="hover:underline">
                                                       {p.first_name} {p.last_name}
                                                   </button>
                                               ) : (
                                                   `${p.first_name} ${p.last_name}`
                                               )}
                                           </td>
                                           <td className="px-6 py-4 text-sm text-gray-500">
                                               {displayRole && <span>{displayRole}</span>}
                                               {displayRelationship && <span className="ml-2 text-xs text-gray-400">({displayRelationship})</span>}
                                           </td>
                                           {isRestricted && (
                                               <td className="px-6 py-4 text-right">
                                                   <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                                       Public Contact
                                                   </span>
                                               </td>
                                           )}
                                           {isManageable && !isRestricted && (
                                               <td className="px-6 py-4 text-right">
                                                   <button
                                                       onClick={() => setEditAffiliationPerson({
                                                           id: p.id,
                                                           name: `${p.first_name} ${p.last_name}`,
                                                           roleTitle: affiliation?.role_title || p.role || '',
                                                           relationshipType: affiliation?.relationship_type || 'employee',
                                                           status: affiliation?.status || 'active',
                                                       })}
                                                       className="text-xs text-indigo-600 hover:underline"
                                                   >
                                                       Edit role
                                                   </button>
                                               </td>
                                           )}
                                       </tr>
                                   )})}
                                   {visiblePeople.length === 0 && (
                                       <tr>
                                           <td colSpan={isRestricted ? 3 : 2} className="px-6 py-8 text-center text-sm text-gray-500 italic">
                                               No public contacts listed.
                                           </td>
                                       </tr>
                                   )}
                               </tbody>
                           </table>
                      </div>
                  </div>
              )}

              {activeTab === 'participation' && (
                  <div className="space-y-4">
                      <InfoBanner title="Structured Participation">
                          <div className="text-sm text-gray-700">
                              Participation tracks structured, date-ranged involvement like memberships, program applications, rentals, incubator residency, and event series.
                          </div>
                      </InfoBanner>
                      {orgParticipations.length === 0 ? (
                          <Card title="Participation">
                              <p className="text-sm text-gray-500">No participation records are linked to this business yet.</p>
                          </Card>
                      ) : (
                          orgParticipations.map((service) => {
                              const provider = organizations.find((candidate) => candidate.id === service.provider_org_id);
                              return (
                                  <Card key={service.id} title={service.name}>
                                      <div className="flex items-start justify-between gap-3">
                                          <div>
                                              <div className="text-sm text-gray-600">
                                                  {service.participation_type?.replace(/_/g, ' ') || 'program'} with {provider?.name || 'Partner organization'}
                                              </div>
                                              <div className="mt-1 text-xs text-gray-500">{formatParticipationWindow(service)}</div>
                                          </div>
                                          <Badge color={getParticipationStatusColor(service)}>
                                              {getParticipationStatusLabel(service)}
                                          </Badge>
                                      </div>
                                      {service.description && (
                                          <div className="mt-3 text-sm text-gray-700">{service.description}</div>
                                      )}
                                  </Card>
                              );
                          })
                      )}
                  </div>
              )}
              {activeTab === 'initiatives' && (
                  <div className="space-y-4">
                      {orgInitiatives.map(init => {
                          if (init.name === RESTRICTED_INITIATIVE_NAME) {
                              return (
                                <div key={init.id} className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-4 flex items-center gap-3 opacity-75">
                                    <span className="text-xl">🔒</span>
                                    <div>
                                        <div className="font-bold text-gray-500 text-sm italic">Restricted Project</div>
                                        <div className="text-xs text-gray-400">Details hidden due to privacy settings.</div>
                                    </div>
                                </div>
                              );
                          }
                          return (
                              <Card key={init.id} title={init.name}>
                                  <p>Status: <Badge color={init.status === 'active' ? 'green' : 'gray'}>{init.status}</Badge></p>
                              </Card>
                          );
                      })}
                      {orgInitiatives.length === 0 && <p className="text-gray-500">No initiatives active.</p>}
                  </div>
              )}
              {activeTab === 'interactions' && (
                   <div className="space-y-4">
                       {orgInteractions.map(int => {
                           if (int.notes === REDACTED_TEXT) {
                               return (
                                   <div key={int.id} className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-4 flex items-center gap-3 opacity-75">
                                       <span className="text-xl">🔒</span>
                                       <div>
                                           <div className="font-bold text-gray-500 text-sm italic">Restricted Interaction</div>
                                           <div className="text-xs text-gray-400">{int.type.toUpperCase()} • {int.date}</div>
                                       </div>
                                   </div>
                               );
                           }
                           return (
                               <Card key={int.id} title={`${int.type} - ${int.date}`}>
                                   <p className="text-sm">{int.notes}</p>
                               </Card>
                           );
                       })}
                   </div>
              )}
              
              {activeTab === 'referrals' && (
                  <div className="space-y-4">
                      {!isEntrepreneurViewer && (
                          <div className="flex justify-end">
                              <button
                                  onClick={() => { setShowCreateReferral(true); setReferralJustCreated(false); }}
                                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                              >
                                  + Make Referral
                              </button>
                          </div>
                      )}
                      {referralJustCreated && (
                          <div className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                              <span>Referral created. To assign an owner, send an intro email, add notes, or set a follow-up date, open it in the Referrals section.</span>
                              <div className="flex items-center gap-2 shrink-0">
                                  {onNavigateToReferrals && (
                                      <button
                                          onClick={onNavigateToReferrals}
                                          className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
                                      >
                                          Go to Referrals →
                                      </button>
                                  )}
                                  <button onClick={() => setReferralJustCreated(false)} className="text-green-600 hover:text-green-800 text-xs">Dismiss</button>
                              </div>
                          </div>
                      )}
                      {orgReferrals.map(ref => {
                          const referrer = organizations.find(o => o.id === ref.referring_org_id);
                          const receiver = organizations.find(o => o.id === ref.receiving_org_id);
                          const subjectPerson = people.find(p => p.id === ref.subject_person_id);
                          const isRedacted = ref.notes === REDACTED_TEXT;

                          return (
                              <Card key={ref.id} title={
                                  <div className="flex flex-wrap items-center gap-2 text-base">
                                      {referrer && onSelectOrganization ? (
                                          <button onClick={() => onSelectOrganization(referrer.id, 'referrals')} className="font-bold text-gray-700 hover:text-indigo-700 hover:underline">
                                              {referrer.name}
                                          </button>
                                      ) : (
                                          <span className="font-bold text-gray-700">{referrer?.name || 'Unknown'}</span>
                                      )}
                                      <span className="text-gray-400 text-sm">➔</span>
                                      {receiver && onSelectOrganization ? (
                                          <button onClick={() => onSelectOrganization(receiver.id, 'referrals')} className="font-bold text-indigo-700 hover:underline">
                                              {receiver.name}
                                          </button>
                                      ) : (
                                          <span className="font-bold text-indigo-700">{receiver?.name || 'Unknown'}</span>
                                      )}
                                  </div>
                              }>
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="text-xs text-gray-500">
                                          {new Date(ref.date).toLocaleDateString()}
                                      </div>
                                      <Badge color={
                                          ref.status === 'pending' ? 'yellow' : 
                                          ref.status === 'accepted' ? 'green' : 
                                          ref.status === 'rejected' ? 'red' : 'blue'
                                      }>
                                          {ref.status.toUpperCase()}
                                      </Badge>
                                  </div>

                                  {subjectPerson && (
                                      <div className="mb-2 text-sm">
                                          <span className="font-bold text-gray-500">Subject:</span>{' '}
                                          {onSelectPerson ? (
                                              <button onClick={() => onSelectPerson(subjectPerson.id)} className="font-medium text-indigo-600 hover:underline">
                                                  {subjectPerson.first_name} {subjectPerson.last_name}
                                              </button>
                                          ) : (
                                              <span className="font-medium text-gray-900">{subjectPerson.first_name} {subjectPerson.last_name}</span>
                                          )}
                                      </div>
                                  )}
                                  
                                  {isRedacted ? (
                                      <div className="bg-gray-50 border border-gray-100 rounded p-2 text-xs text-gray-400 italic flex items-center gap-2">
                                          <span>🔒</span> Content Hidden
                                      </div>
                                  ) : (
                                      <p className="text-sm text-gray-600 mb-2">{ref.notes}</p>
                                  )}

                                  {canManageIncomingReferral(ref) && !isRedacted && (
                                      <div className="mb-3 flex flex-wrap gap-2">
                                          {ref.status === 'pending' && (
                                              <button
                                                  onClick={() => void updateReferralStatus(ref, 'accept')}
                                                  disabled={isUpdatingReferral === ref.id}
                                                  className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                              >
                                                  {isUpdatingReferral === ref.id ? 'Saving...' : 'Confirm intake'}
                                              </button>
                                          )}
                                          {ref.status === 'accepted' && (
                                              <button
                                                  onClick={() => void updateReferralStatus(ref, 'complete')}
                                                  disabled={isUpdatingReferral === ref.id}
                                                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                              >
                                                  {isUpdatingReferral === ref.id ? 'Saving...' : 'Mark completed'}
                                              </button>
                                          )}
                                      </div>
                                  )}
                                  
                                  {ref.status === 'completed' && ref.outcome && !isRedacted && (
                                      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
                                          <span className="text-xs font-bold text-gray-500 uppercase">Outcome:</span>
                                          <span className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                                              {ref.outcome.replace(/_/g, ' ')}
                                          </span>
                                      </div>
                                  )}
                              </Card>
                          );
                      })}
                      {orgReferrals.length === 0 && (
                          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                              No referral history found for this organization.
                          </div>
                      )}
                  </div>
              )}
              
              {activeTab === 'privacy' && (
                  <div className="grid gap-6">
                      <div className="bg-white border border-indigo-100 rounded-lg shadow-sm overflow-hidden">
                          <button 
                              onClick={() => setShowPrivacyHelp(!showPrivacyHelp)}
                              className="w-full flex items-center justify-between p-4 bg-indigo-50/50 hover:bg-indigo-50 transition-colors text-left"
                          >
                              <span className="font-bold text-indigo-900 flex items-center gap-2 text-sm">
                                  <span className="text-lg">ℹ️</span> How Privacy Works
                              </span>
                              <span className="text-indigo-400 text-xs">{showPrivacyHelp ? '▲' : '▼'}</span>
                          </button>
                          
                          {showPrivacyHelp && (
                              <div className="p-6 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-200">
                                  <div className="overflow-hidden rounded-lg border border-gray-200 mb-4">
                                      <table className="min-w-full divide-y divide-gray-200">
                                          <thead className="bg-gray-50">
                                              <tr>
                                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Data Type</th>
                                                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">When Public</th>
                                                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">When Private</th>
                                              </tr>
                                          </thead>
                                          <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                              {[
                                                  { type: 'Directory Profile', public: 'Visible', private: 'Visible' },
                                                  { type: 'Activity Metadata', public: 'Visible', private: 'Visible' },
                                                  { type: 'Interaction Notes', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Metrics & Financials', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Initiative Details', public: 'Visible', private: 'Restricted' },
                                                  { type: 'Team Directory', public: 'Visible', private: 'Limited' }
                                              ].map((row, idx) => (
                                                  <tr key={idx} className="hover:bg-gray-50">
                                                      <td className="px-4 py-2 font-medium text-gray-900">{row.type}</td>
                                                      <td className="px-4 py-2 text-center text-green-600 font-bold">✓ {row.public}</td>
                                                      <td className="px-4 py-2 text-center">
                                                          {row.private === 'Visible' ? (
                                                              <span className="text-green-600 font-bold">✓ Visible</span>
                                                          ) : (
                                                              <span className="text-amber-600 font-bold flex items-center justify-center gap-1">
                                                                  <span>🔒</span> {row.private}
                                                              </span>
                                                          )}
                                                      </td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                                  
                                  <p className="text-sm text-gray-600 leading-relaxed">
                                      Even with privacy enabled, your organization remains discoverable
                                      in the ecosystem directory. Partners can see that you exist and
                                      who has supported you, but cannot access operational details
                                      without your consent.
                                  </p>
                              </div>
                          )}
                      </div>

                      <Card title="Global Company Profile Visibility in Directory">
                          <div className="space-y-4">
                              <div className="flex items-start justify-between gap-4">
                                  <div>
                                      <h4 className="text-sm font-bold text-gray-900">Directory visibility</h4>
                                      <p className="text-sm text-gray-500 mt-1">
                                          This controls how much of your company profile and operating detail is visible to ecosystem partners by default.<br/>
                                          <strong>Open</strong> shares your detailed operating profile with trusted partners. <strong>Restricted</strong> keeps the directory listing visible, but requires explicit trusted-partner grants for deeper access.
                                      </p>
                                  </div>
                                  {isManageable ? (
                                      <button 
                                          onClick={handleToggleVisibility}
                                          aria-label={`Toggle organization visibility. Current setting: ${org.operational_visibility === 'open' ? 'Open' : 'Restricted'}`}
                                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${org.operational_visibility === 'open' ? 'bg-green-600' : 'bg-gray-200'}`}
                                      >
                                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${org.operational_visibility === 'open' ? 'translate-x-5' : 'translate-x-0'}`} />
                                      </button>
                                  ) : (
                                      <Badge color={org.operational_visibility === 'open' ? 'green' : 'gray'}>
                                          {org.operational_visibility === 'open' ? 'Open' : 'Restricted'}
                                      </Badge>
                                  )}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                  <div className={`rounded-lg border px-4 py-3 ${org.operational_visibility === 'restricted' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                                      <div className="text-sm font-semibold text-gray-900">Restricted</div>
                                      <div className="mt-1 text-sm text-gray-600">
                                          Your company still appears in the directory, but only the basic public profile is visible by default. Detailed access must be granted partner by partner below.
                                      </div>
                                  </div>
                                  <div className={`rounded-lg border px-4 py-3 ${org.operational_visibility === 'open' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                                      <div className="text-sm font-semibold text-gray-900">Open</div>
                                      <div className="mt-1 text-sm text-gray-600">
                                          Your company remains discoverable in the directory, and trusted partners can also see operational details like initiatives, metrics, interactions, and the broader team directory.
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </Card>

                      <Card title="Trusted Partners (Consent Grants)">
                          <div className="space-y-4">
                              <p className="text-sm text-gray-500">
                                  These organizations have been granted specific permission to view your data, regardless of your global visibility setting.
                              </p>
                              {isManageable && (
                                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                          <SearchableSelect
                                              label="Find trusted ESO partner"
                                              options={availablePartnerOrgs.map(o => ({ id: o.id, label: o.name }))}
                                              value={selectedPartnerOrgId}
                                              onChange={setSelectedPartnerOrgId}
                                              placeholder="Search ESO organizations in this ecosystem..."
                                          />
                                          <button
                                              type="button"
                                              onClick={handleGrantConsent}
                                              disabled={!selectedPartnerOrgId}
                                              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                              Grant Read Access
                                          </button>
                                      </div>
                                      <div className="mt-1">
                                          <button
                                              type="button"
                                              onClick={() => { if (selectedAccessLevel === 'read') setSelectedAccessLevel('write'); else setSelectedAccessLevel('read'); }}
                                              className="text-xs text-gray-400 hover:text-gray-600 underline"
                                          >
                                              {selectedAccessLevel === 'read' ? 'Grant elevated access instead (write / admin)' : 'Back to read access'}
                                          </button>
                                          {selectedAccessLevel !== 'read' && (
                                              <div className="mt-2 space-y-2">
                                                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                                      <strong>Elevated access</strong> — only grant this to trusted partners. Write allows adding interactions and updates; Admin allows managing data and sharing settings.
                                                  </div>
                                                  <div className="flex gap-2">
                                                      <button
                                                          type="button"
                                                          onClick={() => setSelectedAccessLevel('write')}
                                                          className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${selectedAccessLevel === 'write' ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                                                      >
                                                          Write
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={() => setSelectedAccessLevel('admin')}
                                                          className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${selectedAccessLevel === 'admin' ? 'border-red-400 bg-red-100 text-red-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                                                      >
                                                          Admin
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={handleGrantConsent}
                                                          disabled={!selectedPartnerOrgId}
                                                          className="ml-auto rounded bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                      >
                                                          Grant {selectedAccessLevel.charAt(0).toUpperCase() + selectedAccessLevel.slice(1)} Access
                                                      </button>
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                      <p className="text-xs text-gray-500">
                                          Grant trusted ESO partners access to your operational details without making your organization broadly open to the full network.
                                      </p>
                                      <div className="grid gap-2 md:grid-cols-3">
                                          <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                              <strong className="block text-gray-900">Read</strong>
                                              Can view detailed organizational information.
                                          </div>
                                          <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                              <strong className="block text-gray-900">Write</strong>
                                              Can log interactions and update shared records.
                                          </div>
                                          <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                              <strong className="block text-gray-900">Admin</strong>
                                              Can manage the relationship and consent settings.
                                          </div>
                                      </div>
                                      {availablePartnerOrgs.length === 0 && (
                                          <div className="text-xs text-amber-700">
                                              No matching ESO organizations found in this ecosystem.
                                          </div>
                                      )}
                                  </div>
                              )}
                              {activePolicies.length === 0 ? (
                                  <div className="bg-gray-50 p-4 rounded border border-gray-200 text-center text-sm text-gray-500 italic">
                                      No specific consents granted.
                                  </div>
                              ) : (
                                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                                      {activePolicies.map(policy => {
                                          const partner = organizations.find(o => o.id === policy.viewerId);
                                          return (
                                              <div key={policy.id} className="p-4 bg-white flex justify-between items-center">
                                                  <div className="flex items-center gap-3">
                                                      <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center text-indigo-700 font-bold text-xs">
                                                          {partner?.name.substring(0,2).toUpperCase() || '??'}
                                                      </div>
                                                      <div>
                                                          <div className="font-bold text-sm text-gray-900">{partner?.name || 'Unknown Partner'}</div>
                                                          <div className="text-xs text-gray-500">Access Level: {policy.accessLevel.toUpperCase()}</div>
                                                      </div>
                                                  </div>
                                                  {isManageable && (
                                                      confirmRevokeId === policy.id ? (
                                                          <span className="text-xs text-red-700">
                                                              Revoke access?{' '}
                                                              <button onClick={() => doRevokeConsent(policy.id)} className="font-bold underline mr-2">Yes, revoke</button>
                                                              <button onClick={() => setConfirmRevokeId(null)} className="text-gray-500 underline">Cancel</button>
                                                          </span>
                                                      ) : (
                                                          <button
                                                              onClick={() => handleRevokeConsent(policy.id)}
                                                              className="text-xs text-red-600 hover:text-red-800 font-bold border border-red-200 hover:bg-red-50 px-3 py-1 rounded"
                                                          >
                                                              Revoke Access
                                                          </button>
                                                      )
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                      </Card>

                      <Card title="Consent Audit History">
                        {consentEvents.length === 0 ? (
                            <p className="text-gray-500 text-sm italic">No history recorded.</p>
                        ) : (
                            <>
                                <div className="overflow-hidden rounded-md border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Partner ESO</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Updated By</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {visibleEvents.map(evt => {
                                                const partnerName = organizations.find(o => o.id === evt.viewerId)?.name || 'Unknown';
                                                const actorName = people.find(p => p.id === evt.actorId)?.first_name 
                                                    ? `${people.find(p => p.id === evt.actorId)?.first_name} ${people.find(p => p.id === evt.actorId)?.last_name}`
                                                    : (evt.actorId === org.id ? 'Organization Admin' : 'System'); // Fallback logic
                                                
                                                return (
                                                    <tr key={evt.id} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                                            {new Date(evt.timestamp).toLocaleDateString()} <span className="text-gray-400 text-xs">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <Badge color={evt.action === 'granted' ? 'green' : evt.action === 'revoked' ? 'red' : 'yellow'}>
                                                                {evt.action.toUpperCase()}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                                            {partnerName}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500">
                                                            {evt.reason || '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                                            {actorName}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {consentEvents.length > 10 && (
                                    <div className="mt-4 text-center">
                                        <button 
                                            onClick={() => setShowAllEvents(!showAllEvents)}
                                            className="text-sm text-indigo-600 font-medium hover:underline"
                                        >
                                            {showAllEvents ? 'Show Less' : `View ${consentEvents.length - 10} older events`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                  </div>
              )}

              {activeTab === 'settings' && isManageable && org.roles.includes('eso') && (
                  <div className="grid gap-6">
                      <Card title="Email Templates">
                          <div className="space-y-4">
                              <p className="text-sm text-gray-600 mb-2">
                                  Org-level templates are available to all staff when sending invite emails. Staff can also set personal templates in their own profile.
                              </p>
                              <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-800 space-y-1">
                                  <p className="font-semibold">Tokens replaced when the email is sent:</p>
                                  <p><code className="bg-white/70 rounded px-1">{'{{first_name}}'}</code> — entrepreneur's first name</p>
                                  <p><code className="bg-white/70 rounded px-1">{'{{subject_name}}'}</code> — entrepreneur's full name</p>
                                  <p><code className="bg-white/70 rounded px-1">{'{{receiving_org}}'}</code> — your organization</p>
                                  <p><code className="bg-white/70 rounded px-1">{'{{referring_org}}'}</code> — the organization that sent the referral</p>
                              </div>
                              {orgTemplateDrafts.map((tpl, idx) => (
                                  <div key={tpl.id} className="rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                          <input
                                              className="flex-1 rounded border-gray-300 text-sm font-medium focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border bg-white"
                                              value={tpl.name}
                                              placeholder={`Template name (e.g. "Come visit our space")`}
                                              onChange={(e) => {
                                                  setOrgTemplateDrafts(orgTemplateDrafts.map((t, i) => i === idx ? { ...t, name: e.target.value } : t));
                                              }}
                                          />
                                          <button
                                              type="button"
                                              onClick={() => {
                                                  const next = orgTemplateDrafts.filter((_, i) => i !== idx);
                                                  setOrgTemplateDrafts(next);
                                                  void repos.organizations.update(org.id, { referral_templates: next });
                                                  setOrgTemplatesSavedAt(Date.now());
                                              }}
                                              className="text-xs text-red-400 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                                          >
                                              Remove
                                          </button>
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-500 mb-1">Subject line <span className="font-normal text-gray-400">(optional — leave blank for default)</span></label>
                                          <input
                                              className="block w-full rounded border-gray-300 text-xs focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border bg-white"
                                              value={tpl.subject || ''}
                                              placeholder={`e.g. "Let's connect — {{receiving_org}}"`}
                                              onChange={(e) => {
                                                  setOrgTemplateDrafts(orgTemplateDrafts.map((t, i) => i === idx ? { ...t, subject: e.target.value } : t));
                                              }}
                                          />
                                      </div>
                                      <textarea
                                          className="block w-full rounded border-gray-300 text-xs font-mono focus:border-indigo-500 focus:ring-indigo-500 p-2 border bg-white"
                                          rows={6}
                                          value={tpl.body}
                                          placeholder={`Hi {{first_name}},\n\nThanks for the intro!\n\n[message body]\n\n[Staff name]\n[Org name]`}
                                          onChange={(e) => {
                                              setOrgTemplateDrafts(orgTemplateDrafts.map((t, i) => i === idx ? { ...t, body: e.target.value } : t));
                                          }}
                                      />
                                  </div>
                              ))}
                              <div className="flex items-center gap-3 flex-wrap">
                                  <button
                                      type="button"
                                      onClick={() => {
                                          setOrgTemplateDrafts([...orgTemplateDrafts, { id: `tpl_${Date.now()}`, name: '', body: '' }]);
                                      }}
                                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                                  >
                                      + Add Template
                                  </button>
                                  {orgTemplateDrafts.length > 0 && (
                                      <button
                                          type="button"
                                          disabled={isSavingOrgTemplates}
                                          onClick={async () => {
                                              setIsSavingOrgTemplates(true);
                                              await repos.organizations.update(org.id, { referral_templates: orgTemplateDrafts });
                                              setIsSavingOrgTemplates(false);
                                              setOrgTemplatesSavedAt(Date.now());
                                          }}
                                          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                                      >
                                          {isSavingOrgTemplates ? 'Saving…' : 'Save templates'}
                                      </button>
                                  )}
                                  {orgTemplatesSavedAt && (
                                      <span className="text-xs text-green-600 font-medium">Saved</span>
                                  )}
                              </div>
                              <div className="text-xs text-gray-400">Subject note: if left blank, the email subject defaults to <em>"[Org] accepted your referral"</em>. The template body is inserted as a paragraph inside the system email wrapper.</div>
                          </div>
                      </Card>
                  </div>
              )}
           </div>

           <CreateReferralModal
               isOpen={showCreateReferral}
               onClose={() => setShowCreateReferral(false)}
               onSave={async (referral) => {
                   await repos.referrals.add({
                       id: `ref_${Date.now()}`,
                       ecosystem_id: viewer.ecosystemId,
                       source: 'manual_ui',
                       date: new Date().toISOString(),
                       ...referral,
                   } as Referral);
                   setShowCreateReferral(false);
                   setReferralJustCreated(true);
                   onRefresh?.();
               }}
               subjectOrg={org}
               organizations={organizations}
               currentOrgId={viewer.orgId}
           />

           <ManagePersonModal
               isOpen={isAddPersonOpen}
               onClose={() => setIsAddPersonOpen(false)}
               onSave={(personUpdates) => { void handleAddPerson(personUpdates); }}
               onLink={(personId, roleTitle, relationshipType) => { void handleLinkPerson(personId, roleTitle, relationshipType); }}
               orgId={org.id}
               allPeople={people}
           />

           {/* Edit affiliation modal */}
           <Modal isOpen={!!editAffiliationPerson} onClose={() => setEditAffiliationPerson(null)} title={`Edit Role — ${editAffiliationPerson?.name || ''}`}>
               {editAffiliationPerson && (
                   <div className="space-y-4">
                       <div>
                           <label className={FORM_LABEL_CLASS}>Role Title</label>
                           <input
                               className={FORM_INPUT_CLASS}
                               value={editAffiliationPerson.roleTitle}
                               onChange={e => setEditAffiliationPerson({ ...editAffiliationPerson, roleTitle: e.target.value })}
                               placeholder="e.g. Founder, Advisor, Coach..."
                           />
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                           <div>
                               <label className={FORM_LABEL_CLASS}>Relationship</label>
                               <select
                                   className={FORM_SELECT_CLASS}
                                   value={editAffiliationPerson.relationshipType}
                                   onChange={e => setEditAffiliationPerson({ ...editAffiliationPerson, relationshipType: e.target.value })}
                               >
                                   <option value="founder">Founder</option>
                                   <option value="owner">Owner</option>
                                   <option value="employee">Employee</option>
                                   <option value="advisor">Advisor</option>
                                   <option value="board">Board</option>
                                   <option value="other">Other</option>
                               </select>
                           </div>
                           <div>
                               <label className={FORM_LABEL_CLASS}>Status</label>
                               <select
                                   className={FORM_SELECT_CLASS}
                                   value={editAffiliationPerson.status}
                                   onChange={e => setEditAffiliationPerson({ ...editAffiliationPerson, status: e.target.value })}
                               >
                                   <option value="active">Active</option>
                                   <option value="pending">Pending</option>
                                   <option value="revoked">No longer active</option>
                               </select>
                           </div>
                       </div>
                       <div className="flex justify-end gap-2 pt-2">
                           <button onClick={() => setEditAffiliationPerson(null)} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                           <button
                               onClick={() => {
                                   void handleUpdateAffiliation(editAffiliationPerson.id, {
                                       role_title: editAffiliationPerson.roleTitle,
                                       relationship_type: editAffiliationPerson.relationshipType,
                                       status: editAffiliationPerson.status,
                                   });
                                   setEditAffiliationPerson(null);
                               }}
                               className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                           >
                               Save
                           </button>
                       </div>
                   </div>
               )}
           </Modal>
           {isManageable && (
               <EditOrgModal
                   org={org}
                   isOpen={isEditOrgOpen}
                   onClose={() => setIsEditOrgOpen(false)}
                   onSave={handleSaveOrgProfile}
               />
           )}
        </div>
    );
};
