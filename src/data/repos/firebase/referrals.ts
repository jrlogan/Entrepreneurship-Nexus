import { deleteField } from 'firebase/firestore';
import { getDocument, queryCollection, whereEquals, setDocument, updateDocument } from '../../../services/firestoreClient';
import type { Referral, ReferralStatus } from '../../../domain/referrals/types';
import type { ViewerContext } from '../../../domain/access/policy';
import type { NetworkViewSource } from '../../networkView';
import { assertReferralTransition } from '../../../domain/referrals/transitions';

export class FirebaseReferralsRepo {
  constructor(private networkView: NetworkViewSource) {}

  // Reads go through the network view: Firestore rules only let the referring
  // and receiving organizations (and the entrepreneur) read a referral directly.
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Referral[]> {
    return (await this.networkView.get(viewer, ecosystemId)).referrals;
  }

  async add(referral: Referral): Promise<void> {
    const now = new Date().toISOString();
    const doc = {
        ...referral,
        delivered_at: referral.delivered_at || now,
        date: referral.date || now,
    };
    await setDocument('referrals', referral.id, doc);
    this.networkView.invalidate();
  }

  // Guards mirror the mock repo and src/domain/referrals/transitions.ts so
  // production cannot reach states the demo forbids (e.g. rejected -> completed).
  private async assertTransition(id: string, to: ReferralStatus): Promise<void> {
    const existing = await getDocument<Referral>('referrals', id);
    if (!existing) throw new Error(`Referral ${id} not found`);
    assertReferralTransition(existing.status, to);
  }

  async accept(id: string, notes?: string, ownerId?: string): Promise<void> {
    await this.assertTransition(id, 'accepted');
    const updates: Partial<Referral> = {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
    };
    if (notes) updates.response_notes = notes;
    if (ownerId) updates.owner_id = ownerId;

    await updateDocument('referrals', id, updates);
    this.networkView.invalidate();
  }

  async decline(id: string, notes?: string): Promise<void> {
    await this.assertTransition(id, 'rejected');
    const updates: Partial<Referral> = {
        status: 'rejected',
        declined_at: new Date().toISOString(),
    };
    if (notes) updates.response_notes = notes;

    await updateDocument('referrals', id, updates);
    this.networkView.invalidate();
  }

  async close(id: string, outcome: string, outcomeTags: string[], notes?: string): Promise<void> {
    await this.assertTransition(id, 'completed');
    const updates: Partial<Referral> = {
        status: 'completed',
        closed_at: new Date().toISOString(),
        outcome,
        outcome_tags: outcomeTags,
    };
    if (notes) updates.response_notes = notes;

    await updateDocument('referrals', id, updates);
    this.networkView.invalidate();
  }

  async updateFollowUp(id: string, date: string): Promise<void> {
    await updateDocument('referrals', id, { follow_up_date: date });
    this.networkView.invalidate();
  }

  async assignOwner(id: string, ownerId?: string): Promise<void> {
    // updateDocument strips undefined values, so clearing the owner needs an
    // explicit deleteField() sentinel — `undefined` was a silent no-op.
    await updateDocument('referrals', id, { owner_id: ownerId || deleteField() } as Partial<Referral>);
    this.networkView.invalidate();
  }

  async update(id: string, updates: Partial<Referral>): Promise<void> {
    await updateDocument('referrals', id, updates);
    this.networkView.invalidate();
  }
}
