
import React, { useState } from 'react';
import { Badge, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { loadEnums } from '../../domain/standards/loadStandards';
import { EnumSelect } from '../../shared/EnumSelect';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Referral, Person } from '../../domain/types';
import { CreateReferralModal } from './CreateReferralModal';
import { callHttpFunction } from '../../services/httpFunctionClient';

export const ReferralsView = ({
    currentUser,
    allReferrals = [],
    organizations = [],
    people = [],
    onSelectOrganization,
    onSelectPerson,
    onEditMyTemplates,
    onRefresh
}: {
    currentUser: Person;
    allReferrals?: Referral[];
    organizations?: any[];
    people?: Person[];
    onSelectOrganization?: (id: string, tab?: string) => void;
    onSelectPerson?: (id: string) => void;
    onEditMyTemplates?: () => void;
    onRefresh?: () => void;
}) => {
    const repos = useRepos();
    const viewer = useViewer();
    
    const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing' | 'all'>('incoming');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    
    // Modal & Action States
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
    const [responseNote, setResponseNote] = useState('');
    const [outcome, setOutcome] = useState('');
    const [tagChips, setTagChips] = useState<string[]>([]);
    const [tagInputValue, setTagInputValue] = useState('');
    const [followUpDate, setFollowUpDate] = useState('');
    const [assignedOwnerId, setAssignedOwnerId] = useState('');
    const [assignedOwnerSearch, setAssignedOwnerSearch] = useState('');
    const [pendingAction, setPendingAction] = useState<'accept' | 'assign' | 'decline' | null>(null);
    const [activePanel, setActivePanel] = useState<'assign' | 'email' | 'note' | 'close' | null>(null);
    const [addAsClient, setAddAsClient] = useState(false);
    const [sendAcceptanceEmail, setSendAcceptanceEmail] = useState(false);
    const [sendDeclineEmail, setSendDeclineEmail] = useState(true);
    const [acceptanceEmailTemplate, setAcceptanceEmailTemplate] = useState<'schedule_link' | 'book_tour' | 'custom'>('schedule_link');
    const [acceptanceEmailLink, setAcceptanceEmailLink] = useState('');
    const [acceptanceEmailMessage, setAcceptanceEmailMessage] = useState('');
    const [acceptanceEmailSubject, setAcceptanceEmailSubject] = useState('');
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
    const [isProcessing, setIsProcessing] = useState(false);

    // Interaction Log State (within Referral Modal)
    const [intDate, setIntDate] = useState('');
    const [intType, setIntType] = useState('call');
    const [intNotes, setIntNotes] = useState('');

    const enums = loadEnums();
    const defaultFollowUpDate = () => {
        const next = new Date();
        next.setDate(next.getDate() + 7);
        return next.toISOString().split('T')[0];
    };
    
    const currentOrgId = currentUser.organization_id;
    const isSystemAdmin = ['platform_admin', 'ecosystem_manager'].includes(currentUser.system_role);
    const viewerOrg = organizations.find((o: any) => o.id === currentOrgId);
    // Build combined template list: personal first, then org-level, no duplicates by id
    const personalTemplates: Array<{id: string; name: string; subject?: string; body: string}> = currentUser.referral_templates || [];
    const orgTemplates: Array<{id: string; name: string; subject?: string; body: string}> = viewerOrg?.referral_templates || [];
    const orgTemplateIds = new Set(personalTemplates.map(t => t.id));
    const allTemplates = [...personalTemplates, ...orgTemplates.filter(t => !orgTemplateIds.has(t.id))];
    const defaultInviteTemplate = allTemplates[0]?.body || '';

    // Calculate Counts
    const incomingCount = allReferrals.filter(r => r.receiving_org_id === currentOrgId && r.status === 'pending').length;
    const outgoingCount = allReferrals.filter(r => r.referring_org_id === currentOrgId && r.status !== 'completed' && r.status !== 'rejected').length;

    // Filter Logic
    const filteredReferrals = allReferrals.filter(r => {
        // Tab Filter
        if (activeTab === 'incoming' && r.receiving_org_id !== currentOrgId) return false;
        if (activeTab === 'outgoing' && r.referring_org_id !== currentOrgId) return false;
        // 'all' shows everything (admin only feature usually, or debugging)
        
        // Status Filter
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        
        return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleCreateReferral = async (newReferral: Partial<Referral>) => {
        setIsProcessing(true);
        try {
            await repos.referrals.add({
                id: `ref_${Date.now()}`,
                ecosystem_id: viewer.ecosystemId,
                source: 'manual_ui',
                date: new Date().toISOString(),
                ...newReferral
            } as Referral);
            setIsCreateModalOpen(false);
            onRefresh?.();
        } catch (error) {
            console.error('Failed to create referral:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpen = (ref: Referral) => {
        setSelectedReferral(ref);
        setFeedbackMessage(null);
        setResponseNote(ref.response_notes || '');
        setOutcome(ref.outcome || 'services_provided');
        setTagChips(ref.outcome_tags || []);
        setFollowUpDate(ref.follow_up_date || (ref.status === 'pending' ? defaultFollowUpDate() : ''));
        setAssignedOwnerId(ref.owner_id || '');
        setAssignedOwnerSearch('');
        setPendingAction(null);
        setSendAcceptanceEmail(false);
        setSendDeclineEmail(true);
        setAcceptanceEmailTemplate('schedule_link');
        setAcceptanceEmailLink('');
        setAcceptanceEmailMessage(defaultInviteTemplate);
        setAcceptanceEmailSubject(allTemplates[0]?.subject || '');
        // Default addAsClient based on whether subject org is already a client
        const subjectOrgId = ref.subject_org_id;
        const subjectOrg = subjectOrgId ? organizations.find((o: any) => o.id === subjectOrgId) : null;
        const alreadyClient = subjectOrg?.managed_by_ids?.includes(currentOrgId) || false;
        setAddAsClient(!alreadyClient);

        // Reset Interaction defaults
        setIntDate(new Date().toISOString().split('T')[0]);
        setIntType('call');
        setIntNotes('');
    };

    const handleAccept = async () => {
        if (selectedReferral) {
            setIsProcessing(true);
            try {
                await repos.referrals.accept(selectedReferral.id);
                if (acceptanceEmailMessage.trim()) {
                    await callHttpFunction('sendReferralDecisionEmail', {
                        referral_id: selectedReferral.id,
                        decision: 'accepted',
                        template: acceptanceEmailTemplate,
                        message: acceptanceEmailMessage,
                        custom_subject: acceptanceEmailSubject || undefined,
                    });
                    await repos.referrals.update(selectedReferral.id, { invite_sent_at: new Date().toISOString() });
                }
                setSelectedReferral(null);
                onRefresh?.();
            } catch (error) {
                console.error('Failed to accept referral:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleDecline = async () => {
        if (selectedReferral) {
            if (!responseNote.trim()) {
                setFeedbackTone('error');
                setFeedbackMessage('Add a shared explanation before declining so the entrepreneur and introducer understand why.');
                return;
            }
            setIsProcessing(true);
            try {
                await repos.referrals.decline(selectedReferral.id, responseNote);
                if (sendDeclineEmail) {
                    await callHttpFunction('sendReferralDecisionEmail', {
                        referral_id: selectedReferral.id,
                        decision: 'declined',
                        note: responseNote,
                    });
                }
                setSelectedReferral(null);
                onRefresh?.();
            } catch (error) {
                console.error('Failed to decline referral:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleSendAcceptanceEmail = async () => {
        if (!selectedReferral || !acceptanceEmailMessage.trim()) {
            return;
        }

        setIsProcessing(true);
        setFeedbackMessage(null);
        try {
            await callHttpFunction('sendReferralDecisionEmail', {
                referral_id: selectedReferral.id,
                decision: 'accepted',
                note: responseNote,
                template: acceptanceEmailTemplate,
                message: acceptanceEmailMessage,
                custom_subject: acceptanceEmailSubject || undefined,
            });
            await repos.referrals.update(selectedReferral.id, { invite_sent_at: new Date().toISOString() });
            setFeedbackTone('success');
            setFeedbackMessage('Next-steps email sent.');
            setAcceptanceEmailMessage('');
            setActivePanel(null);
        } catch (error: any) {
            setFeedbackTone('error');
            setFeedbackMessage(error?.message || 'Unable to send the next-steps email.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = async () => {
        if (selectedReferral) {
            if (!outcome) {
                setFeedbackTone('error');
                setFeedbackMessage('Select a final outcome before closing the referral.');
                return;
            }
            setIsProcessing(true);
            try {
                const tags = tagChips;
                await repos.referrals.close(selectedReferral.id, outcome, tags, responseNote);

                // Log a formal interaction record for the closing meeting
                const subjectPerson = people.find(p => p.id === selectedReferral.subject_person_id);
                const orgId = selectedReferral.subject_org_id || subjectPerson?.organization_id;
                if (orgId && intDate) {
                    const attendees = subjectPerson ? [`${subjectPerson.first_name} ${subjectPerson.last_name}`] : [];
                    const outcomeLabel = enums.ReferralOutcome.find(o => o.id === outcome)?.label || outcome;
                    const noteBody = responseNote.trim()
                        ? `${responseNote.trim()}\n\n[Outcome: ${outcomeLabel}]`
                        : `[Outcome: ${outcomeLabel}]`;
                    await repos.interactions.add({
                        id: `int_close_${Date.now()}`,
                        organization_id: orgId,
                        ecosystem_id: viewer.ecosystemId,
                        author_org_id: viewer.orgId,
                        date: intDate,
                        type: intType as any,
                        visibility: 'network_shared',
                        note_confidential: false,
                        notes: noteBody,
                        recorded_by: `${currentUser.first_name} ${currentUser.last_name}`,
                        attendees,
                    });
                }

                // Optionally enroll subject org as a client
                if (addAsClient && selectedReferral.subject_org_id) {
                    const subjectOrg = organizations.find((o: any) => o.id === selectedReferral.subject_org_id);
                    if (subjectOrg) {
                        const alreadyClient = subjectOrg.managed_by_ids?.includes(currentOrgId);
                        if (!alreadyClient) {
                            await repos.organizations.update(selectedReferral.subject_org_id, {
                                managed_by_ids: [...(subjectOrg.managed_by_ids || []), currentOrgId],
                            });
                        }
                    }
                }
                setSelectedReferral(null);
                onRefresh?.();
            } catch (error) {
                console.error('Failed to close referral:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const getAgingBadge = (ref: Referral): { text: string; color: 'yellow' | 'red' } | null => {
        if (ref.status !== 'pending' && ref.status !== 'accepted') return null;
        const now = Date.now();
        const daysSince = (isoDate?: string) => isoDate ? Math.floor((now - new Date(isoDate).getTime()) / 86400000) : null;

        if (ref.status === 'pending') {
            const days = daysSince(ref.date);
            if (days === null) return null;
            if (days >= 14) return { text: `${days}d pending`, color: 'red' };
            if (days >= 7) return { text: `${days}d pending`, color: 'yellow' };
            return null;
        }

        if (ref.status === 'accepted') {
            if (!ref.invite_sent_at) {
                const days = daysSince(ref.accepted_at);
                if (days === null) return null;
                if (days >= 5) return { text: `No invite sent — ${days}d`, color: 'red' };
                if (days >= 2) return { text: `No invite sent — ${days}d`, color: 'yellow' };
                return null;
            }
            const days = daysSince(ref.accepted_at);
            if (days === null) return null;
            if (days >= 30) return { text: `${days}d since accepted`, color: 'red' };
            if (days >= 14) return { text: `${days}d since accepted`, color: 'yellow' };
            return null;
        }
        return null;
    };

    const handleUpdateFollowUp = async () => {
        if (selectedReferral && followUpDate) {
            setIsProcessing(true);
            try {
                if (assignedOwnerId) {
                    await repos.referrals.assignOwner(selectedReferral.id, assignedOwnerId);
                }
                await repos.referrals.updateFollowUp(selectedReferral.id, followUpDate);
                setSelectedReferral({
                    ...selectedReferral,
                    owner_id: assignedOwnerId || undefined,
                    follow_up_date: followUpDate,
                });
                setFeedbackTone('success');
                setFeedbackMessage('Referral owner and next follow-up date saved.');
                onRefresh?.();
            } catch (error) {
                console.error('Failed to update follow-up:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    }

    const handleAssignOwnerAccepted = async () => {
        if (!selectedReferral || !assignedOwnerId) {
            setFeedbackTone('error');
            setFeedbackMessage('Select an owner before saving.');
            return;
        }
        setIsProcessing(true);
        try {
            await repos.referrals.assignOwner(selectedReferral.id, assignedOwnerId);
            setSelectedReferral(null); // Close modal on success
            setFeedbackTone('success');
            setFeedbackMessage('Owner assigned.');
            setActivePanel(null);
            onRefresh?.();
        } catch (error: any) {
            setFeedbackTone('error');
            setFeedbackMessage(error?.message || 'Unable to assign owner.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAssignReviewer = async () => {
        if (!selectedReferral || selectedReferral.status !== 'pending') {
            return;
        }
        if (!assignedOwnerId) {
            setFeedbackTone('error');
            setFeedbackMessage('Select a reviewer before assigning.');
            return;
        }

        setIsProcessing(true);
        setFeedbackMessage(null);
        try {
            await repos.referrals.assignOwner(selectedReferral.id, assignedOwnerId);
            setSelectedReferral(null); // Close modal on success
            setFeedbackTone('success');
            setFeedbackMessage('Reviewer assignment saved.');
            setPendingAction(null);
            onRefresh?.();
        } catch (error: any) {
            console.error('Failed to assign reviewer:', error);
            setFeedbackTone('error');
            setFeedbackMessage(error?.message || 'Unable to assign reviewer.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleLogInteraction = async () => {
        if (selectedReferral && intNotes) {
            setIsProcessing(true);
            try {
                const subjectPerson = people.find(p => p.id === selectedReferral.subject_person_id);
                const attendees = subjectPerson ? [`${subjectPerson.first_name} ${subjectPerson.last_name}`] : [];
                
                // If subject_org_id is missing, try to resolve from person
                const orgId = selectedReferral.subject_org_id || subjectPerson?.organization_id || 'unknown_org';

                await repos.interactions.add({
                    id: `int_ref_${Date.now()}`,
                    organization_id: orgId,
                    ecosystem_id: viewer.ecosystemId,
                    author_org_id: viewer.orgId,
                    date: intDate,
                    type: intType as any,
                    visibility: 'network_shared',
                    note_confidential: false,
                    notes: `[Referral Follow-up] ${intNotes}`,
                    recorded_by: `${currentUser.first_name} ${currentUser.last_name}`,
                    attendees
                });
                setFeedbackTone('success');
                setFeedbackMessage('Follow-up interaction logged.');
                setIntNotes('');
                onRefresh?.();
            } catch (error) {
                console.error('Failed to log interaction:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    // Helper for previewing email
    const getPreviewData = (ref: Referral) => {
        const subjectPerson = people.find(p => p.id === ref.subject_person_id);
        const refOrg = organizations.find(o => o.id === ref.referring_org_id);
        const recOrg = organizations.find(o => o.id === ref.receiving_org_id);
        const subOrg = organizations.find(o => o.id === ref.subject_org_id);
        
        // This is a rough estimation of the sender for the preview since we don't store the exact sender ID in the referral object currently, 
        // just the referring org ID. In a real system, `created_by` would be on the referral.
        const senderName = ref.referring_org_id === currentUser.organization_id 
            ? `${currentUser.first_name} ${currentUser.last_name}` 
            : 'Partner Staff';

        return {
            to: subjectPerson?.email || 'email@example.com',
            subject: `Introduction: ${refOrg?.name || 'Partner'} → ${recOrg?.name || 'Partner'}`,
            body: `Hello ${recOrg?.name || 'Partner'} Team,\n\nI'd like to introduce ${subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'the client'} from ${subOrg?.name || 'Client Org'}.\n\n${ref.notes}\n\nBest,\n${senderName}\n${refOrg?.name || ''}`
        };
    };

    const getReferralLabel = (ref: Referral) => {
        const subjectPerson = people.find(p => p.id === ref.subject_person_id);
        if (subjectPerson) {
            return `${subjectPerson.first_name} ${subjectPerson.last_name}`;
        }
        const subjectOrg = organizations.find(o => o.id === ref.subject_org_id);
        return subjectOrg?.name || 'Unknown';
    };

    const getStatusPresentation = (ref: Referral) => {
        if (ref.status === 'pending') {
            if (ref.intake_type === 'self_introduction' && ref.referring_org_id === currentOrgId) {
                return { color: 'yellow' as const, label: 'support request submitted' };
            }
            if (ref.intake_type === 'access_request' && ref.referring_org_id === currentOrgId) {
                return { color: 'yellow' as const, label: 'access request pending' };
            }
            if (ref.receiving_org_id === currentOrgId) {
                return { color: 'yellow' as const, label: 'pending review' };
            }
            if (ref.referring_org_id === currentOrgId) {
                return { color: 'yellow' as const, label: 'awaiting acceptance' };
            }
        }
        if (ref.status === 'accepted') {
            return { color: 'green' as const, label: 'accepted' };
        }
        if (ref.status === 'rejected') {
            return { color: 'red' as const, label: 'rejected' };
        }
        return { color: 'blue' as const, label: 'completed' };
    };

    const getReferralTypeLabel = (ref: Referral) => {
        if (ref.intake_type === 'self_introduction') return 'Self-introduction';
        if (ref.intake_type === 'access_request') return 'Access request';
        return 'Referral';
    };

    const formatReferralDate = (value?: string) => {
        if (!value) {
            return 'Unknown';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    };

    const getOwnerLabel = (ref: Referral) => {
        const owner = people.find(p => p.id === ref.owner_id);
        if (owner) {
            return `${owner.first_name} ${owner.last_name}`;
        }
        if (ref.status === 'pending' && ref.referring_org_id === currentOrgId) {
            return 'Awaiting receiver acceptance';
        }
        if (ref.status === 'pending' && ref.receiving_org_id === currentOrgId) {
            return 'Assign on acceptance';
        }
        return 'Unassigned';
    };

    const sendReferralReminder = async (referralId: string, mode: 'reminder' | 'follow_up') => {
        if (!selectedReferral) {
            return;
        }
        setIsProcessing(true);
        setFeedbackMessage(null);
        try {
            await callHttpFunction('sendReferralReminder', {
                referral_id: referralId,
                mode,
                message: mode === 'follow_up'
                    ? 'Additional details were shared by the referring organization.'
                    : '',
            });
            setFeedbackTone('success');
            setFeedbackMessage(mode === 'follow_up'
                ? 'Follow-up email sent to the receiving organization.'
                : 'Reminder email sent to the receiving organization.');
        } catch (error: any) {
            setFeedbackTone('error');
            setFeedbackMessage(error?.message || 'Unable to send the reminder email.');
        } finally {
            setIsProcessing(false);
        }
    };

    const assignablePeople = selectedReferral
        ? people.filter(p => p.organization_id === selectedReferral.receiving_org_id)
        : [];
    const selectedAssignedOwner = assignablePeople.find((person) => person.id === assignedOwnerId) || null;
    const filteredAssignablePeople = assignablePeople.filter((person) => {
        const term = assignedOwnerSearch.trim().toLowerCase();
        if (!term) {
            return true;
        }

        const fullName = `${person.first_name} ${person.last_name}`.toLowerCase();
        return fullName.includes(term) || person.email.toLowerCase().includes(term) || (person.role || '').toLowerCase().includes(term);
    });
    const hasAcceptanceEmailRecipients = selectedReferral
        ? !!people.find((person) => person.id === selectedReferral.subject_person_id)?.email
        : false;
    const isAcceptanceEmailValid = !sendAcceptanceEmail || !!acceptanceEmailMessage.trim();

    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-gray-800">Referrals</h2>
                 <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                 >
                    New Referral
                 </button>
             </div>

             {/* Tabs */}
             <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('incoming')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                            activeTab === 'incoming'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Incoming Requests
                        {incomingCount > 0 && <Badge color="yellow">{incomingCount}</Badge>}
                    </button>
                    <button
                        onClick={() => setActiveTab('outgoing')}
                        className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                            activeTab === 'outgoing'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Outgoing (Sent)
                        {outgoingCount > 0 && <Badge color="blue">{outgoingCount}</Badge>}
                    </button>
                    {isSystemAdmin && (
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'all'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            All System Referrals
                        </button>
                    )}
                </nav>
             </div>

             {/* Filters */}
             <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-500 font-medium">Filter Status:</span>
                <EnumSelect 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    options={enums.ReferralStatus}
                    includeAllOption
                    allLabel="All Statuses"
                    className="w-40 border-gray-300 text-sm py-1"
                />
             </div>

             {feedbackMessage && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${
                    feedbackTone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}>
                    {feedbackMessage}
                </div>
             )}

             {/* Table */}
             <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {activeTab !== 'outgoing' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>}
                            {activeTab !== 'incoming' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>}
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referral</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner / Next Step</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow-Up</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredReferrals.map(ref => {
                            const subjectPerson = people.find(p => p.id === ref.subject_person_id);
                            const subjectOrg = organizations.find((o: any) => o.id === ref.subject_org_id);
                            const statusPresentation = getStatusPresentation(ref);
                            return (
                                <tr key={ref.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleOpen(ref)}>
                                    {activeTab !== 'outgoing' && (
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            {organizations.find(o => o.id === ref.referring_org_id) && onSelectOrganization ? (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectOrganization(ref.referring_org_id, 'referrals');
                                                    }}
                                                    className="hover:text-indigo-700 hover:underline"
                                                >
                                                    {organizations.find(o => o.id === ref.referring_org_id)?.name}
                                                </button>
                                            ) : (
                                                organizations.find(o => o.id === ref.referring_org_id)?.name
                                            )}
                                        </td>
                                    )}
                                    {activeTab !== 'incoming' && (
                                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                            {organizations.find(o => o.id === ref.receiving_org_id) && onSelectOrganization ? (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectOrganization(ref.receiving_org_id, 'referrals');
                                                    }}
                                                    className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                                                >
                                                    {organizations.find(o => o.id === ref.receiving_org_id)?.name}
                                                    <span aria-hidden="true">↗</span>
                                                </button>
                                            ) : (
                                                organizations.find(o => o.id === ref.receiving_org_id)?.name
                                            )}
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        <div>
                                            {subjectPerson && onSelectPerson ? (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectPerson(subjectPerson.id);
                                                    }}
                                                    className="font-medium text-indigo-600 hover:underline"
                                                >
                                                    {getReferralLabel(ref)}
                                                </button>
                                            ) : (
                                                getReferralLabel(ref)
                                            )}
                                            {subjectOrg && (
                                                <div className="mt-0.5">
                                                    {onSelectOrganization ? (
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                onSelectOrganization(subjectOrg.id);
                                                            }}
                                                            className="text-xs text-gray-500 hover:text-indigo-600 hover:underline"
                                                        >
                                                            {subjectOrg.name}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-500">{subjectOrg.name}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="mt-1 text-xs text-gray-400">{getReferralTypeLabel(ref)}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <Badge color={statusPresentation.color}>{statusPresentation.label}</Badge>
                                            {(() => {
                                                const aging = getAgingBadge(ref);
                                                if (!aging) return null;
                                                return (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${aging.color === 'red' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        ⚠ {aging.text}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">{getOwnerLabel(ref)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{ref.follow_up_date || 'Not scheduled'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{formatReferralDate(ref.date)}</td>
                                    <td className="px-6 py-4 text-right text-sm text-indigo-600 hover:text-indigo-900">
                                        {ref.status === 'pending' && activeTab === 'incoming'
                                            ? 'Review'
                                            : ref.status === 'pending' && activeTab === 'outgoing'
                                                ? 'Follow Up'
                                                : 'View'}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredReferrals.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-sm text-gray-500 text-center">
                                    {activeTab === 'incoming' 
                                        ? "No incoming referrals found. You're all caught up!" 
                                        : activeTab === 'outgoing' 
                                            ? "No outgoing referrals found. Start networking!"
                                            : "No referrals match your criteria."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
             </div>

             {/* Referral Detail Modal */}
             {selectedReferral && (
                 <Modal isOpen={!!selectedReferral} onClose={() => setSelectedReferral(null)} title="Manage Referral" wide>
                     <div className="space-y-6">
                         <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm">
                             <div className="grid grid-cols-2 gap-4 mb-2">
                                 <div><span className="font-bold text-gray-500">From:</span> {organizations.find(o => o.id === selectedReferral.referring_org_id)?.name}</div>
                                 <div><span className="font-bold text-gray-500">To:</span> {organizations.find(o => o.id === selectedReferral.receiving_org_id)?.name}</div>
                             </div>
                             <div className="mb-2">
                                 <span className="font-bold text-gray-500">Subject:</span> {people.find(p => p.id === selectedReferral.subject_person_id)?.first_name} {people.find(p => p.id === selectedReferral.subject_person_id)?.last_name}
                             </div>
                             <div className="mb-2">
                                 <span className="font-bold text-gray-500">Case Type:</span> {getReferralTypeLabel(selectedReferral)}
                             </div>
                             <div className="mb-2">
                                 <span className="font-bold text-gray-500">Introduction Note:</span>
                                 <p className="mt-1 text-gray-800 italic bg-white p-2 rounded border">{selectedReferral.notes}</p>
                             </div>
                             <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-2">
                                 {selectedReferral.delivered_at && <span>Delivered: {new Date(selectedReferral.delivered_at).toLocaleDateString()}</span>}
                                 {selectedReferral.accepted_at && <span>Accepted: {new Date(selectedReferral.accepted_at).toLocaleDateString()}</span>}
                                 {selectedReferral.closed_at && <span>Closed: {new Date(selectedReferral.closed_at).toLocaleDateString()}</span>}
                             </div>
                         </div>

                         {/* Email Preview Section */}
                         {selectedReferral.intro_email_sent && (
                             <div className="mt-4 border border-indigo-200 rounded-md overflow-hidden text-sm bg-indigo-50/50">
                                 <div className="bg-indigo-100 px-3 py-2 border-b border-indigo-200 flex justify-between items-center">
                                     <span className="font-bold text-indigo-900 text-xs uppercase tracking-wide">Email Sent</span>
                                     <span className="text-xs text-indigo-700">Preview Copy</span>
                                 </div>
                                 <div className="p-3 space-y-2 font-mono text-xs">
                                     <div className="flex gap-2">
                                         <span className="text-gray-500 w-12 text-right">To:</span> 
                                         <span className="text-gray-800">{getPreviewData(selectedReferral).to}</span>
                                     </div>
                                     <div className="flex gap-2">
                                         <span className="text-gray-500 w-12 text-right">Subject:</span> 
                                         <span className="text-gray-800 font-bold">{getPreviewData(selectedReferral).subject}</span>
                                     </div>
                                     <div className="pt-2 border-t border-indigo-100 mt-2 text-gray-700 whitespace-pre-wrap leading-relaxed">
                                         {getPreviewData(selectedReferral).body}
                                     </div>
                                 </div>
                             </div>
                         )}

                        {/* Actions: Incoming & Pending */}
                         {((selectedReferral.receiving_org_id === currentOrgId) || isSystemAdmin) && selectedReferral.status === 'pending' && (
                             <div className="space-y-3">
                                 <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4">
                                     {selectedReferral.owner_id ? (() => {
                                         const assignedPerson = people.find(p => p.id === selectedReferral.owner_id);
                                         const assignedName = assignedPerson ? `${assignedPerson.first_name} ${assignedPerson.last_name}` : 'a reviewer';
                                         return (
                                             <>
                                                 <div className="flex items-center gap-2">
                                                     <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                                                     <span className="text-sm font-medium text-slate-900">Assigned to {assignedName}</span>
                                                 </div>
                                                 <div className="flex flex-wrap gap-2">
                                                     <button type="button" onClick={() => setPendingAction('accept')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'accept' ? 'bg-green-600 text-white' : 'border border-green-300 bg-white text-green-700 hover:bg-green-50'}`}>Accept</button>
                                                     <button type="button" onClick={() => setPendingAction('assign')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'assign' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Reassign</button>
                                                     <button type="button" onClick={() => setPendingAction('decline')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'decline' ? 'bg-red-600 text-white' : 'border border-red-300 bg-white text-red-700 hover:bg-red-50'}`}>Decline</button>
                                                 </div>
                                             </>
                                         );
                                     })() : (
                                         <>
                                             <div className="text-sm font-medium text-slate-900">What do you want to do with this referral?</div>
                                             <div className="flex flex-wrap gap-2">
                                                 <button type="button" onClick={() => setPendingAction('accept')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'accept' ? 'bg-green-600 text-white' : 'border border-green-300 bg-white text-green-700 hover:bg-green-50'}`}>Accept</button>
                                                 <button type="button" onClick={() => setPendingAction('assign')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'assign' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>Assign</button>
                                                 <button type="button" onClick={() => setPendingAction('decline')} className={`rounded px-4 py-2 text-sm font-medium ${pendingAction === 'decline' ? 'bg-red-600 text-white' : 'border border-red-300 bg-white text-red-700 hover:bg-red-50'}`}>Decline</button>
                                             </div>
                                             <div className="text-xs text-slate-600">Accept now, assign it to someone else for review, or decline with a shared reason.</div>
                                         </>
                                     )}
                                 </div>
                                 {pendingAction === 'assign' && (
                                     <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
                                         <div>
                                             <div className="text-sm font-medium text-slate-900">{selectedReferral.owner_id ? 'Reassign reviewer' : 'Assign reviewer'}</div>
                                             <div className="text-xs text-slate-600">Choose who should review this referral and decide what happens next.</div>
                                         </div>
                                         <div className="space-y-2">
                                             <label htmlFor="pending-reviewer-search" className={FORM_LABEL_CLASS}>Choose Reviewer</label>
                                             <input
                                                 id="pending-reviewer-search"
                                                 className={FORM_INPUT_CLASS}
                                                 value={assignedOwnerSearch}
                                                 onChange={(e) => setAssignedOwnerSearch(e.target.value)}
                                                 placeholder="Type name, email, or role to filter reviewers..."
                                             />
                                             {selectedAssignedOwner ? (
                                                 <div className="flex items-center justify-between rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                                                     <div>
                                                         <div className="font-medium text-indigo-900">{selectedAssignedOwner.first_name} {selectedAssignedOwner.last_name}</div>
                                                         <div className="text-xs text-indigo-700">{selectedAssignedOwner.email}</div>
                                                     </div>
                                                     <button
                                                         type="button"
                                                         onClick={() => {
                                                             setAssignedOwnerId('');
                                                             setAssignedOwnerSearch('');
                                                         }}
                                                         className="text-sm font-medium text-indigo-700 hover:underline"
                                                     >
                                                         Clear
                                                     </button>
                                                 </div>
                                             ) : (
                                                 <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white">
                                                     {filteredAssignablePeople.length === 0 ? (
                                                         <div className="px-3 py-2 text-sm text-gray-500">No matching reviewers.</div>
                                                     ) : (
                                                         filteredAssignablePeople.map((person) => (
                                                             <button
                                                                 key={person.id}
                                                                 type="button"
                                                                 onClick={() => {
                                                                     setAssignedOwnerId(person.id);
                                                                     setAssignedOwnerSearch(`${person.first_name} ${person.last_name}`);
                                                                 }}
                                                                 className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                                                             >
                                                                 <div className="text-sm font-medium text-gray-900">{person.first_name} {person.last_name}</div>
                                                                 <div className="text-xs text-gray-500">{person.email}{person.role ? ` · ${person.role}` : ''}</div>
                                                             </button>
                                                         ))
                                                     )}
                                                 </div>
                                             )}
                                         </div>
                                         <div className="flex justify-end gap-2">
                                             <button onClick={() => setPendingAction(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50">Back</button>
                                             <button
                                                 onClick={handleAssignReviewer}
                                                 disabled={!assignedOwnerId || isProcessing}
                                                 className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                             >
                                                 {selectedReferral.owner_id ? 'Reassign reviewer' : 'Assign reviewer'}
                                             </button>
                                         </div>
                                     </div>
                                 )}
                                 {pendingAction === 'decline' && (
                                     <div className="space-y-3 rounded border border-rose-200 bg-rose-50 p-4">
                                         <div>
                                             <div className="text-sm font-medium text-rose-900">Decline with shared reason</div>
                                             <div className="text-xs text-rose-800">Explain why this referral is being declined. This reason is saved on the referral and can be emailed out.</div>
                                         </div>
                                         <div>
                                             <label className={FORM_LABEL_CLASS}>Reason to Share</label>
                                             <textarea className={FORM_TEXTAREA_CLASS} rows={3} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="We don't offer this program, we're at capacity, or other context to help the entrepreneur and introducer..." />
                                         </div>
                                         <label className="flex items-start gap-2 text-sm text-rose-900">
                                             <input type="checkbox" className="mt-1" checked={sendDeclineEmail} onChange={(e) => setSendDeclineEmail(e.target.checked)} />
                                             <span>Email this reason to the entrepreneur and introducer</span>
                                         </label>
                                         <div className="flex justify-end gap-2">
                                             <button onClick={() => setPendingAction(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-white">Back</button>
                                             <button onClick={handleDecline} className="px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-100">Confirm decline</button>
                                         </div>
                                     </div>
                                 )}
                                {pendingAction === 'accept' && (() => {
                                    const subjectPerson = people.find(p => p.id === selectedReferral.subject_person_id);
                                    const hasEmail = !!subjectPerson?.email;
                                    return (
                                        <div className="space-y-3 rounded border border-green-200 bg-green-50 p-4">
                                            <div>
                                                <div className="text-sm font-medium text-green-900">Accept & Invite to Connect</div>
                                                <div className="text-xs text-green-800">Accepting marks this referral as active. You can send an invite email to the entrepreneur now — or skip and send it later.</div>
                                            </div>
                                            {hasEmail ? (
                                                <>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className={FORM_LABEL_CLASS} style={{marginBottom: 0}}>Start from a template</label>
                                                            {onEditMyTemplates && <button type="button" onClick={onEditMyTemplates} className="text-xs text-indigo-500 hover:underline">Edit my templates →</button>}
                                                        </div>
                                                        <select className={FORM_SELECT_CLASS} value={acceptanceEmailTemplate}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setAcceptanceEmailTemplate(val as any);
                                                                const tpl = allTemplates.find(t => t.id === val);
                                                                setAcceptanceEmailMessage(tpl ? tpl.body : '');
                                                            }}>
                                                            <option value="custom">— Blank / write your own —</option>
                                                            {allTemplates.map(tpl => (
                                                                <option key={tpl.id} value={tpl.id}>{tpl.name || 'Unnamed template'}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={FORM_LABEL_CLASS}>
                                                            Message to {subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'entrepreneur'}
                                                            <span className="font-normal text-gray-400 ml-1">(optional)</span>
                                                        </label>
                                                        <textarea className={FORM_TEXTAREA_CLASS} rows={4}
                                                            value={acceptanceEmailMessage}
                                                            onChange={(e) => setAcceptanceEmailMessage(e.target.value)}
                                                            placeholder="Leave blank to skip the invite email for now..." />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="rounded border border-green-300 bg-white px-3 py-2 text-xs text-green-800">
                                                    No email on file for this entrepreneur — you can send an invite after accepting from the referral detail.
                                                    {subjectPerson && onSelectPerson && (
                                                        <button type="button" onClick={() => { setSelectedReferral(null); onSelectPerson(subjectPerson.id); }}
                                                            className="block mt-1 underline font-medium hover:text-green-700">
                                                            Add email to their profile →
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setPendingAction(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-white text-sm">Back</button>
                                                <button onClick={handleAccept} disabled={isProcessing}
                                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                                                    {acceptanceEmailMessage.trim() ? 'Accept & Send Invite' : 'Accept'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}
                             </div>
                         )}

                         {/* Actions: Accepted (Manage Referral) */}
                         {(selectedReferral.receiving_org_id === currentOrgId || isSystemAdmin) && selectedReferral.status === 'accepted' && (() => {
                             const TAG_SUGGESTIONS = [
                                 'Series A', 'Series B', 'Seed Round', 'Angel Investment',
                                 '$10k Grant', '$25k Grant', '$50k Grant', '$100k Grant',
                                 'SBIR Grant', 'Pilot Program', 'Accelerator', 'Incubator',
                                 'Workshop Attended', 'Mentorship Match', 'Strategic Partnership',
                                 'New Hire', 'Revenue Milestone', 'Product Launch', 'Export Ready',
                                 'Manufacturing', 'Workspace Access', 'Equipment Access',
                             ];
                             const filteredTagSuggestions = TAG_SUGGESTIONS.filter(
                                 s => s.toLowerCase().includes(tagInputValue.toLowerCase()) && !tagChips.includes(s)
                             );
                             const addTag = (tag: string) => {
                                 const trimmed = tag.trim();
                                 if (trimmed && !tagChips.includes(trimmed)) {
                                     setTagChips([...tagChips, trimmed]);
                                 }
                                 setTagInputValue('');
                             };
                             const removeTag = (tag: string) => setTagChips(tagChips.filter(t => t !== tag));

                             const actionBtnClass = (panel: typeof activePanel) =>
                                 `px-3 py-2 text-sm font-medium rounded border transition-colors ${
                                     activePanel === panel
                                         ? 'bg-slate-800 text-white border-slate-800'
                                         : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                 }`;

                             return (
                                 <div className="space-y-3">
                                     {/* Status summary */}
                                     <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 px-1">
                                         <span>Owner: <strong className="text-slate-800">{getOwnerLabel(selectedReferral)}</strong></span>
                                         {selectedReferral.follow_up_date && (
                                             <>
                                                 <span className="hidden sm:inline text-slate-300">·</span>
                                                 <span>Follow-up: <strong className="text-slate-800">{selectedReferral.follow_up_date}</strong></span>
                                             </>
                                         )}
                                     </div>

                                     {/* Action buttons */}
                                     <div className="border-t border-slate-100 pt-3 space-y-2">
                                         <div className="flex flex-wrap gap-2">
                                             <button type="button" onClick={() => setActivePanel(activePanel === 'email' ? null : 'email')}
                                                 className={`px-4 py-2 text-sm font-medium rounded border transition-colors ${activePanel === 'email' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}>
                                                 Invite to Connect
                                             </button>
                                             <button type="button" onClick={() => setActivePanel(activePanel === 'close' ? null : 'close')}
                                                 className={`px-4 py-2 text-sm font-medium rounded border transition-colors ${activePanel === 'close' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                                                 Complete Referral
                                             </button>
                                         </div>
                                         <div>
                                             <button type="button" onClick={() => setActivePanel(activePanel === 'assign' ? null : 'assign')}
                                                 className="text-xs text-slate-400 hover:text-slate-600 underline">
                                                 {activePanel === 'assign' ? 'Cancel reassign' : `Reassign${selectedReferral.owner_id ? ` (currently ${getOwnerLabel(selectedReferral)})` : ''}`}
                                             </button>
                                         </div>
                                     </div>

                                     {/* Reassign panel (secondary) */}
                                     {activePanel === 'assign' && (
                                         <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
                                             <input
                                                 className={FORM_INPUT_CLASS}
                                                 value={assignedOwnerSearch}
                                                 onChange={(e) => setAssignedOwnerSearch(e.target.value)}
                                                 placeholder="Type name, email, or role to filter..."
                                             />
                                             {selectedAssignedOwner ? (
                                                 <div className="flex items-center justify-between rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                                                     <div>
                                                         <div className="font-medium text-indigo-900">{selectedAssignedOwner.first_name} {selectedAssignedOwner.last_name}</div>
                                                         <div className="text-xs text-indigo-700">{selectedAssignedOwner.email}</div>
                                                     </div>
                                                     <button type="button" onClick={() => { setAssignedOwnerId(''); setAssignedOwnerSearch(''); }} className="text-sm font-medium text-indigo-700 hover:underline">Clear</button>
                                                 </div>
                                             ) : (
                                                 <div className="max-h-36 overflow-y-auto rounded border border-gray-200 bg-white">
                                                     {filteredAssignablePeople.length === 0 ? (
                                                         <div className="px-3 py-2 text-sm text-gray-500">No matching people.</div>
                                                     ) : (
                                                         filteredAssignablePeople.map((person) => (
                                                             <button key={person.id} type="button"
                                                                 onClick={() => { setAssignedOwnerId(person.id); setAssignedOwnerSearch(`${person.first_name} ${person.last_name}`); }}
                                                                 className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50">
                                                                 <div className="text-sm font-medium text-gray-900">{person.first_name} {person.last_name}</div>
                                                                 <div className="text-xs text-gray-500">{person.email}{person.role ? ` · ${person.role}` : ''}</div>
                                                             </button>
                                                         ))
                                                     )}
                                                 </div>
                                             )}
                                             <div className="flex justify-end">
                                                 <button onClick={handleAssignOwnerAccepted} disabled={!assignedOwnerId || isProcessing}
                                                     className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">
                                                     Save
                                                 </button>
                                             </div>
                                         </div>
                                     )}


                                     {/* Send Email panel */}
                                     {activePanel === 'email' && (() => {
                                         const subjectPerson = people.find(p => p.id === selectedReferral.subject_person_id);
                                         const receivingOrg = organizations.find((o: any) => o.id === selectedReferral.receiving_org_id);
                                         const autoSubject = receivingOrg
                                             ? `${receivingOrg.name} accepted your referral`
                                             : '[Org name] accepted your referral';
                                         return (
                                             <div className="rounded border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                                                 <h4 className="font-semibold text-sm text-emerald-900">Invite to Connect</h4>
                                                 <p className="text-xs text-emerald-800">Send next steps directly to the entrepreneur — a scheduling link, tour invite, or custom message.</p>
                                                 {hasAcceptanceEmailRecipients ? (
                                                     <>
                                                         <div>
                                                             <div className="flex items-center justify-between mb-1">
                                                            <label className={FORM_LABEL_CLASS} style={{marginBottom: 0}}>Start from a template</label>
                                                            {onEditMyTemplates && <button type="button" onClick={onEditMyTemplates} className="text-xs text-indigo-500 hover:underline">Edit my templates →</button>}
                                                        </div>
                                                             <select className={FORM_SELECT_CLASS} value={acceptanceEmailTemplate}
                                                                 onChange={(e) => {
                                                                     const val = e.target.value;
                                                                     setAcceptanceEmailTemplate(val as any);
                                                                     const tpl = allTemplates.find(t => t.id === val);
                                                                     setAcceptanceEmailMessage(tpl ? tpl.body : '');
                                                                     setAcceptanceEmailSubject(tpl?.subject || '');
                                                                 }}>
                                                                 <option value="custom">— Blank / write your own —</option>
                                                                 {allTemplates.map(tpl => (
                                                                     <option key={tpl.id} value={tpl.id}>{tpl.name || 'Unnamed template'}</option>
                                                                 ))}
                                                             </select>
                                                         </div>
                                                         <div>
                                                             <label className={FORM_LABEL_CLASS}>Subject line</label>
                                                             <input className={FORM_INPUT_CLASS}
                                                                 value={acceptanceEmailSubject}
                                                                 onChange={(e) => setAcceptanceEmailSubject(e.target.value)}
                                                                 placeholder={`Leave blank for auto: "${autoSubject}"`} />
                                                             <p className="text-xs text-gray-400 mt-0.5">If blank, defaults to <em>"{autoSubject}"</em></p>
                                                         </div>
                                                         <div>
                                                             <label className={FORM_LABEL_CLASS}>Message to {subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'entrepreneur'}</label>
                                                             <textarea className={FORM_TEXTAREA_CLASS} rows={5}
                                                                 value={acceptanceEmailMessage}
                                                                 onChange={(e) => setAcceptanceEmailMessage(e.target.value)}
                                                                 placeholder="Write your message here. You can include links, scheduling URLs, or any next-step instructions." />
                                                             <div className="mt-1.5 rounded bg-emerald-100 border border-emerald-200 px-2.5 py-2 text-xs text-emerald-800 space-y-0.5">
                                                                 <p className="font-semibold">Tokens replaced on send:</p>
                                                                 <p><code className="bg-white/60 rounded px-1">{'{{first_name}}'}</code> — entrepreneur's first name</p>
                                                                 <p><code className="bg-white/60 rounded px-1">{'{{subject_name}}'}</code> — entrepreneur's full name</p>
                                                                 <p><code className="bg-white/60 rounded px-1">{'{{receiving_org}}'}</code> — your org ({receivingOrg?.name || 'your org'})</p>
                                                                 <p><code className="bg-white/60 rounded px-1">{'{{referring_org}}'}</code> — the introducing organization</p>
                                                             </div>
                                                         </div>
                                                         <div className="flex justify-end">
                                                             <button onClick={handleSendAcceptanceEmail} disabled={!acceptanceEmailMessage.trim() || isProcessing}
                                                                 className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                 Send email
                                                             </button>
                                                         </div>
                                                     </>
                                                 ) : (
                                                     <div className="rounded border border-emerald-300 bg-white px-3 py-3 text-sm text-emerald-900 space-y-1">
                                                         <p className="font-medium">No email address on file for {subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'this entrepreneur'}.</p>
                                                         {subjectPerson && onSelectPerson && (
                                                             <button type="button" onClick={() => { setSelectedReferral(null); onSelectPerson(subjectPerson.id); }}
                                                                 className="text-xs underline font-medium text-emerald-800 hover:text-emerald-700">
                                                                 Edit their profile to add an email →
                                                             </button>
                                                         )}
                                                     </div>
                                                 )}
                                             </div>
                                         );
                                     })()}

                                     {/* Complete Referral panel */}
                                     {activePanel === 'close' && (
                                         <div className="rounded border border-gray-200 bg-gray-50 p-4 space-y-3">
                                             <div>
                                                 <h4 className="font-semibold text-sm text-gray-900">Complete Referral</h4>
                                                 <p className="text-xs text-gray-500 mt-0.5">Record what happened and close out this referral.</p>
                                             </div>
                                             <div className="grid grid-cols-2 gap-3">
                                                 <div>
                                                     <label className={FORM_LABEL_CLASS}>Meeting date</label>
                                                     <input type="date" className={FORM_INPUT_CLASS} value={intDate} onChange={(e) => setIntDate(e.target.value)} />
                                                 </div>
                                                 <div>
                                                     <label className={FORM_LABEL_CLASS}>How did you connect?</label>
                                                     <select className={FORM_SELECT_CLASS} value={intType} onChange={(e) => setIntType(e.target.value)}>
                                                         {enums.InteractionType.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                     </select>
                                                 </div>
                                             </div>
                                             <div>
                                                 <label className={FORM_LABEL_CLASS}>What happened?</label>
                                                 <textarea className={FORM_TEXTAREA_CLASS} rows={3} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="Brief notes from the meeting — what was discussed, what was decided..." />
                                             </div>
                                             <div>
                                                 <label className={FORM_LABEL_CLASS}>Outcome</label>
                                                 <select className={FORM_SELECT_CLASS} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                                                     {enums.ReferralOutcome.map(opt => (
                                                         <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                     ))}
                                                 </select>
                                             </div>
                                             <div>
                                                 <label className={FORM_LABEL_CLASS}>Tags <span className="font-normal text-gray-400">(optional)</span></label>
                                                 {tagChips.length > 0 && (
                                                     <div className="flex flex-wrap gap-1.5 mb-2">
                                                         {tagChips.map(tag => (
                                                             <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                                                                 {tag}
                                                                 <button type="button" onClick={() => removeTag(tag)} className="text-slate-500 hover:text-slate-900 leading-none">&times;</button>
                                                             </span>
                                                         ))}
                                                     </div>
                                                 )}
                                                 <div className="relative">
                                                     <input
                                                         className={FORM_INPUT_CLASS}
                                                         value={tagInputValue}
                                                         onChange={(e) => setTagInputValue(e.target.value)}
                                                         onKeyDown={(e) => {
                                                             if ((e.key === 'Enter' || e.key === ',') && tagInputValue.trim()) {
                                                                 e.preventDefault();
                                                                 addTag(tagInputValue);
                                                             }
                                                         }}
                                                         placeholder="Type a tag and press Enter..."
                                                     />
                                                     {tagInputValue && filteredTagSuggestions.length > 0 && (
                                                         <div className="absolute z-10 mt-1 w-full rounded border border-gray-200 bg-white shadow-sm">
                                                             {filteredTagSuggestions.slice(0, 6).map(s => (
                                                                 <button key={s} type="button" onMouseDown={() => addTag(s)}
                                                                     className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                                                                     {s}
                                                                 </button>
                                                             ))}
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>
                                             {(() => {
                                                 const subjectOrg = selectedReferral.subject_org_id ? organizations.find((o: any) => o.id === selectedReferral.subject_org_id) : null;
                                                 const alreadyClient = subjectOrg?.managed_by_ids?.includes(currentOrgId);
                                                 return subjectOrg && !alreadyClient ? (
                                                     <label className="flex items-center gap-3 cursor-pointer rounded border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                                                         <input
                                                             type="checkbox"
                                                             checked={addAsClient}
                                                             onChange={(e) => setAddAsClient(e.target.checked)}
                                                             className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                         />
                                                         <span className="text-sm text-indigo-900">
                                                             Add <strong>{subjectOrg.name}</strong> to Our Clients
                                                         </span>
                                                     </label>
                                                 ) : alreadyClient ? (
                                                     <div className="text-xs text-gray-400 px-1">✓ {subjectOrg?.name} is already in Our Clients</div>
                                                 ) : null;
                                             })()}
                                             <button onClick={handleClose} disabled={!outcome || isProcessing}
                                                 className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                 Mark as Completed
                                             </button>
                                         </div>
                                     )}
                                 </div>
                             );
                         })()}

                         {/* Read Only / Outgoing View */}
                         {((selectedReferral.referring_org_id === currentOrgId) || (selectedReferral.status !== 'pending' && selectedReferral.status !== 'accepted')) && (
                             <div className="text-center text-gray-500 py-4">
                                 <div className="mb-2">
                                    Status: <Badge color={getStatusPresentation(selectedReferral).color}>{getStatusPresentation(selectedReferral).label}</Badge>
                                 </div>
                                 {selectedReferral.referring_org_id === currentOrgId && selectedReferral.status === 'pending' && (
                                     <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-4 text-left">
                                         <h4 className="mb-1 text-sm font-bold text-amber-900">Waiting on the receiving organization</h4>
                                         <p className="text-sm text-amber-800">
                                             This referral has been sent, but the receiving organization has not accepted it yet. You can send a reminder or a follow-up note while it is still awaiting acceptance.
                                         </p>
                                         {(() => {
                                             const receivingOrg = organizations.find(o => o.id === selectedReferral.receiving_org_id);
                                             const recipientEmail = receivingOrg?.email;
                                             const referralLabel = getReferralLabel(selectedReferral);
                                             return (
                                                 <div className="mt-3 flex flex-wrap gap-2">
                                                     <button
                                                         type="button"
                                                         disabled={!recipientEmail || isProcessing}
                                                         onClick={() => void sendReferralReminder(selectedReferral.id, 'reminder')}
                                                         className="rounded border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                     >
                                                         Send reminder
                                                     </button>
                                                     <button
                                                         type="button"
                                                         disabled={!recipientEmail || isProcessing}
                                                         onClick={() => void sendReferralReminder(selectedReferral.id, 'follow_up')}
                                                         className="rounded border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                     >
                                                         Send follow-up
                                                     </button>
                                                     {!recipientEmail && (
                                                         <span className="self-center text-xs text-amber-800">
                                                             Add an organization email to enable reminder messages.
                                                         </span>
                                                     )}
                                                 </div>
                                             );
                                         })()}
                                     </div>
                                 )}
                                 {selectedReferral.outcome && (
                                     <div className="mb-2">
                                         <span className="block text-xs uppercase font-bold text-gray-400">Result</span>
                                         <span className="font-bold text-gray-900">
                                             {enums.ReferralOutcome.find(o => o.id === selectedReferral.outcome)?.label || selectedReferral.outcome}
                                         </span>
                                     </div>
                                 )}
                                 {selectedReferral.response_notes && (
                                     <div className="mt-2 text-sm bg-gray-50 p-2 rounded text-left">
                                         <strong>Response:</strong> {selectedReferral.response_notes}
                                     </div>
                                 )}
                                 {selectedReferral.outcome_tags && selectedReferral.outcome_tags.length > 0 && (
                                     <div className="mt-2">
                                         Tags: {selectedReferral.outcome_tags.map(t => <Badge key={t} color="green">{t}</Badge>)}
                                     </div>
                                 )}
                             </div>
                         )}
                     </div>
                 </Modal>
             )}

             <CreateReferralModal 
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateReferral}
                organizations={organizations}
                currentOrgId={currentOrgId}
             />
        </div>
    );
};
