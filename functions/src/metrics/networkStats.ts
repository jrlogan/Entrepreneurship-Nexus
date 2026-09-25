/**
 * Network statistics — aggregate and anonymous, by design.
 *
 * Computed server-side over the whole network (every partner's records), but
 * only counts leave: no person, no note, no record-level detail. This is the
 * "statistics fall out of what partners already record" promise — entrepreneurs
 * served (each counted once however many partners help them), referral
 * follow-through, program reach, and how much partners work together.
 *
 * Pure: takes records, returns numbers. Used by the getNetworkStats function
 * and by the demo over sample data.
 */

export interface StatsReferral {
  referring_org_id?: string | null;
  receiving_org_id?: string | null;
  subject_person_id?: string | null;
  subject_org_id?: string | null;
  status?: string;
  date?: string;
  accepted_at?: string | null;
  declined_at?: string | null;
  closed_at?: string | null;
}

export interface StatsParticipation {
  provider_org_id: string;
  recipient_person_id?: string | null;
  recipient_org_id?: string | null;
  participation_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string | null;
}

export interface StatsInteraction {
  author_org_id: string;
  organization_id?: string;
  subject_person_id?: string | null;
  type?: string;
  date?: string;
  visibility?: string;
  note_confidential?: boolean;
}

export interface StatsPerson {
  id: string;
  organization_id?: string;
  system_role?: string;
}

export interface StatsOrganization {
  id: string;
  name?: string;
  roles?: string[];
}

export interface StatsInput {
  people: StatsPerson[];
  organizations: StatsOrganization[];
  referrals: StatsReferral[];
  participations: StatsParticipation[];
  interactions: StatsInteraction[];
}

export interface StatsWindow {
  /** Inclusive ISO date (YYYY-MM-DD). Omit for all time. */
  from?: string;
  /** Inclusive ISO date (YYYY-MM-DD). Omit for today. */
  to?: string;
}

export interface OrgPairCount {
  from_org_id: string;
  from_org_name: string;
  to_org_id: string;
  to_org_name: string;
  sent: number;
  accepted: number;
  completed: number;
}

export interface PartnerCount {
  org_id: string;
  org_name: string;
  entrepreneurs_served: number;
  referrals_sent: number;
  referrals_received: number;
  referrals_answered_rate: number | null;
}

export interface NetworkStats {
  window: StatsWindow;
  entrepreneurs: {
    /** Distinct entrepreneurs any partner recorded working with — counted once. */
    served: number;
    /** Of those, how many were served by two or more partners. */
    served_by_two_or_more: number;
    /** Sum over partners of the entrepreneurs each served — what adding up partners' own reports would give. */
    naive_sum_across_partners: number;
  };
  referrals: {
    sent: number;
    pending: number;
    accepted: number;
    declined: number;
    completed: number;
    /** (accepted + completed) / (accepted + completed + declined); null when nothing was answered. */
    acceptance_rate: number | null;
    /** completed / (sent − pending); null when nothing was decided. */
    completion_rate: number | null;
    /** Median days from sent to accepted or declined. */
    median_days_to_response: number | null;
    /** Median days from sent to completed. */
    median_days_to_close: number | null;
    /** Pending referrals older than 14 days — the ones going cold. */
    waiting_over_14_days: number;
    by_org_pair: OrgPairCount[];
  };
  participation: {
    active: number;
    started_in_window: number;
    completed_in_window: number;
    by_type: Record<string, number>;
  };
  activity: {
    /** Activity partners chose to share as a fact. Private activity is not counted. */
    shared_facts: number;
    by_type: Record<string, number>;
  };
  partners: PartnerCount[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const inWindow = (date: string | null | undefined, window: StatsWindow): boolean => {
  if (!date) return false;
  const d = date.slice(0, 10);
  if (window.from && d < window.from) return false;
  if (window.to && d > window.to) return false;
  return true;
};

const daysBetween = (from?: string | null, to?: string | null): number | null => {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / DAY_MS;
};

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
};

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;

export const computeNetworkStats = (input: StatsInput, window: StatsWindow = {}, now: Date = new Date()): NetworkStats => {
  const orgName = (id?: string | null) => input.organizations.find((o) => o.id === id)?.name || 'Unknown organization';
  const partnerIds = new Set(
    input.organizations.filter((o) => (o.roles || []).some((r) => ['eso', 'funder', 'resource'].includes(r))).map((o) => o.id)
  );

  // Map ventures back to their founders so "working with the venture" and
  // "working with the founder" count as the same entrepreneur.
  const foundersByVenture = new Map<string, string[]>();
  input.people.forEach((p) => {
    if (p.organization_id && !partnerIds.has(p.organization_id)) {
      foundersByVenture.set(p.organization_id, [...(foundersByVenture.get(p.organization_id) || []), p.id]);
    }
  });
  const entrepreneurKeys = (personId?: string | null, orgId?: string | null): string[] => {
    if (personId) return [`p:${personId}`];
    if (orgId && !partnerIds.has(orgId)) {
      const founders = foundersByVenture.get(orgId);
      return founders && founders.length ? founders.map((id) => `p:${id}`) : [`o:${orgId}`];
    }
    return [];
  };

  // --- Who served whom, in the window --------------------------------------
  const servedBy = new Map<string, Set<string>>(); // entrepreneur key -> partner org ids
  const serve = (keys: string[], orgId?: string | null) => {
    if (!orgId) return;
    keys.forEach((key) => {
      const set = servedBy.get(key) || new Set<string>();
      set.add(orgId);
      servedBy.set(key, set);
    });
  };

  input.participations.forEach((p) => {
    const activeInWindow = inWindow(p.start_date, window)
      || (!!p.start_date && (!window.to || p.start_date.slice(0, 10) <= window.to)
        && (!p.end_date || !window.from || p.end_date.slice(0, 10) >= window.from));
    if (activeInWindow) serve(entrepreneurKeys(p.recipient_person_id, p.recipient_org_id), p.provider_org_id);
  });
  input.referrals.forEach((r) => {
    if (!inWindow(r.date, window)) return;
    const keys = entrepreneurKeys(r.subject_person_id, r.subject_org_id);
    serve(keys, r.referring_org_id);
    if (r.status === 'accepted' || r.status === 'completed') serve(keys, r.receiving_org_id);
  });
  input.interactions.forEach((i) => {
    if (inWindow(i.date, window)) serve(entrepreneurKeys(i.subject_person_id, i.organization_id), i.author_org_id);
  });

  const servedCounts = Array.from(servedBy.values());
  const naiveSum = servedCounts.reduce((sum, set) => sum + set.size, 0);

  // --- Referrals ---------------------------------------------------------------
  const windowReferrals = input.referrals.filter((r) => inWindow(r.date, window));
  const count = (status: string) => windowReferrals.filter((r) => r.status === status).length;
  const accepted = count('accepted');
  const declined = count('rejected');
  const completed = count('completed');
  const pending = count('pending');
  const responseDays = windowReferrals
    .map((r) => daysBetween(r.date, r.accepted_at || r.declined_at || (r.status === 'completed' ? r.closed_at : null)))
    .filter((d): d is number => d !== null);
  const closeDays = windowReferrals
    .filter((r) => r.status === 'completed')
    .map((r) => daysBetween(r.date, r.closed_at))
    .filter((d): d is number => d !== null);
  const waiting = windowReferrals.filter((r) => r.status === 'pending' && (daysBetween(r.date, now.toISOString()) || 0) > 14).length;

  const pairs = new Map<string, OrgPairCount>();
  windowReferrals.forEach((r) => {
    if (!r.referring_org_id || !r.receiving_org_id) return;
    const key = `${r.referring_org_id}>${r.receiving_org_id}`;
    const row = pairs.get(key) || {
      from_org_id: r.referring_org_id,
      from_org_name: orgName(r.referring_org_id),
      to_org_id: r.receiving_org_id,
      to_org_name: orgName(r.receiving_org_id),
      sent: 0,
      accepted: 0,
      completed: 0,
    };
    row.sent += 1;
    if (r.status === 'accepted' || r.status === 'completed') row.accepted += 1;
    if (r.status === 'completed') row.completed += 1;
    pairs.set(key, row);
  });

  // --- Participation ------------------------------------------------------------
  const byType: Record<string, number> = {};
  let activeParticipation = 0;
  input.participations.forEach((p) => {
    if (p.status === 'active') {
      activeParticipation += 1;
      const type = p.participation_type || 'program';
      byType[type] = (byType[type] || 0) + 1;
    }
  });

  // --- Activity -------------------------------------------------------------------
  const sharedFacts = input.interactions.filter((i) =>
    inWindow(i.date, window) && (i.visibility || 'network_shared') === 'network_shared' && !i.note_confidential
  );
  const activityByType: Record<string, number> = {};
  sharedFacts.forEach((i) => { const t = i.type || 'other'; activityByType[t] = (activityByType[t] || 0) + 1; });

  // --- Per partner ---------------------------------------------------------------------
  const partners: PartnerCount[] = input.organizations
    .filter((o) => partnerIds.has(o.id))
    .map((o) => {
      const received = windowReferrals.filter((r) => r.receiving_org_id === o.id);
      const answered = received.filter((r) => r.status !== 'pending').length;
      return {
        org_id: o.id,
        org_name: o.name || o.id,
        entrepreneurs_served: servedCounts.filter((set) => set.has(o.id)).length,
        referrals_sent: windowReferrals.filter((r) => r.referring_org_id === o.id).length,
        referrals_received: received.length,
        referrals_answered_rate: rate(answered, received.length),
      };
    })
    .sort((a, b) => a.org_name.localeCompare(b.org_name));

  return {
    window,
    entrepreneurs: {
      served: servedBy.size,
      served_by_two_or_more: servedCounts.filter((set) => set.size >= 2).length,
      naive_sum_across_partners: naiveSum,
    },
    referrals: {
      sent: windowReferrals.length,
      pending,
      accepted,
      declined,
      completed,
      acceptance_rate: rate(accepted + completed, accepted + completed + declined),
      completion_rate: rate(completed, windowReferrals.length - pending),
      median_days_to_response: median(responseDays),
      median_days_to_close: median(closeDays),
      waiting_over_14_days: waiting,
      by_org_pair: Array.from(pairs.values()).sort((a, b) => b.sent - a.sent),
    },
    participation: {
      active: activeParticipation,
      started_in_window: input.participations.filter((p) => inWindow(p.start_date, window)).length,
      completed_in_window: input.participations.filter((p) => p.status === 'past' && inWindow(p.end_date, window)).length,
      by_type: byType,
    },
    activity: {
      shared_facts: sharedFacts.length,
      by_type: activityByType,
    },
    partners,
  };
};

/**
 * For sharing outside the network: counts of entrepreneurs below the
 * threshold are replaced with null so small cells cannot identify anyone.
 */
export const SMALL_CELL_THRESHOLD = 5;
export const suppressSmall = (value: number): number | null => (value > 0 && value < SMALL_CELL_THRESHOLD ? null : value);
