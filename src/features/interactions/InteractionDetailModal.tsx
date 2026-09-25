
import React from 'react';
import { Interaction, Organization } from '../../domain/types';
import { Modal, Badge } from '../../shared/ui/Components';
import { useViewer } from '../../data/AppDataContext';
import { useAdminReadLogger } from '../../data/useAdminReadLogger';

interface InteractionDetailModalProps {
    interaction: Interaction | null;
    onClose: () => void;
    organizations: Organization[];
}

export const InteractionDetailModal = ({ interaction, onClose, organizations }: InteractionDetailModalProps) => {
    const viewer = useViewer();

    // Tier-5 audit: log when an admin opens an interaction not authored by
    // their own org. The hook self-gates on role and active=false; calling
    // it before the early return keeps hook order stable.
    useAdminReadLogger({
        resourceType: 'interaction',
        resourceId: interaction?.id || '',
        subjectOrgId: interaction?.organization_id,
        surface: 'interaction_detail',
        active: !!interaction && interaction.author_org_id !== viewer.orgId,
    });

    if (!interaction) return null;

    const subjectOrg = organizations.find(o => o.id === interaction.organization_id);
    const authorOrg = organizations.find(o => o.id === interaction.author_org_id);

    return (
        <Modal isOpen={!!interaction} onClose={onClose} title="Interaction Detail">
            <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{interaction.type.toUpperCase()}</h3>
                        <div className="text-sm text-gray-500 mt-1">{interaction.date}</div>
                    </div>
                    <Badge color={interaction.visibility === 'network_shared' ? 'green' : 'red'}>
                        {interaction.visibility === 'network_shared' ? 'Network Shared' : 'Private to Agency'}
                    </Badge>
                </div>

                {/* Confidentiality Warning for authorized viewers */}
                {interaction.note_confidential && (
                    <div className="bg-amber-50 p-3 rounded border border-amber-200 flex items-center gap-2 text-amber-900 text-sm">
                        <span className="text-xl">🔒</span>
                        <div>
                            <strong>Confidential Note:</strong> Notes are visible only to the organization that recorded them.
                        </div>
                    </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">Context</div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-gray-500">Subject Organization:</span>
                            <span className="font-medium text-gray-900">{subjectOrg?.name || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Recorded By (Agency):</span>
                            <span className="font-medium text-gray-900">{authorOrg?.name || 'Unknown'}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Staff Member:</span>
                            <span className="font-medium text-gray-900">{interaction.recorded_by}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500">Attendees:</span>
                            <span className="font-medium text-gray-900">{interaction.attendees?.join(', ') || 'None listed'}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">Notes</div>
                    <div className="bg-white p-4 border border-gray-200 rounded text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                        {interaction.notes}
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium text-sm">Close</button>
                </div>
            </div>
        </Modal>
    );
};
