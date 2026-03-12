
import React, { useState } from 'react';
import { Badge, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { loadEnums } from '../../domain/standards/loadStandards';
import { EnumSelect } from '../../shared/EnumSelect';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Referral, Person } from '../../domain/types';
import { CreateReferralModal } from './CreateReferralModal';

export const ReferralsView = ({
    currentUser,
    allReferrals = [],
    organizations = [],
    people = [],
    onSelectOrganization,
    onSelectPerson,
    onRefresh
}: {
    currentUser: Person;
    allReferrals?: Referral[];
    organizations?: any[];
    people?: Person[];
    onSelectOrganization?: (id: string, tab?: string) => void;
    onSelectPerson?: (id: string) => void;
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
    const [outcomeTags, setOutcomeTags] = useState('');
    const [followUpDate, setFollowUpDate] = useState('');
    const [assignedOwnerId, setAssignedOwnerId] = useState('');
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
    const [isProcessing, setIsProcessing] = useState(false);

    // Interaction Log State (within Referral Modal)
    const [intDate, setIntDate] = useState('');
    const [intType, setIntType] = useState('call');
    const [intNotes, setIntNotes] = useState('');

    const enums = loadEnums();
    
    const currentOrgId = currentUser.organization_id;
    const isSystemAdmin = ['platform_admin', 'ecosystem_manager'].includes(currentUser.system_role);

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
        setOutcome(ref.outcome || '');
        setOutcomeTags(ref.outcome_tags?.join(', ') || '');
        setFollowUpDate(ref.follow_up_date || '');
        setAssignedOwnerId(ref.owner_id || '');
        
        // Reset Interaction defaults
        setIntDate(new Date().toISOString().split('T')[0]);
        setIntType('call');
        setIntNotes('');
    };

    const handleAccept = async () => {
        if (selectedReferral) {
            setIsProcessing(true);
            try {
                await repos.referrals.accept(selectedReferral.id, responseNote, assignedOwnerId || undefined);
                if (followUpDate) {
                    await repos.referrals.updateFollowUp(selectedReferral.id, followUpDate);
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
            setIsProcessing(true);
            try {
                await repos.referrals.decline(selectedReferral.id, responseNote);
                setSelectedReferral(null);
                onRefresh?.();
            } catch (error) {
                console.error('Failed to decline referral:', error);
            } finally {
                setIsProcessing(false);
            }
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
                const tags = outcomeTags.split(',').map(s => s.trim()).filter(Boolean);
                await repos.referrals.close(selectedReferral.id, outcome, tags, responseNote);
                setSelectedReferral(null);
                onRefresh?.();
            } catch (error) {
                console.error('Failed to close referral:', error);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleUpdateFollowUp = async () => {
        if (selectedReferral && followUpDate) {
            setIsProcessing(true);
            try {
                if (assignedOwnerId) {
                    await repos.referrals.assignOwner(selectedReferral.id, assignedOwnerId);
                }
                await repos.referrals.updateFollowUp(selectedReferral.id, followUpDate);
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

    const getOwnerLabel = (ref: Referral) => {
        const owner = people.find(p => p.id === ref.owner_id);
        return owner ? `${owner.first_name} ${owner.last_name}` : 'Unassigned';
    };

    const assignablePeople = selectedReferral
        ? people.filter(p => p.organization_id === selectedReferral.receiving_org_id)
        : [];

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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Follow-Up</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredReferrals.map(ref => {
                            const subjectPerson = people.find(p => p.id === ref.subject_person_id);
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
                                                    className="hover:text-indigo-700 hover:underline"
                                                >
                                                    {organizations.find(o => o.id === ref.receiving_org_id)?.name}
                                                </button>
                                            ) : (
                                                organizations.find(o => o.id === ref.receiving_org_id)?.name
                                            )}
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {subjectPerson && onSelectPerson ? (
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSelectPerson(subjectPerson.id);
                                                }}
                                                className="font-medium text-indigo-600 hover:underline"
                                            >
                                                {subjectPerson.first_name} {subjectPerson.last_name}
                                            </button>
                                        ) : (
                                            subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'Unknown'
                                        )}
                                    </td>
                                    <td className="px-6 py-4"><Badge color={ref.status === 'pending' ? 'yellow' : ref.status === 'accepted' ? 'green' : ref.status === 'rejected' ? 'red' : 'blue'}>{ref.status}</Badge></td>
                                    <td className="px-6 py-4 text-sm text-gray-700">{getOwnerLabel(ref)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{ref.follow_up_date || 'Not scheduled'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{ref.date}</td>
                                    <td className="px-6 py-4 text-right text-sm text-indigo-600 hover:text-indigo-900">
                                        {ref.status === 'pending' && activeTab === 'incoming' ? 'Review' : 'View'}
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
                 <Modal isOpen={!!selectedReferral} onClose={() => setSelectedReferral(null)} title="Manage Referral">
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
                         {selectedReferral.receiving_org_id === currentOrgId && selectedReferral.status === 'pending' && (
                             <div className="space-y-3">
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                     <div>
                                         <label className={FORM_LABEL_CLASS}>Assign Follow-Up Owner</label>
                                         <select className={FORM_SELECT_CLASS} value={assignedOwnerId} onChange={(e) => setAssignedOwnerId(e.target.value)}>
                                             <option value="">Unassigned</option>
                                             {assignablePeople.map(person => (
                                                 <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>
                                             ))}
                                         </select>
                                     </div>
                                     <div>
                                         <label className={FORM_LABEL_CLASS}>Initial Follow-Up Due</label>
                                         <input type="date" className={FORM_INPUT_CLASS} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                                     </div>
                                 </div>
                                 <label className={FORM_LABEL_CLASS}>Response Note</label>
                                 <textarea className={FORM_TEXTAREA_CLASS} rows={3} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="Enter acceptance or rejection reason..."></textarea>
                                 <div className="flex gap-2 justify-end">
                                     <button onClick={handleDecline} className="px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50">Decline</button>
                                     <button onClick={handleAccept} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Accept Referral</button>
                                 </div>
                             </div>
                         )}

                         {/* Actions: Incoming & Accepted (Closing) */}
                         {selectedReferral.receiving_org_id === currentOrgId && selectedReferral.status === 'accepted' && (
                             <div className="space-y-6">
                                 
                                 {/* 1. Assign Owner And Due Date */}
                                 <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4">
                                     <h4 className="font-bold text-sm text-slate-900">Assign owner and next follow-up</h4>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                         <div>
                                             <label className={FORM_LABEL_CLASS}>Follow-Up Owner</label>
                                             <select className={FORM_SELECT_CLASS} value={assignedOwnerId} onChange={(e) => setAssignedOwnerId(e.target.value)}>
                                                 <option value="">Unassigned</option>
                                                 {assignablePeople.map(person => (
                                                     <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>
                                                 ))}
                                             </select>
                                         </div>
                                         <div>
                                             <label className={FORM_LABEL_CLASS}>Next Follow-Up Due</label>
                                             <div className="flex gap-2">
                                                 <input type="date" className={FORM_INPUT_CLASS} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                                                 <button onClick={handleUpdateFollowUp} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Save</button>
                                             </div>
                                         </div>
                                     </div>
                                     <div className="text-xs text-slate-700">
                                         Current owner: <strong>{getOwnerLabel(selectedReferral)}</strong>
                                         {' · '}
                                         Follow-up due: <strong>{selectedReferral.follow_up_date || 'Not scheduled'}</strong>
                                     </div>
                                 </div>

                                 {/* 2. Log Activity */}
                                 <div className="bg-indigo-50 p-4 rounded border border-indigo-100">
                                     <h4 className="font-bold text-sm text-indigo-900 mb-3 flex items-center gap-2">
                                         <span>📞</span> Log follow-up note
                                     </h4>
                                     <div className="space-y-3">
                                         <div className="grid grid-cols-2 gap-2">
                                             <div>
                                                 <label className="block text-xs font-medium text-indigo-800 mb-1">Date</label>
                                                 <input 
                                                    type="date" 
                                                    className="block w-full rounded border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-1.5"
                                                    value={intDate} 
                                                    onChange={(e) => setIntDate(e.target.value)} 
                                                 />
                                             </div>
                                             <div>
                                                 <label className="block text-xs font-medium text-indigo-800 mb-1">Type</label>
                                                 <select 
                                                    className="block w-full rounded border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-1.5"
                                                    value={intType}
                                                    onChange={(e) => setIntType(e.target.value)}
                                                 >
                                                     {enums.InteractionType.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                 </select>
                                             </div>
                                         </div>
                                         <div>
                                             <input 
                                                className="block w-full rounded border-indigo-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2"
                                                placeholder="What happened in the follow-up?"
                                                value={intNotes}
                                                onChange={(e) => setIntNotes(e.target.value)}
                                             />
                                         </div>
                                         <div className="flex justify-end">
                                             <button 
                                                onClick={handleLogInteraction}
                                                disabled={!intNotes}
                                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 disabled:opacity-50"
                                             >
                                                 Save follow-up note
                                             </button>
                                         </div>
                                     </div>
                                 </div>

                                 {/* 3. Close Referral */}
                                 <div className="pt-4 border-t border-gray-100">
                                    <h4 className="font-bold text-sm text-gray-800 mb-2">Close referral</h4>
                                    <div className="space-y-2">
                                        <div>
                                            <label className={FORM_LABEL_CLASS}>Primary Outcome <span className="text-red-500">*</span></label>
                                            <select 
                                                className={FORM_SELECT_CLASS} 
                                                value={outcome} 
                                                onChange={(e) => setOutcome(e.target.value)}
                                            >
                                                <option value="">-- Select Outcome --</option>
                                                {enums.ReferralOutcome.map(opt => (
                                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={FORM_LABEL_CLASS}>Additional Tags (Optional)</label>
                                            <input 
                                                className={FORM_INPUT_CLASS} 
                                                value={outcomeTags} 
                                                onChange={(e) => setOutcomeTags(e.target.value)} 
                                                placeholder="e.g. Series A, $50k Grant, Pilot Program" 
                                            />
                                        </div>
                                        <div>
                                            <label className={FORM_LABEL_CLASS}>Closing Note</label>
                                            <textarea className={FORM_TEXTAREA_CLASS} rows={2} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} placeholder="Final details..."></textarea>
                                        </div>
                                        <button onClick={handleClose} disabled={!outcome} className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">Mark as Completed</button>
                                    </div>
                                 </div>
                             </div>
                         )}

                         {/* Read Only / Outgoing View */}
                         {((selectedReferral.referring_org_id === currentOrgId) || (selectedReferral.status !== 'pending' && selectedReferral.status !== 'accepted')) && (
                             <div className="text-center text-gray-500 py-4">
                                 <div className="mb-2">
                                    Status: <Badge color={selectedReferral.status === 'pending' ? 'yellow' : selectedReferral.status === 'accepted' ? 'green' : 'red'}>{selectedReferral.status}</Badge>
                                 </div>
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
