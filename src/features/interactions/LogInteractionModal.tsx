import React, { useEffect, useState } from 'react';
import { Organization, InteractionType } from '../../domain/types';
import { Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface LogInteractionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    organizations: Organization[];
}

const INTERACTION_TYPES: Array<{ value: InteractionType; label: string }> = [
    { value: 'meeting', label: 'Meeting' },
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
    { value: 'event', label: 'Event' },
    { value: 'note', label: 'Note' },
];

/**
 * Records a piece of support work.
 *
 * Two separate choices, matching the compact:
 * - Whether the FACT is shared ("your org met with this venture on this date")
 *   with partners who also work with them. That is a per-event choice.
 * - The NOTES are never shared. They stay with the organization that wrote
 *   them, whatever the sharing choice.
 */
export const LogInteractionModal = ({ isOpen, onClose, onComplete, organizations }: LogInteractionModalProps) => {
    const repos = useRepos();
    const viewer = useViewer();

    const [orgId, setOrgId] = useState('');
    const [type, setType] = useState<InteractionType>('meeting');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [shareFact, setShareFact] = useState(true);
    const [notes, setNotes] = useState('');
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setOrgId(organizations.length === 1 ? organizations[0].id : '');
        setType('meeting');
        setDate(new Date().toISOString().split('T')[0]);
        setShareFact(true);
        setNotes('');
        setFormError('');
    }, [isOpen, organizations]);

    const handleSave = async () => {
        setFormError('');
        if (!orgId) {
            setFormError('Choose the venture or organization this was with.');
            return;
        }
        setIsSaving(true);
        try {
            await repos.interactions.add({
                id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                organization_id: orgId,
                date,
                type,
                note_confidential: !shareFact,
                visibility: shareFact ? 'network_shared' : 'eso_private',
                notes,
                author_org_id: viewer.orgId,
                ecosystem_id: viewer.ecosystemId,
            });
            onComplete();
            onClose();
        } catch (error: any) {
            setFormError(error?.message || 'Could not save this activity.');
        } finally {
            setIsSaving(false);
        }
    };

    const orgOptions = organizations.map(o => ({ id: o.id, label: o.name, subLabel: o.email }));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Log Activity">
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <SearchableSelect
                            label="Venture or organization"
                            options={orgOptions}
                            value={orgId}
                            onChange={setOrgId}
                            placeholder="Search organizations…"
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Type</label>
                        <select className={FORM_SELECT_CLASS} value={type} onChange={(e) => setType(e.target.value as InteractionType)}>
                            {INTERACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Date</label>
                        <input type="date" className={FORM_INPUT_CLASS} value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={shareFact}
                        onChange={(e) => setShareFact(e.target.checked)}
                    />
                    <span>
                        <span className="font-medium text-gray-900">Let partners who work with this venture know this happened</span>
                        <span className="block text-gray-600">They see your organization, the type of activity, and the date — so they can coordinate rather than duplicate. Nothing else.</span>
                    </span>
                </label>

                <div>
                    <label className={FORM_LABEL_CLASS}>Notes <span className="font-normal text-gray-500">— private to your organization</span></label>
                    <textarea
                        className={FORM_TEXTAREA_CLASS}
                        rows={5}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What was discussed, next steps…"
                    />
                    <p className="mt-1 text-xs text-gray-500">Notes are never shared with other organizations, whatever you choose above.</p>
                </div>

                {formError && <p className="text-sm text-red-600">{formError}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium text-sm">Cancel</button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={isSaving}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium text-sm disabled:opacity-50"
                    >
                        {isSaving ? 'Saving…' : 'Save activity'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
