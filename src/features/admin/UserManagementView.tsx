
import React, { useState, useEffect } from 'react';
import { Person, Organization, SystemRole } from '../../domain/types';
import { Badge, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { useRepos } from '../../data/AppDataContext';
import { loadEnums } from '../../domain/standards/loadStandards';

interface EditUserModalProps {
    person: Person | null;
    organizations: Organization[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: Partial<Person>) => void;
}

const EditUserModal = ({ person, organizations, isOpen, onClose, onSave }: EditUserModalProps) => {
    const enums = loadEnums();
    const [formData, setFormData] = useState<Partial<Person>>({});

    useEffect(() => {
        if (person) {
            setFormData({
                first_name: person.first_name,
                last_name: person.last_name,
                email: person.email,
                organization_id: person.organization_id,
                system_role: person.system_role
            });
        }
    }, [person, isOpen]);

    const handleSave = () => {
        if (person && person.id) {
            onSave(person.id, formData);
            onClose();
        }
    };

    if (!person) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${person.first_name} ${person.last_name}`}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={FORM_LABEL_CLASS}>First Name</label>
                        <input 
                            className={FORM_INPUT_CLASS} 
                            value={formData.first_name || ''} 
                            onChange={e => setFormData({...formData, first_name: e.target.value})} 
                        />
                    </div>
                    <div>
                        <label className={FORM_LABEL_CLASS}>Last Name</label>
                        <input 
                            className={FORM_INPUT_CLASS} 
                            value={formData.last_name || ''} 
                            onChange={e => setFormData({...formData, last_name: e.target.value})} 
                        />
                    </div>
                </div>
                
                <div>
                    <label className={FORM_LABEL_CLASS}>Email</label>
                    <input 
                        className={FORM_INPUT_CLASS} 
                        value={formData.email || ''} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                    />
                </div>

                <div>
                    <label className={FORM_LABEL_CLASS}>Organization</label>
                    <select 
                        className={FORM_SELECT_CLASS} 
                        value={formData.organization_id || ''} 
                        onChange={e => setFormData({...formData, organization_id: e.target.value})}
                    >
                        {organizations.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>

                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                    <label className={FORM_LABEL_CLASS}>System Role (Permissions)</label>
                    <select 
                        className={FORM_SELECT_CLASS} 
                        value={formData.system_role || ''} 
                        onChange={e => setFormData({...formData, system_role: e.target.value as SystemRole})}
                    >
                        {enums.SystemRole.map(role => (
                            <option key={role.id} value={role.id}>{role.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                        <strong>Note:</strong> Changing this role will immediately update what this user can access.
                    </p>
                </div>

                <div className="flex justify-end pt-4 gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Save Changes</button>
                </div>
            </div>
        </Modal>
    );
};

export const UserManagementView = ({ people, organizations, onRefresh }: { people: Person[], organizations: Organization[], onRefresh?: () => void }) => {
    const repos = useRepos();
    const [editingUser, setEditingUser] = useState<Person | null>(null);

    const handleEdit = (person: Person) => {
        setEditingUser(person);
    };

    const handleSaveUser = (id: string, updates: Partial<Person>) => {
        repos.people.update(id, updates);
        if (onRefresh) onRefresh();
    };

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">System Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {people.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.first_name} {p.last_name}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{p.email}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{organizations.find(o => o.id === p.organization_id)?.name}</td>
                                <td className="px-6 py-4 text-sm"><Badge color="blue">{p.system_role}</Badge></td>
                                <td className="px-6 py-4 text-sm">
                                    <button 
                                        onClick={() => handleEdit(p)}
                                        className="text-indigo-600 hover:text-indigo-900 font-medium"
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <EditUserModal 
                isOpen={!!editingUser}
                onClose={() => setEditingUser(null)}
                person={editingUser}
                organizations={organizations}
                onSave={handleSaveUser}
            />
        </div>
    );
};
