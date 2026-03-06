
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
import { MyVenturesView } from '../features/portal/MyVenturesView';
import { DemoWalkthrough } from '../features/onboarding/DemoWalkthrough';
import { VentureScoutView } from '../features/scout/VentureScoutView';
import { TodosView } from '../features/todos/TodosView';

// App Shell
import { AppShell } from './AppShell';
import { ViewMode } from './types';

// Ecosystem data for config view (still static for now as it's config)
import { NEW_HAVEN_ECOSYSTEM as DEFAULT_ECO } from '../data/mockData';

const App = () => {
  // Initialize Repositories
  const [repos] = useState(() => new AppRepos());

  const [view, setView] = useState<ViewMode>('dashboard');
  const [dataVersion, setDataVersion] = useState(0); // Used to force refresh when sub-components update data
  
  // User Session
  const [user, setUser] = useState<Person>(repos.people.getAll().find(p => p.system_role === 'eso_admin') || repos.people.getAll()[0]);
  
  // Context Management
  const [currentEcosystemId, setCurrentEcosystemId] = useState<string>(user.memberships?.[0]?.ecosystem_id || DEFAULT_ECO.id);

  // Derive Current Role based on Ecosystem Membership
  const currentMembership = user.memberships?.find(m => m.ecosystem_id === currentEcosystemId);
  const currentRole = currentMembership?.system_role || user.system_role; // Fallback to primary if not found

  // Construct ViewerContext for policy enforcement
  // New: Inject capabilities based on the role
  const viewerContext: ViewerContext = useMemo(() => ({
    personId: user.id,
    orgId: user.organization_id,
    role: currentRole,
    ecosystemId: currentEcosystemId,
    capabilities: getCapabilitiesForRole(currentRole) // Hydrate capabilities from the map
  }), [user.id, user.organization_id, currentRole, currentEcosystemId]);

  // Fetch Scoped Data based on Current Ecosystem AND Permissions
  // Dependent on dataVersion to trigger re-fetch/re-render when data changes
  const organizations = useMemo(() => repos.organizations.getAll(viewerContext, currentEcosystemId), [repos, viewerContext, currentEcosystemId, dataVersion]);
  const people = useMemo(() => repos.people.getAll(currentEcosystemId), [repos, currentEcosystemId, dataVersion]);
  
  // Updated: Use viewer-aware initiative fetching
  const initiatives = useMemo(() => repos.pipelines.getInitiativesForViewer(viewerContext, currentEcosystemId), [repos, viewerContext, currentEcosystemId, dataVersion]);
  
  const interactions = useMemo(() => repos.interactions.getAll(viewerContext, currentEcosystemId), [repos, viewerContext, currentEcosystemId, dataVersion]);
  const pipelines = useMemo(() => repos.pipelines.getPipelines(currentEcosystemId), [repos, currentEcosystemId]);
  const referrals = useMemo(() => repos.referrals.getAll(viewerContext), [repos, viewerContext, dataVersion]);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | undefined>(undefined);
  const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
  const [isSwitchUserOpen, setIsSwitchUserOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(true); // Default to TRUE for Splash Screen on Load

  const navigateToOrg = (id: string) => { setSelectedOrgId(id); setView('detail'); setSelectedTab(undefined); };
  const navigateToPerson = (id: string) => { setSelectedPersonId(id); setView('person_detail'); };
  const refreshData = () => setDataVersion(v => v + 1);

  const currentEcosystem = ALL_ECOSYSTEMS.find(e => e.id === currentEcosystemId) || DEFAULT_ECO;

  return (
    <AppDataProvider repos={repos} viewer={viewerContext}>
      <AppShell
        user={user}
        currentRole={currentRole}
        currentEcosystem={currentEcosystem}
        availableEcosystems={ALL_ECOSYSTEMS.filter(e => user.memberships?.some(m => m.ecosystem_id === e.id))}
        onSwitchEcosystem={setCurrentEcosystemId}
        view={view}
        onNavigate={(v) => { setView(v); setSelectedTab(undefined); }}
        onSwitchUser={() => setIsSwitchUserOpen(true)}
        onStartDemo={() => setShowDemo(true)}
      >
           {view === 'dashboard' && (
               <DashboardView />
           )}
           {view === 'directory' && (
              <DirectoryView 
                organizations={organizations} 
                onSelect={navigateToOrg}
                onAdd={() => setIsAddOrgOpen(true)}
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
               <InitiativesView initiatives={initiatives} organizations={organizations} pipelines={pipelines} />
           )}
           {view === 'pipelines' && (
               <PipelinesView pipelines={pipelines} />
           )}
           {view === 'scout' && (
               <VentureScoutView />
           )}
           {view === 'interactions' && (
               <InteractionsView />
           )}
           {view === 'todos' && (
               <TodosView />
           )}
           {view === 'referrals' && (
                <ReferralsView currentUser={user} />
           )}
           {view === 'reports' && (
                <ReportsView />
           )}
           {view === 'data_quality' && (
               <DataQualityView organizations={organizations} onRefresh={refreshData} />
           )}
           {view === 'data_standards' && (
               <DataStandardsView />
           )}
           {view === 'api_console' && (
               <APIConsoleView />
           )}
           {view === 'ecosystem_config' && (
               <EcosystemConfigView ecosystem={currentEcosystem} />
           )}
           {view === 'metrics_manager' && (
               <MetricsManagerView />
           )}
           {view === 'my_ventures' && (
               <MyVenturesView 
                  person={user} 
                  initiatives={initiatives} 
                  organizations={organizations} 
                  people={people}
                  interactions={interactions}
                  referrals={referrals}
                  onAdvance={() => {}} 
                  onRefresh={refreshData}
                />
           )}
           {view === 'user_management' && (
               <UserManagementView 
                  people={people} 
                  organizations={organizations} 
                  onRefresh={refreshData} 
               />
           )}
           
           {/* Detailed Views */}
           {view === 'detail' && selectedOrgId && (
              <OrganizationDetailView 
                org={organizations.find(o => o.id === selectedOrgId)!} 
                organizations={organizations}
                people={people}
                initiatives={initiatives}
                interactions={interactions}
                referrals={referrals}
                onBack={() => setView('directory')}
                onRefresh={refreshData}
                initialTab={selectedTab}
              />
           )}
           {view === 'person_detail' && selectedPersonId && (
              <PersonDetailView 
                 person={people.find(p => p.id === selectedPersonId)!}
                 organizations={organizations}
                 interactions={interactions}
                 referrals={referrals}
                 onBack={() => setView('contacts')}
                 onLogInteraction={() => {}}
                 onCreateReferral={() => {}}
              />
           )}

           {/* Entrepreneur Specific Routes */}
           {view === 'my_org' && (
              <OrganizationDetailView 
                org={organizations.find(o => o.id === user.organization_id) || organizations[0]} 
                organizations={organizations}
                people={people}
                initiatives={initiatives}
                interactions={interactions}
                referrals={referrals}
                onBack={() => setView('my_ventures')}
                onRefresh={refreshData}
                initialTab={selectedTab}
              />
           )}
           {view === 'my_projects' && (
               <InitiativesView 
                  initiatives={initiatives.filter(i => i.organization_id === user.organization_id)} 
                  organizations={organizations.filter(o => 
                      o.id === user.organization_id || 
                      (user.secondary_profile && o.id === user.secondary_profile.organization_id)
                  )} 
                  pipelines={pipelines} 
               />
           )}
           
           {/* Fallback for other views */}
           {!['dashboard', 'directory', 'detail', 'person_detail', 'contacts', 'pipelines', 'interactions', 'referrals', 'reports', 'data_quality', 'data_standards', 'ecosystem_config', 'my_ventures', 'user_management', 'api_console', 'initiatives', 'scout', 'todos', 'my_org', 'my_projects', 'metrics_manager'].includes(view) && (
              <div className="flex items-center justify-center h-full text-gray-400">
                View "{view}" is under construction.
              </div>
           )}
      </AppShell>

      {/* Demo Tour Component */}
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
           const newUser = repos.people.getAll().find(p => p.system_role === role);
           if (newUser) {
               setUser(newUser);
               if (newUser.memberships?.length > 0) {
                   setCurrentEcosystemId(newUser.memberships[0].ecosystem_id);
               }
           }
        }}
      />

      {/* Modals */}
      <Modal isOpen={isAddOrgOpen} onClose={() => setIsAddOrgOpen(false)} title="Add New Organization">
          <AddOrgForm 
            onSave={(org) => { 
                const newOrg = { ...org, ecosystem_ids: [currentEcosystemId] };
                repos.organizations.add(newOrg);
                refreshData();
                setView('directory'); 
                setIsAddOrgOpen(false); 
            }} 
            onCancel={() => setIsAddOrgOpen(false)} 
          />
      </Modal>

      <Modal isOpen={isSwitchUserOpen} onClose={() => setIsSwitchUserOpen(false)} title="Switch Context (User)">
          <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-4">Select a user to simulate their permissions and view.</p>
              {repos.people.getAll().map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => { 
                        setUser(p); 
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
                      {user.id === p.id && <span className="text-indigo-600 font-bold">Active</span>}
                  </button>
              ))}
          </div>
      </Modal>
    </AppDataProvider>
  );
};

export default App;
