import type { SystemRole } from '../people/types';

export type AccountRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccountRequest {
  id: string;
  auth_uid: string;
  email: string;
  first_name: string;
  last_name: string;
  requested_role: SystemRole;
  requested_organization_id: string;
  requested_ecosystem_id: string;
  status: AccountRequestStatus;
  note?: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  approved_role?: SystemRole;
  approved_organization_id?: string;
  approved_ecosystem_id?: string;
  rejection_reason?: string;
}
