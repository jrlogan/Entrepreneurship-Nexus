
import React from 'react';
import { Interaction, Organization, Person, Referral, Todo } from '../../domain/types';
import { acceptSuggestion } from '../../domain/advisor/logic';
import { Modal, Badge } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface InteractionDetailModalProps {
    interaction: Interaction | null;
    onClose: () => void;
    organizations: Organization[];
}

export const InteractionDetailModal = ({ interaction, onClose, organizations }: InteractionDetailModalProps) => {
    const repos = useRepos();
    const viewer = useViewer();

    if (!interaction) return null;

    const subjectOrg = organizations.find(o => o.id === interaction.organization_id);
    const authorOrg = organizations.find(o => o.id === interaction.author_org_id);

    // AI Advisor Logic
    const handleAcceptSuggestion = (suggestionId: string) => {
        const suggestion = interaction.advisor_suggestions?.find(s => s.id === suggestionId);
        if (!suggestion) return;

        // We need the actor (Person object). Using a quick lookup from viewer context.
        const actor = repos.people.getById(viewer.personId);
        if (!actor) {
            alert("Error: Current user context invalid.");
            return;
        }

        const result = acceptSuggestion(suggestion, actor, viewer.ecosystemId);

        // 1. Create Todo if payload exists
        if (result.todo_payload) {
            const newTodo: Todo = {
                id: `todo_${Date.now()}`,
                ...result.todo_payload
            } as Todo;
            repos.todos.add(newTodo);
            alert("Task added to your list.");
        }

        // 2. Create Referral if payload exists (Mock logic: create pending referral)
        if (result.referral_payload) {
            const newReferral: Referral = {
                id: `ref_${Date.now()}`,
                ...result.referral_payload
            } as Referral;
            repos.referrals.add(newReferral);
            alert("Referral draft created.");
        }

        // 3. Update Interaction locally to reflect acceptance
        interaction.advisor_acceptances = [
            ...(interaction.advisor_acceptances || []),
            result
        ];
    };

    const isSuggestionAccepted = (id: string) => {
        return interaction.advisor_acceptances?.some(a => a.audit_event.suggestion_id === id);
    };

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
                            <strong>Confidential Note:</strong> Content is hidden from the network, visible only to the author and admins.
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

                {/* AI Advisor Section */}
                {interaction.advisor_suggestions && interaction.advisor_suggestions.length > 0 && (
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xl">✨</span>
                            <h4 className="font-bold text-indigo-900">AI Advisor Suggestions</h4>
                        </div>
                        <div className="space-y-3">
                            {interaction.advisor_suggestions.map(sugg => {
                                const accepted = isSuggestionAccepted(sugg.id);
                                if (accepted) return null; // Hide if already handled

                                return (
                                    <div key={sugg.id} className="bg-white p-3 rounded shadow-sm border border-indigo-100">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-gray-800 text-sm">{sugg.title}</span>
                                            <Badge color={sugg.priority === 'high' ? 'red' : 'blue'}>{sugg.confidence_score}% Conf.</Badge>
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1 italic">{sugg.reason}</p>
                                        <div className="mt-3 flex gap-2 justify-end">
                                            <button className="text-xs text-gray-400 hover:text-gray-600 font-medium px-2">Dismiss</button>
                                            <button 
                                                onClick={() => handleAcceptSuggestion(sugg.id)}
                                                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded font-bold hover:bg-indigo-700 shadow-sm"
                                            >
                                                {sugg.type === 'referral' ? 'Create Referral' : 'Accept as Task'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {interaction.advisor_suggestions.every(s => isSuggestionAccepted(s.id)) && (
                                <p className="text-xs text-green-600 font-medium text-center">All suggestions processed.</p>
                            )}
                        </div>
                    </div>
                )}

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
