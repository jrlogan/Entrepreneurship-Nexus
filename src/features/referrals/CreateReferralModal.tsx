
import React, { useState, useEffect, useMemo } from 'react';
import { Organization, Person, Referral } from '../../domain/types';
import { Modal, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS, FORM_INPUT_CLASS } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface CreateReferralModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (referral: Partial<Referral>) => void;
    subjectOrg?: Organization;
    organizations: Organization[];
    currentOrgId: string;
}

export const CreateReferralModal = ({ isOpen, onClose, onSave, subjectOrg, organizations, currentOrgId }: CreateReferralModalProps) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [receivingOrgId, setReceivingOrgId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedPersonId, setSelectedPersonId] = useState('');
    const [contactName, setContactName] = useState('');
    const [notes, setNotes] = useState('');
    const [sendEmail, setSendEmail] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setReceivingOrgId('');
            setSelectedSubjectId(subjectOrg?.id || '');
            setSelectedPersonId('');
            setContactName('');
            setNotes('');
            setSendEmail(false);
        }
    }, [isOpen, subjectOrg]);

    // Determine the active subject (either passed in or selected)
    const activeSubjectId = subjectOrg?.id || selectedSubjectId;
    const activeSubject = organizations.find(o => o.id === activeSubjectId);

    // Fetch people for the selected org
    const availablePeople = useMemo(() => {
        if (!activeSubjectId) return [];
        return repos.people.getAll().filter(p => p.organization_id === activeSubjectId);
    }, [activeSubjectId, repos]);

    // Fetch context for preview
    const subjectPerson = availablePeople.find(p => p.id === selectedPersonId);
    const referringOrg = organizations.find(o => o.id === currentOrgId);
    const receivingOrg = organizations.find(o => o.id === receivingOrgId);
    const currentUser = repos.people.getById(viewer.personId);

    // Filter potential subjects (exclude current org)
    const subjectCandidates = organizations.filter(o => o.id !== currentOrgId);

    // Filter targets (ESOs, not current org, not subject)
    const targetOrgs = organizations.filter(o => 
        o.id !== currentOrgId && 
        o.id !== activeSubjectId && 
        o.roles.includes('eso')
    );

    const handleSave = () => {
        if (!receivingOrgId) {
            alert('Please select a recipient organization.');
            return;
        }
        if (!activeSubjectId) {
            alert('Please select an organization to refer.');
            return;
        }

        let finalNotes = notes;
        let finalPersonId = selectedPersonId;

        // Logic: If no person selected but contact name provided, use it in notes
        if (!finalPersonId && contactName) {
            finalNotes = `Primary Contact: ${contactName}\n\n${notes}`;
            finalPersonId = 'unknown_person';
        } else if (!finalPersonId) {
             finalPersonId = 'unknown_person';
        }

        onSave({
            referring_org_id: currentOrgId,
            receiving_org_id: receivingOrgId,
            subject_org_id: activeSubjectId,
            subject_person_id: finalPersonId, 
            date: new Date().toISOString().split('T')[0],
            status: 'pending',
            notes: finalNotes,
            intro_email_sent: sendEmail
        });
        
        setReceivingOrgId('');
        setSelectedSubjectId('');
        setSelectedPersonId('');
        setContactName('');
        setNotes('');
        setSendEmail(false);
        onClose();
    };

    const modalTitle = activeSubject ? `Refer ${activeSubject.name}` : "New Referral";

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
            <div className="space-y-4">
                {subjectOrg ? (
                    <p className="text-sm text-gray-600">Send a warm introduction for <strong>{subjectOrg.name}</strong> to another support organization in the network.</p>
                ) : (
                    <div>
                        <label className={FORM_LABEL_CLASS}>Organization to Refer</label>
                        <select 
                            className={FORM_SELECT_CLASS} 
                            value={selectedSubjectId} 
                            onChange={e => {
                                setSelectedSubjectId(e.target.value);
                                setSelectedPersonId(''); // Reset person when org changes
                            }}
                        >
                            <option value="">-- Select Organization --</option>
                            {subjectCandidates.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Select the client/entity you want to refer.</p>
                    </div>
                )}

                {activeSubjectId && (
                    <div>
                        <label className={FORM_LABEL_CLASS}>Person / Contact</label>
                        {availablePeople.length > 0 ? (
                            <select 
                                className={FORM_SELECT_CLASS}
                                value={selectedPersonId}
                                onChange={e => setSelectedPersonId(e.target.value)}
                            >
                                <option value="">-- Select Person (Optional) --</option>
                                {availablePeople.map(p => (
                                    <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.role})</option>
                                ))}
                            </select>
                        ) : (
                            <div>
                                <input 
                                    className={FORM_INPUT_CLASS}
                                    placeholder="Contact Name (e.g. John Doe)"
                                    value={contactName}
                                    onChange={e => setContactName(e.target.value)}
                                />
                                <p className="text-xs text-gray-500 mt-1">No people profiles found for this org. Enter name manually.</p>
                            </div>
                        )}
                    </div>
                )}
                
                <div>
                    <label className={FORM_LABEL_CLASS}>Recipient Organization (ESO)</label>
                    <select className={FORM_SELECT_CLASS} value={receivingOrgId} onChange={e => setReceivingOrgId(e.target.value)}>
                        <option value="">-- Select Partner --</option>
                        {targetOrgs.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Introduction / Notes</label>
                    <textarea 
                        className={FORM_TEXTAREA_CLASS} 
                        rows={4} 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Why are you referring them? What help do they need?"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="sendEmail" 
                        checked={sendEmail} 
                        onChange={e => setSendEmail(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300"
                    />
                    <label htmlFor="sendEmail" className="text-sm text-gray-700 font-medium">Send Automated Introduction Email</label>
                </div>

                {sendEmail && (
                    <div className="border border-indigo-200 rounded-md overflow-hidden text-sm bg-indigo-50/50 animate-in fade-in">
                        <div className="bg-indigo-100 px-3 py-2 border-b border-indigo-200 flex justify-between items-center">
                            <span className="font-bold text-indigo-900 text-xs uppercase tracking-wide">Email Preview</span>
                        </div>
                        <div className="p-3 space-y-2 font-mono text-xs">
                            <div className="flex gap-2">
                                <span className="text-gray-500 w-12 text-right">To:</span> 
                                <span className="text-gray-800">{subjectPerson?.email || 'candidate@example.com'}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-gray-500 w-12 text-right">Subject:</span> 
                                <span className="text-gray-800 font-bold">Introduction: {referringOrg?.name || 'My Org'} → {receivingOrg?.name || 'Partner Org'}</span>
                            </div>
                            <div className="pt-2 border-t border-indigo-100 mt-2 text-gray-700 whitespace-pre-wrap leading-relaxed">
{`Hello ${receivingOrg?.name || 'Partner'} Team,

I'd like to introduce ${subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : contactName || 'our client'} from ${activeSubject?.name || 'Client Org'}.

${notes || '(Your notes will appear here...)'}

Best,
${currentUser?.first_name || 'Staff'} ${currentUser?.last_name || ''}
${referringOrg?.name || 'Organization'}`}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-2 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm">Send Referral</button>
                </div>
            </div>
        </Modal>
    );
};
