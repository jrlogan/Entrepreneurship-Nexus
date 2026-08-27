import type { SystemRole } from '../types';

/**
 * Single source of truth for feature-flag / role gating of app views.
 *
 * This logic previously existed as four hand-synced copies (App.tsx,
 * AppShell.tsx, a demo-mode literal, and an inlined copy in
 * navAccess.test.ts) which had already drifted. App, shell, and tests all
 * import this function now.
 *
 * Principle: platform admins always see system views (they configure the
 * flags — flags gate other roles only).
 */

export type FeatureFlags = Record<string, boolean | undefined>;

export interface NavAccess {
  showMvpEsoNav: boolean;
  canAccessDashboard: boolean;
  canAccessTasksAdvice: boolean;
  canAccessInitiatives: boolean;
  canAccessProcesses: boolean;
  canAccessInteractions: boolean;
  canAccessReports: boolean;
  canAccessVentureScout: boolean;
  canAccessApiConsole: boolean;
  canAccessDataQuality: boolean;
  canAccessDataStandards: boolean;
  canAccessMetricsManager: boolean;
  canAccessInboundIntake: boolean;
  canAccessGrantLab: boolean;
  canAccessCommunityCalendar: boolean;
}

export function computeNavAccess(role: SystemRole, flags: FeatureFlags, isMvpMode = true): NavAccess {
  const isClient = role === 'entrepreneur';
  const isPrivileged = ['eso_admin', 'ecosystem_manager', 'platform_admin'].includes(role);
  const isSuper = ['platform_admin', 'ecosystem_manager'].includes(role);
  const isPlatformAdmin = role === 'platform_admin';

  const canAccessAdvancedWorkflows = flags.advanced_workflows === true;
  const canAccessDashboard = canAccessAdvancedWorkflows || flags.dashboard === true;
  const canAccessTasksAdvice = canAccessAdvancedWorkflows || flags.tasks_advice === true;
  const canAccessInitiatives = canAccessAdvancedWorkflows || flags.initiatives === true;
  const canAccessProcesses = canAccessAdvancedWorkflows || flags.processes === true;
  const canAccessInteractions = canAccessAdvancedWorkflows || flags.interactions === true;
  const canAccessReports = canAccessAdvancedWorkflows || flags.reports === true;
  const canAccessVentureScout = canAccessAdvancedWorkflows || flags.venture_scout === true;

  const hasAnyWorkflowFeature = canAccessDashboard || canAccessTasksAdvice || canAccessInitiatives ||
    canAccessProcesses || canAccessInteractions || canAccessReports || canAccessVentureScout;
  // In MVP mode show the simplified nav — unless feature flags have unlocked specific workflow views.
  const showMvpEsoNav = isMvpMode && !isClient && !hasAnyWorkflowFeature;

  const canAccessApiConsole = isPlatformAdmin || (isPrivileged && flags.api_console === true);
  const canAccessDataQuality = isPlatformAdmin || (isPrivileged && flags.data_quality === true);
  const canAccessDataStandards = isPlatformAdmin || (isPrivileged && flags.data_standards === true);
  const canAccessMetricsManager = isPlatformAdmin || (isSuper && flags.metrics_manager === true);
  const canAccessInboundIntake = isPlatformAdmin || (role === 'ecosystem_manager' && flags.inbound_intake === true);
  // Platform admins can reach optional modules an ecosystem has not configured
  // yet (flag absent) — but an EXPLICIT false is a deliberate "this ecosystem
  // does not run this module" and hides it from everyone, admins included.
  // Without that distinction a deployment that switches a module off still
  // shows it to its own operators, which is how "disabled" features leak back
  // into demos and screenshots.
  const canAccessGrantLab =
    flags.grant_lab === true || (isPlatformAdmin && flags.grant_lab !== false);
  const canAccessCommunityCalendar =
    flags.community_calendar === true || (isPlatformAdmin && flags.community_calendar !== false);

  return {
    showMvpEsoNav,
    canAccessDashboard,
    canAccessTasksAdvice,
    canAccessInitiatives,
    canAccessProcesses,
    canAccessInteractions,
    canAccessReports,
    canAccessVentureScout,
    canAccessApiConsole,
    canAccessDataQuality,
    canAccessDataStandards,
    canAccessMetricsManager,
    canAccessInboundIntake,
    canAccessGrantLab,
    canAccessCommunityCalendar,
  };
}
