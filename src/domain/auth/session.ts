import type { User as FirebaseUser } from 'firebase/auth';
import type { ViewerContext } from '../access/policy';
import type { EcosystemMembership, Person } from '../people/types';

export type AuthSessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'needs_profile' | 'disabled';

export interface AuthSession {
  authUser: FirebaseUser | null;
  person: Person | null;
  memberships: EcosystemMembership[];
  activeEcosystemId: string | null;
  activeOrgId: string | null;
  viewer: ViewerContext | null;
  status: AuthSessionStatus;
}
