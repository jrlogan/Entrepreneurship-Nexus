"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const networkStats_1 = require("./networkStats");
const orgs = [
    { id: 'org_mh', name: 'MakeHaven', roles: ['eso'] },
    { id: 'org_ef', name: 'Foundation', roles: ['eso'] },
    { id: 'org_ipf', name: 'IP Factory', roles: ['eso'] },
    { id: 'org_grace_co', name: 'Grace Robotics', roles: [] },
];
const base = () => ({
    people: [
        { id: 'grace', organization_id: 'org_grace_co', system_role: 'entrepreneur' },
        { id: 'sam', organization_id: '', system_role: 'entrepreneur' },
    ],
    organizations: orgs,
    participations: [
        { provider_org_id: 'org_mh', recipient_person_id: 'grace', participation_type: 'membership', status: 'active', start_date: '2026-01-10' },
        { provider_org_id: 'org_ipf', recipient_person_id: 'sam', participation_type: 'program', status: 'past', start_date: '2026-02-01', end_date: '2026-05-01' },
    ],
    referrals: [
        { referring_org_id: 'org_mh', receiving_org_id: 'org_ef', subject_person_id: 'grace', status: 'completed', date: '2026-03-01T00:00:00Z', accepted_at: '2026-03-03T00:00:00Z', closed_at: '2026-03-11T00:00:00Z' },
        { referring_org_id: 'org_mh', receiving_org_id: 'org_ipf', subject_person_id: 'grace', status: 'rejected', date: '2026-03-05T00:00:00Z', declined_at: '2026-03-06T00:00:00Z' },
        { referring_org_id: 'org_ipf', receiving_org_id: 'org_ef', subject_person_id: 'sam', status: 'pending', date: '2026-04-01T00:00:00Z' },
    ],
    interactions: [
        // Logged against Grace's venture, not Grace — must still count as Grace.
        { author_org_id: 'org_ef', organization_id: 'org_grace_co', type: 'meeting', date: '2026-03-12', visibility: 'network_shared' },
        { author_org_id: 'org_mh', organization_id: 'org_grace_co', type: 'call', date: '2026-03-13', visibility: 'eso_private', note_confidential: true },
    ],
});
(0, node_test_1.describe)('computeNetworkStats', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    (0, node_test_1.it)('counts each entrepreneur once, however many partners help them', () => {
        const stats = (0, networkStats_1.computeNetworkStats)(base(), {}, now);
        // Grace: MakeHaven, Foundation. Sam: IP Factory.
        strict_1.default.equal(stats.entrepreneurs.served, 2);
        strict_1.default.equal(stats.entrepreneurs.served_by_two_or_more, 1);
        strict_1.default.equal(stats.entrepreneurs.naive_sum_across_partners, 3);
    });
    (0, node_test_1.it)('treats work with a venture as work with its founder', () => {
        const data = base();
        data.participations = [];
        data.referrals = [];
        const stats = (0, networkStats_1.computeNetworkStats)(data, {}, now);
        strict_1.default.equal(stats.entrepreneurs.served, 1);
    });
    (0, node_test_1.it)('measures referral follow-through', () => {
        const r = (0, networkStats_1.computeNetworkStats)(base(), {}, now).referrals;
        strict_1.default.equal(r.sent, 3);
        strict_1.default.equal(r.completed, 1);
        strict_1.default.equal(r.declined, 1);
        strict_1.default.equal(r.pending, 1);
        strict_1.default.equal(r.acceptance_rate, 0.5);
        strict_1.default.equal(r.completion_rate, 0.5);
        strict_1.default.equal(r.median_days_to_response, 1.5);
        strict_1.default.equal(r.median_days_to_close, 10);
        strict_1.default.equal(r.waiting_over_14_days, 1);
    });
    (0, node_test_1.it)('breaks referrals down by sending and receiving partner', () => {
        const pairs = (0, networkStats_1.computeNetworkStats)(base(), {}, now).referrals.by_org_pair;
        const mhToEf = pairs.find((p) => p.from_org_id === 'org_mh' && p.to_org_id === 'org_ef');
        strict_1.default.equal(mhToEf.sent, 1);
        strict_1.default.equal(mhToEf.completed, 1);
        strict_1.default.equal(mhToEf.from_org_name, 'MakeHaven');
    });
    (0, node_test_1.it)('counts only activity partners chose to share', () => {
        const a = (0, networkStats_1.computeNetworkStats)(base(), {}, now).activity;
        strict_1.default.equal(a.shared_facts, 1);
        strict_1.default.deepEqual(a.by_type, { meeting: 1 });
    });
    (0, node_test_1.it)('respects the date window', () => {
        const stats = (0, networkStats_1.computeNetworkStats)(base(), { from: '2026-04-01', to: '2026-04-30' }, now);
        strict_1.default.equal(stats.referrals.sent, 1);
        // Sam's program was running in April; Grace's membership too.
        strict_1.default.equal(stats.entrepreneurs.served, 2);
        strict_1.default.equal(stats.participation.completed_in_window, 0);
    });
    (0, node_test_1.it)('reports per-partner counts without any individual', () => {
        const ef = (0, networkStats_1.computeNetworkStats)(base(), {}, now).partners.find((p) => p.org_id === 'org_ef');
        strict_1.default.equal(ef.referrals_received, 2);
        strict_1.default.equal(ef.referrals_answered_rate, 0.5);
        strict_1.default.equal(ef.entrepreneurs_served, 1);
        strict_1.default.equal(JSON.stringify((0, networkStats_1.computeNetworkStats)(base(), {}, now)).includes('grace'), false);
    });
});
(0, node_test_1.describe)('helpers', () => {
    (0, node_test_1.it)('median', () => {
        strict_1.default.equal((0, networkStats_1.median)([]), null);
        strict_1.default.equal((0, networkStats_1.median)([3, 1, 2]), 2);
        strict_1.default.equal((0, networkStats_1.median)([1, 2, 3, 4]), 2.5);
    });
    (0, node_test_1.it)('suppresses small cells for publication', () => {
        strict_1.default.equal((0, networkStats_1.suppressSmall)(0), 0);
        strict_1.default.equal((0, networkStats_1.suppressSmall)(3), null);
        strict_1.default.equal((0, networkStats_1.suppressSmall)(5), 5);
    });
});
