import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeNetworkStats, median, suppressSmall, type StatsInput } from './networkStats';

const orgs = [
  { id: 'org_mh', name: 'MakeHaven', roles: ['eso'] },
  { id: 'org_ef', name: 'Foundation', roles: ['eso'] },
  { id: 'org_ipf', name: 'IP Factory', roles: ['eso'] },
  { id: 'org_grace_co', name: 'Grace Robotics', roles: [] },
];

const base = (): StatsInput => ({
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

describe('computeNetworkStats', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('counts each entrepreneur once, however many partners help them', () => {
    const stats = computeNetworkStats(base(), {}, now);
    // Grace: MakeHaven, Foundation. Sam: IP Factory.
    assert.equal(stats.entrepreneurs.served, 2);
    assert.equal(stats.entrepreneurs.served_by_two_or_more, 1);
    assert.equal(stats.entrepreneurs.naive_sum_across_partners, 3);
  });

  it('treats work with a venture as work with its founder', () => {
    const data = base();
    data.participations = [];
    data.referrals = [];
    const stats = computeNetworkStats(data, {}, now);
    assert.equal(stats.entrepreneurs.served, 1);
  });

  it('measures referral follow-through', () => {
    const r = computeNetworkStats(base(), {}, now).referrals;
    assert.equal(r.sent, 3);
    assert.equal(r.completed, 1);
    assert.equal(r.declined, 1);
    assert.equal(r.pending, 1);
    assert.equal(r.acceptance_rate, 0.5);
    assert.equal(r.completion_rate, 0.5);
    assert.equal(r.median_days_to_response, 1.5);
    assert.equal(r.median_days_to_close, 10);
    assert.equal(r.waiting_over_14_days, 1);
  });

  it('breaks referrals down by sending and receiving partner', () => {
    const pairs = computeNetworkStats(base(), {}, now).referrals.by_org_pair;
    const mhToEf = pairs.find((p) => p.from_org_id === 'org_mh' && p.to_org_id === 'org_ef')!;
    assert.equal(mhToEf.sent, 1);
    assert.equal(mhToEf.completed, 1);
    assert.equal(mhToEf.from_org_name, 'MakeHaven');
  });

  it('counts only activity partners chose to share', () => {
    const a = computeNetworkStats(base(), {}, now).activity;
    assert.equal(a.shared_facts, 1);
    assert.deepEqual(a.by_type, { meeting: 1 });
  });

  it('respects the date window', () => {
    const stats = computeNetworkStats(base(), { from: '2026-04-01', to: '2026-04-30' }, now);
    assert.equal(stats.referrals.sent, 1);
    // Sam's program was running in April; Grace's membership too.
    assert.equal(stats.entrepreneurs.served, 2);
    assert.equal(stats.participation.completed_in_window, 0);
  });

  it('reports per-partner counts without any individual', () => {
    const ef = computeNetworkStats(base(), {}, now).partners.find((p) => p.org_id === 'org_ef')!;
    assert.equal(ef.referrals_received, 2);
    assert.equal(ef.referrals_answered_rate, 0.5);
    assert.equal(ef.entrepreneurs_served, 1);
    assert.equal(JSON.stringify(computeNetworkStats(base(), {}, now)).includes('grace'), false);
  });
});

describe('helpers', () => {
  it('median', () => {
    assert.equal(median([]), null);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it('suppresses small cells for publication', () => {
    assert.equal(suppressSmall(0), 0);
    assert.equal(suppressSmall(3), null);
    assert.equal(suppressSmall(5), 5);
  });
});
