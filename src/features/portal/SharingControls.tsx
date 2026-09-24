
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Organization, Referral, Interaction } from '../../domain/types';
import type { ConsentPolicy } from '../../domain/consent/types';
import { policyAppliesInEcosystem } from '../../domain/consent/types';
import { effectiveVisibility } from '../../domain/access/policy';
import { Card, CompanyLogo } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface Props {
  myOrg: Organization;
  organizations: Organization[];
  referrals: Referral[];
  interactions: Interaction[];
  ecosystemName: string;
  /**
   * The networks this entrepreneur belongs to, for the in-panel selector.
   * Privacy is decided per network even though their activity is shown across
   * all of them, so the choice of network lives here rather than in a global
   * switcher — named explicitly, next to the setting it governs.
   */
  availableEcosystems?: { id: string; name: string }[];
  onChange?: () => void;
}

interface EsoRow {
  org: Organization;
  policy: ConsentPolicy | null;
  hasRelationship: boolean; // referrer/receiver/recorded interactions
}

const formatDate = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export const SharingControls: React.FC<Props> = ({ myOrg, organizations, referrals, interactions, ecosystemName, availableEcosystems, onChange }) => {
  const repos = useRepos();
  const viewer = useViewer();
  // Which network these settings apply to. Defaults to the viewer's current
  // one; the selector below changes only what this panel governs, never what
  // the rest of the portal shows.
  const [scopeEcosystemId, setScopeEcosystemId] = useState<string>(viewer.ecosystemId);
  const networks = (availableEcosystems && availableEcosystems.length > 0)
    ? availableEcosystems
    : [{ id: viewer.ecosystemId, name: ecosystemName }];
  const scopeName = networks.find((n) => n.id === scopeEcosystemId)?.name || ecosystemName;
  const [policies, setPolicies] = useState<ConsentPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyEsoId, setBusyEsoId] = useState<string | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const list = await repos.consent.getPoliciesForEntityAsync(myOrg.id);
      setPolicies(list);
    } finally {
      setLoading(false);
    }
  }, [repos, myOrg.id]);

  useEffect(() => { void loadPolicies(); }, [loadPolicies]);

  // Derive ESO rows scoped to this ecosystem.
  const esoRows: EsoRow[] = useMemo(() => {
    const relatedIds = new Set<string>();
    referrals.forEach((r) => {
      if (r.subject_org_id === myOrg.id || r.subject_person_id) {
        if (r.referring_org_id) relatedIds.add(r.referring_org_id);
        if (r.receiving_org_id) relatedIds.add(r.receiving_org_id);
      }
    });
    interactions.forEach((i) => {
      if (i.organization_id === myOrg.id && i.author_org_id) relatedIds.add(i.author_org_id);
    });
    relatedIds.delete(myOrg.id);

    const list: EsoRow[] = organizations
      .filter((o) =>
        o.id !== myOrg.id
        && o.ecosystem_ids.includes(scopeEcosystemId)
        && o.roles.includes('eso')
      )
      .map((o) => ({
        org: o,
        // Only a grant made in THIS network counts here. A grant made in
        // another network is shown separately below rather than silently
        // rendering this network's toggle as "on".
        policy: policies.find(
          (p) => p.viewerId === o.id && p.isActive && policyAppliesInEcosystem(p, scopeEcosystemId)
        ) ?? null,
        hasRelationship: relatedIds.has(o.id),
      }))
      .sort((a, b) => {
        // Active grants first, then existing relationships, then alphabetical
        const aActive = a.policy ? 1 : 0;
        const bActive = b.policy ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aRel = a.hasRelationship ? 1 : 0;
        const bRel = b.hasRelationship ? 1 : 0;
        if (aRel !== bRel) return bRel - aRel;
        return a.org.name.localeCompare(b.org.name);
      });
    return list;
  }, [organizations, policies, referrals, interactions, myOrg.id, scopeEcosystemId]);

  const isOpenMode = effectiveVisibility(myOrg, scopeEcosystemId) === 'open';

  const handleSetVisibility = async (next: 'open' | 'restricted') => {
    if (effectiveVisibility(myOrg, scopeEcosystemId) === next) return;
    setVisibilityBusy(true);
    setError(null);
    try {
      // Per-network: opening up to one network must not open up the others.
      // Networks with no explicit choice are restricted (consent is off by
      // default — see effectiveVisibility).
      await repos.organizations.update(myOrg.id, {
        operational_visibility_by_ecosystem: {
          ...(myOrg.operational_visibility_by_ecosystem || {}),
          [scopeEcosystemId]: next,
        },
      });
      onChange?.();
    } catch {
      setError('Could not update sharing default. Try again.');
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleToggle = async (row: EsoRow, next: boolean) => {
    setBusyEsoId(row.org.id);
    setError(null);
    try {
      if (next) {
        // Base ConsentRepo signature is (resource, viewer, level, actor); the
        // Firebase impl defaults grantedVia to 'self' when no opts arg is given.
        await repos.consent.grantAccess(myOrg.id, row.org.id, 'read', viewer.personId, {
          ecosystemId: scopeEcosystemId,
        });
      } else if (row.policy) {
        await repos.consent.revokeAccess(row.policy.id, viewer.personId, myOrg.id, row.org.id, 'Revoked by entrepreneur via portal');
      }
      await loadPolicies();
      onChange?.();
    } catch {
      setError('Could not update sharing for that organization. Try again.');
    } finally {
      setBusyEsoId(null);
    }
  };

  const handleRevokeOther = async (policy: ConsentPolicy) => {
    setError(null);
    try {
      await repos.consent.revokeAccess(
        policy.id,
        viewer.personId,
        myOrg.id,
        policy.viewerId,
        'Revoked by entrepreneur via portal (other network)'
      );
      await loadPolicies();
      onChange?.();
    } catch {
      setError('Could not revoke that grant. Try again.');
    }
  };

  const grantedCount = esoRows.filter((r) => !!r.policy).length;

  // Grants the entrepreneur made in their OTHER networks. Previously these
  // were loaded, still in force, and then filtered out of the list — active
  // access that could not be seen or revoked from this screen. They are shown
  // separately so every organization that can see the venture is accounted
  // for, wherever the grant was made.
  const otherNetworkGrants = useMemo(() => {
    return policies
      .filter((p) => p.isActive && !policyAppliesInEcosystem(p, scopeEcosystemId))
      .map((p) => ({
        policy: p,
        org: organizations.find((o) => o.id === p.viewerId) || null,
      }));
  }, [policies, organizations, scopeEcosystemId]);

  return (
    <Card title="Who can see the details" className="border-t-4 border-t-emerald-500">
      <div className="space-y-4">
        {networks.length > 1 && (
          <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2.5">
            <label htmlFor="sharing-network" className="block text-xs font-bold text-indigo-900 mb-1">
              These settings apply to one network at a time
            </label>
            <select
              id="sharing-network"
              value={scopeEcosystemId}
              onChange={(e) => setScopeEcosystemId(e.target.value)}
              className="w-full rounded border border-indigo-200 bg-white px-2 py-1.5 text-sm text-gray-900"
            >
              {networks.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-indigo-800">
              You belong to {networks.length} networks. Your activity is shown across all of them, but
              sharing is decided separately for each — opening up here does not open up the others.
            </p>
          </div>
        )}

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
          Organizations you work with in <strong>{scopeName}</strong> always see your name and email, and that other partners are also helping you. The controls below decide whether they can also see the <strong>details</strong> of each other's records about your venture — program names, referral outcomes. Notes staff write are never shared, whatever you choose. Every organization here has signed the network compact and the data usage agreement.
        </div>

        {/* Venture-wide sharing set before the per-person choice existed.
            "Every partner I work with" now lives in Your network choices;
            this only appears so an older venture-level setting is visible
            and can be switched off. */}
        {isOpenMode && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            Your venture is set to share record details with <strong>every partner you work with</strong> in {scopeName}.
            <button
              type="button"
              disabled={visibilityBusy}
              onClick={() => void handleSetVisibility('restricted')}
              className="ml-2 font-semibold underline"
            >
              Switch to partners I choose
            </button>
          </div>
        )}

        {/* Per-partner grants */}
        {(
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-900">
                Choose partners one by one in {scopeName}
              </div>
              <div className="text-xs text-gray-500">
                {grantedCount} of {esoRows.length} can see record details
              </div>
            </div>

            {loading && <div className="text-sm text-gray-500 py-2">Loading…</div>}

            {!loading && esoRows.length === 0 && (
              <div className="text-sm text-gray-500 py-2">No organizations in {scopeName} yet.</div>
            )}

            <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
              {esoRows.map((row) => {
                const granted = !!row.policy;
                const isBusy = busyEsoId === row.org.id;
                return (
                  <li key={row.org.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyLogo src={row.org.logo_url} name={row.org.name} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{row.org.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {granted ? (
                            <>You granted access{row.policy?.updatedAt ? ` · ${formatDate(row.policy.updatedAt)}` : ''}{row.policy?.grantedVia === 'eso_request' ? ' · approved request' : ''}</>
                          ) : row.hasRelationship ? (
                            <>Works with you — sees that activity happened, not the details</>
                          ) : (
                            <>{row.org.description ? row.org.description.slice(0, 90) : 'No description'}</>
                          )}
                        </div>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={granted}
                      disabled={isBusy}
                      onChange={(next) => void handleToggle(row, next)}
                      ariaLabel={`Toggle access for ${row.org.name}`}
                    />
                  </li>
                );
              })}
            </ul>

            {otherNetworkGrants.length > 0 && (
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">
                  Access granted in your other networks
                </div>
                <p className="text-xs text-amber-800 mb-2">
                  These organizations can see your venture through a grant you made in a different
                  network. They are listed here so nothing is sharing quietly — you can revoke any of
                  them from here.
                </p>
                <ul className="divide-y divide-amber-200 rounded border border-amber-200 bg-white">
                  {otherNetworkGrants.map(({ policy, org }) => (
                    <li key={policy.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {org?.name || 'Organization outside your current network'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {policy.ecosystemId ? `Granted in another network` : 'Granted before networks were separated — applies everywhere'}
                          {policy.updatedAt ? ` · ${formatDate(policy.updatedAt)}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-medium text-rose-700 hover:underline shrink-0"
                        onClick={() => void handleRevokeOther(policy)}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}


        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </div>
    </Card>
  );
};

const ToggleSwitch: React.FC<{ checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; ariaLabel?: string }> = ({ checked, disabled, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-40 ${
      checked ? 'bg-emerald-500' : 'bg-gray-300'
    }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);
