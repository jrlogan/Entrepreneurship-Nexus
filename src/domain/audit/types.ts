
import type { SystemRole } from '../people/types';

export type ChangeAction = 'create' | 'update' | 'delete' | 'rollback';

export interface Revision<T> {
  id: string;
  entityId: string;
  timestamp: string; // ISO Date
  actor: {
    id: string;
    label: string; // e.g. "John Doe" or "API Key: Salesforce Sync"
    type: 'user' | 'api_key' | 'system';
  };
  action: ChangeAction;
  changesSummary?: string; // e.g. "Changed status from Active to Closed"
  snapshot: T; // The full state of the object at this point in time
}

// ─── Tier-5 admin read audit ─────────────────────────────────────────────────
// When platform_admin or ecosystem_manager opens data they don't own (no
// consent grant, not their org), record it. The audit log is the difference
// between "admins are trusted" (assertion) and "admin access is observable"
// (verifiable). See project_privacy_5tier memory.

export type AdminReadResource = 'organization' | 'interaction' | 'person' | 'referral';

export type AdminReadSurface =
  | 'org_detail'              // OrganizationDetailView mount on a non-own org
  | 'interaction_detail'      // InteractionDetailModal opened
  | 'people_detail'           // future: person profile view
  | 'admin_access_log_viewer' // self-referential — admin viewing the audit log itself
  ;

export interface AdminReadEvent {
  id: string;
  timestamp: string;          // ISO
  actor_person_id: string;
  actor_auth_uid: string;
  actor_name: string;         // denormalized so the trail survives renames
  actor_role: SystemRole;     // role at time of access (platform_admin or ecosystem_manager)
  actor_org_id: string;
  ecosystem_id: string;       // viewer's active ecosystem
  resource_type: AdminReadResource;
  resource_id: string;
  subject_org_id?: string;    // when the resource is scoped to a specific org
  surface: AdminReadSurface;
}

