
import { useEffect } from 'react';
import { useViewer } from './AppDataContext';
import { useAuthContext } from '../app/AuthProvider';
import { FirebaseAdminAuditRepo } from './repos/firebase/adminAudit';
import type { AdminReadResource, AdminReadSurface } from '../domain/audit/types';

const repo = new FirebaseAdminAuditRepo();

// Per-session de-duplication. Keyed by `${actor}:${surface}:${resourceId}` so
// re-mounting the same view (router navigation, prop refresh) doesn't double-
// log. Reset on full page reload, which is the right boundary for "session".
const loggedThisSession = new Set<string>();

const isAdminRole = (role: string): boolean =>
  role === 'platform_admin' || role === 'ecosystem_manager';

interface LogParams {
  resourceType: AdminReadResource;
  resourceId: string;
  surface: AdminReadSurface;
  subjectOrgId?: string;
  // Only fires the log when this is true. Lets the caller pass `!isOwn && hasAdminRole`
  // logic inline instead of reproducing it in the hook.
  active: boolean;
}

/**
 * Logs a tier-5 admin read once per (actor, surface, resource) per session.
 * No-ops for non-admin roles or when active=false. Fire-and-forget — does
 * not block render and never throws into React.
 */
export function useAdminReadLogger(params: LogParams): void {
  const viewer = useViewer();
  const { session } = useAuthContext();

  useEffect(() => {
    if (!params.active) return;
    if (!isAdminRole(viewer.role)) return;
    if (!params.resourceId) return;

    const authUser = session.authUser;
    if (!authUser) return;

    const key = `${viewer.personId}:${params.surface}:${params.resourceId}`;
    if (loggedThisSession.has(key)) return;
    loggedThisSession.add(key);

    void repo
      .logAdminRead({
        actor_person_id: viewer.personId,
        actor_auth_uid: authUser.uid,
        actor_name: authUser.displayName || authUser.email || 'Unknown admin',
        actor_role: viewer.role,
        actor_org_id: viewer.orgId,
        ecosystem_id: viewer.ecosystemId,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        surface: params.surface,
        ...(params.subjectOrgId ? { subject_org_id: params.subjectOrgId } : {}),
      })
      .catch(() => {
        // Silent failure: audit log writes must not break user flow.
        // Remove from cache so a future retry can write the same event.
        loggedThisSession.delete(key);
      });
  }, [
    params.active,
    params.resourceType,
    params.resourceId,
    params.surface,
    params.subjectOrgId,
    viewer.role,
    viewer.personId,
    viewer.orgId,
    viewer.ecosystemId,
    session.authUser,
  ]);
}
