/**
 * Where the app reads other organizations' records from.
 *
 * Everything cross-organization — people, ventures, activity, participation,
 * referrals — comes through one "network view" that has already had the
 * compact's privacy rules applied (functions/src/privacy/policy.ts):
 *
 *   - RemoteNetworkViewSource calls the getNetworkView Cloud Function, which
 *     applies the policy server-side. Firestore rules block the direct reads
 *     that would bypass it.
 *   - LocalNetworkViewSource applies the SAME policy function to the demo's
 *     sample data, so the demo shows exactly what production would.
 */
import {
  buildNetworkView,
  type NetworkData,
  type NetworkView,
  type Viewer,
} from '../../functions/src/privacy/policy';
import type { ViewerContext } from '../domain/access/policy';
import type { Interaction } from '../domain/interactions/types';
import type { Organization } from '../domain/organizations/types';
import type { Person } from '../domain/people/types';
import type { Referral } from '../domain/referrals/types';
import type { Service } from '../domain/services/types';
import type { ConsentPolicy } from '../domain/consent/types';
import { callHttpFunction } from '../services/httpFunctionClient';
import {
  ALL_ORGANIZATIONS,
  MOCK_CONSENT_POLICIES,
  MOCK_DIRECTORY_LISTINGS,
  MOCK_INTERACTIONS,
  MOCK_PEOPLE,
  MOCK_REFERRALS,
  MOCK_SERVICES,
} from './mockData';

export type AccessTier = 'full' | 'detail' | 'fact';

export type OrgAccess = { level: 'basic' | 'detailed'; reason: string };

/** The network view in the app's own types. */
export interface AppNetworkView {
  people: Array<Person & { _visibility: string }>;
  organizations: Array<Organization & { _access: OrgAccess; _visibility: string }>;
  interactions: Array<Interaction & { _access: AccessTier }>;
  participations: Array<Service & { _access: AccessTier }>;
  referrals: Array<Referral & { _access: AccessTier }>;
}

export interface NetworkViewSource {
  get(viewer: ViewerContext, ecosystemId?: string): Promise<AppNetworkView>;
  /** Drop cached views after a write so the next read reflects it. */
  invalidate(): void;
}

const ORG_ACCESS_REASONS: Record<string, string> = {
  own: 'Your organization',
  support_org: 'Support organization',
  works_with: 'You work with them',
  operator: 'Network operator',
  directory: 'Listed in the network directory',
};

/**
 * Convert the policy's output to app types. The policy works on structural
 * records so it can run on raw Firestore documents; this is the one place
 * those records are asserted to be the app's domain types.
 */
const toAppView = (view: NetworkView): AppNetworkView => ({
  people: view.people as unknown as AppNetworkView['people'],
  organizations: view.organizations.map((org) => ({
    ...(org as unknown as Organization),
    roles: Array.isArray(org.roles) ? org.roles : [],
    managed_by_ids: Array.isArray(org.managed_by_ids) ? org.managed_by_ids : [],
    external_refs: org.external_refs || [],
    _visibility: org._visibility,
    _access: {
      level: org._detail_access ? 'detailed' : 'basic',
      reason: org._detail_access && org._visibility === 'works_with'
        ? 'Consent granted'
        : ORG_ACCESS_REASONS[org._visibility] || 'Visible',
    },
  })) as AppNetworkView['organizations'],
  interactions: view.interactions as unknown as AppNetworkView['interactions'],
  participations: view.participations as unknown as AppNetworkView['participations'],
  referrals: view.referrals as unknown as AppNetworkView['referrals'],
});

const toPolicyViewer = (viewer: ViewerContext, ecosystemId: string): Viewer => ({
  personId: viewer.personId,
  orgId: viewer.orgId || null,
  role: viewer.role,
  ecosystemId,
});

// ---------------------------------------------------------------------------
// Production: the Cloud Function
// ---------------------------------------------------------------------------

const CACHE_MS = 3_000;

type ViewResponse = NetworkView & { ok: boolean };

export class RemoteNetworkViewSource implements NetworkViewSource {
  private cache = new Map<string, { at: number; promise: Promise<AppNetworkView> }>();

  get(viewer: ViewerContext, ecosystemId?: string): Promise<AppNetworkView> {
    const eco = ecosystemId || viewer.ecosystemId;
    const key = `${viewer.personId}|${viewer.orgId}|${eco}`;
    const hit = this.cache.get(key);
    // App.tsx fires several repo reads at once on every refresh; sharing one
    // in-flight request keeps that to a single function call.
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;

    const promise = callHttpFunction<{ ecosystem_id: string; acting_org_id: string | null }, ViewResponse>(
      'getNetworkView',
      { ecosystem_id: eco, acting_org_id: viewer.orgId || null }
    ).then(toAppView);
    promise.catch(() => this.cache.delete(key));
    this.cache.set(key, { at: Date.now(), promise });
    return promise;
  }

  invalidate(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Demo: the same policy over the sample data
// ---------------------------------------------------------------------------

const inEcosystem = (ecoIds: string[] | undefined, eco: string) => (ecoIds || []).includes(eco);

const toGrant = (policy: ConsentPolicy) => ({
  resource_id: policy.resourceId,
  viewer_id: policy.viewerId,
  is_active: policy.isActive,
  ecosystem_id: policy.ecosystemId || null,
});

export const buildLocalNetworkData = (eco: string): NetworkData => {
  const orgsInEco = ALL_ORGANIZATIONS.filter((o) => inEcosystem(o.ecosystem_ids, eco));
  const orgIdsInEco = new Set(orgsInEco.map((o) => o.id));
  return {
    people: MOCK_PEOPLE
      .filter((p) => p.ecosystem_id === eco || (p.memberships || []).some((m) => m.ecosystem_id === eco))
      .map((p) => ({ ...p })),
    organizations: orgsInEco.map((o) => ({ ...o })),
    interactions: MOCK_INTERACTIONS.filter((i) => i.ecosystem_id === eco).map((i) => ({ ...i })),
    participations: MOCK_SERVICES
      .filter((s) => (s.ecosystem_id ? s.ecosystem_id === eco : orgIdsInEco.has(s.provider_org_id)))
      .map((s) => ({ ...s })),
    referrals: MOCK_REFERRALS
      .filter((r) => (r.ecosystem_id
        ? r.ecosystem_id === eco
        : (!!r.referring_org_id && orgIdsInEco.has(r.referring_org_id)) || (!!r.receiving_org_id && orgIdsInEco.has(r.receiving_org_id))))
      .map((r) => ({ ...r })),
    consentGrants: MOCK_CONSENT_POLICIES.map(toGrant),
    directoryListedPersonIds: MOCK_DIRECTORY_LISTINGS.filter((l) => l.ecosystem_id === eco).map((l) => l.person_id),
  };
};

export class LocalNetworkViewSource implements NetworkViewSource {
  async get(viewer: ViewerContext, ecosystemId?: string): Promise<AppNetworkView> {
    const eco = ecosystemId || viewer.ecosystemId;
    return toAppView(buildNetworkView(toPolicyViewer(viewer, eco), buildLocalNetworkData(eco)));
  }

  invalidate(): void {
    // Nothing cached: every read recomputes from the sample data.
  }
}
