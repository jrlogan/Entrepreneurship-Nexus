
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Organization, 
  Initiative, 
  PipelineDefinition, 
  MetricLog,
  PipelineStage,
  Person,
  Interaction,
  InteractionType,
  SystemRole,
  Referral,
  Ecosystem,
  Service,
  ApiKey,
  EcosystemMembership
} from '../domain/types';
import { ViewerContext } from '../domain/access/policy';
import { getCapabilitiesForRole } from '../domain/access/policy'; // Imported helper
import { 
  ALL_ORGANIZATIONS,
  INITIATIVE_A, 
  INITIATIVE_B, 
  INITIATIVE_C,
  METRIC_LOGS,
  MOCK_PEOPLE,
  MOCK_INTERACTIONS,
  MOCK_REFERRALS,
  NEW_HAVEN_ECOSYSTEM,
  CT_MAKERSPACES_ECOSYSTEM,
  ALL_ECOSYSTEMS,
  NEXUS_ADMIN_ORG,
  MOCK_SERVICES,
  DARKSTAR_MARINE 
} from '../data/mockData';
import { calculatePipelineProgress, calculateDaysBetween, detectDuplicates } from '../domain/logic';

// Repos & Context
import { AppRepos } from '../data/repos';
import { AppDataProvider } from '../data/AppDataContext';
import { setDocument, getDocument } from '../services/firestoreClient';
import { isEmulatorMode } from '../services/firebaseConfig';
import { callHttpFunction } from '../services/httpFunctionClient';

// Shared
import { Modal } from '../shared/ui/Components';

// Features
import { DashboardView } from '../features/dashboard/DashboardView';
import { DirectoryView } from '../features/directory/DirectoryView';
import { OrganizationDetailView } from '../features/directory/OrganizationDetailView';
import { AddOrgForm } from '../features/directory/AddOrgForm';
import { ContactsView } from '../features/people/ContactsView';
import { PersonDetailView } from '../features/people/PersonDetailView';
import { InitiativesView } from '../features/pipelines/InitiativesView';
import { PipelinesView } from '../features/pipelines/PipelinesView';
import { InteractionsView } from '../features/interactions/InteractionsView';
import { ReferralsView } from '../features/referrals/ReferralsView';
import { ReportsView } from '../features/reports/ReportsView';
import { DataQualityView } from '../features/admin/DataQualityView';
import { DataStandardsView } from '../features/admin/DataStandardsView';
import { APIConsoleView } from '../features/admin/APIConsoleView';
import { EcosystemConfigView } from '../features/admin/EcosystemConfigView';
import { UserManagementView } from '../features/admin/UserManagementView';
import { MetricsManagerView } from '../features/admin/MetricsManagerView';
import { InboundIntakeView } from '../features/admin/InboundIntakeView';
import { PlatformAdminView } from '../features/admin/PlatformAdminView';
import { AuthGateView } from '../features/auth/AuthGateView';
import { MyVenturesView } from '../features/portal/MyVenturesView';
import { DemoWalkthrough } from '../features/onboarding/DemoWalkthrough';
import { VentureScoutView } from '../features/scout/VentureScoutView';
import { TodosView } from '../features/todos/TodosView';
import { GrantsView } from '../features/grants/GrantsView';

// App Shell
import { AppShell } from './AppShell';
import { ViewMode } from './types';
import { CONFIG } from './config';
import { useAuthContext } from './AuthProvider';
import type { InviteSummary } from '../domain/auth/invites';
import { resolveSessionPerson } from '../domain/auth/resolveSessionPerson';
import { getActiveOrganizationAffiliations } from '../domain/people/affiliations';
import { isFirebaseEnabled } from '../services/firebaseApp';
import { signOutUser } from '../services/authService';

// Ecosystem data for config view (still static for now as it's config)
import { NEW_HAVEN_ECOSYSTEM as DEFAULT_ECO } from '../data/mockData';

const APP_VIEWS = new Set<ViewMode>([
  'dashboard', 'directory', 'detail', 'pipelines', 'initiatives', 'reports', 'contacts', 'person_detail',
  'my_clients', 'interactions', 'referrals', 'my_ventures', 'user_management', 'api_console', 'data_quality',
  'journey', 'ecosystem_config', 'scout', 'todos', 'my_org', 'my_projects', 'data_standards',
  'metrics_manager', 'my_metrics_tasks', 'inbound_intake', 'grants',
]);

type RouteState = {
  view?: ViewMode;
  orgId?: string | null;
  personId?: string | null;
  tab?: string | undefined;
  ecosystemId?: string | null;
  inviteToken?: string | null;
};

const readRouteFromLocation = (): RouteState => {
  if (typeof window === 'undefined') {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view');
  return {
    view: viewParam && APP_VIEWS.has(viewParam as ViewMode) ? viewParam as ViewMode : undefined,
    orgId: params.get('org'),
    personId: params.get('person'),
    tab: params.get('tab') || undefined,
    ecosystemId: params.get('eco'),
    inviteToken: params.get('invite'),
  };
};

const writeRouteToLocation = (route: RouteState, mode: 'push' | 'replace' = 'push') => {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams();
  if (route.view) params.set('view', route.view);
  if (route.orgId) params.set('org', route.orgId);
  if (route.personId) params.set('person', route.personId);
  if (route.tab) params.set('tab', route.tab);
  if (route.ecosystemId) params.set('eco', route.ecosystemId);
  if (route.inviteToken) params.set('invite', route.inviteToken);

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  if (mode === 'replace') {
    window.history.replaceState(route, '', nextUrl);
  } else {
    window.history.pushState(route, '', nextUrl);
  }
};

const App = () => {
  const { session, setResolvedSession } = useAuthContext();
  const initialRoute = readRouteFromLocation();
  // Initialize Repositories
  const [repos] = useState(() => new AppRepos());

  const [view, setView] = useState<ViewMode>(initialRoute.view || (CONFIG.IS_DEMO_MODE ? 'dashboard' : 'referrals'));
  const [dataVersion, setDataVersion] = useState(0); // Used to force refresh when sub-components update data
  
  // User Session
  const defaultDemoUser = MOCK_PEOPLE.find((person) => person.system_role === 'eso_admin') || MOCK_PEOPLE[0];
  const [demoUser, setDemoUser] = useState<Person>(defaultDemoUser);
  const [resolvedAuthPerson, setResolvedAuthPerson] = useState<Person | null>(null);
  const [isResolvingAuthPerson, setIsResolvingAuthPerson] = useState(false);
  const [hasAttemptedPersonResolution, setHasAttemptedPersonResolution] = useState(false);
  const [pendingInviteToken] = useState<string>(() => {
    if (initialRoute.inviteToken) {
      return initialRoute.inviteToken;
    }
    if (typeof window === 'undefined') {
      return '';
    }
    try {
      return sessionStorage.getItem('pending_invite_token') || '';
    } catch {
      return '';
    }
  });
  const [pendingInviteSummary, setPendingInviteSummary] = useState<InviteSummary | null>(null);

  const shouldRequireAuth = isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE;
  const activeUser = shouldRequireAuth ? resolvedAuthPerson : demoUser;

  useEffect(() => {
    if (!pendingInviteToken) {
      return;
    }
    try {
      sessionStorage.setItem('pending_invite_token', pendingInviteToken);
    } catch {
      // ignore storage failures
    }
  }, [pendingInviteToken]);

  useEffect(() => {
    if (!pendingInviteToken) {
      setPendingInviteSummary(null);
      return;
    }

    let cancelled = false;
    const loadInviteSummary = async () => {
      try {
        const summary = await callHttpFunction<{ token: string }, InviteSummary>('getInviteSummary', { token: pendingInviteToken });
        if (!cancelled) {
          setPendingInviteSummary(summary);
        }
      } catch {
        if (!cancelled) {
          setPendingInviteSummary(null);
        }
      }
    };

    void loadInviteSummary();
    return () => {
      cancelled = true;
    };
  }, [pendingInviteToken]);

  // Onboarding acknowledgment — shown once per entrepreneur per ecosystem
  const [showAcknowledgmentModal, setShowAcknowledgmentModal] = useState(false);
  const [isSubmittingAck, setIsSubmittingAck] = useState(false);

  // Context Management
  const [currentEcosystemId, setCurrentEcosystemId] = useState<string>(initialRoute.ecosystemId || demoUser.memberships?.[0]?.ecosystem_id || DEFAULT_ECO.id);
  const [currentActingOrgId, setCurrentActingOrgId] = useState<string>(() => {
    try { return localStorage.getItem('acting_org_id') || ''; } catch { return ''; }
  });
  const switchActingOrg = React.useCallback((orgId: string) => {
    setCurrentActingOrgId(orgId);
    try { localStorage.setItem('acting_org_id', orgId); } catch { /* ignore */ }
  }, []);
  const activeMemberships = useMemo(() => activeUser?.memberships || [], [activeUser]);
  const currentMembership = activeMemberships.find(m => m.ecosystem_id === currentEcosystemId) || activeMemberships[0] || null;
  const currentRole = currentMembership?.system_role || activeUser?.system_role || 'entrepreneur';
  const activeOrganizationAffiliations = useMemo(
    () => getActiveOrganizationAffiliations(activeUser, currentEcosystemId),
    [activeUser, currentEcosystemId]
  );
  const currentOrgId = currentActingOrgId
    || currentMembership?.organization_id
    || activeOrganizationAffiliations[0]?.organization_id
    || activeUser?.organization_id
    || '';

  useEffect(() => {
    if (!activeUser) {
      return;
    }

    const hasMembershipForCurrentEco = activeUser.memberships?.some((membership) => membership.ecosystem_id === currentEcosystemId);
    if (!hasMembershipForCurrentEco) {
      setCurrentEcosystemId(activeUser.memberships?.[0]?.ecosystem_id || activeUser.ecosystem_id || DEFAULT_ECO.id);
    }
  }, [activeUser, currentEcosystemId]);

  useEffect(() => {
    if (!activeUser) {
      return;
    }

    const isPrivilegedRole = ['platform_admin', 'ecosystem_manager'].includes(currentRole);

    if (activeOrganizationAffiliations.length === 0) {
      if (isPrivilegedRole) {
        return;
      }
      switchActingOrg('');
      return;
    }

    const validOrgIds = new Set(activeOrganizationAffiliations.map((affiliation) => affiliation.organization_id));
    // Privileged roles (platform_admin, ecosystem_manager) can act on behalf of any org in the
    // system — not just their direct affiliations — so trust whatever is stored in localStorage
    // rather than resetting to their primary org on every reload.
    if (!currentActingOrgId || (!isPrivilegedRole && !validOrgIds.has(currentActingOrgId))) {
      // Prefer: primary org → membership org → first affiliation
      const primaryOrgId = activeUser?.organization_id;
      const fallback =
        (primaryOrgId && validOrgIds.has(primaryOrgId) ? primaryOrgId : null)
        ?? (currentMembership?.organization_id && validOrgIds.has(currentMembership.organization_id) ? currentMembership.organization_id : null)
        ?? activeOrganizationAffiliations[0].organization_id;
      switchActingOrg(fallback);
    }
  }, [activeOrganizationAffiliations, activeUser, currentActingOrgId, currentMembership, currentRole, switchActingOrg]);

  useEffect(() => {
    if (CONFIG.IS_DEMO_MODE || !activeUser) {
      return;
    }

    if (currentRole === 'entrepreneur' && view === 'referrals') {
      setView('my_ventures');
      return;
    }

    if (currentRole !== 'entrepreneur' && (view === 'dashboard' || view === 'my_ventures')) {
      setView('referrals');
    }
  }, [activeUser, currentRole, view]);

  const viewerContext: ViewerContext | null = useMemo(() => {
    if (!activeUser) {
      return null;
    }

    return {
      personId: activeUser.id,
      orgId: currentOrgId,
      role: currentRole,
      ecosystemId: currentEcosystemId,
      capabilities: getCapabilitiesForRole(currentRole),
    };
  }, [activeUser, currentOrgId, currentRole, currentEcosystemId]);

  useEffect(() => {
    if (!session.authUser) {
      setIsResolvingAuthPerson(false);
      setResolvedAuthPerson(null);
      return;
    }

    let cancelled = false;

    const syncSessionUser = async () => {
      setIsResolvingAuthPerson(true);
      try {
        const resolvedFirebasePerson = await resolveSessionPerson(session.authUser?.uid, session.authUser?.email);
        if (cancelled) {
          return;
        }

        const fallbackMockPeople = session.authUser?.email
          ? await repos.people.getAll()
          : [];
        const fallbackMockPerson = session.authUser?.email
          ? fallbackMockPeople.find(person => person.email.toLowerCase() === session.authUser.email!.toLowerCase())
          : undefined;

        const matchedUser = resolvedFirebasePerson || fallbackMockPerson;
        setResolvedAuthPerson(matchedUser || null);
        if (matchedUser?.memberships?.length) {
          setCurrentEcosystemId(prev => (
            matchedUser.memberships.some(membership => membership.ecosystem_id === prev)
              ? prev
              : matchedUser.memberships[0].ecosystem_id
          ));
        }

        // Auto-accept any pending invite for already-authenticated users
        if (matchedUser) {
          try {
            if (pendingInviteToken) {
              await callHttpFunction('acceptInvite', { token: pendingInviteToken });
              sessionStorage.removeItem('pending_invite_token');
            }
          } catch { /* non-fatal — invite may already be accepted or expired */ }

          // Show onboarding acknowledgment modal for entrepreneurs who haven't seen it yet
          if (matchedUser.system_role === 'entrepreneur' && !CONFIG.IS_DEMO_MODE) {
            try {
              const effectiveEcosystemId = matchedUser.memberships?.some((membership) => membership.ecosystem_id === currentEcosystemId)
                ? currentEcosystemId
                : (matchedUser.memberships?.[0]?.ecosystem_id || currentEcosystemId || 'default');
              const ackKey = `nexus_ack_${matchedUser.id}_${effectiveEcosystemId}`;
              let alreadyAcked = Boolean(sessionStorage.getItem(ackKey) || localStorage.getItem(ackKey));
              if (!alreadyAcked && isFirebaseEnabled()) {
                const persistedAck = await getDocument<Record<string, unknown>>('consent_events', `ack_${matchedUser.id}_${effectiveEcosystemId}`);
                if (persistedAck) {
                  const acknowledgedAt = typeof persistedAck.timestamp === 'string' ? persistedAck.timestamp : new Date().toISOString();
                  try {
                    sessionStorage.setItem(ackKey, acknowledgedAt);
                    localStorage.setItem(ackKey, acknowledgedAt);
                  } catch { /* ignore storage errors */ }
                  alreadyAcked = true;
                }
              }
              setShowAcknowledgmentModal(!alreadyAcked);
            } catch { /* ignore storage errors */ }
          }
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAuthPerson(false);
          setHasAttemptedPersonResolution(true);
        }
      }
    };

    void syncSessionUser();

    return () => {
      cancelled = true;
    };
  }, [currentEcosystemId, pendingInviteToken, repos, session.authUser]);

  useEffect(() => {
    if (shouldRequireAuth && session.authUser && isResolvingAuthPerson) {
      return;
    }

    setResolvedSession({
      person: activeUser,
      memberships: activeMemberships,
      activeEcosystemId: activeUser ? currentEcosystemId : null,
      activeOrgId: activeUser ? currentOrgId : null,
      viewer: activeUser ? viewerContext : null,
    });
  }, [activeMemberships, activeUser, currentEcosystemId, currentOrgId, isResolvingAuthPerson, session.authUser, setResolvedSession, shouldRequireAuth, viewerContext]);

  // Fetch Scoped Data based on Current Ecosystem AND Permissions
  // Dependent on dataVersion to trigger re-fetch/re-render when data changes
  const [organizations, setOrganizations] = useState<(Organization & { _access: { level: 'basic' | 'detailed', reason: string } })[]>([]);
  const [archivedOrganizations, setArchivedOrganizations] = useState<Organization[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES);

  useEffect(() => {
    setOrganizations([]);
    if (viewerContext) {
      repos.organizations.getAll(viewerContext, currentEcosystemId)
        .then(setOrganizations)
        .catch(() => setOrganizations([]));
      const canSeeArchived = ['platform_admin', 'ecosystem_manager', 'eso_admin'].includes(currentRole);
      if (canSeeArchived && repos.organizations.getArchived) {
        repos.organizations.getArchived(currentEcosystemId)
          .then(setArchivedOrganizations)
          .catch(() => setArchivedOrganizations([]));
      }
    }
  }, [repos, viewerContext, currentEcosystemId, dataVersion, currentRole]);

  useEffect(() => {
    if (viewerContext) {
      repos.people.getAll(currentEcosystemId).then(setPeople);
    }
  }, [repos, viewerContext, currentEcosystemId, dataVersion]);

  useEffect(() => {
    if (viewerContext) {
      repos.pipelines.getInitiativesForViewer(viewerContext, currentEcosystemId).then(setInitiatives);
    }
  }, [repos, viewerContext, currentEcosystemId, dataVersion]);

  useEffect(() => {
    if (viewerContext) {
      repos.interactions.getAll(viewerContext, currentEcosystemId).then(setInteractions);
    }
  }, [repos, viewerContext, currentEcosystemId, dataVersion]);

  useEffect(() => {
    if (shouldRequireAuth && !viewerContext) {
      return;
    }

    repos.pipelines.getPipelines(currentEcosystemId).then(setPipelines).catch((error) => {
      console.error('Failed to load pipelines', error);
    });
  }, [repos, currentEcosystemId, dataVersion, shouldRequireAuth, viewerContext]);

  useEffect(() => {
    if (viewerContext) {
      repos.referrals.getAll(viewerContext).then(setReferrals);
    }
  }, [repos, viewerContext, dataVersion]);

  useEffect(() => {
    if (shouldRequireAuth && !viewerContext) {
      return;
    }

    repos.services.getAll(currentEcosystemId).then(setServices).catch((error) => {
      console.error('Failed to load services', error);
    });
  }, [repos, currentEcosystemId, dataVersion, shouldRequireAuth, viewerContext]);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialRoute.orgId || null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialRoute.personId || null);
  const [selectedTab, setSelectedTab] = useState<string | undefined>(initialRoute.tab);
  const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
  const [addOrgError, setAddOrgError] = useState<string | null>(null);
  const [isSwitchUserOpen, setIsSwitchUserOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(CONFIG.IS_DEMO_MODE);
  const selectedOrganization = selectedOrgId ? organizations.find((organization) => organization.id === selectedOrgId) || null : null;
  const myOrganization = currentOrgId ? organizations.find((organization) => organization.id === currentOrgId) || null : null;
  const actingOrganizations = useMemo(
    () => activeOrganizationAffiliations.map((affiliation) => ({
      ...affiliation,
      name: organizations.find((organization) => organization.id === affiliation.organization_id)?.name || affiliation.organization_id,
    })),
    [activeOrganizationAffiliations, organizations]
  );
  const selectedPerson = selectedPersonId
    ? people.find((person) => person.id === selectedPersonId)
      || (activeUser?.id === selectedPersonId ? activeUser : null)
    : null;

  const applyRoute = (route: RouteState, mode: 'push' | 'replace' = 'push') => {
    if (route.view) setView(route.view);
    setSelectedOrgId(route.orgId ?? null);
    setSelectedPersonId(route.personId ?? null);
    setSelectedTab(route.tab);
    if (route.ecosystemId) {
      setCurrentEcosystemId(route.ecosystemId);
    }
    writeRouteToLocation({
      view: route.view,
      orgId: route.orgId ?? undefined,
      personId: route.personId ?? undefined,
      tab: route.tab,
      ecosystemId: route.ecosystemId ?? currentEcosystemId,
      inviteToken: pendingInviteToken || undefined,
    }, mode);
  };

  const handleNavigate = (nextView: ViewMode) => {
    applyRoute({ view: nextView, ecosystemId: currentEcosystemId }, 'push');
  };

  const navigateToOrg = (id: string, tab?: string) => {
    applyRoute({ view: 'detail', orgId: id, tab, ecosystemId: currentEcosystemId }, 'push');
  };

  const navigateToPerson = (id: string) => {
    applyRoute({ view: 'person_detail', personId: id, ecosystemId: currentEcosystemId }, 'push');
  };
  const refreshData = () => setDataVersion(v => v + 1);

  useEffect(() => {
    const onPopState = () => {
      const route = readRouteFromLocation();
      setView(route.view || (CONFIG.IS_DEMO_MODE ? 'dashboard' : 'referrals'));
      setSelectedOrgId(route.orgId || null);
      setSelectedPersonId(route.personId || null);
      setSelectedTab(route.tab);
      if (route.ecosystemId) {
        setCurrentEcosystemId(route.ecosystemId);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    writeRouteToLocation({
      view,
      orgId: selectedOrgId || undefined,
      personId: selectedPersonId || undefined,
      tab: selectedTab,
      ecosystemId: currentEcosystemId,
      inviteToken: pendingInviteToken || undefined,
    }, 'replace');
  }, [view, selectedOrgId, selectedPersonId, selectedTab, currentEcosystemId, pendingInviteToken]);

  const [ecosystemOverrides, setEcosystemOverrides] = useState<Record<string, Partial<Ecosystem>>>(() => {
    // Seed from localStorage immediately (works in all environments)
    const initial: Record<string, Partial<Ecosystem>> = {};
    ALL_ECOSYSTEMS.forEach(eco => {
      try {
        const raw = localStorage.getItem(`eco_override_${eco.id}`);
        if (raw) initial[eco.id] = JSON.parse(raw);
      } catch {}
    });
    return initial;
  });
  useEffect(() => {
    // Overlay with Firestore data when available (production)
    if (isEmulatorMode) return;
    ALL_ECOSYSTEMS.forEach(eco => {
      getDocument('ecosystems', eco.id).then(doc => {
        if (doc) setEcosystemOverrides(prev => ({ ...prev, [eco.id]: doc as Partial<Ecosystem> }));
      }).catch(() => {});
    });
  }, []);

  const baseEcosystem = ALL_ECOSYSTEMS.find(e => e.id === currentEcosystemId) || DEFAULT_ECO;
  const override = ecosystemOverrides[currentEcosystemId] || {};
  const currentEcosystem: Ecosystem = {
    ...baseEcosystem,
    ...override,
    settings: {
      ...baseEcosystem.settings,
      ...(override.settings || {}),
      // Deep-merge feature_flags so a partial override doesn't wipe base flags
      feature_flags: {
        ...(baseEcosystem.settings.feature_flags || {}),
        ...(override.settings?.feature_flags || {}),
      },
    },
  };
  const featureFlags = currentEcosystem.settings.feature_flags || {};
  const canAccessAdvancedWorkflows = featureFlags.advanced_workflows === true;
  const canAccessDashboard = canAccessAdvancedWorkflows || featureFlags.dashboard === true;
  const canAccessTasksAdvice = canAccessAdvancedWorkflows || featureFlags.tasks_advice === true;
  const canAccessInitiatives = canAccessAdvancedWorkflows || featureFlags.initiatives === true;
  const canAccessProcesses = canAccessAdvancedWorkflows || featureFlags.processes === true;
  const canAccessInteractions = canAccessAdvancedWorkflows || featureFlags.interactions === true;
  const canAccessReports = canAccessAdvancedWorkflows || featureFlags.reports === true;
  const canAccessVentureScout = canAccessAdvancedWorkflows || featureFlags.venture_scout === true;
  const isPlatformAdmin = currentRole === 'platform_admin';
  const canAccessApiConsole = isPlatformAdmin || (['eso_admin', 'ecosystem_manager'].includes(currentRole) && featureFlags.api_console === true);
  const canAccessDataQuality = isPlatformAdmin || (['eso_admin', 'ecosystem_manager'].includes(currentRole) && featureFlags.data_quality === true);
  const canAccessDataStandards = isPlatformAdmin || (['eso_admin', 'ecosystem_manager'].includes(currentRole) && featureFlags.data_standards === true);
  const canAccessMetricsManager = (isPlatformAdmin || currentRole === 'ecosystem_manager') && featureFlags.metrics_manager === true;
  const canAccessInboundIntake = isPlatformAdmin || (currentRole === 'ecosystem_manager' && featureFlags.inbound_intake === true);
  const canAccessGrantLab = featureFlags.grant_lab === true;
  const canAccessPlatformAdmin = isPlatformAdmin;

  useEffect(() => {
    const viewFeatureBlocked =
      (view === 'dashboard' && !canAccessDashboard) ||
      (view === 'todos' && !canAccessTasksAdvice) ||
      (view === 'initiatives' && !canAccessInitiatives) ||
      (view === 'pipelines' && !canAccessProcesses) ||
      (view === 'interactions' && !canAccessInteractions) ||
      (view === 'reports' && !canAccessReports) ||
      (view === 'scout' && !canAccessVentureScout) ||
      (view === 'api_console' && !canAccessApiConsole) ||
      (view === 'data_quality' && !canAccessDataQuality) ||
      (view === 'data_standards' && !canAccessDataStandards) ||
      (view === 'metrics_manager' && !canAccessMetricsManager) ||
      (view === 'inbound_intake' && !canAccessInboundIntake) ||
      (view === 'grants' && !canAccessGrantLab) ||
      (view === 'platform_admin' && !canAccessPlatformAdmin);

    if (viewFeatureBlocked) {
      setView(currentRole === 'entrepreneur' ? 'my_ventures' : 'referrals');
    }
  }, [
    canAccessApiConsole,
    canAccessDashboard,
    canAccessDataQuality,
    canAccessDataStandards,
    canAccessGrantLab,
    canAccessInboundIntake,
    canAccessInteractions,
    canAccessInitiatives,
    canAccessMetricsManager,
    canAccessPlatformAdmin,
    canAccessProcesses,
    canAccessReports,
    canAccessTasksAdvice,
    canAccessVentureScout,
    currentRole,
    view,
  ]);

  const shouldShowAuthLoading = shouldRequireAuth && (
    session.status === 'loading' ||
    (!!session.authUser && isResolvingAuthPerson) ||
    (!!session.authUser && !hasAttemptedPersonResolution)
  );
  const normalizedInviteEmail = pendingInviteSummary?.email?.trim().toLowerCase() || '';
  const normalizedAuthEmail = session.authUser?.email?.trim().toLowerCase() || '';
  const inviteRequiresDifferentAccount = !!pendingInviteToken
    && !!normalizedInviteEmail
    && !!normalizedAuthEmail
    && normalizedInviteEmail !== normalizedAuthEmail;

  if (shouldShowAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="text-lg font-semibold">Loading Entrepreneurship Nexus</div>
          <div className="mt-2 text-sm text-slate-300">Restoring your session and workspace.</div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-400" />
          </div>
        </div>
      </div>
    );
  }

  if (shouldRequireAuth && session.status !== 'authenticated') {
    return (
      <AuthGateView
        status={session.authUser ? 'needs_profile' : 'unauthenticated'}
        authUserEmail={session.authUser?.email}
        authUid={session.authUser?.uid}
        organizations={ALL_ORGANIZATIONS}
        ecosystems={ALL_ECOSYSTEMS}
      />
    );
  }

  if (inviteRequiresDifferentAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Invite Link Detected
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">This invite is for a different account</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            You are currently signed in as <strong className="text-white">{session.authUser?.email}</strong>, but this invitation is for <strong className="text-white">{pendingInviteSummary?.email}</strong>.
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Sign out, then continue with the invited email address to accept the invite.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => { void signOutUser(); }}
            >
              Sign out and continue
            </button>
            <button
              className="rounded border border-white/15 px-4 py-2 font-medium text-slate-200 hover:bg-white/5"
              onClick={() => { window.location.href = '/'; }}
            >
              Stay in current workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeUser || !viewerContext) {
    return null;
  }

  return (
    <AppDataProvider repos={repos} viewer={viewerContext}>
      <AppShell
        user={activeUser}
        actingOrganizationName={myOrganization?.name || null}
        actingOrganizationId={myOrganization?.id || null}
        actingOrganizations={actingOrganizations}
        currentRole={currentRole}
        currentEcosystem={currentEcosystem}
        availableEcosystems={currentRole === 'platform_admin' ? ALL_ECOSYSTEMS : ALL_ECOSYSTEMS.filter(e => activeUser.memberships?.some(m => m.ecosystem_id === e.id))}
        onSwitchEcosystem={(ecosystemId) => applyRoute({
          view,
          orgId: selectedOrgId,
          personId: selectedPersonId,
          tab: selectedTab,
          ecosystemId,
        }, 'push')}
        onSwitchActingOrganization={switchActingOrg}
        onSelectOrganization={navigateToOrg}
        view={view}
        onNavigate={handleNavigate}
        onOpenProfile={() => applyRoute({ view: 'person_detail', personId: activeUser.id, ecosystemId: currentEcosystemId }, 'push')}
        onSwitchUser={() => setIsSwitchUserOpen(true)}
        onStartDemo={() => setShowDemo(true)}
        feedbackContext={{
          personId: activeUser.id,
          personName: `${activeUser.first_name} ${activeUser.last_name}`,
          role: currentRole,
          orgId: currentOrgId,
          orgName: myOrganization?.name,
          ecosystemId: currentEcosystemId,
          currentView: view,
        }}
      >
           {view === 'dashboard' && (
               canAccessDashboard ? (
               <DashboardView ecosystem={currentEcosystem} />
               ) : null
           )}
           {view === 'directory' && (
              <DirectoryView
                organizations={organizations}
                interactions={interactions}
                onSelect={navigateToOrg}
                onAdd={() => setIsAddOrgOpen(true)}
                onRefresh={() => setDataVersion(v => v + 1)}
              />
           )}
           {view === 'contacts' && (
               <ContactsView 
                   people={people} 
                   organizations={organizations} 
                   interactions={interactions}
                   onSelectPerson={navigateToPerson} 
               />
           )}
           {view === 'initiatives' && (
               canAccessInitiatives ? (
               <InitiativesView initiatives={initiatives} organizations={organizations} pipelines={pipelines} currentEcosystem={currentEcosystem} />
               ) : null
           )}
           {view === 'pipelines' && (
               canAccessProcesses ? (
               <PipelinesView pipelines={pipelines} />
               ) : null
           )}
           {view === 'scout' && (
               canAccessVentureScout ? (
               <VentureScoutView />
               ) : null
           )}
           {view === 'interactions' && (
               canAccessInteractions ? (
               <InteractionsView />
               ) : null
           )}
           {view === 'todos' && (
               canAccessTasksAdvice ? (
               <TodosView />
               ) : null
           )}
           {view === 'grants' && (
               canAccessGrantLab ? (
               <GrantsView onLinkToInitiative={(organizationId) => navigateToOrg(organizationId, 'initiatives')} />
               ) : null
           )}
           {view === 'referrals' && (
                <ReferralsView
                  currentUser={activeUser}
                  allReferrals={referrals}
                  organizations={organizations}
                  people={people}
                  onSelectOrganization={navigateToOrg}
                  onSelectPerson={navigateToPerson}
                  onEditMyTemplates={() => applyRoute({ view: 'person_detail', personId: activeUser.id, tab: 'settings', ecosystemId: currentEcosystemId }, 'push')}
                  onRefresh={refreshData}
                />
           )}
           {view === 'reports' && (
               canAccessReports ? (
                <ReportsView />
               ) : null
           )}
           {view === 'data_quality' && (
               canAccessDataQuality ? (
               <DataQualityView organizations={organizations} archivedOrganizations={archivedOrganizations} onRefresh={refreshData} />
               ) : null
           )}
           {view === 'data_standards' && (
               canAccessDataStandards ? (
               <DataStandardsView />
               ) : null
           )}
           {view === 'api_console' && (
               canAccessApiConsole ? (
               <APIConsoleView />
               ) : null
           )}
           {view === 'ecosystem_config' && (
               <EcosystemConfigView
                 ecosystem={currentEcosystem}
                 allEcosystems={ALL_ECOSYSTEMS.map(e => {
                   const ov = ecosystemOverrides[e.id];
                   if (!ov) return e;
                   return { ...e, ...ov, settings: { ...e.settings, ...(ov.settings || {}) } };
                 })}
                 viewerRole={currentRole}
               />
           )}
           {view === 'metrics_manager' && (
               canAccessMetricsManager ? (
               <MetricsManagerView />
               ) : null
           )}
           {view === 'inbound_intake' && (
               canAccessInboundIntake ? (
               <InboundIntakeView />
               ) : null
           )}
           {view === 'platform_admin' && canAccessPlatformAdmin && (
               <PlatformAdminView onNavigate={handleNavigate} />
           )}
           {view === 'my_ventures' && (
               <MyVenturesView 
                  person={activeUser} 
                  initiatives={initiatives} 
                  organizations={organizations} 
                  people={people}
                  interactions={interactions}
                  referrals={referrals}
                  services={services}
                  actingOrgId={currentOrgId}
                  onAdvance={() => {}} 
                  onRefresh={refreshData}
                  onSelectOrganization={navigateToOrg}
                  onCreateOrganization={() => setIsAddOrgOpen(true)}
                  currentEcosystem={currentEcosystem}
                />
           )}
           {view === 'user_management' && (
               <UserManagementView 
                  people={people} 
                  organizations={organizations} 
                  onRefresh={refreshData} 
                  onSelectPerson={navigateToPerson}
                  onSelectOrganization={(orgId) => navigateToOrg(orgId)}
               />
           )}
           
           {/* Detailed Views */}
           {view === 'detail' && selectedOrganization && (
              <OrganizationDetailView
                org={selectedOrganization}
                organizations={organizations}
                people={people}
                initiatives={initiatives}
                interactions={interactions}
                referrals={referrals}
                services={services}
                currentEcosystem={currentEcosystem}
                onBack={() => applyRoute({ view: 'directory', ecosystemId: currentEcosystemId }, 'push')}
                onRefresh={refreshData}
                initialTab={selectedTab}
                onTabChange={(tab) => applyRoute({ view: 'detail', orgId: selectedOrgId, tab, ecosystemId: currentEcosystemId }, 'push')}
                onSelectPerson={navigateToPerson}
                onSelectOrganization={navigateToOrg}
                onNavigateToReferrals={() => applyRoute({ view: 'referrals', ecosystemId: currentEcosystemId }, 'push')}
              />
           )}
           {view === 'person_detail' && selectedPerson && (
              <PersonDetailView 
                 person={selectedPerson}
                 organizations={organizations}
                 interactions={interactions}
                 referrals={referrals}
                 services={services}
                 onBack={() => applyRoute({ view: 'contacts', ecosystemId: currentEcosystemId }, 'push')}
                 initialTab={(selectedTab as 'associations' | 'interactions' | 'referrals' | 'participation' | undefined) || 'associations'}
                 onTabChange={(tab) => applyRoute({ view: 'person_detail', personId: selectedPersonId, tab, ecosystemId: currentEcosystemId }, 'push')}
                 onSelectOrganization={(orgId) => navigateToOrg(orgId)}
                 onRefresh={refreshData}
                 onLogInteraction={() => {}}
                 onCreateReferral={() => {}}
              />
           )}
           {view === 'person_detail' && selectedPersonId && !selectedPerson && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-900">
                That person is not available in the current ecosystem view or no longer exists.
              </div>
           )}

           {/* Entrepreneur Specific Routes */}
           {view === 'my_org' && myOrganization && (
              <OrganizationDetailView 
                org={myOrganization} 
                organizations={organizations}
                people={people}
                initiatives={initiatives}
                interactions={interactions}
                referrals={referrals}
                services={services}
                currentEcosystem={currentEcosystem}
                onBack={() => applyRoute({ view: 'my_ventures', ecosystemId: currentEcosystemId }, 'push')}
                onRefresh={refreshData}
                initialTab={selectedTab}
                onTabChange={(tab) => applyRoute({ view: 'my_org', tab, ecosystemId: currentEcosystemId }, 'push')}
                onSelectPerson={navigateToPerson}
                onSelectOrganization={navigateToOrg}
              />
           )}
           {view === 'my_org' && !myOrganization && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-900">
                Your account does not currently have a primary organization linked in this ecosystem yet.
              </div>
           )}
           {view === 'my_projects' && (
               <InitiativesView 
                  initiatives={initiatives.filter(i => i.organization_id === currentOrgId)} 
                  organizations={organizations.filter(o => 
                      o.id === currentOrgId || 
                      (activeUser.secondary_profile && o.id === activeUser.secondary_profile.organization_id)
                  )} 
                  pipelines={pipelines}
                  currentEcosystem={currentEcosystem}
               />
           )}
           
           {/* Fallback for other views */}
           {!['dashboard', 'directory', 'detail', 'person_detail', 'contacts', 'pipelines', 'interactions', 'referrals', 'reports', 'data_quality', 'data_standards', 'ecosystem_config', 'my_ventures', 'user_management', 'api_console', 'initiatives', 'scout', 'todos', 'my_org', 'my_projects', 'metrics_manager', 'inbound_intake', 'platform_admin'].includes(view) && (
              <div className="flex items-center justify-center h-full text-gray-400">
                View "{view}" is under construction.
              </div>
           )}
      </AppShell>

      {/* Onboarding Data-Sharing Acknowledgment */}
      {showAcknowledgmentModal && activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900">Welcome to {currentEcosystem?.name || 'Entrepreneurship Nexus'}</h2>
              <p className="mt-1 text-sm text-gray-500">A quick note about your data and privacy</p>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
              <p>When you work with organizations in this ecosystem, they may record interactions, referrals, and notes related to your business. Here's what you should know:</p>
              <ul className="space-y-2 pl-4">
                <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span><span><strong>Basic profile</strong> — your name, business, and contact info are visible to organizations you work with in this ecosystem.</span></li>
                <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span><span><strong>Interaction records</strong> — each organization only sees their own notes and activity with you by default.</span></li>
                <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span><span><strong>Cross-organization sharing</strong> — you control whether partner organizations can see each other's records. You'll be asked to approve any such requests.</span></li>
                <li className="flex gap-2"><span className="text-indigo-500 font-bold">•</span><span><strong>Your rights</strong> — you can review all sharing activity and request data removal at any time from your business privacy settings.</span></li>
              </ul>
              <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">By continuing, you acknowledge that organizations in this ecosystem may record interactions with your business as described above.</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                disabled={isSubmittingAck}
                onClick={async () => {
                  setIsSubmittingAck(true);
                  try {
                    await callHttpFunction('recordOnboardingAcknowledgment', {
                      ecosystem_id: currentEcosystemId,
                      organization_id: currentOrgId || activeUser.organization_id || undefined,
                    });
                    const ackKey = `nexus_ack_${activeUser.id}_${currentEcosystemId}`;
                    try {
                      const now = new Date().toISOString();
                      sessionStorage.setItem(ackKey, now);
                      localStorage.setItem(ackKey, now);
                    } catch { /* ignore */ }
                  } catch { /* non-fatal */ }
                  setIsSubmittingAck(false);
                  setShowAcknowledgmentModal(false);
                }}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmittingAck ? 'Saving…' : 'I understand, continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Tour Component */}
      {CONFIG.IS_DEMO_MODE && (
        <DemoWalkthrough 
          isOpen={showDemo} 
          onClose={() => setShowDemo(false)} 
          onNavigate={(targetView, targetId, targetTab) => {
              setView(targetView);
              setSelectedTab(targetTab);
              if (targetView === 'detail' && targetId) {
                  setSelectedOrgId(targetId);
              }
          }}
          onSwitchUser={(role) => {
             const newUser = MOCK_PEOPLE.find(p => p.system_role === role);
             if (newUser) {
                 setDemoUser(newUser);
                 if (newUser.memberships?.length > 0) {
                     setCurrentEcosystemId(newUser.memberships[0].ecosystem_id);
                 }
             }
          }}
        />
      )}

      {/* Modals */}
      <Modal isOpen={isAddOrgOpen} onClose={() => { setIsAddOrgOpen(false); setAddOrgError(null); }} title="Add New Organization">
          <AddOrgForm
            saveError={addOrgError}
            onSave={async (org, esoDomains) => {
                setAddOrgError(null);
                try {
                const newOrg = { ...org, ecosystem_ids: [currentEcosystemId] };
                await repos.organizations.add(newOrg);

                if (newOrg.roles.includes('eso') && esoDomains.length > 0) {
                    const now = new Date().toISOString();
                    await Promise.all(esoDomains.flatMap(domain => [
                        setDocument('authorized_sender_domains', `asd_${newOrg.id}_${domain.replace(/\./g, '_')}`, {
                            id: `asd_${newOrg.id}_${domain.replace(/\./g, '_')}`,
                            ecosystem_id: currentEcosystemId,
                            organization_id: newOrg.id,
                            domain,
                            is_active: true,
                            access_policy: 'approved',
                            allow_sender_affiliation: true,
                            allow_auto_acknowledgement: true,
                            allow_invite_prompt: true,
                            created_at: now,
                        }),
                        setDocument('organization_aliases', `alias_${domain.replace(/\./g, '_')}`, {
                            id: `alias_${domain.replace(/\./g, '_')}`,
                            organization_id: newOrg.id,
                            domain,
                            created_at: now,
                        }),
                    ]));
                }

                if (activeUser && currentRole === 'entrepreneur') {
                    const existingAffiliations = getActiveOrganizationAffiliations(activeUser, currentEcosystemId);
                    const alreadyLinked = existingAffiliations.some((affiliation) => affiliation.organization_id === newOrg.id);
                    if (!alreadyLinked) {
                        await repos.people.update(activeUser.id, {
                            organization_id: activeUser.organization_id || newOrg.id,
                            organization_affiliations: [
                                ...(activeUser.organization_affiliations || []),
                                {
                                    organization_id: newOrg.id,
                                    role_title: 'Founder',
                                    relationship_type: 'founder',
                                    status: 'active',
                                    can_self_manage: true,
                                    ecosystem_ids: [currentEcosystemId],
                                    joined_at: new Date().toISOString(),
                                }
                            ]
                        });
                    }
                    switchActingOrg(newOrg.id);
                    applyRoute({ view: 'my_ventures', ecosystemId: currentEcosystemId }, 'push');
                } else {
                    setView('directory');
                }

                refreshData();
                setIsAddOrgOpen(false);
                setAddOrgError(null);
                } catch (err: any) {
                    setAddOrgError(err?.message || 'Failed to save organization. Check your permissions.');
                }
            }}
            onCancel={() => { setIsAddOrgOpen(false); setAddOrgError(null); }}
          />
      </Modal>

      {CONFIG.IS_DEMO_MODE && (
        <Modal isOpen={isSwitchUserOpen} onClose={() => setIsSwitchUserOpen(false)} title="Switch Context (User)">
            <div className="space-y-2">
                <p className="text-sm text-gray-500 mb-4">Select a user to simulate their permissions and view.</p>
                {MOCK_PEOPLE.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => { 
                          setDemoUser(p); 
                          if (p.memberships?.length > 0) {
                              setCurrentEcosystemId(p.memberships[0].ecosystem_id);
                          }
                          setIsSwitchUserOpen(false); 
                      }}
                      className="w-full text-left p-3 hover:bg-gray-100 rounded border border-gray-200 flex items-center justify-between group"
                    >
                        <div>
                            <div className="font-medium text-gray-900">{p.first_name} {p.last_name}</div>
                            <div className="text-xs text-gray-500">{p.system_role}</div>
                        </div>
                        {demoUser.id === p.id && <span className="text-indigo-600 font-bold">Active</span>}
                    </button>
                ))}
            </div>
        </Modal>
      )}
    </AppDataProvider>
  );
};

export default App;
