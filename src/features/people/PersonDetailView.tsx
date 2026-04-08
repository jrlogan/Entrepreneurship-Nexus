import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Person, Organization, Interaction, Referral, Service } from '../../domain/types';
import { Card, Badge, Avatar, Modal, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';
import { SearchableSelect } from '../../shared/ui/SearchableSelect';
import { LogInteractionModal } from '../interactions/LogInteractionModal';
import { CreateReferralModal } from '../referrals/CreateReferralModal';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { getAllOrganizationAffiliations } from '../../domain/people/affiliations';
import { ENUMS } from '../../domain/standards/enums';
import { uploadImageFile } from '../../services/storageUploads';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { ALL_ECOSYSTEMS } from '../../data/mockData';

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
        is_primary: affiliation.organization_id === person.organization_id,
      }));
    }

    if (person.organization_id) {
      return [{
        organization_id: person.organization_id,
        role_title: person.role || '',
        relationship_type: person.system_role === 'entrepreneur' ? 'founder' : 'employee',
        status: 'active' as const,
        can_self_manage: person.system_role === 'entrepreneur',
        is_primary: true,
      }];
    }

    return [];
  }, [person]);
  const [activeTab, setActiveTab] = useState<'associations' | 'interactions' | 'referrals' | 'participation' | 'settings'>(initialTab);
  const [showLogInteraction, setShowLogInteraction] = useState(false);
  const [showCreateReferral, setShowCreateReferral] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddAssociation, setShowAddAssociation] = useState(false);
  const [addAssocForm, setAddAssocForm] = useState({ organization_id: '', role_title: '', relationship_type: 'employee', status: 'active' });
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const cropImgRef = useRef<HTMLImageElement>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);
  const [templateDrafts, setTemplateDrafts] = useState<Array<{id: string; name: string; subject?: string; body: string}>>(person.referral_templates || []);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [templatesSavedAt, setTemplatesSavedAt] = useState<number | null>(null);

  // Privacy & Data state
  type NoticeRecord = { id: string; type: string; status: string; created_at: string; sent_at: string | null };
  const [noticeHistory, setNoticeHistory] = useState<NoticeRecord[] | null>(null);
  const [isLoadingNotices, setIsLoadingNotices] = useState(false);
  const [removalState, setRemovalState] = useState<null | 'confirming' | 'loading' | 'done' | 'already_pending'>(null);
  const [removalRequestedAt, setRemovalRequestedAt] = useState<string | null>(null);

  const loadNoticeHistory = async () => {
    setIsLoadingNotices(true);
    try {
      const result = await callHttpFunction<Record<string, never>, { notices: NoticeRecord[] }>('getMyNoticeHistory', {});
      setNoticeHistory(result.notices);
    } catch {
      setNoticeHistory([]);
    } finally {
      setIsLoadingNotices(false);
    }
  };

  const handleRequestRemoval = async () => {
    setRemovalState('loading');
    try {
      const result = await callHttpFunction<Record<string, never>, { already_pending: boolean; requested_at: string }>('requestDataRemoval', {});
      setRemovalRequestedAt(result.requested_at);
      setRemovalState(result.already_pending ? 'already_pending' : 'done');
    } catch {
      setRemovalState(null);
    }
  };
  useEffect(() => { setTemplateDrafts(person.referral_templates || []); }, [person.referral_templates]);
  const [profileForm, setProfileForm] = useState({
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    secondary_emails: person.secondary_emails || [] as string[],
    avatar_url: person.avatar_url || '',
    role: person.role,
    affiliations: buildAffiliationDrafts(),
    links: person.links || [] as Array<{ platform: 'linkedin' | 'twitter' | 'website' | 'github' | 'other'; url: string }>,
  });

  const personName = `${person.first_name} ${person.last_name}`;
  const personInteractions = interactions.filter((interaction) => interaction.attendees?.includes(personName)).sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const personReferrals = referrals.filter((referral) => referral.subject_person_id === person.id);
  const personParticipations = services
    .filter((service) => service.recipient_person_id === person.id)
    .sort((left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime());
  const allAffiliations = getAllOrganizationAffiliations(person);
  const visibleAffiliations = allAffiliations.filter((affiliation) => affiliation.organization_id);
  const ecosystem = ALL_ECOSYSTEMS.find(e => e.id === viewer.ecosystemId);
  const featureFlags = ecosystem?.settings?.feature_flags || {};
  const canAccessAdvancedWorkflows = featureFlags.advanced_workflows === true;
  const canAccessInteractions = canAccessAdvancedWorkflows || featureFlags.interactions === true;
  const isOwnProfile = viewer.personId === person.id;
  const canEditProfile = isOwnProfile
    || viewer.role === 'platform_admin'
    || viewer.role === 'ecosystem_manager'
    || viewer.role === 'eso_admin'
    || viewer.role === 'eso_staff';
  const showStaffActions = viewer.role !== 'entrepreneur';
  const isAdminViewer = viewer.role === 'platform_admin' || viewer.role === 'ecosystem_manager';

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setProfileForm({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      secondary_emails: person.secondary_emails || [],
      avatar_url: person.avatar_url || '',
      role: person.role,
      affiliations: buildAffiliationDrafts(),
      links: person.links || [],
    });
    setProfilePhotoFile(null);
    setProfilePhotoPreviewUrl(null);
    setProfileSaveError('');
    setIsSavingProfile(false);
  }, [person, showEditProfile, buildAffiliationDrafts]);

  // Keep a stable blob URL for the cropped preview; revoke when it changes or modal closes.
  useEffect(() => {
    if (!profilePhotoFile) {
      setProfilePhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(profilePhotoFile);
    setProfilePhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profilePhotoFile]);

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

  const handlePhotoSelected = (file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const onCropImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height));
  }, []);

  const handleCropConfirm = () => {
    if (!completedCrop || !cropImgRef.current) return;
    const img = cropImgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    // Source region in natural pixels
    const srcW = completedCrop.width * scaleX;
    const srcH = completedCrop.height * scaleY;

    // Cap output at 400×400 — more than enough for an avatar
    const MAX_PX = 400;
    const outSize = Math.min(MAX_PX, srcW, srcH);

    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      srcW, srcH,
      0, 0, outSize, outSize,
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      setProfilePhotoFile(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      URL.revokeObjectURL(cropSrc!);
      setCropSrc(null);
    }, 'image/jpeg', 0.85);
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setProfileSaveError('');
    const isSelfEntrepreneur = isOwnProfile && viewer.role === 'entrepreneur';
    const normalizedAffiliations = profileForm.affiliations
      .filter((affiliation) => affiliation.organization_id)
      .map((affiliation) => ({
        organization_id: affiliation.organization_id,
        role_title: affiliation.role_title || null,
        relationship_type: affiliation.relationship_type || 'other',
        status: affiliation.status || 'active',
        // Entrepreneurs cannot self-grant management rights — preserve existing value only
        can_self_manage: isSelfEntrepreneur
          ? (person.organization_affiliations?.find(a => a.organization_id === affiliation.organization_id)?.can_self_manage ?? false)
          : (affiliation.can_self_manage ?? false),
        is_primary: affiliation.is_primary ?? false,
      }));
    const activeAffiliations = normalizedAffiliations.filter((affiliation) => affiliation.status === 'active');
    const primaryOrganizationId =
      normalizedAffiliations.find((a) => a.is_primary)?.organization_id
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
        secondary_emails: profileForm.secondary_emails.map(e => e.toLowerCase().trim()).filter(Boolean),
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
        links: profileForm.links.filter(l => l.url.trim()),
      });
      setShowEditProfile(false);
      onRefresh?.();
    } catch (error) {
      setProfileSaveError(error instanceof Error ? error.message : 'Unable to save profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddAssociation = async () => {
    if (!addAssocForm.organization_id) return;
    type RelType = 'founder' | 'owner' | 'employee' | 'advisor' | 'board' | 'other';
    type StatusType = 'active' | 'pending' | 'revoked';
    const existing = getAllOrganizationAffiliations(person);
    const alreadyLinked = existing.some(a => a.organization_id === addAssocForm.organization_id);
    if (alreadyLinked) return;
    const isFirst = existing.length === 0 && !person.organization_id;
    await repos.people.update(person.id, {
      organization_affiliations: [
        ...existing,
        {
          organization_id: addAssocForm.organization_id,
          role_title: addAssocForm.role_title || null,
          relationship_type: addAssocForm.relationship_type as RelType,
          status: addAssocForm.status as StatusType,
          can_self_manage: false,
        },
      ],
      ...(isFirst ? { organization_id: addAssocForm.organization_id } : {}),
    });
    setShowAddAssociation(false);
    setAddAssocForm({ organization_id: '', role_title: '', relationship_type: 'employee', status: 'active' });
    onRefresh?.();
  };

  const handleAffiliationChange = (index: number, field: 'organization_id' | 'role_title' | 'relationship_type' | 'status' | 'can_self_manage' | 'is_primary', value: string | boolean) => {
    setProfileForm((current) => ({
      ...current,
      affiliations: current.affiliations.map((affiliation, affiliationIndex) => {
        if (field === 'is_primary') {
          // Only one can be primary at a time
          return { ...affiliation, is_primary: affiliationIndex === index };
        }
        return affiliationIndex === index ? { ...affiliation, [field]: value } : affiliation;
      }),
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
          is_primary: false,
        }
      ]
    }));
  };

  const handleRemoveAffiliation = (index: number) => {
    setProfileForm((current) => {
      const next = current.affiliations.filter((_, i) => i !== index);
      // If the removed one was primary, promote the first remaining active one
      if (current.affiliations[index]?.is_primary && next.length > 0) {
        const firstActive = next.findIndex((a) => a.status === 'active' && a.organization_id);
        const promote = firstActive >= 0 ? firstActive : 0;
        next[promote] = { ...next[promote], is_primary: true };
      }
      return { ...current, affiliations: next };
    });
  };

  const formatAffiliationStatus = (status?: string) => {
    if (status === 'revoked') return 'No longer active';
    if (status === 'pending') return 'Pending approval';
    return 'Active';
  };

  const handleArchivePerson = async () => {
    setIsArchiving(true);
    await repos.people.archive(person.id);
    setIsArchiving(false);
    setShowArchiveConfirm(false);
    onRefresh?.();
    onBack();
  };

  const handleDeletePerson = async () => {
    setIsDeleting(true);
    await repos.people.delete(person.id);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    onBack();
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
            <Avatar src={person.avatar_url} name={personName} size="xl" enlargeable />
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
                {canAccessInteractions && <button onClick={() => setShowLogInteraction(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>}
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
          )) : <span className="text-sm text-gray-400 italic">{canEditProfile ? <button onClick={() => setShowEditProfile(true)} className="underline hover:text-indigo-500">Add LinkedIn or other links</button> : 'No social links added.'}</span>}
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-6">
          {[
            { id: 'associations', label: 'Associations' },
            ...(canAccessInteractions ? [{ id: 'interactions', label: `Interactions (${personInteractions.length})` }] : []),
            { id: 'referrals', label: `Referrals (${personReferrals.length})` },
            { id: 'participation', label: `Participation (${personParticipations.length})` },
            ...((isOwnProfile || isAdminViewer) ? [{ id: 'settings', label: isOwnProfile ? 'My Settings' : 'Settings' }] : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => selectTab(tab.id as 'associations' | 'interactions' | 'referrals' | 'participation' | 'settings')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
          ))}
        </nav>
      </div>

      <div className="space-y-6">
        {activeTab === 'associations' && (
          <div className="space-y-4">
          {canEditProfile && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddAssociation(true)}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                + Add Association
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...visibleAffiliations].sort((a, b) => {
              const aIsPrimary = a.organization_id === person.organization_id ? 0 : 1;
              const bIsPrimary = b.organization_id === person.organization_id ? 0 : 1;
              return aIsPrimary - bIsPrimary;
            }).map((affiliation, index) => {
              const organization = organizations.find((candidate) => candidate.id === affiliation.organization_id);
              if (!organization) return null;
              const isPrimary = organization.id === person.organization_id;
              return (
                <Card key={`${organization.id}_${index}`} title={
                  <span className="flex items-center gap-2">
                    Organization
                    {isPrimary && <Badge color="indigo">Default</Badge>}
                  </span>
                }>
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
            {isAdminViewer && !isOwnProfile && (
              <Card title="Admin Actions">
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">These actions are only visible to admins and cannot be undone easily.</p>
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => setShowArchiveConfirm(true)}
                      className="px-4 py-2 text-sm font-medium border border-yellow-400 text-yellow-700 rounded hover:bg-yellow-50"
                    >
                      Archive Account
                    </button>
                    <button
                      onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
                      className="px-4 py-2 text-sm font-medium border border-red-400 text-red-700 rounded hover:bg-red-50"
                    >
                      Delete Account
                    </button>
                  </div>
                  {person.status === 'revoked' && (
                    <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                      This account is currently archived.
                    </p>
                  )}
                </div>
              </Card>
            )}
            {isOwnProfile && viewer.role !== 'entrepreneur' && <Card title="My Email Templates">
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
            </Card>}

            {isOwnProfile && (
              <Card title="Privacy & Data">
                <div className="space-y-5 text-sm">
                  <p className="text-gray-600">
                    This platform stores your name, email, organization affiliation, referral history, and activity records to support the ecosystem network. Below is a summary of what we hold and what we've sent you.
                  </p>

                  {/* Emails sent */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="font-medium text-gray-800">Emails sent to you by this platform</div>
                      {noticeHistory === null && (
                        <button
                          type="button"
                          onClick={() => void loadNoticeHistory()}
                          disabled={isLoadingNotices}
                          className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
                        >
                          {isLoadingNotices ? 'Loading…' : 'Show history'}
                        </button>
                      )}
                    </div>
                    {noticeHistory === null ? (
                      <p className="text-xs text-gray-400 italic">Click "Show history" to load your email log.</p>
                    ) : noticeHistory.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No platform emails on record.</p>
                    ) : (
                      <div className="rounded border border-gray-200 divide-y divide-gray-100">
                        {noticeHistory.map((notice) => (
                          <div key={notice.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-gray-700 capitalize">{notice.type.replace(/_/g, ' ')}</span>
                            <div className="flex items-center gap-2 text-right">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${notice.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {notice.status}
                              </span>
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {new Date(notice.sent_at || notice.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Data held */}
                  <div>
                    <div className="font-medium text-gray-800 mb-2">Data we hold about you</div>
                    <div className="rounded border border-gray-200 bg-gray-50 divide-y divide-gray-100 text-xs">
                      {[
                        ['Name', `${person.first_name} ${person.last_name}`],
                        ['Email', person.email],
                        ['Organization', person.organization_id || 'None linked'],
                        ['Role', person.system_role],
                        ['Account created', (person as any).created_at ? new Date((person as any).created_at).toLocaleDateString() : 'Unknown'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-4 px-3 py-2">
                          <span className="w-32 shrink-0 text-gray-500">{label}</span>
                          <span className="text-gray-800 break-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Removal request */}
                  <div className="rounded-md border border-rose-100 bg-rose-50 px-4 py-3">
                    <div className="font-medium text-rose-900 mb-1">Request removal from the system</div>
                    <p className="text-xs text-rose-800 mb-3">
                      Submits a request to a platform administrator to permanently delete your profile, referrals, and activity records. This does not happen automatically — an administrator will review and process your request, typically within 30 days.
                    </p>
                    {removalState === 'done' ? (
                      <p className="text-xs text-rose-800 font-medium">
                        Request submitted {removalRequestedAt ? `on ${new Date(removalRequestedAt).toLocaleDateString()}` : ''}. An administrator has been notified and will follow up.
                      </p>
                    ) : removalState === 'already_pending' ? (
                      <p className="text-xs text-rose-800 font-medium">
                        A removal request is already on file {removalRequestedAt ? `from ${new Date(removalRequestedAt).toLocaleDateString()}` : ''}. An administrator will follow up.
                      </p>
                    ) : removalState === 'confirming' ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleRequestRemoval()}
                          className="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                        >
                          Yes, submit request
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemovalState(null)}
                          className="text-xs text-rose-700 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={removalState === 'loading'}
                        onClick={() => setRemovalState('confirming')}
                        className="rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Request data removal
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )}
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
                          {ENUMS.ServiceParticipationType?.find(o => o.id === service.participation_type)?.label ?? service.participation_type?.replace(/_/g, ' ') ?? 'program'} with {provider?.name || 'Partner organization'}
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
            subjectPersonId={person.id}
          />
        </>
      )}

      <Modal isOpen={showEditProfile} onClose={() => setShowEditProfile(false)} title="Edit My Profile" wide>
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
            <label className={FORM_LABEL_CLASS}>Primary Email</label>
            <input className={FORM_INPUT_CLASS} value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Additional Emails <span className="font-normal text-gray-400">(used for matching inbound referrals)</span></label>
            <div className="space-y-2">
              {profileForm.secondary_emails.map((email, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className={FORM_INPUT_CLASS}
                    value={email}
                    placeholder="other@example.com"
                    onChange={(e) => {
                      const next = [...profileForm.secondary_emails];
                      next[i] = e.target.value;
                      setProfileForm({ ...profileForm, secondary_emails: next });
                    }}
                  />
                  <button
                    type="button"
                    title="Make this the primary email"
                    onClick={() => setProfileForm({
                      ...profileForm,
                      email: email,
                      secondary_emails: [
                        profileForm.email,
                        ...profileForm.secondary_emails.filter((_, j) => j !== i),
                      ],
                    })}
                    className="rounded border border-indigo-200 px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                  >
                    Make primary
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileForm({ ...profileForm, secondary_emails: profileForm.secondary_emails.filter((_, j) => j !== i) })}
                    className="rounded border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setProfileForm({ ...profileForm, secondary_emails: [...profileForm.secondary_emails, ''] })}
                className="text-sm text-indigo-600 hover:underline"
              >
                + Add email
              </button>
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Social Links</label>
            <div className="space-y-2">
              {profileForm.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="rounded border border-gray-300 text-sm px-2 py-1.5 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={link.platform}
                    onChange={e => {
                      const next = [...profileForm.links];
                      next[i] = { ...next[i], platform: e.target.value as typeof link.platform };
                      setProfileForm({ ...profileForm, links: next });
                    }}
                  >
                    <option value="linkedin">LinkedIn</option>
                    <option value="website">Website</option>
                    <option value="twitter">Twitter / X</option>
                    <option value="github">GitHub</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={link.url}
                    placeholder="https://..."
                    onChange={e => {
                      const next = [...profileForm.links];
                      next[i] = { ...next[i], url: e.target.value };
                      setProfileForm({ ...profileForm, links: next });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setProfileForm({ ...profileForm, links: profileForm.links.filter((_, j) => j !== i) })}
                    className="rounded border border-red-200 px-2 py-1.5 text-sm text-red-500 hover:bg-red-50"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setProfileForm({ ...profileForm, links: [...profileForm.links, { platform: 'linkedin', url: '' }] })}
                className="text-sm text-indigo-600 hover:underline"
              >+ Add link</button>
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Profile Photo</label>
            <div className="flex items-center gap-4">
              <Avatar src={profilePhotoPreviewUrl ?? person.avatar_url} name={personName} size="lg" />
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoSelected(e.target.files?.[0] || null)}
                  className={FORM_INPUT_CLASS}
                />
                {profilePhotoFile && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-emerald-700">
                    <span>✓ Photo ready to save</span>
                    <button type="button" className="text-gray-400 hover:text-gray-600 underline" onClick={() => { setProfilePhotoFile(null); }}>Remove</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-gray-900">Organization Affiliations</div>
                <div className="text-xs text-gray-500">
                  {isOwnProfile && viewer.role === 'entrepreneur'
                    ? 'Your organization links are managed through the My Ventures portal. You can update your role title or mark a past affiliation as inactive here.'
                    : 'Add every business or organization this person is connected to, including inactive past associations.'}
                </div>
              </div>
              {(!isOwnProfile || viewer.role !== 'entrepreneur') && (
                <button onClick={handleAddAffiliation} className="rounded border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
                  + Add Organization
                </button>
              )}
            </div>
            <div className="space-y-4">
              {profileForm.affiliations.map((affiliation, index) => (
                <div key={`${affiliation.organization_id || 'new'}_${index}`} className="rounded border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex items-center gap-2">
                      {affiliation.is_primary ? (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">Default</span>
                      ) : (
                        affiliation.organization_id && (
                          <button
                            type="button"
                            onClick={() => handleAffiliationChange(index, 'is_primary', true)}
                            className="text-xs text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-full hover:bg-indigo-50 transition-colors"
                          >
                            Make default
                          </button>
                        )
                      )}
                    </div>
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
                  {isOwnProfile && viewer.role === 'entrepreneur' ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <input type="checkbox" checked={affiliation.can_self_manage} disabled readOnly />
                      <span>Can act on behalf of this organization</span>
                      {!affiliation.can_self_manage && (
                        <span className="text-xs text-gray-400 italic">(granted via the portal claim flow)</span>
                      )}
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={affiliation.can_self_manage}
                        onChange={(event) => handleAffiliationChange(index, 'can_self_manage', event.target.checked)}
                      />
                      Can act on behalf of this organization
                    </label>
                  )}
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

      {/* Add Association modal */}
      <Modal isOpen={showAddAssociation} onClose={() => setShowAddAssociation(false)} title="Add Association">
        <div className="space-y-4">
          <SearchableSelect
            label="Organization"
            options={organizations
              .filter(o => !getAllOrganizationAffiliations(person).some(a => a.organization_id === o.id) && o.id !== person.organization_id)
              .map(o => ({ id: o.id, label: o.name }))}
            value={addAssocForm.organization_id}
            onChange={v => setAddAssocForm(f => ({ ...f, organization_id: v }))}
            placeholder="Search organizations..."
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FORM_LABEL_CLASS}>Role Title <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                className={FORM_INPUT_CLASS}
                value={addAssocForm.role_title}
                onChange={e => setAddAssocForm(f => ({ ...f, role_title: e.target.value }))}
                placeholder="Founder, Advisor..."
              />
            </div>
            <div>
              <label className={FORM_LABEL_CLASS}>Relationship</label>
              <select className={FORM_SELECT_CLASS} value={addAssocForm.relationship_type} onChange={e => setAddAssocForm(f => ({ ...f, relationship_type: e.target.value }))}>
                <option value="founder">Founder</option>
                <option value="owner">Owner</option>
                <option value="employee">Employee</option>
                <option value="advisor">Advisor</option>
                <option value="board">Board</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Status</label>
            <select className={FORM_SELECT_CLASS} value={addAssocForm.status} onChange={e => setAddAssocForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="revoked">No longer active</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAddAssociation(false)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => void handleAddAssociation()}
              disabled={!addAssocForm.organization_id}
              className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Association
            </button>
          </div>
        </div>
      </Modal>

      {/* Archive confirmation modal */}
      <Modal isOpen={showArchiveConfirm} onClose={() => setShowArchiveConfirm(false)} title="Archive Account">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Archiving <strong>{personName}</strong> will mark their account as inactive. They will no longer appear in active lists, but their data will be preserved.
          </p>
          <p className="text-sm text-gray-500">You can restore them by editing their profile and changing the status back to active.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowArchiveConfirm(false)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => void handleArchivePerson()}
              disabled={isArchiving}
              className="px-4 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
            >
              {isArchiving ? 'Archiving...' : 'Archive Account'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Account">
        <div className="space-y-4">
          <div className="rounded border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            <strong>This is permanent.</strong> Deleting this account will remove all of {personName}'s data from the system. This cannot be undone.
          </div>
          <p className="text-sm text-gray-700">
            To confirm, type <strong>{personName}</strong> below:
          </p>
          <input
            className={FORM_INPUT_CLASS}
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder={personName}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => void handleDeletePerson()}
              disabled={isDeleting || deleteConfirmText !== personName}
              className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Permanently Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Photo crop modal */}
      {cropSrc && (
        <Modal isOpen={!!cropSrc} onClose={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }} title="Crop Profile Photo">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Drag to reposition. Resize the box to crop.</p>
            <div className="flex justify-center max-h-[60vh] overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
                minWidth={60}
              >
                <img
                  ref={cropImgRef}
                  src={cropSrc}
                  onLoad={onCropImageLoad}
                  alt="Crop preview"
                  style={{ maxHeight: '55vh', maxWidth: '100%' }}
                />
              </ReactCrop>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }} className="rounded border px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleCropConfirm}
                disabled={!completedCrop}
                className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Use this crop
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
