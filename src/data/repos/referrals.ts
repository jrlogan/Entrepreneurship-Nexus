
import type { Referral } from '../../domain/referrals/types';
import { MOCK_REFERRALS, ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, canViewOperationalDetails, validateEcosystemScope } from '../../domain/access/policy';
import { redactReferral } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

export class ReferralsRepo {
  
  constructor(private consentRepo: ConsentRepo) {}

  // Viewer-Aware with Ecosystem Scoping
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Referral[]> {
    const scope = validateEcosystemScope(viewer, ecosystemId);

    // 1. Identify Organizations active in this scope
    // Referrals do not have an explicit `ecosystem_id`, so we check if the involved organizations are members.
    const ecosystemOrgIds = new Set(
        ALL_ORGANIZATIONS
            .filter(o => (o.ecosystem_ids || []).includes(scope))
            .map(o => o.id)
    );

    // 2. Filter Referrals relevant to this ecosystem
    // A referral is relevant if EITHER the sender OR receiver is in the ecosystem.
    const scopedReferrals = MOCK_REFERRALS.filter(r => 
        (r.referring_org_id && ecosystemOrgIds.has(r.referring_org_id)) || 
        (r.receiving_org_id && ecosystemOrgIds.has(r.receiving_org_id))
    );

    // 3. Apply Viewer Permissions (Role-based filtering)
    // Admin sees all in scope
    if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) {
      return Promise.resolve(scopedReferrals);
    }

    // Otherwise, must be Sender, Receiver, or the Subject
    return Promise.resolve(scopedReferrals.filter(r => 
      r.referring_org_id === viewer.orgId ||
      r.receiving_org_id === viewer.orgId ||
      r.subject_person_id === viewer.personId ||
      (r.subject_org_id && r.subject_org_id === viewer.orgId)
    ));
  }

  // New: List referrals for a specific subject Org (e.g. on their profile)
  // This allows 3rd party ESOs to see "Oh, they have pending referrals" (Metadata) without details
  async listForOrgForViewer(viewer: ViewerContext, orgId: string): Promise<Referral[]> {
      const referrals = MOCK_REFERRALS.filter(r => r.subject_org_id === orgId || r.referring_org_id === orgId || r.receiving_org_id === orgId);
      const subjectOrg = ALL_ORGANIZATIONS.find(o => o.id === orgId);

      const results = referrals.map(ref => {
          // If I am involved, I see it
          if (ref.referring_org_id === viewer.orgId || ref.receiving_org_id === viewer.orgId) {
              return ref;
          }

          // If I am looking at the subject org, can I see operational details?
          if (subjectOrg) {
              const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, subjectOrg.id, viewer.ecosystemId);
              if (canViewOperationalDetails(viewer, subjectOrg, hasConsent)) {
                  return ref;
              }
          }

          // Otherwise redact
          return redactReferral(ref);
      });

      return Promise.resolve(results);
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
