import React, { useEffect, useState } from 'react';
import { Person, Organization, Interaction, Referral, Service } from '../../domain/types';
import { Card, Badge, Avatar, Modal, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS } from '../../shared/ui/Components';
import { LogInteractionModal } from '../interactions/LogInteractionModal';
import { CreateReferralModal } from '../referrals/CreateReferralModal';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { getAllOrganizationAffiliations } from '../../domain/people/affiliations';
import { uploadImageFile } from '../../services/storageUploads';

interface PersonDetailViewProps {
  person: Person;
  organizations: Organization[];
  interactions: Interaction[];
  referrals: Referral[];
  services: Service[];
  onBack: () => void;
  initialTab?: 'associations' | 'interactions' | 'referrals' | 'participation' | 'settings';
  onTabChange?: (tab: 'associations' | 'interactions' | 'referrals' | 'participation' | 'settings') => void;
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
  services,
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
  const buildAffiliationDrafts = React.useCallback(() => {
    const existing = getAllOrganizationAffiliations(person);
    if (existing.length > 0) {
      return existing.map((affiliation) => ({
        organization_id: affiliation.organization_id,
        role_title: affiliation.role_title || '',
        relationship_type: affiliation.relationship_type || 'other',
        status: affiliation.status || 'active',
        can_self_manage: affiliation.can_self_manage ?? false,
      }));
    }

    if (person.organization_id) {
      return [{
        organization_id: person.organization_id,
        role_title: person.role || '',
        relationship_type: person.system_role === 'entrepreneur' ? 'founder' : 'employee',
        status: 'active' as const,
        can_self_manage: person.system_role === 'entrepreneur',
      }];
    }

    return [];
  }, [person]);
  const [activeTab, setActiveTab] = useState<'associations' | 'interactions' | 'referrals' | 'participation' | 'settings'>(initialTab);
  const [showLogInteraction, setShowLogInteraction] = useState(false);
  const [showCreateReferral, setShowCreateReferral] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [templateDrafts, setTemplateDrafts] = useState<Array<{id: string; name: string; subject?: string; body: string}>>(person.referral_templates || []);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [templatesSavedAt, setTemplatesSavedAt] = useState<number | null>(null);
  useEffect(() => { setTemplateDrafts(person.referral_templates || []); }, [person.referral_templates]);
  const [profileForm, setProfileForm] = useState({
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    avatar_url: person.avatar_url || '',
    role: person.role,
    organization_id: person.organization_id,
    affiliations: buildAffiliationDrafts(),
  });

  const personName = `${person.first_name} ${person.last_name}`;
  const personInteractions = interactions.filter((interaction) => interaction.attendees?.includes(personName)).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const personReferrals = referrals.filter((referral) => referral.subject_person_id === person.id);
  const personParticipations = services
    .filter((service) => service.recipient_person_id === person.id)
    .sort((left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime());
  const allAffiliations = getAllOrganizationAffiliations(person);
  const visibleAffiliations = allAffiliations.filter((affiliation) => affiliation.organization_id);
  const canEditProfile = viewer.personId === person.id;
  const showStaffActions = viewer.role !== 'entrepreneur';

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setProfileForm({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      avatar_url: person.avatar_url || '',
      role: person.role,
      organization_id: person.organization_id,
      affiliations: buildAffiliationDrafts(),
    });
    setProfilePhotoFile(null);
    setProfileSaveError('');
    setIsSavingProfile(false);
  }, [person, showEditProfile, buildAffiliationDrafts]);

  const selectTab = (tab: 'associations' | 'interactions' | 'referrals' | 'participation' | 'settings') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };
  const formatParticipationWindow = (service: Service) => {
    const start = new Date(service.start_date).toLocaleDateString();
    if (!service.end_date) {
      return `${start} - ongoing`;
    }
    return `${start} - ${new Date(service.end_date).toLocaleDateString()}`;
  };
  const getParticipationStatusLabel = (service: Service) => {
    if (service.status === 'applied') return 'Application submitted';
    if (service.status === 'waitlisted') return 'Waitlisted';
    if (service.status === 'past') return 'Completed / past';
    return 'Active';
  };
  const getParticipationStatusColor = (service: Service) => {
    if (service.status === 'applied') return 'blue' as const;
    if (service.status === 'waitlisted') return 'yellow' as const;
    if (service.status === 'past') return 'gray' as const;
    return 'green' as const;
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

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setProfileSaveError('');
    const normalizedAffiliations = profileForm.affiliations
      .filter((affiliation) => affiliation.organization_id)
      .map((affiliation) => ({
        organization_id: affiliation.organization_id,
        role_title: affiliation.role_title || undefined,
        relationship_type: affiliation.relationship_type || 'other',
        status: affiliation.status || 'active',
        can_self_manage: affiliation.can_self_manage ?? false,
      }));
    const activeAffiliations = normalizedAffiliations.filter((affiliation) => affiliation.status === 'active');
    const primaryOrganizationId = profileForm.organization_id
      || activeAffiliations[0]?.organization_id
      || normalizedAffiliations[0]?.organization_id
      || person.organization_id;
    const secondaryAffiliation = activeAffiliations.find((affiliation) => affiliation.organization_id !== primaryOrganizationId);
    try {
      const resolvedAvatarUrl = profilePhotoFile
        ? await uploadImageFile(profilePhotoFile, ['people', person.id, 'avatar'])
        : profileForm.avatar_url || undefined;

      await repos.people.update(person.id, {
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        email: profileForm.email,
        avatar_url: resolvedAvatarUrl,
        role: profileForm.role,
        organization_id: primaryOrganizationId,
        organization_affiliations: normalizedAffiliations,
        secondary_profile: secondaryAffiliation
          ? {
              system_role: person.system_role,
              organization_id: secondaryAffiliation.organization_id,
              role_title: secondaryAffiliation.role_title || 'Additional Affiliation',
            }
          : undefined,
      });
      setShowEditProfile(false);
      onRefresh?.();
    } catch (error) {
      setProfileSaveError(error instanceof Error ? error.message : 'Unable to save profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAffiliationChange = (index: number, field: 'organization_id' | 'role_title' | 'relationship_type' | 'status' | 'can_self_manage', value: string | boolean) => {
    setProfileForm((current) => ({
      ...current,
      affiliations: current.affiliations.map((affiliation, affiliationIndex) => (
        affiliationIndex === index
          ? { ...affiliation, [field]: value }
          : affiliation
      )),
    }));
  };

  const handleAddAffiliation = () => {
    setProfileForm((current) => ({
      ...current,
      affiliations: [
        ...current.affiliations,
        {
          organization_id: '',
          role_title: '',
          relationship_type: 'other',
          status: 'pending',
          can_self_manage: false,
        }
      ]
    }));
  };

  const handleRemoveAffiliation = (index: number) => {
    setProfileForm((current) => ({
      ...current,
      affiliations: current.affiliations.filter((_, affiliationIndex) => affiliationIndex !== index)
    }));
  };

  const formatAffiliationStatus = (status?: string) => {
    if (status === 'revoked') return 'No longer active';
    if (status === 'pending') return 'Pending approval';
    return 'Active';
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(person.email);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 1500);
    } catch (error) {
      console.error('Unable to copy email address.', error);
    }
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
                <button onClick={() => void handleCopyEmail()} className="text-xs font-medium text-gray-600 hover:text-indigo-600 hover:underline">
                  {emailCopied ? 'Copied!' : 'Copy address'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {canEditProfile && (
              <button onClick={() => setShowEditProfile(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">
                Edit Profile
              </button>
            )}
            {showStaffActions && (
              <>
                <button onClick={() => setShowLogInteraction(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
                <button onClick={() => setShowCreateReferral(true)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Make Referral</button>
              </>
            )}
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
            { id: 'participation', label: `Participation (${personParticipations.length})` },
            ...(canEditProfile ? [{ id: 'settings', label: 'My Settings' }] : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => selectTab(tab.id as 'associations' | 'interactions' | 'referrals' | 'participation' | 'settings')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
          ))}
        </nav>
      </div>

      <div className="space-y-6">
        {activeTab === 'associations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleAffiliations.map((affiliation, index) => {
              const organization = organizations.find((candidate) => candidate.id === affiliation.organization_id);
              if (!organization) return null;
              const isPrimary = organization.id === person.organization_id;
              return (
                <Card key={`${organization.id}_${index}`} title={isPrimary ? 'Primary Organization' : 'Organization Affiliation'}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {onSelectOrganization ? (
                        <button onClick={() => onSelectOrganization(organization.id)} className="text-left text-lg font-bold text-indigo-700 hover:text-indigo-900 hover:underline">
                          {organization.name}
                        </button>
                      ) : (
                        <h4 className="text-lg font-bold text-gray-900">{organization.name}</h4>
                      )}
                      <p className="text-sm text-gray-500">{affiliation.role_title || person.role}</p>
                    </div>
                    <Badge color={affiliation.status === 'revoked' ? 'gray' : affiliation.status === 'pending' ? 'yellow' : 'green'}>
                      {formatAffiliationStatus(affiliation.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {affiliation.relationship_type && (
                      <span className="text-xs bg-indigo-50 px-2 py-1 rounded text-indigo-700 border border-indigo-100">
                        {affiliation.relationship_type}
                      </span>
                    )}
                    {affiliation.can_self_manage && (
                      <span className="text-xs bg-emerald-50 px-2 py-1 rounded text-emerald-700 border border-emerald-100">
                        Can manage profile
                      </span>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
                    {organization.classification.industry_tags.map((tag) => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                  </div>
                </Card>
              );
            })}
            {visibleAffiliations.length === 0 && (
              <Card title="Organization Affiliations">
                <p className="text-sm text-gray-500">No organization affiliations are linked to this profile yet.</p>
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
        {activeTab === 'settings' && canEditProfile && (
          <div className="grid gap-6">
            <Card title="My Email Templates">
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Save personal invite templates to reuse when accepting referrals. Great for scheduling a call, visiting your space, or a Calendly link.
                </p>
                <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">Tokens replaced when the email is sent:</p>
                  <p><code className="bg-white/70 rounded px-1">{'{{first_name}}'}</code> — entrepreneur's first name</p>
                  <p><code className="bg-white/70 rounded px-1">{'{{subject_name}}'}</code> — entrepreneur's full name</p>
                  <p><code className="bg-white/70 rounded px-1">{'{{receiving_org}}'}</code> — your organization</p>
                  <p><code className="bg-white/70 rounded px-1">{'{{referring_org}}'}</code> — the organization that sent the referral</p>
                </div>
                {templateDrafts.map((tpl, idx) => (
                  <div key={tpl.id} className="rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        className="flex-1 rounded border-gray-300 text-sm font-medium focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border bg-white"
                        value={tpl.name}
                        placeholder={`Template name (e.g. "Schedule a call")`}
                        onChange={(e) => {
                          setTemplateDrafts(templateDrafts.map((t, i) => i === idx ? { ...t, name: e.target.value } : t));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = templateDrafts.filter((_, i) => i !== idx);
                          setTemplateDrafts(next);
                          void repos.people.update(person.id, { referral_templates: next });
                          setTemplatesSavedAt(Date.now());
                        }}
                        className="text-xs text-red-400 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Subject line <span className="font-normal text-gray-400">(optional — leave blank for default)</span></label>
                      <input
                        className="block w-full rounded border-gray-300 text-xs focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border bg-white"
                        value={tpl.subject || ''}
                        placeholder={`e.g. "Let's connect — {{receiving_org}}"`}
                        onChange={(e) => {
                          setTemplateDrafts(templateDrafts.map((t, i) => i === idx ? { ...t, subject: e.target.value } : t));
                        }}
                      />
                    </div>
                    <textarea
                      className="block w-full rounded border-gray-300 text-xs font-mono focus:border-indigo-500 focus:ring-indigo-500 p-2 border bg-white"
                      rows={6}
                      value={tpl.body}
                      placeholder={`Hi {{first_name}},\n\nThanks for the intro! I'd love to connect — grab a time here:\n\nhttps://calendly.com/yourname/30min\n\n[Your name]`}
                      onChange={(e) => {
                        setTemplateDrafts(templateDrafts.map((t, i) => i === idx ? { ...t, body: e.target.value } : t));
                      }}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateDrafts([...templateDrafts, { id: `tpl_${Date.now()}`, name: '', body: '' }]);
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + Add Template
                  </button>
                  {templateDrafts.length > 0 && (
                    <button
                      type="button"
                      disabled={isSavingTemplates}
                      onClick={async () => {
                        setIsSavingTemplates(true);
                        await repos.people.update(person.id, { referral_templates: templateDrafts });
                        setIsSavingTemplates(false);
                        setTemplatesSavedAt(Date.now());
                      }}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isSavingTemplates ? 'Saving…' : 'Save templates'}
                    </button>
                  )}
                  {templatesSavedAt && (
                    <span className="text-xs text-green-600 font-medium">Saved</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">Subject line note: if you leave the subject blank, the email subject will default to <em>"[Org] accepted your referral"</em>. The body of your template is inserted as a paragraph inside the system email wrapper.</div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'participation' && (
          <div className="space-y-4">
            {personParticipations.length === 0 ? (
              <Card title="Participation">
                <p className="text-sm text-gray-500">No participation records are linked to this person yet.</p>
              </Card>
            ) : (
              personParticipations.map((service) => {
                const provider = organizations.find((organization) => organization.id === service.provider_org_id);
                return (
                  <Card key={service.id} title={service.name}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-600">
                          {service.participation_type?.replace(/_/g, ' ') || 'program'} with {provider?.name || 'Partner organization'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{formatParticipationWindow(service)}</div>
                      </div>
                      <Badge color={getParticipationStatusColor(service)}>
                        {getParticipationStatusLabel(service)}
                      </Badge>
                    </div>
                    {service.description && (
                      <div className="mt-3 text-sm text-gray-700">{service.description}</div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {showStaffActions && (
        <>
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
        </>
      )}

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
            <label className={FORM_LABEL_CLASS}>Profile Photo URL</label>
            <input className={FORM_INPUT_CLASS} value={profileForm.avatar_url} onChange={(event) => setProfileForm({ ...profileForm, avatar_url: event.target.value })} placeholder="https://..." />
            <div className="mt-1 text-xs text-gray-500">
              Use a hosted image URL for now. Login-provider photos and uploads can be added later.
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Upload Profile Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setProfilePhotoFile(event.target.files?.[0] || null)}
              className={FORM_INPUT_CLASS}
            />
            <div className="mt-1 text-xs text-gray-500">
              Uploaded files go to Firebase Storage and replace the profile photo URL above when saved.
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Role Title</label>
            <input className={FORM_INPUT_CLASS} value={profileForm.role} onChange={(event) => setProfileForm({ ...profileForm, role: event.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Default Acting Organization</label>
            <select className={FORM_SELECT_CLASS} value={profileForm.organization_id} onChange={(event) => setProfileForm({ ...profileForm, organization_id: event.target.value })}>
              <option value="">Select a default organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">Organization Affiliations</div>
                <div className="text-xs text-gray-500">
                  Add every business or organization this person is connected to, including inactive past associations.
                </div>
              </div>
              <button onClick={handleAddAffiliation} className="rounded border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
                + Add Organization
              </button>
            </div>
            <div className="space-y-4">
              {profileForm.affiliations.map((affiliation, index) => (
                <div key={`${affiliation.organization_id || 'new'}_${index}`} className="rounded border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex justify-between gap-3">
                    <div className="text-sm font-medium text-gray-900">Affiliation {index + 1}</div>
                    <button onClick={() => handleRemoveAffiliation(index)} className="text-xs text-gray-500 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                  <div>
                    <label className={FORM_LABEL_CLASS}>Organization</label>
                    <select className={FORM_SELECT_CLASS} value={affiliation.organization_id} onChange={(event) => handleAffiliationChange(index, 'organization_id', event.target.value)}>
                      <option value="">Select organization</option>
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className={FORM_LABEL_CLASS}>Role Title</label>
                      <input className={FORM_INPUT_CLASS} value={affiliation.role_title} onChange={(event) => handleAffiliationChange(index, 'role_title', event.target.value)} placeholder="Founder, advisor, employee..." />
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>Relationship</label>
                      <select className={FORM_SELECT_CLASS} value={affiliation.relationship_type} onChange={(event) => handleAffiliationChange(index, 'relationship_type', event.target.value)}>
                        <option value="founder">Founder</option>
                        <option value="owner">Owner</option>
                        <option value="employee">Employee</option>
                        <option value="advisor">Advisor</option>
                        <option value="board">Board</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={FORM_LABEL_CLASS}>Status</label>
                      <select className={FORM_SELECT_CLASS} value={affiliation.status} onChange={(event) => handleAffiliationChange(index, 'status', event.target.value)}>
                        <option value="active">Active</option>
                        <option value="pending">Pending approval</option>
                        <option value="revoked">No longer active</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={affiliation.can_self_manage}
                      onChange={(event) => handleAffiliationChange(index, 'can_self_manage', event.target.checked)}
                    />
                    Can act on behalf of this organization
                  </label>
                </div>
              ))}
              {profileForm.affiliations.length === 0 && (
                <div className="text-sm text-gray-500">No affiliations added yet.</div>
              )}
              <div className="text-xs text-gray-500">
                Mark former jobs, retired roles, or exited ventures as <strong>No longer active</strong> so they stay in history without appearing in the active context switcher.
              </div>
            </div>
          </div>
          {profileSaveError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {profileSaveError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowEditProfile(false)} className="rounded border px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={() => void handleSaveProfile()} disabled={isSavingProfile} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSavingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
