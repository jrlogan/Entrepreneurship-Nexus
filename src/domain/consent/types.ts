
import { AccessLevel } from '../types';

export type ConsentAction = 'granted' | 'revoked' | 'modified';
export type ResourceType = 'organization' | 'person';

export interface ConsentPolicy {
  id: string;
  resourceType: ResourceType;
  resourceId: string; // The Org or Person ID being accessed
  viewerId: string;   // The Org ID (ESO) allowed to view
  accessLevel: AccessLevel;
  isActive: boolean;
  updatedAt: string;
}

export interface ConsentEvent {
  id: string;
  timestamp: string;
  actorId: string; // User ID who performed the action
  action: ConsentAction;
  resourceId: string;
  viewerId: string; // The ESO involved
  previousAccessLevel?: AccessLevel;
  newAccessLevel?: AccessLevel;
  reason?: string;
}

export interface ConsentCheckResult {
  hasAccess: boolean;
  effectiveLevel: AccessLevel | 'none';
  policyId?: string;
  reason: string;
}
