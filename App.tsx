
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
  ApiKey
} from './types';
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
  MOCK_SERVICES
} from './data';
import { calculatePipelineProgress, calculateDaysBetween, detectDuplicates } from './utils';

// --- Types ---
type ViewMode = 'dashboard' | 'directory' | 'detail' | 'pipelines' | 'initiatives' | 'reports' | 'contacts' | 'person_detail' | 'my_clients' | 'interactions' | 'referrals' | 'my_ventures' | 'user_management' | 'api_console' | 'data_quality' | 'journey' | 'ecosystem_config';

interface SidebarItemProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  textColor: string;
  iconColor: string;
  hoverClass: string;
}

interface SidebarTheme {
  sidebarBg: string;
  sidebarBorder: string;
  headerTitle: string;
  headerSub: string;
  footerBg: string;
  footerBorder: string;
  itemText: string;
  itemIcon: string;
  itemHover: string;
  contextLabel: string; // Label for the badge in footer
  contextColor: string; // Color for the badge in footer
}

// --- Constants & Styles ---
const generateId = (prefix: string) => `${prefix}_${Date.now().toString(36)}`;

const FORM_LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1";
const FORM_INPUT_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";
const FORM_SELECT_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";
const FORM_TEXTAREA_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";

// --- Themes ---
const THEMES = {
  default: { // ESO Admin, Staff
    sidebarBg: 'bg-slate-900',
    sidebarBorder: 'border-slate-800',
    headerTitle: 'text-indigo-500',
    headerSub: 'text-slate-500',
    footerBg: 'bg-slate-800',
    footerBorder: 'border-slate-700',
    itemText: 'text-slate-400',
    itemIcon: 'text-indigo-400',
    itemHover: 'hover:bg-white/5',
    contextLabel: 'ESO View',
    contextColor: 'bg-indigo-600'
  },
  entrepreneur: { // Client / Founder
    sidebarBg: 'bg-indigo-900',
    sidebarBorder: 'border-indigo-800',
    headerTitle: 'text-white',
    headerSub: 'text-indigo-300',
    footerBg: 'bg-indigo-800',
    footerBorder: 'border-indigo-700',
    itemText: 'text-indigo-200',
    itemIcon: 'text-indigo-300',
    itemHover: 'hover:bg-white/10',
    contextLabel: 'Client Portal',
    contextColor: 'bg-white/20'
  },
  admin: { // System Admin
    sidebarBg: 'bg-zinc-900',
    sidebarBorder: 'border-zinc-800',
    headerTitle: 'text-emerald-500',
    headerSub: 'text-zinc-500',
    footerBg: 'bg-black',
    footerBorder: 'border-zinc-800',
    itemText: 'text-zinc-400',
    itemIcon: 'text-emerald-600',
    itemHover: 'hover:bg-zinc-800',
    contextLabel: 'System Admin',
    contextColor: 'bg-emerald-700'
  }
};

const getTheme = (role: SystemRole): SidebarTheme => {
  if (role === 'entrepreneur') return THEMES.entrepreneur;
  if (role === 'platform_admin' || role === 'ecosystem_manager') return THEMES.admin;
  return THEMES.default;
};

// --- Helpers ---
const canManageUsers = (user: Person) => ['eso_admin', 'ecosystem_manager', 'platform_admin'].includes(user.system_role);
const canManageAllUsers = (user: Person) => ['ecosystem_manager', 'platform_admin'].includes(user.system_role);
const isSystemAdmin = (user: Person) => ['platform_admin', 'ecosystem_manager'].includes(user.system_role);
const isEntrepreneur = (user: Person) => user.system_role === 'entrepreneur';

// --- UI Components ---

interface CardProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, children, className = '', action }) => (
  <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-lg flex justify-between items-center">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {action && <div>{action}</div>}
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

interface BadgeProps {
  children?: React.ReactNode;
  color?: string;
}

const Badge: React.FC<BadgeProps> = ({ children, color = 'blue' }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    gray: 'bg-gray-100 text-gray-800',
    red: 'bg-red-100 text-red-800',
    indigo: 'bg-indigo-100 text-indigo-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

const SidebarItem: React.FC<SidebarItemProps> = ({ active, onClick, label, icon, textColor, iconColor, hoverClass }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 transition-colors ${
      active ? 'bg-white/10 text-white' : `${textColor} ${hoverClass} hover:text-white`
    }`}
  >
    <div className={`flex-shrink-0 ${active ? 'text-white' : iconColor}`}>{icon}</div>
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 m-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const DemoWarningBanner = () => (
  <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-1 text-center text-xs font-bold tracking-wide shadow-md">
    ⚠ DEMO ENVIRONMENT: All data is temporary and will reset upon page reload.
  </div>
);

// --- Demo Walkthrough System ---

interface DemoStep {
  title: string;
  description: string;
  targetView: ViewMode;
  targetUserRole?: SystemRole;
  highlight?: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    title: "Welcome to Entrepreneurship Nexus",
    description: "This platform is an API-first 'System of Systems' designed to connect nonprofits, funders, and entrepreneurs. This tour demonstrates core capabilities.",
    targetView: 'dashboard',
    targetUserRole: 'eso_admin'
  },
  {
    title: "Organization Directory & Data Standards",
    description: "Navigate to an organization to see how we standardize data (HSDS/NAICS) and allow granular privacy controls. Notice external IDs from Salesforce/HubSpot.",
    targetView: 'directory',
    targetUserRole: 'eso_admin'
  },
  {
    title: "Initiative Tracking",
    description: "This view shows active projects across the ecosystem. Whether it's a startup developing a hardware product or a business expanding real estate, we track it against stage-gate pipelines.",
    targetView: 'initiatives',
    targetUserRole: 'eso_admin'
  },
  {
    title: "Switching to Entrepreneur View",
    description: "We have now temporarily switched your user role to 'Sarah Connor' (Entrepreneur) to demonstrate the Client Portal. Notice how the sidebar changes color to confirm your new context.",
    targetView: 'my_ventures',
    targetUserRole: 'entrepreneur'
  },
  {
    title: "My Ventures & Client Portal",
    description: "Sarah sees a focused view of her specific initiatives. She can self-report progress and access ecosystem resources without ESO staff intervention.",
    targetView: 'my_ventures',
    targetUserRole: 'entrepreneur'
  },
  {
    title: "Data Quality & Global ID",
    description: "Switching to Admin view: To prevent the '5 records for 1 person' nightmare, we use fuzzy matching to assign Global IDs across the network, flagging potential duplicates for merge.",
    targetView: 'data_quality',
    targetUserRole: 'platform_admin'
  },
  {
    title: "API & Integration Console",
    description: "Developers can manage API keys and webhooks here, enabling data synchronization between the platform and tools like AirTable, Salesforce, or Google Sheets.",
    targetView: 'api_console',
    targetUserRole: 'platform_admin'
  }
];

const DemoWalkthrough = ({ 
  isOpen, 
  onClose, 
  onNavigate, 
  onSwitchUser 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onNavigate: (view: ViewMode) => void,
  onSwitchUser: (role: SystemRole) => void
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const step = DEMO_STEPS[currentStepIndex];
      // Execute the navigation/role switch for the current step
      if (step.targetUserRole) {
        onSwitchUser(step.targetUserRole);
      }
      onNavigate(step.targetView);
    }
  }, [currentStepIndex, isOpen]);

  if (!isOpen) return null;

  const step = DEMO_STEPS[currentStepIndex];
  const isLast = currentStepIndex === DEMO_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
      setCurrentStepIndex(0);
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStepIndex(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none p-4 sm:p-6">
      {/* Floating Card at bottom right - No full screen block */}
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl pointer-events-auto border-2 border-indigo-600 overflow-hidden relative transform transition-all animate-in fade-in slide-in-from-right-8 duration-300">
        {/* Header with Progress */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded">DEMO TOUR</div>
            <span className="text-sm font-medium text-slate-300">Step {currentStepIndex + 1} of {DEMO_STEPS.length}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <span className="sr-only">Close</span>
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <button 
            onClick={handlePrev} 
            disabled={currentStepIndex === 0}
            className={`text-sm font-medium px-4 py-2 rounded-md transition-colors ${currentStepIndex === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            Previous
          </button>
          
          <div className="flex gap-1">
             {DEMO_STEPS.map((_, i) => (
               <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentStepIndex ? 'bg-indigo-600' : 'bg-gray-300'}`} />
             ))}
          </div>

          <button 
            onClick={handleNext}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-6 py-2 rounded-md shadow-sm transition-transform active:scale-95"
          >
            {isLast ? "Finish Tour" : "Next Step →"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Forms ---

const AddOrgForm = ({ onSave, onCancel }: { onSave: (org: Organization) => void, onCancel: () => void }) => {
  const [name, setName] = useState('');
  return (
    <div className="space-y-4">
      <div>
        <label className={FORM_LABEL_CLASS}>Organization Name</label>
        <input className={FORM_INPUT_CLASS} value={name} onChange={e => setName(e.target.value)} placeholder="Enter name..." required />
      </div>
      <div className="flex justify-end space-x-3">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave({ 
            id: generateId('org'), 
            name: name || 'New Org', 
            description: 'New Description', 
            tax_status: 'for_profit', 
            roles: ['startup'], 
            demographics: { minority_owned: false, woman_owned: false, veteran_owned: false }, 
            classification: { industry_tags: [] }, 
            external_refs: [], 
            managed_by_ids: [], 
            visibility: 'public', 
            consents: [], 
            authorized_eso_ids: [] 
          })} 
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">Add Organization</button>
      </div>
    </div>
  );
};

// --- Views ---

const DashboardView = ({ organizations, people, interactions, initiatives }: { organizations: Organization[], people: Person[], interactions: Interaction[], initiatives: Initiative[] }) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm font-medium text-gray-500 uppercase">Organizations</div>
                    <div className="mt-2 text-3xl font-bold text-indigo-600">{organizations.length}</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm font-medium text-gray-500 uppercase">People</div>
                    <div className="mt-2 text-3xl font-bold text-green-600">{people.length}</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm font-medium text-gray-500 uppercase">Interactions</div>
                    <div className="mt-2 text-3xl font-bold text-blue-600">{interactions.length}</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <div className="text-sm font-medium text-gray-500 uppercase">Active Projects</div>
                    <div className="mt-2 text-3xl font-bold text-purple-600">{initiatives.filter(i => i.status === 'active').length}</div>
                </div>
            </div>
            
            <Card title="Recent Network Activity">
                <div className="space-y-4">
                    {interactions.slice(0, 5).map(int => (
                        <div key={int.id} className="flex items-start pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                {int.type[0].toUpperCase()}
                            </div>
                            <div className="ml-4">
                                <p className="text-sm text-gray-900 font-medium">
                                    {int.notes.length > 80 ? int.notes.substring(0, 80) + '...' : int.notes}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {int.date} • {organizations.find(o => o.id === int.organization_id)?.name} • Recorded by {int.recorded_by}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

const InitiativesView = ({ initiatives, organizations, pipelines }: { initiatives: Initiative[], organizations: Organization[], pipelines: PipelineDefinition[] }) => {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Initiatives & Projects</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">New Initiative</button>
            </div>
            
            <div className="grid gap-4">
                {initiatives.map(init => {
                    const org = organizations.find(o => o.id === init.organization_id);
                    const pipeline = pipelines.find(p => p.id === init.pipeline_id);
                    const currentStage = pipeline?.stages[init.current_stage_index];
                    const progress = pipeline ? calculatePipelineProgress(init, pipeline) : 0;
                    
                    return (
                        <Card key={init.id} title={init.name}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div>
                                    <div className="text-sm text-gray-600 mb-1">
                                        Organization: <span className="font-semibold text-gray-900">{org?.name}</span>
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        Pipeline: {pipeline?.name}
                                    </div>
                                </div>
                                <Badge color={init.status === 'active' ? 'green' : 'gray'}>{init.status.toUpperCase()}</Badge>
                            </div>
                            
                            <div className="mb-2 flex justify-between text-xs text-gray-500 uppercase font-bold">
                                <span>Current Stage: {currentStage?.name}</span>
                                <span>{progress}% Complete</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-gray-50 flex justify-end gap-2">
                                <button className="text-sm text-indigo-600 font-medium hover:underline">Update Stage</button>
                                <span className="text-gray-300">|</span>
                                <button className="text-sm text-gray-600 hover:text-gray-900">View History</button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

const ContactsView = ({ people, organizations, onSelectPerson }: { people: Person[], organizations: Organization[], onSelectPerson: (id: string) => void }) => {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">People</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Add Person</button>
            </div>
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">System Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Links</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {people.map(person => (
                            <tr 
                                key={person.id} 
                                onClick={() => onSelectPerson(person.id)}
                                className="hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                            {person.first_name[0]}{person.last_name[0]}
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-indigo-600">{person.first_name} {person.last_name}</div>
                                            <div className="text-xs text-gray-500">{person.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{person.role}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {organizations.find(o => o.id === person.organization_id)?.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <Badge color="gray">{person.system_role.replace('_', ' ')}</Badge>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex gap-2">
                                    {person.links?.map((l, i) => (
                                        <span key={i} title={l.platform} className="text-gray-400 hover:text-indigo-600">
                                            {l.platform === 'linkedin' && 'IN'}
                                            {l.platform === 'twitter' && 'TW'}
                                            {l.platform === 'website' && 'WWW'}
                                        </span>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PipelinesView = ({ pipelines }: { pipelines: PipelineDefinition[] }) => {
    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Ecosystem Pipelines</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">New Pipeline</button>
            </div>
            <div className="grid gap-6">
                {pipelines.map(pipeline => (
                    <Card key={pipeline.id} title={pipeline.name}>
                        <div className="mb-4">
                            <span className="text-xs font-bold text-gray-500 uppercase mr-2">Context:</span>
                            <Badge color="purple">{pipeline.context}</Badge>
                        </div>
                        <div className="relative">
                            <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gray-200"></div>
                            <div className="space-y-6">
                                {pipeline.stages.map((stage, idx) => (
                                    <div key={stage.id} className="relative pl-10">
                                        <div className="absolute left-2.5 top-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full transform -translate-x-1/2"></div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">Stage {idx + 1}: {stage.name}</h4>
                                            <p className="text-sm text-gray-500 mt-1">{stage.description}</p>
                                            {stage.criteria && (
                                                <ul className="mt-2 space-y-1">
                                                    {stage.criteria.map((c, i) => (
                                                        <li key={i} className="text-xs text-gray-500 flex items-center">
                                                            <span className="mr-2 text-green-500">✓</span> {c}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const InteractionsView = ({ interactions, organizations }: { interactions: Interaction[], organizations: Organization[] }) => {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Interactions Log</h2>
                <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Log Interaction</button>
            </div>
            <div className="bg-white shadow-sm rounded-lg border border-gray-200">
                {interactions.map((int, idx) => (
                    <div key={int.id} className={`p-4 ${idx !== interactions.length -1 ? 'border-b border-gray-100' : ''}`}>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                <Badge color={int.type === 'meeting' ? 'blue' : int.type === 'email' ? 'gray' : 'yellow'}>{int.type}</Badge>
                                <span className="font-medium text-gray-900">{organizations.find(o => o.id === int.organization_id)?.name}</span>
                            </div>
                            <span className="text-sm text-gray-500">{int.date}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{int.notes}</p>
                        <div className="mt-2 flex gap-4 text-xs text-gray-500">
                             <span>Recorded by: {int.recorded_by}</span>
                             <span>Attendees: {int.attendees?.join(', ')}</span>
                             <span>Visibility: {int.visibility}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ReferralsView = ({ referrals, organizations, people }: { referrals: Referral[], organizations: Organization[], people: Person[] }) => {
    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-gray-800">Referrals</h2>
                 <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">New Referral</button>
             </div>
             <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {referrals.map(ref => {
                            const subjectPerson = people.find(p => p.id === ref.subject_person_id);
                            return (
                                <tr key={ref.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm text-gray-900">{organizations.find(o => o.id === ref.referring_org_id)?.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{organizations.find(o => o.id === ref.receiving_org_id)?.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{subjectPerson ? `${subjectPerson.first_name} ${subjectPerson.last_name}` : 'Unknown'}</td>
                                    <td className="px-6 py-4"><Badge color={ref.status === 'pending' ? 'yellow' : ref.status === 'accepted' ? 'green' : 'red'}>{ref.status}</Badge></td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{ref.date}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
             </div>
        </div>
    );
};

const DataQualityView = ({ organizations }: { organizations: Organization[] }) => {
    const duplicates = useMemo(() => detectDuplicates(organizations), [organizations]);
    
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Data Quality & Deduplication</h2>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-gray-800">Potential Duplicates Detected</h3>
                    <Badge color={duplicates.length > 0 ? 'red' : 'green'}>{duplicates.length} Issues Found</Badge>
                </div>
                {duplicates.length === 0 ? (
                     <p className="text-green-600 text-sm">✓ No duplicate organizations found in the current dataset.</p>
                ) : (
                    <div className="space-y-4">
                        {duplicates.map((match, i) => {
                            const orgA = organizations.find(o => o.id === match.primary_id);
                            const orgB = organizations.find(o => o.id === match.duplicate_id);
                            if (!orgA || !orgB) return null;
                            return (
                                <div key={i} className="border border-red-200 bg-red-50 p-4 rounded-lg flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-red-900 flex items-center gap-2">
                                            {orgA.name} <span className="text-red-400">vs</span> {orgB.name}
                                        </div>
                                        <div className="text-xs text-red-700 mt-1">
                                            Confidence: {match.confidence_score}% • Reasons: {match.match_reason.join(', ')}
                                        </div>
                                    </div>
                                    <button className="px-3 py-1 bg-white border border-red-300 text-red-700 text-xs font-bold rounded shadow-sm hover:bg-red-100">
                                        Review Merge
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const APIConsoleView = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">API & Integrations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Your API Keys">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded">
                            <div>
                                <div className="font-mono text-sm font-bold text-gray-800">sk_live_...9382</div>
                                <div className="text-xs text-gray-500">Created: Oct 12, 2023 • Scope: Read/Write</div>
                            </div>
                            <Badge color="green">Active</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded opacity-75">
                            <div>
                                <div className="font-mono text-sm font-bold text-gray-800">sk_test_...1102</div>
                                <div className="text-xs text-gray-500">Created: Sep 01, 2023 • Scope: Read Only</div>
                            </div>
                            <Badge color="yellow">Revoked</Badge>
                        </div>
                        <button className="text-sm text-indigo-600 font-bold hover:underline">+ Generate New Key</button>
                    </div>
                </Card>
                <Card title="Documentation">
                    <div className="prose prose-sm text-gray-600">
                        <p>The Entrepreneurship Nexus API follows JSON:API standards. Use your API key in the <code>Authorization</code> header.</p>
                        <div className="bg-slate-900 text-slate-200 p-3 rounded font-mono text-xs overflow-x-auto">
                            curl -H "Authorization: Bearer sk_live_..." \<br/>
                            &nbsp;&nbsp;https://api.nexus.org/v1/organizations
                        </div>
                        <div className="mt-4 flex gap-2">
                            <a href="#" className="text-indigo-600 hover:underline">View Swagger Docs</a>
                            <span>•</span>
                            <a href="#" className="text-indigo-600 hover:underline">Postman Collection</a>
                        </div>
                    </div>
                </Card>
            </div>
            <Card title="Webhooks">
                <p className="text-sm text-gray-500 mb-4">Receive real-time updates when entities change in your ecosystem.</p>
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2">Endpoint</th>
                            <th className="pb-2">Events</th>
                            <th className="pb-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b last:border-0">
                            <td className="py-3 font-mono">https://api.makehaven.org/hooks/nexus</td>
                            <td className="py-3">organization.created, referral.received</td>
                            <td className="py-3"><Badge color="green">Healthy</Badge></td>
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

const EcosystemConfigView = ({ ecosystem }: { ecosystem: Ecosystem }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Ecosystem Configuration: {ecosystem.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card title="General Settings">
                     <div className="space-y-4">
                         <div>
                             <label className={FORM_LABEL_CLASS}>Ecosystem Name</label>
                             <input className={FORM_INPUT_CLASS} defaultValue={ecosystem.name} />
                         </div>
                         <div>
                             <label className={FORM_LABEL_CLASS}>Region / Scope</label>
                             <input className={FORM_INPUT_CLASS} defaultValue={ecosystem.region} />
                         </div>
                         <div>
                             <label className={FORM_LABEL_CLASS}>Default Privacy</label>
                             <select className={FORM_SELECT_CLASS} defaultValue={ecosystem.settings.interaction_privacy_default}>
                                 <option value="network_shared">Network Shared</option>
                                 <option value="eso_private">ESO Private</option>
                             </select>
                         </div>
                     </div>
                 </Card>
                 <Card title="Active Modules">
                     <ul className="space-y-2 text-sm text-gray-700">
                         <li className="flex items-center"><span className="text-green-500 mr-2">✓</span> Pipeline Management</li>
                         <li className="flex items-center"><span className="text-green-500 mr-2">✓</span> Client Portal</li>
                         <li className="flex items-center"><span className="text-green-500 mr-2">✓</span> Referral Network</li>
                         <li className="flex items-center"><span className="text-gray-400 mr-2">○</span> Fiscal Sponsorship (Disabled)</li>
                     </ul>
                 </Card>
            </div>
            <Card title="Portal Quick Links (Resource Hub)">
                 <div className="space-y-2">
                     {ecosystem.portal_links?.map(link => (
                         <div key={link.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                             <div className="flex items-center gap-2">
                                 <span className="text-xl">{link.icon}</span>
                                 <div>
                                     <div className="text-sm font-bold">{link.label}</div>
                                     <div className="text-xs text-gray-500">{link.url}</div>
                                 </div>
                             </div>
                             <button className="text-xs text-indigo-600">Edit</button>
                         </div>
                     ))}
                     <button className="w-full text-center py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded hover:border-indigo-500 hover:text-indigo-600 text-sm font-bold">
                         + Add Link
                     </button>
                 </div>
            </Card>
        </div>
    );
};

const MyVenturesView = ({ person, initiatives, onAdvance }: { person: Person, initiatives: Initiative[], onAdvance: (i: Initiative) => void }) => {
    // Filter initiatives for the logged-in user's organization
    const myInitiatives = initiatives.filter(i => i.organization_id === person.organization_id);
    
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">My Ventures & Projects</h2>
            <div className="bg-indigo-900 text-white p-6 rounded-lg shadow-lg">
                 <h3 className="text-xl font-bold">Welcome back, {person.first_name}!</h3>
                 <p className="text-indigo-200 mt-2">Track your progress and access ecosystem resources below.</p>
            </div>
            
            {myInitiatives.length === 0 ? (
                <div className="text-center p-8 bg-white border border-gray-200 rounded-lg">
                    <p className="text-gray-500">You don't have any active initiatives being tracked.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {myInitiatives.map(init => (
                        <Card key={init.id} title={init.name} className="border-t-4 border-t-indigo-500">
                             <div className="mb-4">
                                <span className="text-sm text-gray-500">Current Phase:</span>
                                <div className="text-lg font-bold text-gray-900 mt-1">Stage {init.current_stage_index + 1}</div>
                             </div>
                             {/* Mock Progress Bar */}
                             <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                                 <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${(init.current_stage_index / 5) * 100}%` }}></div>
                             </div>
                             <div className="flex justify-end">
                                 <button className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded font-bold hover:bg-indigo-100">Update Progress</button>
                             </div>
                        </Card>
                    ))}
                </div>
            )}
            
            <Card title="Ecosystem Resources">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {NEW_HAVEN_ECOSYSTEM.portal_links?.map(link => (
                         <a key={link.id} href={link.url} className="flex items-start p-3 bg-gray-50 rounded hover:bg-white hover:shadow transition-all border border-gray-100">
                             <span className="text-2xl mr-3">{link.icon}</span>
                             <div>
                                 <div className="text-sm font-bold text-gray-900">{link.label}</div>
                                 <div className="text-xs text-gray-500">{link.description}</div>
                             </div>
                         </a>
                    ))}
                </div>
            </Card>
        </div>
    );
};

const UserManagementView = ({ people, organizations }: { people: Person[], organizations: Organization[] }) => {
    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">System Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {people.map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.first_name} {p.last_name}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{p.email}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">{organizations.find(o => o.id === p.organization_id)?.name}</td>
                                <td className="px-6 py-4 text-sm"><Badge color="blue">{p.system_role}</Badge></td>
                                <td className="px-6 py-4 text-sm">
                                    <button className="text-indigo-600 hover:text-indigo-900">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const PersonDetailView = ({
  person,
  organizations,
  interactions,
  referrals,
  onBack,
  onLogInteraction,
  onCreateReferral
}: {
  person: Person,
  organizations: Organization[],
  interactions: Interaction[],
  referrals: Referral[],
  onBack: () => void,
  onLogInteraction: () => void,
  onCreateReferral: () => void
}) => {
  const [activeTab, setActiveTab] = useState<'associations' | 'interactions' | 'referrals'>('associations');

  const personName = `${person.first_name} ${person.last_name}`;
  const personInteractions = interactions.filter(i => i.attendees?.includes(personName)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const personReferrals = referrals.filter(r => r.subject_person_id === person.id);

  const primaryOrg = organizations.find(o => o.id === person.organization_id);
  const secondaryOrg = person.secondary_profile ? organizations.find(o => o.id === person.secondary_profile!.organization_id) : null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">←</button>
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold shadow-inner border border-indigo-200">
               {person.first_name[0]}{person.last_name[0]}
            </div>
            <div>
               <h1 className="text-2xl font-bold text-gray-900 leading-none">{person.first_name} {person.last_name}</h1>
               <div className="text-sm text-gray-500 mt-1">{person.role}</div>
               <div className="flex items-center gap-3 mt-2">
                 <Badge color="gray">{person.system_role.replace('_', ' ')}</Badge>
                 <a href={`mailto:${person.email}`} className="text-sm text-indigo-600 hover:underline">{person.email}</a>
               </div>
            </div>
          </div>
          <div className="flex gap-2">
             <button onClick={onLogInteraction} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
             <button onClick={onCreateReferral} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Make Referral</button>
          </div>
        </div>
        <div className="mt-6 flex gap-4 border-t pt-4">
          {person.links?.length ? person.links.map((link, idx) => (
              <a key={idx} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 transition-colors">
                <span className="font-bold uppercase text-xs">{link.platform}</span>
              </a>
            )) : <span className="text-sm text-gray-400 italic">No social links added.</span>}
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
         <nav className="-mb-px flex space-x-6">
           {[
             { id: 'associations', label: 'Associations' },
             { id: 'interactions', label: `Interactions (${personInteractions.length})` },
             { id: 'referrals', label: `Referrals (${personReferrals.length})` },
           ].map(tab => (
             <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
           ))}
         </nav>
       </div>

       <div className="space-y-6">
         {activeTab === 'associations' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {primaryOrg && <Card title="Primary Organization">
                 <h4 className="text-lg font-bold text-gray-900">{primaryOrg.name}</h4>
                 <p className="text-sm text-gray-500">{person.role}</p>
                 <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                   {primaryOrg.classification.industry_tags.map(tag => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                 </div>
             </Card>}
             {secondaryOrg && <Card title="Secondary Association">
                 <h4 className="text-lg font-bold text-gray-900">{secondaryOrg.name}</h4>
                 <p className="text-sm text-gray-500">{person.secondary_profile?.role_title}</p>
                 <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                   {secondaryOrg.classification.industry_tags.map(tag => <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{tag}</span>)}
                 </div>
             </Card>}
           </div>
         )}
         {activeTab === 'interactions' && (
            <div className="space-y-4">
              {personInteractions.map(int => (
                 <Card key={int.id} title={`${int.type.toUpperCase()} - ${int.date}`}>
                    <p className="text-gray-800">{int.notes}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>Org: {organizations.find(o => o.id === int.organization_id)?.name}</span>
                      <span>By: {int.recorded_by}</span>
                    </div>
                 </Card>
              ))}
            </div>
         )}
         {activeTab === 'referrals' && (
            <div className="space-y-4">
              {personReferrals.map(ref => (
                 <Card key={ref.id} title={`Referral: ${organizations.find(o => o.id === ref.referring_org_id)?.name} → ${organizations.find(o => o.id === ref.receiving_org_id)?.name}`}>
                    <p className="text-gray-800 mb-2">{ref.notes}</p>
                    <Badge color={ref.status === 'pending' ? 'yellow' : 'green'}>{ref.status}</Badge>
                 </Card>
              ))}
            </div>
         )}
       </div>
    </div>
  );
};

// Updated to accept ALL data sets for relationships
const OrganizationDetailView = ({ 
  org, 
  organizations, 
  people,
  initiatives,
  interactions,
  referrals,
  onBack 
}: { 
  org: Organization, 
  organizations: Organization[], 
  people: Person[],
  initiatives: Initiative[],
  interactions: Interaction[],
  referrals: Referral[],
  onBack: () => void 
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'people' | 'initiatives' | 'interactions' | 'referrals' | 'privacy'>('overview');

  const orgPeople = people.filter(p => p.organization_id === org.id);
  const orgInitiatives = initiatives.filter(i => i.organization_id === org.id);
  const orgInteractions = interactions.filter(i => i.organization_id === org.id);
  const orgReferrals = referrals.filter(r => r.referring_org_id === org.id || r.receiving_org_id === org.id || r.subject_org_id === org.id);

  return (
    <div className="space-y-6">
       {/* Header */}
       <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-full transition">
               <span className="sr-only">Back</span>
               ←
            </button>
            <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg flex items-center justify-center text-2xl font-bold text-gray-600 shadow-inner">
               {org.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
               <h1 className="text-2xl font-bold text-gray-900 leading-none">{org.name}</h1>
               <div className="flex items-center gap-2 mt-2">
                 {org.alternate_name && <span className="text-sm text-gray-500 mr-2">aka {org.alternate_name}</span>}
                 <Badge color={org.visibility === 'public' ? 'green' : 'red'}>{org.visibility === 'public' ? 'Network Visible' : 'Private / Hidden'}</Badge>
                 {org.roles.map(r => <Badge key={r} color="gray">{r}</Badge>)}
               </div>
            </div>
          </div>
          <div className="flex gap-2">
             <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50">Edit Profile</button>
             <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700">Log Interaction</button>
          </div>
       </div>

       {/* Tabs Navigation */}
       <div className="bg-white border-b border-gray-200 px-6">
         <nav className="-mb-px flex space-x-6">
           {[
             { id: 'overview', label: 'Overview' },
             { id: 'people', label: `People (${orgPeople.length})` },
             { id: 'initiatives', label: `Initiatives (${orgInitiatives.length})` },
             { id: 'interactions', label: `Interactions (${orgInteractions.length})` },
             { id: 'referrals', label: `Referrals (${orgReferrals.length})` },
             { id: 'privacy', label: 'Data & Privacy' }
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                 activeTab === tab.id
                   ? 'border-indigo-500 text-indigo-600'
                   : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
               }`}
             >
               {tab.label}
             </button>
           ))}
         </nav>
       </div>

       {/* Tab Content */}
       <div className="grid grid-cols-1 gap-6">
          
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-2 space-y-6">
                 <Card title="About">
                    <div className="prose prose-sm text-gray-600 max-w-none">
                      <p>{org.description}</p>
                    </div>
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                       <div>
                         <span className="block text-xs font-bold text-gray-500 uppercase">Website</span>
                         <a href={org.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{org.url || 'N/A'}</a>
                       </div>
                       <div>
                         <span className="block text-xs font-bold text-gray-500 uppercase">Inc. Year</span>
                         <span className="text-gray-900">{org.year_incorporated || 'N/A'}</span>
                       </div>
                       <div>
                         <span className="block text-xs font-bold text-gray-500 uppercase">Tax Status</span>
                         <Badge color="gray">{org.tax_status}</Badge>
                       </div>
                       <div>
                         <span className="block text-xs font-bold text-gray-500 uppercase">EIN</span>
                         <span className="text-gray-900 font-mono">{org.ein || 'N/A'}</span>
                       </div>
                    </div>
                 </Card>
               </div>
               <div className="space-y-6">
                  <Card title="Classification">
                     <div className="space-y-4">
                        <div>
                           <span className="block text-xs font-bold text-gray-500 uppercase mb-1">NAICS Code</span>
                           <span className="text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded border">{org.classification.naics_code || 'N/A'}</span>
                        </div>
                        <div>
                           <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Industry Tags</span>
                           <div className="flex flex-wrap gap-2">
                              {org.classification.industry_tags.map(t => <span key={t} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{t}</span>)}
                           </div>
                        </div>
                     </div>
                  </Card>
                  <Card title="Demographics">
                     <div className="space-y-2">
                        <div className="flex justify-between"><span>Minority Owned</span> <span>{org.demographics.minority_owned ? '✅' : '❌'}</span></div>
                        <div className="flex justify-between"><span>Woman Owned</span> <span>{org.demographics.woman_owned ? '✅' : '❌'}</span></div>
                        <div className="flex justify-between"><span>Veteran Owned</span> <span>{org.demographics.veteran_owned ? '✅' : '❌'}</span></div>
                     </div>
                  </Card>
               </div>
            </div>
          )}
          {activeTab === 'people' && (
              <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
                   <table className="min-w-full divide-y divide-gray-200">
                       <thead className="bg-gray-50">
                           <tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th></tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-gray-200">
                           {orgPeople.map(p => (
                               <tr key={p.id}>
                                   <td className="px-6 py-4 text-sm font-medium text-indigo-600">{p.first_name} {p.last_name}</td>
                                   <td className="px-6 py-4 text-sm text-gray-500">{p.role}</td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
              </div>
          )}
          {activeTab === 'initiatives' && (
              <div className="space-y-4">
                  {orgInitiatives.map(init => (
                      <Card key={init.id} title={init.name}>
                          <p>Status: {init.status}</p>
                      </Card>
                  ))}
                  {orgInitiatives.length === 0 && <p className="text-gray-500">No initiatives active.</p>}
              </div>
          )}
          {activeTab === 'interactions' && (
               <div className="space-y-4">
                   {orgInteractions.map(int => (
                       <Card key={int.id} title={`${int.type} - ${int.date}`}>
                           <p>{int.notes}</p>
                       </Card>
                   ))}
               </div>
          )}
          {activeTab === 'referrals' && <div className="p-4 text-center text-gray-500">Referral history not loaded.</div>}
          {activeTab === 'privacy' && <div className="p-4 text-center text-gray-500">Privacy settings and consents.</div>}
       </div>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [user, setUser] = useState<Person>(MOCK_PEOPLE.find(p => p.system_role === 'eso_admin') || MOCK_PEOPLE[0]);
  const [organizations, setOrganizations] = useState(ALL_ORGANIZATIONS);
  const [people, setPeople] = useState(MOCK_PEOPLE);
  const [initiatives, setInitiatives] = useState<Initiative[]>([INITIATIVE_A, INITIATIVE_B, INITIATIVE_C]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
  const [isSwitchUserOpen, setIsSwitchUserOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  // Combine pipelines from all ecosystems for display
  const allPipelines = [...NEW_HAVEN_ECOSYSTEM.pipelines, ...CT_MAKERSPACES_ECOSYSTEM.pipelines];

  const navigateToOrg = (id: string) => { setSelectedOrgId(id); setView('detail'); };
  const navigateToPerson = (id: string) => { setSelectedPersonId(id); setView('person_detail'); };

  // Determine what the user can see based on role
  const isPrivileged = canManageUsers(user);
  const isSuper = isSystemAdmin(user);
  const isClient = isEntrepreneur(user);
  
  // Get Sidebar Theme
  const theme = getTheme(user.system_role);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <DemoWarningBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`w-64 ${theme.sidebarBg} flex flex-col flex-shrink-0 transition-colors duration-500`}>
           <div className={`p-4 border-b ${theme.sidebarBorder}`}>
             <h1 className={`font-bold text-lg tracking-tight ${theme.headerTitle}`}>Entrepreneurship <span className={theme.itemIcon === 'text-white' ? 'text-indigo-200' : 'text-indigo-500'}>Nexus</span></h1>
             <p className={`text-xs mt-1 ${theme.headerSub}`}>Ecosystem Management</p>
           </div>
           <nav className="flex-1 overflow-y-auto py-4">
             {/* Common Views */}
             <SidebarItem 
               active={view === 'dashboard'} 
               onClick={() => setView('dashboard')} 
               label="Dashboard" 
               icon={<span>📊</span>} 
               textColor={theme.itemText} 
               iconColor={theme.itemIcon} 
               hoverClass={theme.itemHover}
             />
             <SidebarItem 
               active={view === 'directory'} 
               onClick={() => setView('directory')} 
               label="Directory" 
               icon={<span>🏢</span>} 
               textColor={theme.itemText} 
               iconColor={theme.itemIcon} 
               hoverClass={theme.itemHover}
             />
             <SidebarItem 
               active={view === 'contacts'} 
               onClick={() => setView('contacts')} 
               label="People" 
               icon={<span>👥</span>} 
               textColor={theme.itemText} 
               iconColor={theme.itemIcon} 
               hoverClass={theme.itemHover}
             />
             
             {/* ESO / Admin Views */}
             {!isClient && (
               <>
                 <SidebarItem 
                   active={view === 'initiatives'} 
                   onClick={() => setView('initiatives')} 
                   label="Projects & Initiatives" 
                   icon={<span>🎯</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 <SidebarItem 
                   active={view === 'pipelines'} 
                   onClick={() => setView('pipelines')} 
                   label="Pipelines" 
                   icon={<span>🚀</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>My Work</div>
                 <SidebarItem 
                   active={view === 'interactions'} 
                   onClick={() => setView('interactions')} 
                   label="Interactions" 
                   icon={<span>💬</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 <SidebarItem 
                   active={view === 'referrals'} 
                   onClick={() => setView('referrals')} 
                   label="Referrals" 
                   icon={<span>📫</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
               </>
             )}

             {/* Entrepreneur Views */}
             {isClient && (
               <>
                 <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>Client Portal</div>
                 <SidebarItem 
                   active={view === 'my_ventures'} 
                   onClick={() => setView('my_ventures')} 
                   label="My Ventures" 
                   icon={<span>🚀</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
               </>
             )}

             {/* System Admin Views */}
             {isPrivileged && (
               <>
                 <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>System</div>
                 {isSuper && <SidebarItem 
                   active={view === 'ecosystem_config'} 
                   onClick={() => setView('ecosystem_config')} 
                   label="Ecosystem Config" 
                   icon={<span>⚙️</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />}
                 {isSuper && <SidebarItem 
                   active={view === 'user_management'} 
                   onClick={() => setView('user_management')} 
                   label="User Management" 
                   icon={<span>🛡</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />}
                 <SidebarItem 
                   active={view === 'data_quality'} 
                   onClick={() => setView('data_quality')} 
                   label="Data Quality" 
                   icon={<span>🧹</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 <SidebarItem 
                   active={view === 'api_console'} 
                   onClick={() => setView('api_console')} 
                   label="API Console" 
                   icon={<span>🔌</span>} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
               </>
             )}
           </nav>
           <div className={`p-4 ${theme.footerBg} border-t ${theme.footerBorder}`}>
             <div className={`flex items-center gap-3 cursor-pointer p-2 rounded transition-colors ${theme.itemHover}`} onClick={() => setIsSwitchUserOpen(true)}>
               <div className="w-8 h-8 rounded bg-indigo-500 flex items-center justify-center text-white font-bold">{user.first_name[0]}</div>
               <div className="overflow-hidden">
                 <div className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name}</div>
                 <div className="flex items-center gap-1">
                   <span className={`inline-block w-2 h-2 rounded-full ${theme.contextColor}`}></span>
                   <div className={`text-xs truncate ${theme.headerSub}`}>{theme.contextLabel}</div>
                 </div>
               </div>
               <div className="ml-auto text-xs text-gray-500">⇄</div>
             </div>
             <button onClick={() => setShowDemo(true)} className="mt-3 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-sm transition-colors">
               Start Demo Tour
             </button>
           </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
           {view === 'dashboard' && (
               <DashboardView 
                   organizations={organizations} 
                   people={people} 
                   interactions={MOCK_INTERACTIONS}
                   initiatives={initiatives}
               />
           )}
           {view === 'directory' && (
              <div className="space-y-4">
                 <div className="flex justify-between items-center">
                   <h2 className="text-2xl font-bold text-gray-800">Organization Directory</h2>
                   <button onClick={() => setIsAddOrgOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Add Organization</button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {organizations.map(org => (
                      <Card key={org.id} title={org.name} className="hover:shadow-md transition-shadow cursor-pointer" action={<button onClick={() => navigateToOrg(org.id)} className="text-indigo-600 text-sm hover:underline">View</button>}>
                         <p className="text-sm text-gray-600 mb-2 line-clamp-2">{org.description}</p>
                         <div className="flex gap-2">
                            {org.roles.map(r => <Badge key={r} color="blue">{r}</Badge>)}
                         </div>
                      </Card>
                    ))}
                 </div>
              </div>
           )}
           {view === 'contacts' && (
               <ContactsView 
                   people={people} 
                   organizations={organizations} 
                   onSelectPerson={navigateToPerson} 
               />
           )}
           {view === 'initiatives' && (
               <InitiativesView initiatives={initiatives} organizations={organizations} pipelines={allPipelines} />
           )}
           {view === 'pipelines' && (
               <PipelinesView pipelines={NEW_HAVEN_ECOSYSTEM.pipelines} />
           )}
           {view === 'interactions' && (
               <InteractionsView interactions={MOCK_INTERACTIONS} organizations={organizations} />
           )}
           {view === 'referrals' && (
                <ReferralsView referrals={MOCK_REFERRALS} organizations={organizations} people={people} />
           )}
           {view === 'data_quality' && (
               <DataQualityView organizations={organizations} />
           )}
           {view === 'api_console' && (
               <APIConsoleView />
           )}
           {view === 'ecosystem_config' && (
               <EcosystemConfigView ecosystem={NEW_HAVEN_ECOSYSTEM} />
           )}
           {view === 'my_ventures' && (
               <MyVenturesView person={user} initiatives={initiatives} onAdvance={() => {}} />
           )}
           {view === 'user_management' && (
               <UserManagementView people={people} organizations={organizations} />
           )}
           
           {/* Detailed Views */}
           {view === 'detail' && selectedOrgId && (
              <OrganizationDetailView 
                org={organizations.find(o => o.id === selectedOrgId)!} 
                organizations={organizations}
                people={people}
                initiatives={initiatives}
                interactions={MOCK_INTERACTIONS}
                referrals={MOCK_REFERRALS}
                onBack={() => setView('directory')} 
              />
           )}
           {view === 'person_detail' && selectedPersonId && (
              <PersonDetailView 
                 person={people.find(p => p.id === selectedPersonId)!}
                 organizations={organizations}
                 interactions={MOCK_INTERACTIONS}
                 referrals={MOCK_REFERRALS}
                 onBack={() => setView('contacts')}
                 onLogInteraction={() => {}}
                 onCreateReferral={() => {}}
              />
           )}
           
           {/* Fallback for other views */}
           {!['dashboard', 'directory', 'detail', 'person_detail', 'contacts', 'pipelines', 'interactions', 'referrals', 'data_quality', 'ecosystem_config', 'my_ventures', 'user_management', 'api_console', 'initiatives'].includes(view) && (
              <div className="flex items-center justify-center h-full text-gray-400">
                View "{view}" is under construction.
              </div>
           )}
        </main>
      </div>

      {/* Demo Tour Component */}
      <DemoWalkthrough 
        isOpen={showDemo} 
        onClose={() => setShowDemo(false)} 
        onNavigate={setView}
        onSwitchUser={(role) => {
           const newUser = MOCK_PEOPLE.find(p => p.system_role === role);
           if (newUser) setUser(newUser);
        }}
      />

      {/* Modals */}
      <Modal isOpen={isAddOrgOpen} onClose={() => setIsAddOrgOpen(false)} title="Add New Organization">
          <AddOrgForm 
            onSave={(org) => { setOrganizations([...organizations, org]); setIsAddOrgOpen(false); }} 
            onCancel={() => setIsAddOrgOpen(false)} 
          />
      </Modal>

      <Modal isOpen={isSwitchUserOpen} onClose={() => setIsSwitchUserOpen(false)} title="Switch Context (User)">
          <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-4">Select a user to simulate their permissions and view.</p>
              {people.map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => { setUser(p); setIsSwitchUserOpen(false); }}
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
    </div>
  );
};

export default App;
