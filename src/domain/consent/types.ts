
import { AccessLevel } from '../types';

export type ConsentAction = 'granted' | 'revoked' | 'modified' | 'acknowledged';
export type ResourceType = 'organization' | 'person';
export type ConsentGrantedVia = 'self' | 'eso_request' | 'manager_override';
export type ConsentRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface ConsentPolicy {
  id: string;
  resourceType: ResourceType;
  resourceId: string; // The Org or Person ID being accessed
  viewerId: string;   // The Org ID (ESO) allowed to view
  accessLevel: AccessLevel;
  isActive: boolean;
  updatedAt: string;
  grantedVia?: ConsentGrantedVia;
  requestId?: string; // Links to ConsentRequest if grantedVia === 'eso_request'
  /**
   * The network the grant was made in.
   *
   * Consent is given inside a context — "I'm sharing with my county cluster"
   * is a different decision from "I'm sharing with the statewide network" —
   * and an entrepreneur may belong to several. A grant applies only within
   * its ecosystem.
   *
   * Optional for backward compatibility: policies written before scoping
   * existed carry no ecosystem and are treated as network-wide (see
   * policyAppliesInEcosystem). New grants always set it.
   */
  ecosystemId?: string;
}

/**
 * Whether a stored grant is in force for the network being evaluated.
 *
 * Legacy grants (no ecosystemId) stay in force everywhere so an upgrade never
 * silently revokes access someone is relying on — they are surfaced in the UI
 * as unscoped so an entrepreneur can re-make or revoke them deliberately.
 */
export const policyAppliesInEcosystem = (
  policy: Pick<ConsentPolicy, 'ecosystemId'>,
  ecosystemId?: string
): boolean => {
  if (!policy.ecosystemId) return true;
  if (!ecosystemId) return true;
  return policy.ecosystemId === ecosystemId;
};

export interface ConsentEvent {
  id: string;
  timestamp: string;
  actorId: string; // User ID (personId) who performed the action
  action: ConsentAction;
  resourceId: string;
  viewerId: string; // The ESO involved (or ecosystemId for onboarding ack)
  previousAccessLevel?: AccessLevel;
  newAccessLevel?: AccessLevel;
  reason?: string;
  grantedVia?: ConsentGrantedVia;
  overrideReason?: string; // Required when grantedVia === 'manager_override'
}

export interface ConsentRequest {
  id: string;
  ecosystemId: string;
  resourceId: string;       // Org being requested access to
  requestingEsoId: string;  // ESO requesting access
  requestedByPersonId: string;
  requestedAccessLevel: AccessLevel;
  status: ConsentRequestStatus;
  requestedAt: string;
  respondedAt?: string;
  respondedByPersonId?: string;
  requestMessage?: string;  // Optional message from the ESO to the company
  declineReason?: string;
}

export interface ConsentCheckResult {
  hasAccess: boolean;
  effectiveLevel: AccessLevel | 'none';
  policyId?: string;
  reason: string;
}
