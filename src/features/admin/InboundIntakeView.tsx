import React, { useEffect, useMemo, useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, Modal, FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, InfoBanner } from '../../shared/ui/Components';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { queryCollection, setDocument, deleteDocument } from '../../services/firestoreClient';
import { useAuthSession } from '../../app/useAuthSession';
import type { AuthorizedSenderDomain, InboundActivityType, InboundMessage, InboundParseResult, InboundRoute } from '../../domain/inbound/types';
import type { Organization } from '../../domain/organizations/types';
import { callHttpFunction } from '../../services/httpFunctionClient';

interface NoticeQueueItem {
  id: string;
  type: string;
  person_id: string;
  to_email: string;
  status: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export const InboundIntakeView = () => {
  const repos = useRepos();
  const viewer = useViewer();
  const session = useAuthSession();
  const currentRole = session.viewer?.role || session.person?.system_role || 'entrepreneur';
  const canViewInboundIntake = currentRole === 'platform_admin' || currentRole === 'ecosystem_manager';
  const canViewRawIntake = currentRole === 'platform_admin';
  const canManageAuthorizedDomains = currentRole === 'platform_admin';
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [parseResults, setParseResults] = useState<InboundParseResult[]>([]);
  const [noticeQueue, setNoticeQueue] = useState<NoticeQueueItem[]>([]);
  const [routes, setRoutes] = useState<InboundRoute[]>([]);
  const [authorizedDomains, setAuthorizedDomains] = useState<AuthorizedSenderDomain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDomain, setIsSavingDomain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleEsoOrganizations, setVisibleEsoOrganizations] = useState<Organization[]>([]);
  const [allEcosystemOrganizations, setAllEcosystemOrganizations] = useState<Organization[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainOrgId, setNewDomainOrgId] = useState('');
  const [newDomainPolicy, setNewDomainPolicy] = useState<NonNullable<AuthorizedSenderDomain['access_policy']>>('approved');

  const loadData = async () => {
    if (!canViewInboundIntake) {
        setMessages([]);
        setParseResults([]);
        setNoticeQueue([]);
        setRoutes([]);
        setAuthorizedDomains([]);
        setVisibleEsoOrganizations([]);
        setAllEcosystemOrganizations([]);
        setError(null);
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isFirebaseEnabled() && session.authUser) {
        const organizations = await repos.organizations.getAll(viewer, viewer.ecosystemId);
        setVisibleEsoOrganizations(organizations.filter((organization) => organization.roles.includes('eso')));
        setAllEcosystemOrganizations(organizations.slice().sort((a, b) => a.name.localeCompare(b.name)));

        const firestoreRoutes = await queryCollection<InboundRoute>('inbound_routes');
        setRoutes(firestoreRoutes);
        const firestoreDomains = await queryCollection<AuthorizedSenderDomain>('authorized_sender_domains');
        setAuthorizedDomains(firestoreDomains);

        if (canViewRawIntake) {
          const [firestoreMessages, firestoreParseResults, firestoreNoticeQueue] = await Promise.all([
            queryCollection<InboundMessage>('inbound_messages'),
            queryCollection<InboundParseResult>('inbound_parse_results'),
            queryCollection<NoticeQueueItem>('notice_queue'),
          ]);
          setMessages(firestoreMessages);
          setParseResults(firestoreParseResults);
          setNoticeQueue(firestoreNoticeQueue);
        } else {
          setMessages([]);
          setParseResults([]);
          setNoticeQueue([]);
        }
      } else {
        const organizations = await repos.organizations.getAll(viewer, viewer.ecosystemId);
        setVisibleEsoOrganizations(organizations.filter((organization) => organization.roles.includes('eso')));
        setAllEcosystemOrganizations(organizations.slice().sort((a, b) => a.name.localeCompare(b.name)));
        setMessages(await repos.inboundMessages.getMessages());
        setParseResults(await repos.inboundMessages.getParseResults());
        setNoticeQueue([]);
        setRoutes(await repos.inboundMessages.getRoutes());
        setAuthorizedDomains([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load inbound intake data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [canViewInboundIntake, session.authUser]);

  if (!canViewInboundIntake) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Inbound Intake</h2>
        <InfoBanner title="Restricted">
          <p className="text-sm text-gray-700">Inbound intake is currently available only to ecosystem and platform administrators.</p>
        </InfoBanner>
      </div>
    );
  }

  const REVIEW_REASON_LABELS: Record<string, string> = {
    missing_client_email: 'No entrepreneur email found',
    unknown_sender_domain: 'Sender domain not recognized',
    unknown_receiving_org: 'Receiving organization not matched',
    multiple_cc_entrepreneurs: 'Multiple CC recipients — ambiguous entrepreneur',
  };

  const parseResultByMessageId = new Map<string, InboundParseResult>(parseResults.map((result) => [result.inbound_message_id, result]));
  const scopedRoutes = routes.filter((route) => route.ecosystem_id === viewer.ecosystemId);
  // Platform admins see all messages including unrouted ones (ecosystem_id: null); others see only their ecosystem.
  const scopedMessages = canViewRawIntake
    ? messages.slice().sort((a, b) => b.received_at.localeCompare(a.received_at))
    : messages.filter((message) => message.ecosystem_id === viewer.ecosystemId);
  const pendingReviewCount = scopedMessages.filter((m) => m.review_status === 'needs_review').length;
  const scopedAuthorizedDomains = authorizedDomains
    .filter((domain) => domain.ecosystem_id === viewer.ecosystemId)
    .sort((a, b) => a.domain.localeCompare(b.domain));
  const authorizedSenderDomains = Array.from(new Set([
    ...scopedRoutes.flatMap((route) => route.allowed_sender_domains || []),
    ...scopedAuthorizedDomains.map((domain) => domain.domain),
  ])).sort();
  const activeIntegrationOrganizations = useMemo(() => visibleEsoOrganizations.filter((organization) => {
    const activeKeys = (organization.api_keys || []).filter((key) => key.status === 'active').length;
    const activeWebhooks = (organization.webhooks || []).filter((hook) => hook.status === 'active').length;
    return activeKeys > 0 || activeWebhooks > 0;
  }), [visibleEsoOrganizations]);

  const [newRoute, setNewRoute] = useState({ route_address: '', activity_type: 'introduction' as InboundActivityType });
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);

  const handleCreateRoute = async () => {
    if (!newRoute.route_address.trim()) return;
    setIsSavingRoute(true);
    setError(null);
    try {
      const id = `route_${Date.now()}`;
      const routeDoc: InboundRoute = {
        id,
        route_address: newRoute.route_address.trim().toLowerCase(),
        ecosystem_id: viewer.ecosystemId,
        activity_type: newRoute.activity_type,
        allowed_sender_domains: [],
        is_active: true,
      };
      await setDocument('inbound_routes', id, routeDoc);
      setNewRoute({ route_address: '', activity_type: 'introduction' });
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to create route.');
    } finally {
      setIsSavingRoute(false);
    }
  };

  const sendQueuedNotices = async () => {
    setIsSending(true);
    setError(null);
    try {
      await callHttpFunction('sendQueuedNotices', {});
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to send queued notices.');
    } finally {
      setIsSending(false);
    }
  };

  const updateAuthorizedDomain = (id: string, patch: Partial<AuthorizedSenderDomain>) => {
    setAuthorizedDomains(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  };

  const addAuthorizedDomain = async () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    const duplicate = scopedAuthorizedDomains.find((d) => d.domain === trimmed);
    if (duplicate) {
      setError(`Domain "${trimmed}" is already configured for this ecosystem.`);
      return;
    }
    setIsSavingDomain(true);
    setError(null);
    try {
      const id = `domain_${Date.now()}`;
      const doc: AuthorizedSenderDomain = {
        id,
        domain: newDomain.trim().toLowerCase(),
        ecosystem_id: viewer.ecosystemId,
        organization_id: newDomainOrgId,
        access_policy: newDomainPolicy,
        is_active: true,
        allow_sender_affiliation: newDomainPolicy === 'approved',
        allow_auto_acknowledgement: newDomainPolicy === 'approved',
        allow_invite_prompt: newDomainPolicy === 'approved' || newDomainPolicy === 'invite_only',
      };
      await setDocument('authorized_sender_domains', id, doc);
      setNewDomain('');
      setNewDomainOrgId('');
      setNewDomainPolicy('approved');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to add domain.');
    } finally {
      setIsSavingDomain(false);
    }
  };

  const persistAuthorizedDomain = async (domain: AuthorizedSenderDomain) => {
    setIsSavingDomain(true);
    setError(null);
    try {
      await setDocument('authorized_sender_domains', domain.id, domain, true);
    } catch (err: any) {
      setError(err?.message || 'Unable to save domain.');
    } finally {
      setIsSavingDomain(false);
    }
  };

  const [selectedMessage, setSelectedMessage] = useState<InboundMessage | null>(null);
  const [reviewData, setReviewData] = useState({
    person_email: '',
    person_name: '',
    venture_name: '',
    subject_org_id: '',
    receiving_org_id: '',
    referring_org_id: '',
  });
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDeleteDomainId, setConfirmDeleteDomainId] = useState<string | null>(null);

  const handleOpenReview = (message: InboundMessage) => {
    const result = parseResultByMessageId.get(message.id);
    const ventureName = result?.candidate_venture_name || '';
    const matchedOrg = ventureName
      ? allEcosystemOrganizations.find((o) => o.name.toLowerCase() === ventureName.toLowerCase())
      : undefined;
    setSelectedMessage(message);
    setReviewData({
      person_email: result?.candidate_person_email || '',
      person_name: result?.candidate_person_name || '',
      venture_name: matchedOrg ? '' : ventureName,
      subject_org_id: matchedOrg ? matchedOrg.id : '',
      receiving_org_id: result?.candidate_receiving_org_id || '',
      referring_org_id: result?.candidate_referring_org_id || '',
    });
    setIsRejecting(false);
    setRejectReason('');
    setError(null);
  };

  const approveMessage = async () => {
    if (!selectedMessage) return;
    setIsApproving(true);
    setError(null);
    try {
      await callHttpFunction('approveInboundMessage', {
        inbound_message_id: selectedMessage.id,
        ...reviewData,
      });
      setSelectedMessage(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to approve message.');
    } finally {
      setIsApproving(false);
    }
  };

  const rejectMessage = async () => {
    if (!selectedMessage) return;
    setIsApproving(true);
    setError(null);
    try {
      await callHttpFunction('rejectInboundMessage', {
        inbound_message_id: selectedMessage.id,
        reason: rejectReason,
      });
      setSelectedMessage(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to reject message.');
    } finally {
      setIsApproving(false);
    }
  };

  const deleteDomain = async (id: string) => {
    await deleteDocument('authorized_sender_domains', id);
    setConfirmDeleteDomainId(null);
    await loadData();
  };

  return (
    <div className="space-y-6">
      {/* ... previous header and summary cards ... */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Inbound Intake</h2>
        <div className="flex items-center gap-3">
          {canViewRawIntake && (
            <button
              onClick={() => void sendQueuedNotices()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={isSending || noticeQueue.filter((notice) => notice.status === 'queued').length === 0}
            >
              {isSending ? 'Sending...' : 'Send queued notices'}
            </button>
          )}
          <button
            onClick={() => void loadData()}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <InfoBanner title="MVP Intake Pipeline">
        <p>This view shows the local BCC-intake workflow. Ecosystem managers get a scoped overview of inbound routes, authorized sender domains, and ESO integration activity. Platform admins also see raw inbound messages, parse results, and queued notices.</p>
        <p>When Firebase is enabled, this reads directly from Firestore emulator collections. Otherwise it falls back to the in-memory repo.</p>
      </InfoBanner>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Pipeline Summary">
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Inbound Routes</span>
              <Badge color="indigo">{scopedRoutes.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Authorized Domains</span>
              <Badge color="purple">{authorizedSenderDomains.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>ESO Integrations Active</span>
              <Badge color="green">{activeIntegrationOrganizations.length}</Badge>
            </div>
            {canViewRawIntake && (
              <>
                <div className="flex items-center justify-between">
                  <span>Inbound Messages</span>
                  <Badge color="indigo">{scopedMessages.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Queued Notices</span>
                  <Badge color="green">{noticeQueue.length}</Badge>
                </div>
              </>
            )}
            <div className="pt-2 text-xs text-gray-500">
              Session status: <span className="font-mono">{session.status}</span>
            </div>
          </div>
        </Card>

        <Card title="Inbound Routes & Authorized Domains" className="xl:col-span-2">
          {canManageAuthorizedDomains && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 p-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">Route address (email)</label>
                <input
                  className={FORM_INPUT_CLASS}
                  placeholder="referrals@inbound.entrepreneurship.nexus"
                  value={newRoute.route_address}
                  onChange={e => setNewRoute({ ...newRoute, route_address: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Activity type</label>
                <select
                  className={FORM_SELECT_CLASS}
                  value={newRoute.activity_type}
                  onChange={e => setNewRoute({ ...newRoute, activity_type: e.target.value as InboundActivityType })}
                >
                  <option value="introduction">introduction</option>
                  <option value="referral">referral</option>
                  <option value="followup">followup</option>
                  <option value="outcome">outcome</option>
                </select>
              </div>
              <button
                onClick={() => void handleCreateRoute()}
                disabled={!newRoute.route_address.trim() || isSavingRoute}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSavingRoute ? 'Saving...' : '+ Add Route'}
              </button>
            </div>
          )}
          {scopedRoutes.length === 0 ? (
            <p className="text-sm text-gray-500">No inbound routes configured for this ecosystem yet.</p>
          ) : (
            <div className="space-y-3">
              {scopedRoutes.map((route) => (
                  <div key={route.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-900">{route.route_address}</div>
                      <Badge color={route.is_active ? 'green' : 'gray'}>{route.is_active ? 'active' : 'inactive'}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{route.activity_type} · inbound route</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(route.allowed_sender_domains || []).map((domain) => (
                        <Badge key={domain} color="gray">{domain}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {scopedAuthorizedDomains.length > 0 && (
                  <div className="rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Approved domain registry</div>
                    <div className="mt-2 space-y-2">
                      {scopedAuthorizedDomains.map((domainRecord) => {
                        const org = visibleEsoOrganizations.find((organization) => organization.id === domainRecord.organization_id);
                        return (
                          <div key={domainRecord.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div className="font-medium text-gray-900">{domainRecord.domain}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge color="indigo">{org?.name || domainRecord.organization_id}</Badge>
                              <Badge color={
                                domainRecord.access_policy === 'invite_only'
                                  ? 'yellow'
                                  : domainRecord.access_policy === 'request_access'
                                    ? 'purple'
                                    : domainRecord.access_policy === 'blocked'
                                      ? 'red'
                                      : 'green'
                              }>
                                {domainRecord.access_policy || 'approved'}
                              </Badge>
                              {domainRecord.allow_sender_affiliation !== false && <Badge color="green">sender affiliation</Badge>}
                              {domainRecord.allow_auto_acknowledgement !== false && <Badge color="purple">sender receipt</Badge>}
                              {domainRecord.allow_invite_prompt !== false && <Badge color="gray">claim prompt</Badge>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Introduction Email Template">
        {(() => {
          const introRoute = scopedRoutes.find((r) => r.activity_type === 'introduction' && r.is_active);
          const bccAddress = introRoute?.route_address || '[your-intake-address@inbound.postmarkapp.com]';
          const template = [
            `To: [Receiving ESO contact email]`,
            `CC: [Entrepreneur's email]`,
            `BCC: ${bccAddress}`,
            `Subject: Introduction: [Entrepreneur First & Last Name]`,
            ``,
            `Hi [Receiving ESO name],`,
            ``,
            `I'd like to introduce you to [Entrepreneur name]. [1-2 sentences about them and why you're making this connection.]`,
            ``,
            `[Entrepreneur name], meet the team at [Receiving ESO]. They [1 sentence about what the ESO offers].`,
            ``,
            `I'll let you both take it from here.`,
            ``,
            `Best,`,
            `[Your name]`,
            ``,
            `--- NETWORK REFERRAL DATA ---`,
            `client_name: [Full Name]`,
            `client_venture: [Business / Venture Name]`,
            `receiving_org: [Receiving ESO Name]`,
            ``,
            `incorporation_status:`,
            `[ ] not_incorporated — Not yet incorporated`,
            `[ ] incorporated — Incorporated`,
            `[ ] unknown — Unknown`,
            ``,
            `venture_stage:`,
            `[ ] idea — Concept / Pre-Launch`,
            `[ ] prototype — Pilot / Testing`,
            `[ ] early_revenue — Early Revenue`,
            `[ ] sustaining — Sustaining · Solo & Self-Sufficient`,
            `[ ] multi_person — Growing · Adding Team & Scale`,
            `[ ] established — Established`,
            ``,
            `support_needs:`,
            `[ ] funding`,
            `[ ] legal`,
            `[ ] business_coaching`,
            `[ ] product_development`,
            `[ ] manufacturing`,
            `[ ] marketing`,
            `[ ] sales`,
            `[ ] hiring`,
            `[ ] workspace`,
            `[ ] networking`,
            `[ ] other`,
            ``,
            `intro_contact_permission:`,
            `[ ] on_file — I have permission on file`,
            `[ ] newly_confirmed — Entrepreneur confirmed just now`,
            `[ ] not_confirmed — Not yet confirmed`,
            `--- END NETWORK REFERRAL DATA ---`,
          ].join('\n');

          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Use this template when making a BCC introduction. The structured footer lets the system automatically capture the entrepreneur's profile — you only need to fill in what you know.
                Fields already captured automatically: <strong>your organization</strong> (from your email domain) and <strong>entrepreneur email</strong> (from the CC field).
              </p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-800 font-mono whitespace-pre">
                  {template}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(template).then(() => {
                      setTemplateCopied(true);
                      setTimeout(() => setTemplateCopied(false), 2500);
                    });
                  }}
                  className="absolute right-3 top-3 rounded bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm border border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
                >
                  {templateCopied ? '✓ Copied!' : 'Copy template'}
                </button>
              </div>
              {introRoute && (
                <p className="text-xs text-gray-500">
                  BCC address shown above is your active intake route. Always BCC this address — never put it in To or CC.
                </p>
              )}
              {!introRoute && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 border border-amber-200">
                  No active introduction route found for this ecosystem. Configure an Inbound Route above to get your BCC address.
                </p>
              )}
            </div>
          );
        })()}
      </Card>

      <Card title="ESO Integration Activity">
        {visibleEsoOrganizations.length === 0 ? (
          <p className="text-sm text-gray-500">No ESO organizations found in this ecosystem.</p>
        ) : (
          <div className="space-y-3">
            {visibleEsoOrganizations.map((organization) => {
              const activeKeys = (organization.api_keys || []).filter((key) => key.status === 'active');
              const activeWebhooks = (organization.webhooks || []).filter((hook) => hook.status === 'active');
              const organizationDomain = organization.email?.split('@')[1];
              return (
                <div key={organization.id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">{organization.name}</div>
                    <Badge color={activeKeys.length > 0 || activeWebhooks.length > 0 ? 'green' : 'gray'}>
                      {activeKeys.length > 0 || activeWebhooks.length > 0 ? 'integrating' : 'not configured'}
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-3">
                    <div>{activeKeys.length} active API key{activeKeys.length === 1 ? '' : 's'}</div>
                    <div>{activeWebhooks.length} active webhook{activeWebhooks.length === 1 ? '' : 's'}</div>
                    <div>{organizationDomain ? 1 : 0} known org domain</div>
                  </div>
                  {organizationDomain && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge color="indigo">{organizationDomain}</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Authorized Sender Domain Policies">
        {!isFirebaseEnabled() ? (
          <p className="text-sm text-gray-500">Domain policy editing is available when Firebase is enabled.</p>
        ) : (
          <div className="space-y-4">
            {canManageAuthorizedDomains && (
              <div className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[2fr_2fr_1.2fr_auto]">
                <input
                  className={FORM_INPUT_CLASS}
                  placeholder="agency.org"
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                />
                <select
                  className={FORM_SELECT_CLASS}
                  value={newDomainOrgId}
                  onChange={(event) => setNewDomainOrgId(event.target.value)}
                >
                  <option value="">Select ESO organization</option>
                  {visibleEsoOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
                <select
                  className={FORM_SELECT_CLASS}
                  value={newDomainPolicy}
                  onChange={(event) => setNewDomainPolicy(event.target.value as NonNullable<AuthorizedSenderDomain['access_policy']>)}
                >
                  <option value="approved">approved</option>
                  <option value="invite_only">invite_only</option>
                  <option value="request_access">request_access</option>
                  <option value="blocked">blocked</option>
                </select>
                <button
                  onClick={() => void addAuthorizedDomain()}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={isSavingDomain}
                >
                  Add domain
                </button>
              </div>
            )}

            {scopedAuthorizedDomains.length === 0 ? (
              <p className="text-sm text-gray-500">No sender domain policies configured for this ecosystem yet.</p>
            ) : (
              <div className="space-y-3">
                {scopedAuthorizedDomains.map((domainRecord) => (
                  <div key={domainRecord.id} className="rounded-md border border-gray-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-[2fr_2fr_1.2fr_auto]">
                      <input
                        className={FORM_INPUT_CLASS}
                        value={domainRecord.domain}
                        disabled={!canManageAuthorizedDomains}
                        onChange={(event) => updateAuthorizedDomain(domainRecord.id, { domain: event.target.value.toLowerCase() })}
                      />
                      <select
                        className={FORM_SELECT_CLASS}
                        value={domainRecord.organization_id}
                        disabled={!canManageAuthorizedDomains}
                        onChange={(event) => updateAuthorizedDomain(domainRecord.id, { organization_id: event.target.value })}
                      >
                        {visibleEsoOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </select>
                      <select
                        className={FORM_SELECT_CLASS}
                        value={domainRecord.access_policy || 'approved'}
                        disabled={!canManageAuthorizedDomains}
                        onChange={(event) => {
                          const policy = event.target.value as NonNullable<AuthorizedSenderDomain['access_policy']>;
                          updateAuthorizedDomain(domainRecord.id, {
                            access_policy: policy,
                            allow_sender_affiliation: policy === 'approved',
                            allow_auto_acknowledgement: policy === 'approved',
                            allow_invite_prompt: policy === 'approved' || policy === 'invite_only',
                          });
                        }}
                      >
                        <option value="approved">approved</option>
                        <option value="invite_only">invite_only</option>
                        <option value="request_access">request_access</option>
                        <option value="blocked">blocked</option>
                      </select>
                      {canManageAuthorizedDomains ? (
                        confirmDeleteDomainId === domainRecord.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDeleteDomainId(null)}
                              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => void deleteDomain(domainRecord.id)}
                              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                              Confirm delete
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => void persistAuthorizedDomain(domainRecord)}
                              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              disabled={isSavingDomain}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setConfirmDeleteDomainId(domainRecord.id)}
                              className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                              title="Delete domain"
                            >
                              ×
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-end">
                          <Badge color={domainRecord.is_active ? 'green' : 'gray'}>{domainRecord.is_active ? 'active' : 'inactive'}</Badge>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => updateAuthorizedDomain(domainRecord.id, { is_active: !domainRecord.is_active })}
                        disabled={!canManageAuthorizedDomains}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${domainRecord.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'} ${!canManageAuthorizedDomains ? 'opacity-60' : ''}`}
                      >
                        {domainRecord.is_active ? 'active' : 'inactive'}
                      </button>
                      <button
                        onClick={() => updateAuthorizedDomain(domainRecord.id, { allow_sender_affiliation: !(domainRecord.allow_sender_affiliation !== false) })}
                        disabled={!canManageAuthorizedDomains}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${(domainRecord.allow_sender_affiliation !== false) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'} ${!canManageAuthorizedDomains ? 'opacity-60' : ''}`}
                      >
                        sender affiliation
                      </button>
                      <button
                        onClick={() => updateAuthorizedDomain(domainRecord.id, { allow_auto_acknowledgement: !(domainRecord.allow_auto_acknowledgement !== false) })}
                        disabled={!canManageAuthorizedDomains}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${(domainRecord.allow_auto_acknowledgement !== false) ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'} ${!canManageAuthorizedDomains ? 'opacity-60' : ''}`}
                      >
                        sender receipt
                      </button>
                      <button
                        onClick={() => updateAuthorizedDomain(domainRecord.id, { allow_invite_prompt: !(domainRecord.allow_invite_prompt !== false) })}
                        disabled={!canManageAuthorizedDomains}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${(domainRecord.allow_invite_prompt !== false) ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'} ${!canManageAuthorizedDomains ? 'opacity-60' : ''}`}
                      >
                        claim prompt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {canViewRawIntake && (
      <Card title="Queued Notices">
        {noticeQueue.length === 0 ? (
          <p className="text-sm text-gray-500">No queued notices yet.</p>
        ) : (
          <div className="space-y-3">
            {noticeQueue
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((notice) => (
                <div key={notice.id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">{notice.to_email}</div>
                    <Badge color={notice.status === 'queued' ? 'yellow' : notice.status === 'failed' ? 'red' : 'green'}>{notice.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{notice.type} · {notice.created_at}</div>
                  {(notice as any).last_error && (
                    <div className="mt-2 text-xs text-red-600">{(notice as any).last_error}</div>
                  )}
                  {notice.payload && (
                    <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
{JSON.stringify(notice.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
          </div>
        )}
      </Card>
      )}

      {canViewRawIntake && (
      <Card title={
        <span className="flex items-center gap-2">
          Inbound Messages
          {pendingReviewCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingReviewCount} pending review
            </span>
          )}
        </span>
      }>
        {scopedMessages.length === 0 ? (
          <p className="text-sm text-gray-500">No inbound messages found.</p>
        ) : (
          <div className="space-y-4">
            {scopedMessages
              .map((message) => {
                const parseResult = parseResultByMessageId.get(message.id);
                const needsReview = message.review_status === 'needs_review';
                const reviewReasons: string[] = parseResult?.needs_review_reasons || [];
                return (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-4 ${needsReview ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
                  >
                    {needsReview && reviewReasons.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {reviewReasons.map((reason) => (
                          <span key={reason} className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-900">
                            ⚠ {REVIEW_REASON_LABELS[reason] || reason}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-base font-semibold text-gray-900">{message.subject || '(No subject)'}</div>
                        <div className="mt-1 text-sm text-gray-600">
                          From <span className="font-mono">{message.from_email}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Route <span className="font-mono">{message.route_address}</span> · {message.received_at}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {needsReview && (
                          <button
                            onClick={() => handleOpenReview(message)}
                            className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                          >
                            Review &amp; Approve
                          </button>
                        )}
                        <Badge color="indigo">{message.activity_type}</Badge>
                        <Badge color={message.parse_status === 'parsed' ? 'green' : message.parse_status === 'failed' ? 'red' : 'yellow'}>
                          {message.parse_status}
                        </Badge>
                        <Badge color={message.review_status === 'approved' ? 'green' : message.review_status === 'rejected' ? 'red' : 'yellow'}>
                          {message.review_status}
                        </Badge>
                      </div>
                    </div>
                    {(message as any).rejection_reason && (
                      <div className="mt-2 text-xs text-red-600 font-medium italic">
                        Rejection reason: {(message as any).rejection_reason}
                      </div>
                    )}
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Body Preview</div>
                        <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-700">
                          {(message.text_body || '').slice(0, 500) || 'No text body available.'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Parse Result</div>
                        {parseResult ? (
                          <div className="mt-1 rounded bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
                            <div>Person: <span className="font-medium">{parseResult.candidate_person_name || '—'}</span> · <span className="font-mono text-xs">{parseResult.candidate_person_email || 'no email'}</span></div>
                            {parseResult.candidate_venture_name && (
                              <div>Venture: <span className="font-medium">{parseResult.candidate_venture_name}</span></div>
                            )}
                            {(parseResult as any).incorporation_status && (
                              <div>Incorporation: <span className="font-medium">{(parseResult as any).incorporation_status}</span></div>
                            )}
                            {((parseResult as any).venture_stages?.length > 0 || parseResult.venture_stage) && (
                              <div>Stage: <span className="font-medium">{((parseResult as any).venture_stages?.join(', ') || parseResult.venture_stage)}</span></div>
                            )}
                            {parseResult.support_needs?.length > 0 && (
                              <div>Needs: <span className="font-medium">{parseResult.support_needs.join(', ')}</span></div>
                            )}
                            <div className="text-xs text-gray-500">Confidence: {Math.round((parseResult.confidence || 0) * 100)}%</div>
                          </div>
                        ) : (
                          <div className="mt-1 rounded bg-gray-50 p-3 text-sm text-gray-500">No parse result found.</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
      )}

      {selectedMessage && (
        <Modal
          isOpen={!!selectedMessage}
          onClose={() => setSelectedMessage(null)}
          title="Review Inbound Introduction"
          wide
        >
          <div className="space-y-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="font-semibold text-gray-700">Inbound Message</div>
              <div className="mt-1">From: <span className="font-mono">{selectedMessage.from_email}</span></div>
              <div className="mt-1">Subject: {selectedMessage.subject}</div>
              <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-white p-2 text-xs border border-gray-100">
                {selectedMessage.text_body}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className={FORM_LABEL_CLASS}>Client Name</label>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={reviewData.person_name}
                    onChange={(e) => setReviewData({ ...reviewData, person_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className={FORM_LABEL_CLASS}>Client Email</label>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={reviewData.person_email}
                    onChange={(e) => setReviewData({ ...reviewData, person_email: e.target.value })}
                  />
                </div>
                <div>
                  <label className={FORM_LABEL_CLASS}>Client Organization</label>
                  <select
                    className={FORM_SELECT_CLASS}
                    value={reviewData.subject_org_id}
                    onChange={(e) => setReviewData({ ...reviewData, subject_org_id: e.target.value, venture_name: '' })}
                  >
                    <option value="">-- New org (enter name below) --</option>
                    {allEcosystemOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  {!reviewData.subject_org_id && (
                    <input
                      className={`${FORM_INPUT_CLASS} mt-1`}
                      placeholder="New org name (optional)"
                      value={reviewData.venture_name}
                      onChange={(e) => setReviewData({ ...reviewData, venture_name: e.target.value })}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={FORM_LABEL_CLASS}>Receiving Organization</label>
                  <select
                    className={FORM_SELECT_CLASS}
                    value={reviewData.receiving_org_id}
                    onChange={(e) => setReviewData({ ...reviewData, receiving_org_id: e.target.value })}
                  >
                    <option value="">Select receiver...</option>
                    {visibleEsoOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={FORM_LABEL_CLASS}>Referring Organization (Attributed)</label>
                  <select
                    className={FORM_SELECT_CLASS}
                    value={reviewData.referring_org_id}
                    onChange={(e) => setReviewData({ ...reviewData, referring_org_id: e.target.value })}
                  >
                    <option value="">Select referrer...</option>
                    {visibleEsoOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 italic">Determined by sender email domain.</p>
                </div>
              </div>
            </div>

            {isRejecting ? (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <label className={FORM_LABEL_CLASS}>Reason for rejection</label>
                <textarea
                  className={`${FORM_INPUT_CLASS} min-h-[80px]`}
                  placeholder="Optional: describe why this introduction is being rejected"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setIsRejecting(false)}
                    disabled={isApproving}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void rejectMessage()}
                    disabled={isApproving}
                    className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isApproving ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            ) : (
            <div className="flex justify-between gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setIsRejecting(true)}
                disabled={isApproving}
                className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject Introduction
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void approveMessage()}
                  disabled={isApproving || !reviewData.person_email || !reviewData.receiving_org_id}
                  className="rounded bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isApproving ? 'Approving...' : 'Approve & Create Referral'}
                </button>
              </div>
            </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
