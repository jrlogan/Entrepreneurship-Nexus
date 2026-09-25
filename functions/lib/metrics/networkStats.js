"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.suppressSmall = exports.SMALL_CELL_THRESHOLD = exports.computeNetworkStats = exports.median = void 0;
const DAY_MS = 24 * 60 * 60 * 1000;
const inWindow = (date, window) => {
    if (!date)
        return false;
    const d = date.slice(0, 10);
    if (window.from && d < window.from)
        return false;
    if (window.to && d > window.to)
        return false;
    return true;
};
const daysBetween = (from, to) => {
    if (!from || !to)
        return null;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a)
        return null;
    return (b - a) / DAY_MS;
};
const median = (values) => {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(value * 10) / 10;
};
exports.median = median;
const rate = (numerator, denominator) => denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;
const computeNetworkStats = (input, window = {}, now = new Date()) => {
    const orgName = (id) => input.organizations.find((o) => o.id === id)?.name || 'Unknown organization';
    const partnerIds = new Set(input.organizations.filter((o) => (o.roles || []).some((r) => ['eso', 'funder', 'resource'].includes(r))).map((o) => o.id));
    // Map ventures back to their founders so "working with the venture" and
    // "working with the founder" count as the same entrepreneur.
    const foundersByVenture = new Map();
    input.people.forEach((p) => {
        if (p.organization_id && !partnerIds.has(p.organization_id)) {
            foundersByVenture.set(p.organization_id, [...(foundersByVenture.get(p.organization_id) || []), p.id]);
        }
    });
    const entrepreneurKeys = (personId, orgId) => {
        if (personId)
            return [`p:${personId}`];
        if (orgId && !partnerIds.has(orgId)) {
            const founders = foundersByVenture.get(orgId);
            return founders && founders.length ? founders.map((id) => `p:${id}`) : [`o:${orgId}`];
        }
        return [];
    };
    // --- Who served whom, in the window --------------------------------------
    const servedBy = new Map(); // entrepreneur key -> partner org ids
    const serve = (keys, orgId) => {
        if (!orgId)
            return;
        keys.forEach((key) => {
            const set = servedBy.get(key) || new Set();
            set.add(orgId);
            servedBy.set(key, set);
        });
    };
    input.participations.forEach((p) => {
        const activeInWindow = inWindow(p.start_date, window)
            || (!!p.start_date && (!window.to || p.start_date.slice(0, 10) <= window.to)
                && (!p.end_date || !window.from || p.end_date.slice(0, 10) >= window.from));
        if (activeInWindow)
            serve(entrepreneurKeys(p.recipient_person_id, p.recipient_org_id), p.provider_org_id);
    });
    input.referrals.forEach((r) => {
        if (!inWindow(r.date, window))
            return;
        const keys = entrepreneurKeys(r.subject_person_id, r.subject_org_id);
        serve(keys, r.referring_org_id);
        if (r.status === 'accepted' || r.status === 'completed')
            serve(keys, r.receiving_org_id);
    });
    input.interactions.forEach((i) => {
        if (inWindow(i.date, window))
            serve(entrepreneurKeys(i.subject_person_id, i.organization_id), i.author_org_id);
    });
    const servedCounts = Array.from(servedBy.values());
    const naiveSum = servedCounts.reduce((sum, set) => sum + set.size, 0);
    // --- Referrals ---------------------------------------------------------------
    const windowReferrals = input.referrals.filter((r) => inWindow(r.date, window));
    const count = (status) => windowReferrals.filter((r) => r.status === status).length;
    const accepted = count('accepted');
    const declined = count('rejected');
    const completed = count('completed');
    const pending = count('pending');
    const responseDays = windowReferrals
        .map((r) => daysBetween(r.date, r.accepted_at || r.declined_at || (r.status === 'completed' ? r.closed_at : null)))
        .filter((d) => d !== null);
    const closeDays = windowReferrals
        .filter((r) => r.status === 'completed')
        .map((r) => daysBetween(r.date, r.closed_at))
        .filter((d) => d !== null);
    const waiting = windowReferrals.filter((r) => r.status === 'pending' && (daysBetween(r.date, now.toISOString()) || 0) > 14).length;
    const pairs = new Map();
    windowReferrals.forEach((r) => {
        if (!r.referring_org_id || !r.receiving_org_id)
            return;
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
        if (r.status === 'accepted' || r.status === 'completed')
            row.accepted += 1;
        if (r.status === 'completed')
            row.completed += 1;
        pairs.set(key, row);
    });
    // --- Participation ------------------------------------------------------------
    const byType = {};
    let activeParticipation = 0;
    input.participations.forEach((p) => {
        if (p.status === 'active') {
            activeParticipation += 1;
            const type = p.participation_type || 'program';
            byType[type] = (byType[type] || 0) + 1;
        }
    });
    // --- Activity -------------------------------------------------------------------
    const sharedFacts = input.interactions.filter((i) => inWindow(i.date, window) && (i.visibility || 'network_shared') === 'network_shared' && !i.note_confidential);
    const activityByType = {};
    sharedFacts.forEach((i) => { const t = i.type || 'other'; activityByType[t] = (activityByType[t] || 0) + 1; });
    // --- Per partner ---------------------------------------------------------------------
    const partners = input.organizations
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
            median_days_to_response: (0, exports.median)(responseDays),
            median_days_to_close: (0, exports.median)(closeDays),
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
exports.computeNetworkStats = computeNetworkStats;
/**
 * For sharing outside the network: counts of entrepreneurs below the
 * threshold are replaced with null so small cells cannot identify anyone.
 */
exports.SMALL_CELL_THRESHOLD = 5;
const suppressSmall = (value) => (value > 0 && value < exports.SMALL_CELL_THRESHOLD ? null : value);
exports.suppressSmall = suppressSmall;
