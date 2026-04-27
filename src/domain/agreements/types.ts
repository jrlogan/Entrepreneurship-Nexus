
import type { SystemRole } from '../people/types';

export type AgreementType = 'privacy_policy' | 'data_usage_agreement' | 'federation_compact';

export const AGREEMENT_VERSIONS: Record<AgreementType, string> = {
  privacy_policy: '1.0',
  data_usage_agreement: '1.0',
  // 0.x-draft marks the compact as pre-distribution — text may still be
  // edited freely without re-prompting acceptances. When it is finalized
  // and published, bump to 1.0 and text_hash-based re-prompting can be
  // turned on in App.tsx's acceptance check.
  federation_compact: '0.1-draft',
};

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
  accepted_via: 'signup' | 'invite' | 'post_login_gate' | 'oidc_sso';
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
