import React, { useEffect, useMemo, useState } from 'react';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { Card, Badge, FORM_INPUT_CLASS, FORM_SELECT_CLASS, InfoBanner } from '../../shared/ui/Components';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { queryCollection, setDocument } from '../../services/firestoreClient';
import { useAuthSession } from '../../app/useAuthSession';
import type { AuthorizedSenderDomain, InboundMessage, InboundParseResult, InboundRoute } from '../../domain/inbound/types';
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
        setError(null);
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isFirebaseEnabled() && session.authUser) {
        const organizations = await repos.organizations.getAll(viewer, viewer.ecosystemId);
        setVisibleEsoOrganizations(organizations.filter((organization) => organization.roles.includes('eso')));

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

  const parseResultByMessageId = new Map(parseResults.map((result) => [result.inbound_message_id, result]));
  const scopedRoutes = routes.filter((route) => route.ecosystem_id === viewer.ecosystemId);
  const scopedMessages = messages.filter((message) => message.ecosystem_id === viewer.ecosystemId);
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

  const sendQueuedNotices = async () => {
    setIsSending(true);
    setError(null);
    try {
      await callHttpFunction('sendQueuedNotices', { limit: 10 });
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Unable to send queued notices.');
    } finally {
      setIsSending(false);
    }
  };

  const updateAuthorizedDomain = (domainId: string, updates: Partial<AuthorizedSenderDomain>) => {
    setAuthorizedDomains((current) => current.map((domain) => (
      domain.id === domainId ? { ...domain, ...updates } : domain
    )));
  };

  const persistAuthorizedDomain = async (domainRecord: AuthorizedSenderDomain) => {
    setIsSavingDomain(true);
    setError(null);
    try {
      await setDocument('authorized_sender_domains', domainRecord.id, domainRecord);
    } catch (err: any) {
      setError(err?.message || 'Unable to save authorized domain.');
    } finally {
      setIsSavingDomain(false);
    }
  };

  const addAuthorizedDomain = async () => {
    const normalizedDomain = newDomain.trim().toLowerCase();
    if (!normalizedDomain || !newDomainOrgId) {
      setError('Domain and organization are required.');
      return;
    }

    const domainId = `auth_domain_${viewer.ecosystemId}_${normalizedDomain.replace(/[^a-z0-9]+/g, '_')}`;
    const record: AuthorizedSenderDomain = {
      id: domainId,
      ecosystem_id: viewer.ecosystemId,
      organization_id: newDomainOrgId,
      domain: normalizedDomain,
      is_active: true,
      access_policy: newDomainPolicy,
      allow_sender_affiliation: newDomainPolicy === 'approved',
      allow_auto_acknowledgement: newDomainPolicy === 'approved',
      allow_invite_prompt: newDomainPolicy === 'approved' || newDomainPolicy === 'invite_only',
    };

    setAuthorizedDomains((current) => {
      const withoutDuplicate = current.filter((domain) => domain.id !== domainId);
      return [...withoutDuplicate, record];
    });
    await persistAuthorizedDomain(record);
    setNewDomain('');
    setNewDomainOrgId('');
    setNewDomainPolicy('approved');
  };

  return (
    <div className="space-y-6">
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
                        <button
                          onClick={() => void persistAuthorizedDomain(domainRecord)}
                          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          disabled={isSavingDomain}
                        >
                          Save
                        </button>
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
      <Card title="Inbound Messages">
        {scopedMessages.length === 0 ? (
          <p className="text-sm text-gray-500">No inbound messages found.</p>
        ) : (
          <div className="space-y-4">
            {scopedMessages
              .slice()
              .sort((a, b) => b.received_at.localeCompare(a.received_at))
              .map((message) => {
                const parseResult = parseResultByMessageId.get(message.id);
                return (
                  <div key={message.id} className="rounded-lg border border-gray-200 bg-white p-4">
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
                        <Badge color="indigo">{message.activity_type}</Badge>
                        <Badge color={message.parse_status === 'parsed' ? 'green' : message.parse_status === 'failed' ? 'red' : 'yellow'}>
                          {message.parse_status}
                        </Badge>
                        <Badge color={message.review_status === 'approved' ? 'green' : message.review_status === 'rejected' ? 'red' : 'gray'}>
                          {message.review_status}
                        </Badge>
                      </div>
                    </div>
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
                          <div className="mt-1 rounded bg-gray-50 p-3 text-sm text-gray-700">
                            <div>Candidate person email: <span className="font-mono">{parseResult.candidate_person_email || 'n/a'}</span></div>
                            <div>Candidate person name: {parseResult.candidate_person_name || 'n/a'}</div>
                            <div>Candidate venture: {parseResult.candidate_venture_name || 'n/a'}</div>
                            <div>Confidence: {parseResult.confidence}</div>
                            <div>Review reasons: {parseResult.needs_review_reasons.length > 0 ? parseResult.needs_review_reasons.join(', ') : 'none'}</div>
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
    </div>
  );
};
