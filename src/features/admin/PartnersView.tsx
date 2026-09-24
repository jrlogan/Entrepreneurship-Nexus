import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Ecosystem, Organization, SystemRole } from '../../domain/types';
import { AGREEMENT_VERSIONS, ORG_REQUIRED_AGREEMENTS, type OrgAgreementAcceptance } from '../../domain/agreements/types';
import { classifySignature } from '../../domain/agreements/orgEnforcement';
import { FirebaseOrgAgreementsRepo } from '../../data/repos/firebase/orgAgreements';
import { useRepos } from '../../data/AppDataContext';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { Card, FORM_INPUT_CLASS, FORM_LABEL_CLASS } from '../../shared/ui/Components';
import { CONFIG } from '../../app/config';

const orgAgreementsRepo = new FirebaseOrgAgreementsRepo();

/**
 * Partners — the network operator's view of who has joined.
 *
 * Invite a partner organization (creates the organization and an admin invite
 * for its contact), and see where each partner is: invited, signed, connected.
 * Joining itself is done by the partner's admin (PartnerOnboardingView).
 */

type PartnerStatus = { signedCount: number; signedAt: string | null };

const emptyForm = { name: '', website: '', contactName: '', contactEmail: '' };

export const PartnersView = ({
  organizations,
  ecosystem,
  viewerRole,
  onSelectOrganization,
  onRefresh,
}: {
  organizations: Organization[];
  ecosystem: Ecosystem;
  viewerRole: SystemRole;
  onSelectOrganization: (orgId: string) => void;
  onRefresh: () => void;
}) => {
  const repos = useRepos();
  const isDemo = CONFIG.IS_DEMO_MODE || !isFirebaseEnabled();
  const partners = useMemo(
    () => organizations
      .filter((o) => (o.roles || []).includes('eso') && (o.ecosystem_ids || []).includes(ecosystem.id) && o.id !== 'org_nexus_admin')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [organizations, ecosystem.id]
  );
  const [statuses, setStatuses] = useState<Record<string, PartnerStatus>>({});
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    if (isDemo) return;
    const entries = await Promise.all(partners.map(async (org) => {
      const sigs: OrgAgreementAcceptance[] = await orgAgreementsRepo.getForOrg(org.id, ecosystem.id).catch(() => []);
      const current = ORG_REQUIRED_AGREEMENTS
        .map((type) => sigs.find((s) => s.agreement_type === type))
        .filter((s, i) => classifySignature(s, AGREEMENT_VERSIONS[ORG_REQUIRED_AGREEMENTS[i]]) === 'signed');
      const signedAt = current.length === ORG_REQUIRED_AGREEMENTS.length
        ? current.map((s) => s!.signed_at).sort().pop() || null
        : null;
      return [org.id, { signedCount: current.length, signedAt }] as const;
    }));
    setStatuses(Object.fromEntries(entries));
  }, [isDemo, partners, ecosystem.id]);

  useEffect(() => { void loadStatuses(); }, [loadStatuses]);

  const invite = async () => {
    setError('');
    setInviteUrl(null);
    if (!form.name.trim() || !form.contactEmail.trim()) {
      setError('Organization name and contact email are required.');
      return;
    }
    setBusy(true);
    try {
      const orgId = `org_${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString(36)}`;
      const website = form.website.trim();
      await repos.organizations.add({
        id: orgId,
        name: form.name.trim(),
        description: '',
        url: website ? (website.startsWith('http') ? website : `https://${website}`) : undefined,
        email: form.contactEmail.trim().toLowerCase(),
        tax_status: 'non_profit',
        roles: ['eso'],
        classification: { industry_tags: [] },
        external_refs: [],
        managed_by_ids: [],
        operational_visibility: 'restricted',
        authorized_eso_ids: [],
        version: 1,
        ecosystem_ids: [ecosystem.id],
      } as Organization);
      if (!isDemo) {
        const result = await callHttpFunction<Record<string, string>, { invite_url: string }>('createInvite', {
          email: form.contactEmail.trim().toLowerCase(),
          invited_role: 'eso_admin',
          organization_id: orgId,
          ecosystem_id: ecosystem.id,
          note: `${form.contactName.trim() ? `${form.contactName.trim()}, you` : 'You'} are invited to connect ${form.name.trim()} to ${ecosystem.name}. After signing in you will review and sign the network agreements, then get the integration guide for your system.`,
        });
        setInviteUrl(result.invite_url);
      } else {
        setInviteUrl(`${window.location.origin}/?invite=demo`);
      }
      setForm(emptyForm);
      onRefresh();
    } catch (e: any) {
      setError(e?.message || 'Could not invite this partner.');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (org: Organization) => {
    if (isDemo) return { text: 'Demo', tone: 'bg-gray-100 text-gray-700' };
    const s = statuses[org.id];
    if (!s) return { text: 'Checking…', tone: 'bg-gray-100 text-gray-600' };
    if (s.signedCount === ORG_REQUIRED_AGREEMENTS.length) return { text: `Signed ${s.signedAt ? new Date(s.signedAt).toLocaleDateString() : ''}`, tone: 'bg-emerald-100 text-emerald-800' };
    if (s.signedCount > 0) return { text: `${s.signedCount} of ${ORG_REQUIRED_AGREEMENTS.length} signed`, tone: 'bg-amber-100 text-amber-800' };
    return { text: 'Invited — not signed', tone: 'bg-rose-100 text-rose-800' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Partners in {ecosystem.name}</h2>
        <p className="mt-1 text-sm text-gray-600">
          A partner joins in three steps: you invite its admin, the admin signs the network agreements, and their developer connects
          their system using the integration guide. A partner that has not signed sees only its own records and cannot get an API key.
        </p>
      </div>

      <Card title="Invite a partner organization">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={FORM_LABEL_CLASS}>Organization name</label>
            <input className={FORM_INPUT_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Website</label>
            <input className={FORM_INPUT_CLASS} placeholder="example.org" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <p className="mt-1 text-xs text-gray-500">Used to check where their signup flow may send founders back to after the consent page.</p>
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Contact name</label>
            <input className={FORM_INPUT_CLASS} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div>
            <label className={FORM_LABEL_CLASS}>Contact email — becomes the organization's admin</label>
            <input className={FORM_INPUT_CLASS} type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {inviteUrl && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Invitation created{isDemo ? ' (demo — not sent)' : ' and emailed'}. You can also send this link yourself:
            <div className="mt-1 break-all font-mono text-xs">{inviteUrl}</div>
          </div>
        )}
        <button
          type="button"
          disabled={busy || !['platform_admin', 'ecosystem_manager'].includes(viewerRole)}
          onClick={() => void invite()}
          className="mt-4 rounded-lg bg-[#8b1919] px-4 py-2 text-sm font-semibold text-white hover:bg-[#710a0a] disabled:opacity-40"
        >
          {busy ? 'Inviting…' : 'Create organization and invite its admin'}
        </button>
      </Card>

      <Card title={`Partner organizations (${partners.length})`}>
        {partners.length === 0 ? (
          <p className="text-sm text-gray-500">No partners yet. Invite the first one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {partners.map((org) => {
              const status = statusLabel(org);
              return (
                <li key={org.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <button type="button" onClick={() => onSelectOrganization(org.id)} className="text-left">
                    <div className="font-medium text-gray-900 hover:underline">{org.name}</div>
                    <div className="text-xs text-gray-500">{org.url || org.email || org.id}</div>
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
