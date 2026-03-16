import React, { useEffect, useMemo, useState } from 'react';
import { AccountRequest, Ecosystem, Invite, Person, Organization, SystemRole } from '../../domain/types';
import { Badge, Modal, FORM_LABEL_CLASS, FORM_INPUT_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { useRepos } from '../../data/AppDataContext';
import { loadEnums } from '../../domain/standards/loadStandards';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { queryCollection, whereEquals } from '../../services/firestoreClient';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { useAuthSession } from '../../app/useAuthSession';

interface EditUserModalProps {
  person: Person | null;
  organizations: Organization[];
  allowedRoles: SystemRole[];
  canEditRole: boolean;
  canEditOrganization: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Person>) => void;
}

type InviteFormState = {
  email: string;
  invited_role: SystemRole;
  organization_id: string;
  ecosystem_id: string;
  note: string;
};

const EditUserModal = ({ person, organizations, allowedRoles, canEditRole, canEditOrganization, isOpen, onClose, onSave }: EditUserModalProps) => {
  const enums = loadEnums();
  const [formData, setFormData] = useState<Partial<Person>>({});

  useEffect(() => {
    if (person) {
      setFormData({
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        organization_id: person.organization_id,
        system_role: person.system_role,
      });
    }
  }, [person, isOpen]);

  const handleSave = () => {
    if (person?.id) {
      onSave(person.id, formData);
      onClose();
    }
  };

  if (!person) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${person.first_name} ${person.last_name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={FORM_LABEL_CLASS}>First Name</label>
            <input className={FORM_INPUT_CLASS} value={formData.first_name || ''} onChange={(event) => setFormData({ ...formData, first_name: event.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Last Name</label>
            <input className={FORM_INPUT_CLASS} value={formData.last_name || ''} onChange={(event) => setFormData({ ...formData, last_name: event.target.value })} />
          </div>
        </div>

        <div>
          <label className={FORM_LABEL_CLASS}>Email</label>
          <input className={FORM_INPUT_CLASS} value={formData.email || ''} onChange={(event) => setFormData({ ...formData, email: event.target.value })} />
        </div>

        <div>
          <label className={FORM_LABEL_CLASS}>Organization</label>
          <select className={FORM_SELECT_CLASS} value={formData.organization_id || ''} onChange={(event) => setFormData({ ...formData, organization_id: event.target.value })} disabled={!canEditOrganization}>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <label className={FORM_LABEL_CLASS}>System Role (Permissions)</label>
          <select className={FORM_SELECT_CLASS} value={formData.system_role || ''} onChange={(event) => setFormData({ ...formData, system_role: event.target.value as SystemRole })} disabled={!canEditRole}>
            {enums.SystemRole.filter((role) => allowedRoles.includes(role.id as SystemRole)).map((role) => (
              <option key={role.id} value={role.id}>{role.label}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="rounded border px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
};

export const UserManagementView = ({
  people,
  organizations,
  onRefresh,
  onSelectPerson,
  onSelectOrganization,
}: {
  people: Person[];
  organizations: Organization[];
  onRefresh?: () => void;
  onSelectPerson?: (id: string) => void;
  onSelectOrganization?: (id: string) => void;
}) => {
  const repos = useRepos();
  const session = useAuthSession();
  const [editingUser, setEditingUser] = useState<Person | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AccountRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ invite_url: string } | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: '',
    invited_role: 'eso_coach',
    organization_id: organizations[0]?.id || '',
    ecosystem_id: session.viewer?.ecosystemId || ALL_ECOSYSTEMS[0]?.id || '',
    note: '',
  });

  const currentRole = session.viewer?.role || session.person?.system_role || 'entrepreneur';
  const isPlatformAdmin = currentRole === 'platform_admin';
  const isEcosystemManager = currentRole === 'ecosystem_manager';
  const canEditUsers = isPlatformAdmin || isEcosystemManager;
  const canManageInvites = ['platform_admin', 'ecosystem_manager', 'eso_admin'].includes(currentRole);
  const manageableMemberships = useMemo(
    () => session.memberships.filter((membership) => ['platform_admin', 'ecosystem_manager', 'eso_admin'].includes(membership.system_role)),
    [session.memberships],
  );
  const manageableOrganizations = useMemo(() => {
    if (isPlatformAdmin || currentRole === 'ecosystem_manager') {
      return organizations;
    }

    const orgIds = new Set(manageableMemberships.map((membership) => membership.organization_id).filter(Boolean));
    return organizations.filter((organization) => orgIds.has(organization.id));
  }, [currentRole, isPlatformAdmin, manageableMemberships, organizations]);
  const isSingleOrganizationEsoManager = !isPlatformAdmin && !isEcosystemManager && manageableOrganizations.length === 1;
  const selectedInviteOrganization = manageableOrganizations.find((organization) => organization.id === inviteForm.organization_id) || manageableOrganizations[0] || null;
  const derivedInviteEcosystemIds = selectedInviteOrganization?.ecosystem_ids || [];
  const shouldLockInviteOrganization = currentRole === 'eso_admin' || isSingleOrganizationEsoManager;
  const currentInviteEcosystemId = inviteForm.organization_id
    ? (derivedInviteEcosystemIds[0] || inviteForm.ecosystem_id)
    : inviteForm.ecosystem_id;
  const derivedInviteEcosystemLabel = derivedInviteEcosystemIds
    .map((ecosystemId) => ALL_ECOSYSTEMS.find((ecosystem: Ecosystem) => ecosystem.id === ecosystemId)?.name || ecosystemId)
    .join(', ');
  const visibleInviteOrganizations = useMemo(() => {
    if (shouldLockInviteOrganization) {
      return manageableOrganizations;
    }

    if (!inviteForm.ecosystem_id) {
      return manageableOrganizations;
    }

    return manageableOrganizations.filter((organization) => organization.ecosystem_ids.includes(inviteForm.ecosystem_id));
  }, [inviteForm.ecosystem_id, manageableOrganizations, shouldLockInviteOrganization]);
  const inviteNeedsOrganization = inviteForm.invited_role !== 'entrepreneur';
  const canCreateInvite = !!inviteForm.email.trim() && (!inviteNeedsOrganization || !!inviteForm.organization_id);

  useEffect(() => {
    setInviteForm((current) => {
      const nextOrganizationId = manageableOrganizations.some((organization) => organization.id === current.organization_id)
        ? current.organization_id
        : (manageableOrganizations[0]?.id || '');
      return nextOrganizationId === current.organization_id
        ? current
        : { ...current, organization_id: nextOrganizationId };
    });
  }, [manageableOrganizations]);

  useEffect(() => {
    if (!shouldLockInviteOrganization) {
      return;
    }

    setInviteForm((current) => {
      const lockedOrganization = manageableOrganizations[0] || null;
      const nextOrganizationId = current.invited_role === 'entrepreneur' ? '' : (lockedOrganization?.id || '');
      const nextEcosystemId = lockedOrganization?.ecosystem_ids[0] || current.ecosystem_id;
      if (nextOrganizationId === current.organization_id && nextEcosystemId === current.ecosystem_id) {
        return current;
      }

      return {
        ...current,
        organization_id: nextOrganizationId,
        ecosystem_id: nextEcosystemId,
      };
    });
  }, [manageableOrganizations, shouldLockInviteOrganization]);

  useEffect(() => {
    if (!inviteForm.organization_id) {
      return;
    }

    if (!visibleInviteOrganizations.some((organization) => organization.id === inviteForm.organization_id)) {
      setInviteForm((current) => {
        const nextOrganizationId = visibleInviteOrganizations[0]?.id || '';
        return nextOrganizationId === current.organization_id
          ? current
          : { ...current, organization_id: nextOrganizationId };
      });
    }
  }, [inviteForm.organization_id, visibleInviteOrganizations]);

  const loadPendingRequests = async () => {
    if (!isFirebaseEnabled() || !isPlatformAdmin) {
      setPendingRequests([]);
      return;
    }

    setIsLoadingRequests(true);
    try {
      const requests = await queryCollection<AccountRequest>('account_requests', [whereEquals('status', 'pending')]);
      setPendingRequests(requests.sort((left, right) => left.created_at.localeCompare(right.created_at)));
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const loadInvites = async () => {
    if (!isFirebaseEnabled() || !canManageInvites) {
      setInvites([]);
      return;
    }

    setIsLoadingInvites(true);
    setInviteActionError(null);
    try {
      const result = await callHttpFunction<{}, { invites: Invite[] }>('listInvites', {});
      setInvites(result.invites);
    } catch (error: any) {
      setInviteActionError(error?.message || 'Unable to load invites.');
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    void loadPendingRequests();
    void loadInvites();
  }, [isPlatformAdmin, canManageInvites]);

  const handleSaveUser = (id: string, updates: Partial<Person>) => {
    repos.people.update(id, updates);
    onRefresh?.();
  };

  const handleApproveRequest = async (request: AccountRequest) => {
    setRequestActionError(null);
    try {
      await callHttpFunction('approveAccountRequest', {
        request_id: request.id,
        approved_role: request.requested_role,
        organization_id: request.requested_organization_id,
        ecosystem_id: request.requested_ecosystem_id,
      });
      await loadPendingRequests();
      onRefresh?.();
    } catch (error: any) {
      setRequestActionError(error?.message || 'Unable to approve request.');
    }
  };

  const handleRejectRequest = async (request: AccountRequest) => {
    setRequestActionError(null);
    try {
      await callHttpFunction('rejectAccountRequest', { request_id: request.id });
      await loadPendingRequests();
    } catch (error: any) {
      setRequestActionError(error?.message || 'Unable to reject request.');
    }
  };

  const handleCreateInvite = async () => {
    setInviteActionError(null);
    setInviteResult(null);
    try {
      const payload: InviteFormState = {
        ...inviteForm,
        ecosystem_id: currentInviteEcosystemId,
      };
      const result = await callHttpFunction<InviteFormState, { invite_url: string }>('createInvite', payload);
      setInviteResult(result);
      setInviteForm((current) => ({ ...current, email: '', note: '' }));
      await loadInvites();
    } catch (error: any) {
      setInviteActionError(error?.message || 'Unable to create invite.');
    }
  };

  const handleResendInvite = async (invite: Invite) => {
    setInviteActionError(null);
    try {
      const result = await callHttpFunction<{ invite_id: string }, { invite_url: string }>('resendInvite', { invite_id: invite.id });
      setInviteResult(result);
      await loadInvites();
    } catch (error: any) {
      setInviteActionError(error?.message || 'Unable to resend invite.');
    }
  };

  const handleRevokeInvite = async (invite: Invite) => {
    setInviteActionError(null);
    try {
      await callHttpFunction('revokeInvite', { invite_id: invite.id });
      await loadInvites();
    } catch (error: any) {
      setInviteActionError(error?.message || 'Unable to revoke invite.');
    }
  };

  const sortedInvites = useMemo(() => invites.slice().sort((left, right) => right.created_at.localeCompare(left.created_at)), [invites]);
  const visiblePeople = useMemo(() => {
    if (isPlatformAdmin || isEcosystemManager) {
      return people;
    }

    const orgIds = new Set(manageableOrganizations.map((organization) => organization.id));
    return people.filter((person) => orgIds.has(person.organization_id));
  }, [isPlatformAdmin, isEcosystemManager, manageableOrganizations, people]);
  const editableOrganizations = isPlatformAdmin || isEcosystemManager ? organizations : manageableOrganizations;
  const editableRoles: SystemRole[] = isPlatformAdmin
    ? ['platform_admin', 'ecosystem_manager', 'eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur']
    : ['ecosystem_manager', 'eso_admin', 'eso_staff', 'eso_coach', 'entrepreneur'];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">User Management</h2>

      {canManageInvites && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Invites</h3>
            <p className="text-sm text-gray-500">Invite ESO staff, coaches, admins, or entrepreneurs into your organization scope.</p>
          </div>
          <div className="space-y-4 px-6 py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <input className={FORM_INPUT_CLASS} placeholder="Invitee email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
              <select className={FORM_SELECT_CLASS} value={inviteForm.invited_role} onChange={(event) => setInviteForm({ ...inviteForm, invited_role: event.target.value as SystemRole, organization_id: event.target.value === 'entrepreneur' ? '' : inviteForm.organization_id })}>
                <option value="entrepreneur">Entrepreneur</option>
                <option value="eso_coach">ESO Coach</option>
                <option value="eso_staff">ESO Staff</option>
                <option value="eso_admin">ESO Admin</option>
              </select>
              <select className={FORM_SELECT_CLASS} value={inviteForm.ecosystem_id} onChange={(event) => setInviteForm({ ...inviteForm, ecosystem_id: event.target.value })} disabled={currentRole === 'eso_admin'}>
                {ALL_ECOSYSTEMS.map((ecosystem) => (
                  <option key={ecosystem.id} value={ecosystem.id}>{ecosystem.name}</option>
                ))}
              </select>
              <select
                className={FORM_SELECT_CLASS}
                value={inviteForm.organization_id}
                onChange={(event) => setInviteForm({ ...inviteForm, organization_id: event.target.value })}
                disabled={(shouldLockInviteOrganization || inviteForm.invited_role === 'entrepreneur')}
              >
                {inviteForm.invited_role === 'entrepreneur' && (
                  <option value="">No organization yet</option>
                )}
                {visibleInviteOrganizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
              <div className={`${FORM_INPUT_CLASS} flex items-center bg-gray-50 text-gray-600`}>
                {inviteForm.organization_id
                  ? (derivedInviteEcosystemLabel || 'Organization ecosystem will be used')
                  : inviteNeedsOrganization
                    ? shouldLockInviteOrganization
                      ? 'This invite will be created in the organization tied to your account.'
                      : 'Select the ESO organization this staff/admin invite belongs to'
                    : 'Entrepreneur invite without organization'}
              </div>
              <textarea className={`${FORM_INPUT_CLASS} lg:col-span-2`} rows={3} placeholder="Optional note for the invite" value={inviteForm.note} onChange={(event) => setInviteForm({ ...inviteForm, note: event.target.value })} />
            </div>
            {inviteForm.invited_role !== 'entrepreneur' && visibleInviteOrganizations.length === 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No organizations are configured in this ecosystem yet. Add the ESO organization first, then return here to invite staff into it.
              </div>
            )}
            {inviteForm.invited_role === 'entrepreneur' && (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Entrepreneurs can be invited without an organization. They can join the ecosystem first and add a venture later.
              </div>
            )}
            {shouldLockInviteOrganization && selectedInviteOrganization && (
              <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {currentRole === 'eso_admin'
                  ? 'Your account can invite only into the organization you administer. Ecosystem scope is derived automatically from that organization.'
                  : isSingleOrganizationEsoManager
                  ? 'Your account manages one organization, so staff invites default to that organization automatically.'
                  : 'ESO admins can invite only into their own organization. Ecosystem scope is derived from the selected organization.'}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => void handleCreateInvite()} disabled={!canCreateInvite} className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Create invite
              </button>
              <button onClick={() => void loadInvites()} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Refresh invites
              </button>
            </div>
            {inviteActionError && (
              <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{inviteActionError}</div>
            )}
            {inviteResult?.invite_url && (
              <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Invite created:
                <div className="mt-1 break-all font-mono text-xs">{inviteResult.invite_url}</div>
              </div>
            )}
            <div className="space-y-3">
              {isLoadingInvites ? (
                <div className="text-sm text-gray-500">Loading invites...</div>
              ) : sortedInvites.length === 0 ? (
                <div className="text-sm text-gray-500">No invites created yet.</div>
              ) : (
                sortedInvites.map((invite) => (
                  <div key={invite.id} className="rounded border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{invite.email}</div>
                        <div className="text-xs text-gray-500">
                          {invite.invited_role} · {organizations.find((organization) => organization.id === invite.organization_id)?.name || invite.organization_id}
                        </div>
                      </div>
                      <Badge color={invite.status === 'pending' ? 'yellow' : invite.status === 'accepted' ? 'green' : 'gray'}>{invite.status}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">Expires {invite.expires_at}</div>
                    {invite.token_last4 && <div className="mt-1 text-xs text-gray-400">Invite token ends with {invite.token_last4}</div>}
                    {invite.note && <div className="mt-1 text-xs text-gray-500">{invite.note}</div>}
                    {invite.status === 'pending' && (
                      <div className="mt-3 flex gap-3 text-sm">
                        <button onClick={() => void handleResendInvite(invite)} className="font-medium text-indigo-700 hover:text-indigo-900">Resend</button>
                        <button onClick={() => void handleRevokeInvite(invite)} className="font-medium text-rose-700 hover:text-rose-900">Revoke</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isPlatformAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pending Elevated Access Requests</h3>
              <p className="text-sm text-gray-500">Approve role and organization membership before granting higher access.</p>
            </div>
            <button onClick={() => void loadPendingRequests()} className="rounded border px-3 py-2 text-sm hover:bg-gray-50">Refresh</button>
          </div>
          {requestActionError && (
            <div className="mx-6 mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{requestActionError}</div>
          )}
          {isLoadingRequests ? (
            <div className="px-6 py-8 text-sm text-gray-500">Loading requests...</div>
          ) : pendingRequests.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">No pending access requests.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requester</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested Org</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ecosystem</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{request.first_name} {request.last_name}</div>
                      <div className="text-gray-500">{request.email}</div>
                      {request.note && <div className="mt-1 text-xs text-gray-500">{request.note}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm"><Badge color="yellow">{request.requested_role}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{organizations.find((organization) => organization.id === request.requested_organization_id)?.name || request.requested_organization_id}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{ALL_ECOSYSTEMS.find((ecosystem: Ecosystem) => ecosystem.id === request.requested_ecosystem_id)?.name || request.requested_ecosystem_id}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-3">
                        <button onClick={() => void handleApproveRequest(request)} className="font-medium text-emerald-700 hover:text-emerald-900">Approve</button>
                        <button onClick={() => void handleRejectRequest(request)} className="font-medium text-rose-700 hover:text-rose-900">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
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
          <tbody className="divide-y divide-gray-200 bg-white">
            {visiblePeople.map((person) => (
              <tr key={person.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {onSelectPerson ? (
                    <button onClick={() => onSelectPerson(person.id)} className="text-indigo-600 hover:text-indigo-900 hover:underline">
                      {person.first_name} {person.last_name}
                    </button>
                  ) : (
                    `${person.first_name} ${person.last_name}`
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{person.email}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {onSelectOrganization && organizations.find((organization) => organization.id === person.organization_id) ? (
                    <button onClick={() => onSelectOrganization(person.organization_id)} className="text-indigo-600 hover:text-indigo-900 hover:underline">
                      {organizations.find((organization) => organization.id === person.organization_id)?.name}
                    </button>
                  ) : (
                    organizations.find((organization) => organization.id === person.organization_id)?.name
                  )}
                </td>
                <td className="px-6 py-4 text-sm"><Badge color="blue">{person.system_role}</Badge></td>
                <td className="px-6 py-4 text-sm">
                  {canEditUsers ? (
                    <button onClick={() => setEditingUser(person)} className="font-medium text-indigo-600 hover:text-indigo-900">Edit</button>
                  ) : (
                    <span className="text-gray-400">Read only</span>
                  )}
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
        organizations={editableOrganizations}
        allowedRoles={editableRoles}
        canEditRole={canEditUsers}
        canEditOrganization={canEditUsers}
        onSave={handleSaveUser}
      />
    </div>
  );
};
