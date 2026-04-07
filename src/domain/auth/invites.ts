import type { SystemRole } from '../people/types';

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface Invite {
  id: string;
  email: string;
  invited_role: SystemRole;
  organization_id: string;
  ecosystem_id: string;
  invited_by_person_id: string;
  invited_by_role: SystemRole;
  status: InviteStatus;
  note?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  last_sent_at?: string;
  accepted_at?: string;
  accepted_by_auth_uid?: string;
  revoked_at?: string;
  revoked_by_person_id?: string;
  token_last4?: string | null;
  // Set by listInvites when the invitee already has a person record (joined outside invite flow)
  person_in_system?: boolean;
  existing_person_id?: string | null;
}

export interface InviteSummary {
  id: string;
  email: string;
  invited_role: SystemRole;
  organization_id: string;
  ecosystem_id: string;
  status: InviteStatus;
  expires_at: string;
  note?: string;
}
