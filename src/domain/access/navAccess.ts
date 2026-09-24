import type { SystemRole } from '../types';

/**
 * Single source of truth for feature-flag / role gating of app views.
 *
 * App, shell, and tests all import this function — it previously existed as
 * several hand-synced copies that drifted.
 *
 * The MVP surface is small, so most views are on by default for the roles
 * that need them; an ecosystem can switch one off with an explicit `false`.
 * Platform admins always see system views (they configure the flags — flags
 * gate other roles only).
 */

export type FeatureFlags = Record<string, boolean | undefined>;

export interface NavAccess {
  canAccessDashboard: boolean;
  canAccessInteractions: boolean;
  canAccessReports: boolean;
  canAccessIntegrationGuide: boolean;
  canAccessPartners: boolean;
  canAccessApiConsole: boolean;
  canAccessDataQuality: boolean;
  canAccessDataStandards: boolean;
  canAccessInboundIntake: boolean;
}

const STAFF_ROLES: SystemRole[] = ['eso_admin', 'eso_staff', 'eso_coach', 'ecosystem_manager', 'platform_admin'];

export function computeNavAccess(role: SystemRole, flags: FeatureFlags): NavAccess {
  const isStaff = STAFF_ROLES.includes(role);
  const isPrivileged = ['eso_admin', 'ecosystem_manager', 'platform_admin'].includes(role);
  const isPlatformAdmin = role === 'platform_admin';
  const isOn = (flag: string) => flags[flag] !== false;

  return {
    canAccessDashboard: isStaff && isOn('dashboard'),
    canAccessInteractions: isStaff && isOn('interactions'),
    canAccessReports: isStaff && isOn('reports'),
    // Every partner organization needs the integration guide — it is how they
    // connect. Not flag-gated.
    canAccessIntegrationGuide: isStaff,
    // Inviting partners and tracking who has joined is the operator's job.
    canAccessPartners: isPlatformAdmin || role === 'ecosystem_manager',
    // Keys are issued to an organization by its admin.
    canAccessApiConsole: isPlatformAdmin || (isPrivileged && isOn('api_console')),
    // Merging records is a network-operator job, off unless an ecosystem opts in
    // for its ESO admins.
    canAccessDataQuality: isPlatformAdmin || role === 'ecosystem_manager' || (role === 'eso_admin' && flags.data_quality === true),
    // Partners map their fields onto the standard, so staff can read it.
    canAccessDataStandards: isPlatformAdmin || (isStaff && isOn('data_standards')),
    canAccessInboundIntake: isPlatformAdmin || (role === 'ecosystem_manager' && flags.inbound_intake === true),
  };
}
