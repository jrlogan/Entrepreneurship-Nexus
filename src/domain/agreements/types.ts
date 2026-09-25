
import type { SystemRole } from '../people/types';

import type { AgreementType } from '../../../functions/src/agreements/content';
export type { AgreementType } from '../../../functions/src/agreements/content';
export { AGREEMENT_VERSIONS } from '../../../functions/src/agreements/content';

export interface AgreementAcceptance {
  id: string;           // deterministic: {auth_uid}_{ecosystem_id}_{type}
  auth_uid: string;     // Firebase auth UID — used for Firestore rules
  person_id: string;    // Person document ID (may equal auth_uid or be set later)
  ecosystem_id: string;
  agreement_type: AgreementType;
  version: string;
  // SHA-256 hex of the canonical text presented at acceptance. Stored now so
  // that when the compact text is finalized, stale acceptances (hash mismatch)
  // can be detected and re-prompted without a schema change.
  text_hash?: string;
  accepted_at: string;
  accepted_via: 'signup' | 'invite' | 'post_login_gate' | 'oidc_sso' | 'terms_update';
}

// Which agreement types are required for each system role. Entrepreneurs
// joining this ecosystem must acknowledge both how their data is handled
// within the ecosystem (privacy_policy) and that they are participating in
// the federated entrepreneurship network (federation_compact).
export const REQUIRED_AGREEMENTS: Partial<Record<SystemRole, AgreementType[]>> = {
  entrepreneur: ['privacy_policy', 'federation_compact'],
  eso_staff: ['data_usage_agreement'],
  eso_admin: ['data_usage_agreement'],
  eso_coach: ['data_usage_agreement'],
};

// ─── Org-level (consortium) agreements ────────────────────────────────────────
// Tier-2 of the privacy model (see project_privacy_5tier memory): in addition
// to per-user click-through, an ESO must sign these on behalf of its
// organization, per ecosystem it participates in. Acceptance carries legal
// weight for the whole org, not just the signing user.

export {
  ORG_REQUIRED_AGREEMENTS,
  REFERRAL_PARTNER_REQUIRED_AGREEMENTS,
  MEMBERSHIP_TIER_LABELS,
  membershipTierOf,
  requiredAgreementsFor,
} from '../../../functions/src/agreements/content';
export type { MembershipTier } from '../../../functions/src/agreements/content';
export type { OrgAgreementType } from '../../../functions/src/agreements/content';
import type { OrgAgreementType } from '../../../functions/src/agreements/content';

export interface OrgAgreementAcceptance {
  id: string;                 // deterministic: {org_id}_{ecosystem_id}_{type}
  org_id: string;
  ecosystem_id: string;
  agreement_type: OrgAgreementType;
  version: string;
  text_hash?: string;
  signed_by_uid: string;      // Firebase auth UID of the signer
  signed_by_person_id: string;
  signed_by_name: string;     // denormalized so the audit trail survives renames
  signed_by_role: SystemRole; // role at time of signing (eso_admin / platform_admin / etc.)
  signed_at: string;
  revoked_at?: string;
  revoked_by_uid?: string;
  revoked_reason?: string;
}
