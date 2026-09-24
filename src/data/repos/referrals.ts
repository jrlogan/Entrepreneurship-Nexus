
import type { Referral } from '../../domain/referrals/types';
import { MOCK_REFERRALS } from '../mockData';
import type { ViewerContext } from '../../domain/access/policy';
import type { NetworkViewSource } from '../networkView';

export class ReferralsRepo {
  
  constructor(private networkView: NetworkViewSource) {}

  // Parties to a referral see it in full; other partners who work with the
  // entrepreneur see only that it happened (functions/src/privacy/policy.ts).
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Referral[]> {
    return (await this.networkView.get(viewer, ecosystemId)).referrals;
  }

  async listForOrgForViewer(viewer: ViewerContext, orgId: string): Promise<Referral[]> {
    return (await this.getAll(viewer)).filter((r) =>
      r.subject_org_id === orgId || r.referring_org_id === orgId || r.receiving_org_id === orgId
    );
  }

  async add(referral: Referral): Promise<void> {
    referral.delivered_at = new Date().toISOString();
    MOCK_REFERRALS.push(referral);
    return Promise.resolve();
  }

  async accept(id: string, notes?: string, ownerId?: string): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'pending') {
        ref.status = 'accepted';
        ref.accepted_at = new Date().toISOString();
        if (notes) ref.response_notes = notes;
        if (ownerId) ref.owner_id = ownerId;
    }
    return Promise.resolve();
  }

  async decline(id: string, notes?: string): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'pending') {
        ref.status = 'rejected';
        ref.declined_at = new Date().toISOString();
        if (notes) ref.response_notes = notes;
    }
    return Promise.resolve();
  }

  async close(id: string, outcome: string, outcomeTags: string[], notes?: string): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'accepted') {
        ref.status = 'completed';
        ref.closed_at = new Date().toISOString();
        ref.outcome = outcome;
        ref.outcome_tags = outcomeTags;
        if (notes) ref.response_notes = (ref.response_notes || '') + '\nClosing Note: ' + notes;
    }
    return Promise.resolve();
  }

  async updateFollowUp(id: string, date: string): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref) {
      ref.follow_up_date = date;
    }
    return Promise.resolve();
  }

  async assignOwner(id: string, ownerId?: string): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref) {
      ref.owner_id = ownerId || undefined;
    }
    return Promise.resolve();
  }

  async update(id: string, updates: Partial<Referral>): Promise<void> {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref) {
      Object.assign(ref, updates);
    }
    return Promise.resolve();
  }
}
