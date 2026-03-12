import React, { useEffect, useState } from 'react';
import { Person, Organization, Interaction, Referral } from '../../domain/types';
import { Card, Badge, Avatar, Modal, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { LogInteractionModal } from '../interactions/LogInteractionModal';
import { CreateReferralModal } from '../referrals/CreateReferralModal';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface PersonDetailViewProps {
  person: Person;
  organizations: Organization[];
  interactions: Interaction[];
  referrals: Referral[];
  onBack: () => void;
  initialTab?: 'associations' | 'interactions' | 'referrals';
  onTabChange?: (tab: 'associations' | 'interactions' | 'referrals') => void;
  onSelectOrganization?: (id: string) => void;
  onRefresh?: () => void;
  onLogInteraction: () => void;
  onCreateReferral: () => void;
}

export const PersonDetailView = ({
  person,
  organizations,
  interactions,
  referrals,
  onBack,
  initialTab = 'associations',
  onTabChange,
  onSelectOrganization,
  onRefresh,
  onLogInteraction,
  onCreateReferral
}: PersonDetailViewProps) => {
  const repos = useRepos();
  const viewer = useViewer();
  const [activeTab, setActiveTab] = useState<'associations' | 'interactions' | 'referrals'>(initialTab);
  const [showLogInteraction, setShowLogInteraction] = useState(false);
  const [showCreateReferral, setShowCreateReferral] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    role: person.role,
    organization_id: person.organization_id,
    secondary_org_id: person.secondary_profile?.organization_id || '',
    secondary_role_title: person.secondary_profile?.role_title || '',
  });

  const personName = `${person.first_name} ${person.last_name}`;
  const personInteractions = interactions.filter((interaction) => interaction.attendees?.includes(personName)).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const personReferrals = referrals.filter((referral) => referral.subject_person_id === person.id);
  const primaryOrg = organizations.find((organization) => organization.id === person.organization_id);
  const secondaryOrg = person.secondary_profile ? organizations.find((organization) => organization.id === person.secondary_profile!.organization_id) : null;
  const canEditProfile = viewer.personId === person.id;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setProfileForm({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      role: person.role,
      organization_id: person.organization_id,
      secondary_org_id: person.secondary_profile?.organization_id || '',
      secondary_role_title: person.secondary_profile?.role_title || '',
    });
  }, [person, showEditProfile]);

  const selectTab = (tab: 'associations' | 'interactions' | 'referrals') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleInteractionComplete = () => {
    onRefresh?.();
  };

  const handleReferralSave = (referral: Partial<Referral>) => {
    repos.referrals.add({
      id: `ref_${Date.now()}`,
      ...referral
    } as Referral);
    onRefresh?.();
  };

  const handleSaveProfile = () => {
    repos.people.update(person.id, {
      first_name: profileForm.first_name,
      last_name: profileForm.last_name,
      email: profileForm.email,
      role: profileForm.role,
      organization_id: profileForm.organization_id,
      secondary_profile: profileForm.secondary_org_id
        ? {
            system_role: person.secondary_profile?.system_role || person.system_role,
            organization_id: profileForm.secondary_org_id,
            role_title: profileForm.secondary_role_title || 'Additional Affiliation',
          }
        : undefined,
    });
    setShowEditProfile(false);
    onRefresh?.();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">←</button>
            <Avatar src={person.avatar_url} name={personName} size="xl" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-none">{personName}</h1>
              <div className="text-sm text-gray-500 mt-1">{person.role}</div>
              <div className="flex items-center gap-3 mt-2">
                <Badge color="gray">{person.system_role.replace('_', ' ')}</Badge>
                <a href={`mailto:${person.email}`} className="text-sm text-indigo-600 hover:underline">{person.email}</a>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {canEditProfile && (
              <button onClick={() => setShowEditProfile(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">
                Edit Profile
              </button>
            )}
            <button onClick={() => setShowLogInteraction(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
            <button onClick={() => setShowCreateReferral(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Make Referral</button>
          </div>
        </div>
        <div className="mt-6 flex gap-4 border-t pt-4">
          {person.links?.length ? person.links.map((link, idx) => (
            <a key={idx} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors">
              <span className="font-bold uppercase text-xs">{link.platform}</span>
            </a>
          )) : <span className="text-sm text-gray-400 italic">No social links added.</span>}
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-6">
          {[
            { id: 'associations', label: 'Associations' },
            { id: 'interactions', label: `Interactions (${personInteractions.length})` },
            { id: 'referrals', label: `Referrals (${personReferrals.length})` },
          ].map((tab) => (
            <button key={tab.id} onClick={() => selectTab(tab.id as 'associations' | 'interactions' | 'referrals')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
          ))}
        </nav>
      </div>

      <div className="space-y-6">
        {activeTab === 'associations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {primaryOrg && (
              <Card title="Primary Organization">
                {onSelectOrganization ? (
                  <button onClick={() => onSelectOrganization(primaryOrg.id)} className="text-left text-lg font-bold text-indigo-700 hover:text-indigo-900 hover:underline">
                    {primaryOrg.name}
                  </button>
                ) : (
                  <h4 className="text-lg font-bold text-gray-900">{primaryOrg.name}</h4>
                )}
                <p className="text-sm text-gray-500">{person.role}</p>
                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                  {primaryOrg.classification.industry_tags.map((tag) => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                </div>
              </Card>
            )}
            {secondaryOrg && (
              <Card title="Secondary Association">
                {onSelectOrganization ? (
                  <button onClick={() => onSelectOrganization(secondaryOrg.id)} className="text-left text-lg font-bold text-indigo-700 hover:text-indigo-900 hover:underline">
                    {secondaryOrg.name}
                  </button>
                ) : (
                  <h4 className="text-lg font-bold text-gray-900">{secondaryOrg.name}</h4>
                )}
                <p className="text-sm text-gray-500">{person.secondary_profile?.role_title}</p>
                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                  {secondaryOrg.classification.industry_tags.map((tag) => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                </div>
              </Card>
            )}
          </div>
        )}
        {activeTab === 'interactions' && (
          <div className="space-y-4">
            {personInteractions.map((interaction) => (
              <Card key={interaction.id} title={`${interaction.type.toUpperCase()} - ${interaction.date}`}>
                <p className="text-gray-800">{interaction.notes}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>Org: {organizations.find((organization) => organization.id === interaction.organization_id)?.name}</span>
                  <span>By: {interaction.recorded_by}</span>
                </div>
              </Card>
            ))}
            {personInteractions.length === 0 && <p className="text-gray-500 text-center">No interactions found.</p>}
          </div>
        )}
        {activeTab === 'referrals' && (
          <div className="space-y-4">
            {personReferrals.map((referral) => (
              <Card key={referral.id} title={`Referral: ${organizations.find((organization) => organization.id === referral.referring_org_id)?.name} → ${organizations.find((organization) => organization.id === referral.receiving_org_id)?.name}`}>
                <p className="text-gray-800 mb-2">{referral.notes}</p>
                <Badge color={referral.status === 'pending' ? 'yellow' : 'green'}>{referral.status}</Badge>
              </Card>
            ))}
            {personReferrals.length === 0 && <p className="text-gray-500 text-center">No referrals found.</p>}
          </div>
        )}
      </div>

      <LogInteractionModal
        isOpen={showLogInteraction}
        onClose={() => setShowLogInteraction(false)}
        onComplete={handleInteractionComplete}
        organizations={organizations}
      />

      <CreateReferralModal
        isOpen={showCreateReferral}
        onClose={() => setShowCreateReferral(false)}
        onSave={handleReferralSave}
        organizations={organizations}
        currentOrgId={viewer.orgId}
        subjectOrg={organizations.find((organization) => organization.id === person.organization_id)}
      />

      <Modal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} title="Edit My Profile">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FORM_LABEL_CLASS}>First Name</label>
              <input className={FORM_INPUT_CLASS} value={profileForm.first_name} onChange={(event) => setProfileForm({ ...profileForm, first_name: event.target.value })} />
            </div>
            <div>
              <label className={FORM_LABEL_CLASS}>Last Name</label>
              <input className={FORM_INPUT_CLASS} value={profileForm.last_name} onChange={(event) => setProfileForm({ ...profileForm, last_name: event.target.value })} />
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Email</label>
            <input className={FORM_INPUT_CLASS} value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Role Title</label>
            <input className={FORM_INPUT_CLASS} value={profileForm.role} onChange={(event) => setProfileForm({ ...profileForm, role: event.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Primary Organization</label>
            <select className={FORM_SELECT_CLASS} value={profileForm.organization_id} onChange={(event) => setProfileForm({ ...profileForm, organization_id: event.target.value })}>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 font-medium text-gray-900">Additional Affiliation</div>
            <div className="space-y-3">
              <div>
                <label className={FORM_LABEL_CLASS}>Secondary Organization</label>
                <select className={FORM_SELECT_CLASS} value={profileForm.secondary_org_id} onChange={(event) => setProfileForm({ ...profileForm, secondary_org_id: event.target.value })}>
                  <option value="">None</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FORM_LABEL_CLASS}>Secondary Role Title</label>
                <input className={FORM_INPUT_CLASS} value={profileForm.secondary_role_title} onChange={(event) => setProfileForm({ ...profileForm, secondary_role_title: event.target.value })} placeholder="Coach, advisor, founder, board member..." />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowEditProfile(false)} className="rounded border px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveProfile} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">Save Profile</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
