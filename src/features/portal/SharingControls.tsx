
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Organization, Referral, Interaction } from '../../domain/types';
import type { ConsentPolicy } from '../../domain/consent/types';
import { Card, CompanyLogo } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';

interface Props {
  myOrg: Organization;
  organizations: Organization[];
  referrals: Referral[];
  interactions: Interaction[];
  ecosystemName: string;
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

export const SharingControls: React.FC<Props> = ({ myOrg, organizations, referrals, interactions, ecosystemName, onChange }) => {
  const repos = useRepos();
  const viewer = useViewer();
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
        && o.ecosystem_ids.includes(viewer.ecosystemId)
        && o.roles.includes('eso')
      )
      .map((o) => ({
        org: o,
        policy: policies.find((p) => p.viewerId === o.id && p.isActive) ?? null,
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
  }, [organizations, policies, referrals, interactions, myOrg.id, viewer.ecosystemId]);

  const isOpenMode = myOrg.operational_visibility === 'open';

  const handleSetVisibility = async (next: 'open' | 'restricted') => {
    if (myOrg.operational_visibility === next) return;
    setVisibilityBusy(true);
    setError(null);
    try {
      await repos.organizations.update(myOrg.id, { operational_visibility: next });
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
        await repos.consent.grantAccess(myOrg.id, row.org.id, 'read', viewer.personId);
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

  const grantedCount = esoRows.filter((r) => !!r.policy).length;

  return (
    <Card title="Who can see my activity" className="border-t-4 border-t-emerald-500">
      <div className="space-y-4">
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
          Your basic profile (name, venture, contact) is always visible to organizations in <strong>{ecosystemName}</strong>. The controls below govern <strong>operational data</strong> — interaction notes, program participation, and metrics about your venture. Each organization that receives access has signed the network compact and the data usage agreement.
        </div>

        {/* Default visibility toggle */}
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="text-sm font-semibold text-gray-900 mb-2">Default sharing</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={visibilityBusy}
              onClick={() => void handleSetVisibility('open')}
              className={`text-left rounded border px-3 py-2.5 text-sm transition-colors ${
                isOpenMode
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="font-semibold">Open to ecosystem</div>
              <div className="text-xs mt-0.5 opacity-80">Any ESO in {ecosystemName} can see operational data about your venture.</div>
            </button>
            <button
              type="button"
              disabled={visibilityBusy}
              onClick={() => void handleSetVisibility('restricted')}
              className={`text-left rounded border px-3 py-2.5 text-sm transition-colors ${
                !isOpenMode
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="font-semibold">Restricted — by my approval</div>
              <div className="text-xs mt-0.5 opacity-80">Only ESOs you turn on below can see your operational data.</div>
            </button>
          </div>
        </div>

        {/* Per-ESO controls — only meaningful in restricted mode */}
        {!isOpenMode && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-900">
                Organizations in {ecosystemName}
              </div>
              <div className="text-xs text-gray-500">
                {grantedCount} of {esoRows.length} can see your activity
              </div>
            </div>

            {loading && <div className="text-sm text-gray-500 py-2">Loading…</div>}

            {!loading && esoRows.length === 0 && (
              <div className="text-sm text-gray-500 py-2">No organizations in this ecosystem yet.</div>
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
                            <>Has worked with you — currently no operational access</>
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
          </div>
        )}

        {isOpenMode && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            You've chosen <strong>Open to ecosystem</strong>. Any ESO in {ecosystemName} can see operational details about your venture without further approval. Switch to <strong>Restricted</strong> above to choose individually.
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
