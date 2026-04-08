
import type { SystemRole } from '../people/types';

export type AgreementType = 'privacy_policy' | 'data_usage_agreement';

export const AGREEMENT_VERSIONS: Record<AgreementType, string> = {
  privacy_policy: '1.0',
  data_usage_agreement: '1.0',
};

export interface AgreementAcceptance {
  id: string;           // deterministic: {auth_uid}_{ecosystem_id}_{type}
  auth_uid: string;     // Firebase auth UID — used for Firestore rules
  person_id: string;    // Person document ID (may equal auth_uid or be set later)
  ecosystem_id: string;
  agreement_type: AgreementType;
  version: string;
  accepted_at: string;
  accepted_via: 'signup' | 'invite' | 'post_login_gate';
}

// Which agreement types are required for each system role
export const REQUIRED_AGREEMENTS: Partial<Record<SystemRole, AgreementType[]>> = {
  entrepreneur: ['privacy_policy'],
  eso_staff: ['data_usage_agreement'],
  eso_admin: ['data_usage_agreement'],
  eso_coach: ['data_usage_agreement'],
};
