
import type { Referral } from '../../domain/referrals/types';
import { MOCK_REFERRALS, ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, canViewOperationalDetails, validateEcosystemScope } from '../../domain/access/policy';
import { redactReferral } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

export class ReferralsRepo {
  
  constructor(private consentRepo: ConsentRepo) {}

  // Viewer-Aware with Ecosystem Scoping
  getAll(viewer: ViewerContext, ecosystemId?: string): Referral[] {
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
        ecosystemOrgIds.has(r.referring_org_id) || 
        ecosystemOrgIds.has(r.receiving_org_id)
    );

    // 3. Apply Viewer Permissions (Role-based filtering)
    // Admin sees all in scope
    if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) {
      return scopedReferrals;
    }

    // Otherwise, must be Sender, Receiver, or the Subject
    return scopedReferrals.filter(r => 
      r.referring_org_id === viewer.orgId ||
      r.receiving_org_id === viewer.orgId ||
      r.subject_person_id === viewer.personId ||
      (r.subject_org_id && r.subject_org_id === viewer.orgId)
    );
  }

  // New: List referrals for a specific subject Org (e.g. on their profile)
  // This allows 3rd party ESOs to see "Oh, they have pending referrals" (Metadata) without details
  listForOrgForViewer(viewer: ViewerContext, orgId: string): Referral[] {
      const referrals = MOCK_REFERRALS.filter(r => r.subject_org_id === orgId || r.referring_org_id === orgId || r.receiving_org_id === orgId);
      const subjectOrg = ALL_ORGANIZATIONS.find(o => o.id === orgId);

      return referrals.map(ref => {
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
  }

  add(referral: Referral): void {
    referral.delivered_at = new Date().toISOString();
    MOCK_REFERRALS.push(referral);
  }

  accept(id: string, notes?: string, ownerId?: string): void {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'pending') {
        ref.status = 'accepted';
        ref.accepted_at = new Date().toISOString();
        if (notes) ref.response_notes = notes;
        if (ownerId) ref.owner_id = ownerId;
    }
  }

  decline(id: string, notes?: string): void {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'pending') {
        ref.status = 'rejected';
        ref.declined_at = new Date().toISOString();
        if (notes) ref.response_notes = notes;
    }
  }

  close(id: string, outcome: string, outcomeTags: string[], notes?: string): void {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref && ref.status === 'accepted') {
        ref.status = 'completed';
        ref.closed_at = new Date().toISOString();
        ref.outcome = outcome;
        ref.outcome_tags = outcomeTags;
        if (notes) ref.response_notes = (ref.response_notes || '') + '\nClosing Note: ' + notes;
    }
  }

  updateFollowUp(id: string, date: string): void {
    const ref = MOCK_REFERRALS.find(r => r.id === id);
    if (ref) {
        ref.follow_up_date = date;
    }
  }
}
