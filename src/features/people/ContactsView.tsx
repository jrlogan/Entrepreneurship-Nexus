
import React, { useState, useMemo } from 'react';
import { Person, Organization, Interaction } from '../../domain/types';
import { Badge, Avatar } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { ManagePersonModal } from '../directory/OrgModals';

export const ContactsView = ({ 
    people, 
    organizations, 
    interactions = [],
    onSelectPerson 
}: { 
    people: Person[], 
    organizations: Organization[], 
    interactions?: Interaction[],
    onSelectPerson: (id: string) => void 
}) => {
    const repos = useRepos();
    const viewer = useViewer();
    const [filter, setFilter] = useState<'all' | 'my_connections' | 'my_org_network'>('all');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Filter Logic
    const filteredPeople = useMemo(() => {
        if (filter === 'all') return people;

        return people.filter(person => {
            const personName = `${person.first_name} ${person.last_name}`;
            
            // Check interactions
            const personInteractions = interactions.filter(i => 
                i.attendees?.includes(personName) || 
                (i.organization_id === person.organization_id)
            );

            if (filter === 'my_connections') {
                // People I have personally recorded an interaction with (Coach View)
                return personInteractions.some(i => i.author_org_id === viewer.orgId);
            }

            if (filter === 'my_org_network') {
                // People whose organization is managed by my organization
                const org = organizations.find(o => o.id === person.organization_id);
                return org?.managed_by_ids?.includes(viewer.orgId);
            }

            return true;
        });
    }, [people, interactions, organizations, viewer.orgId, filter]);

    const handleSavePerson = (personData: Partial<Person>) => {
        repos.people.add({
            id: `person_${Date.now()}`,
            system_role: 'entrepreneur', // Default role when added from directory
            ecosystem_id: viewer.ecosystemId,
            memberships: [],
            tags: [],
            ...personData
        } as Person);
        setIsAddModalOpen(false);
        // Usually trigger refresh via parent prop or context update
    };

    // Helper to get interaction stats per person
    const getStats = (person: Person) => {
        const personName = `${person.first_name} ${person.last_name}`;
        const relevant = interactions.filter(i => 
            i.attendees?.includes(personName) || 
            (i.organization_id === person.organization_id && i.attendees?.length === 0) // Implicitly about the org/person
        );
        
        // Filter those authored by my org to be specific about "My/Agency Interactions"
        const myOrgInteractions = relevant.filter(i => i.author_org_id === viewer.orgId);
        
        const lastDate = myOrgInteractions.length > 0 
            ? myOrgInteractions.reduce((max, i) => i.date > max ? i.date : max, '') 
            : null;

        return {
            total: relevant.length,
            myOrgCount: myOrgInteractions.length,
            lastDate
        };
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">People</h2>
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md shadow-sm" role="group">
                        <button 
                            type="button" 
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 text-sm font-medium border border-gray-200 rounded-l-lg hover:bg-gray-100 ${filter === 'all' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}
                        >
                            All
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setFilter('my_org_network')}
                            className={`px-4 py-2 text-sm font-medium border-t border-b border-gray-200 hover:bg-gray-100 ${filter === 'my_org_network' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}
                        >
                            My Clients
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setFilter('my_connections')}
                            className={`px-4 py-2 text-sm font-medium border border-gray-200 rounded-r-lg hover:bg-gray-100 ${filter === 'my_connections' ? 'bg-gray-100 text-indigo-700 z-10 ring-2 ring-indigo-500' : 'bg-white text-gray-900'}`}
                        >
                            My Interactions
                        </button>
                    </div>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
                    >
                        Add Person
                    </button>
                </div>
            </div>
            
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interactions</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Links</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredPeople.map(person => {
                            const stats = getStats(person);
                            return (
                                <tr 
                                    key={person.id} 
                                    onClick={() => onSelectPerson(person.id)}
                                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <Avatar src={person.avatar_url} name={`${person.first_name} ${person.last_name}`} size="sm" className="mr-4" />
                                            <div>
                                                <div className="text-sm font-medium text-indigo-600">{person.first_name} {person.last_name}</div>
                                                <div className="text-xs text-gray-500">{person.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{person.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {organizations.find(o => o.id === person.organization_id)?.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Total: {stats.total}</span>
                                            {stats.myOrgCount > 0 && (
                                                <Badge color="blue">My Org: {stats.myOrgCount}</Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {stats.lastDate ? (
                                            <span className="text-indigo-700 font-medium">{stats.lastDate}</span>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex gap-2">
                                        {person.links?.map((l, i) => (
                                            <span key={i} title={l.platform} className="text-gray-400 hover:text-indigo-600">
                                                {l.platform === 'linkedin' && 'IN'}
                                                {l.platform === 'twitter' && 'TW'}
                                                {l.platform === 'website' && 'WWW'}
                                            </span>
                                        ))}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredPeople.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                                    No people found matching the current filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ManagePersonModal 
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleSavePerson}
                organizations={organizations}
            />
        </div>
    );
};
