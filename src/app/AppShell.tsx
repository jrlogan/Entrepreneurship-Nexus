
import React, { useState } from 'react';
import { Person, SystemRole, Ecosystem } from '../domain/types';
import type { PersonOrganizationAffiliation } from '../domain/people/types';
import { ViewMode } from './types';
import { CONFIG } from './config';
import { getTheme } from './theme';
import { SidebarItem, DemoWarningBanner, Avatar, CompanyLogo, DemoLink } from '../shared/ui/Components';
import { PrivacyLegend } from '../shared/ui/PrivacyLegend';
import { FeedbackWidget } from '../features/feedback/FeedbackWidget';
import { sendPasswordReset, signOutUser } from '../services/authService';
import { 
    IconDashboard, 
    IconBuilding, 
    IconUsers, 
    IconBriefcase, 
    IconChat, 
    IconShare, 
    IconChart, 
    IconRocket, 
    IconSettings, 
    IconMap, 
    IconShield, 
    IconDatabase, 
    IconTerminal,
    IconScout, 
    IconList,
    IconBook,
    IconExternalLink,
    IconMenu,
    IconX
} from '../shared/ui/Icons';
interface AppShellProps {
  user: Person;
  actingOrganizationName?: string | null;
  actingOrganizations?: Array<PersonOrganizationAffiliation & { name: string }>;
  currentRole: SystemRole;
  currentEcosystem: Ecosystem;
  availableEcosystems: Ecosystem[];
  onSwitchEcosystem: (id: string) => void;
  actingOrganizationId?: string | null;
  onSwitchActingOrganization?: (organizationId: string) => void;
  onSelectOrganization?: (id: string) => void;
  view: ViewMode;
  onNavigate: (view: ViewMode) => void;
  feedbackContext?: import('../features/feedback/FeedbackWidget').FeedbackContext;
  onOpenProfile: () => void;
  onSwitchUser: () => void;
  onStartDemo: () => void;
  children: React.ReactNode;
}

// Helpers
const canManageUsers = (role: SystemRole) => ['eso_admin', 'ecosystem_manager', 'platform_admin'].includes(role);
const isSystemAdmin = (role: SystemRole) => ['platform_admin', 'ecosystem_manager'].includes(role);
const isEntrepreneur = (role: SystemRole) => role === 'entrepreneur';
const isMvpMode = !CONFIG.IS_DEMO_MODE;

export const AppShell: React.FC<AppShellProps> = ({ 
    user, 
    actingOrganizationName,
    actingOrganizations = [],
    currentRole, 
    currentEcosystem, 
    availableEcosystems, 
    onSwitchEcosystem,
    actingOrganizationId,
    onSwitchActingOrganization,
    onSelectOrganization,
    view,
    onNavigate,
    onOpenProfile,
    onSwitchUser,
    onStartDemo,
    feedbackContext,
    children
}) => {
  const [isEcoDropdownOpen, setIsEcoDropdownOpen] = useState(false);
  const [isActingOrgDropdownOpen, setIsActingOrgDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isAccountActionBusy, setIsAccountActionBusy] = useState(false);
  
  const theme = getTheme(currentRole);
  const isPrivileged = canManageUsers(currentRole);
  const isSuper = isSystemAdmin(currentRole);
  const isClient = isEntrepreneur(currentRole);
  const featureFlags = currentEcosystem.settings.feature_flags || {};
  const canAccessAdvancedWorkflows = featureFlags.advanced_workflows === true;
  const canAccessDashboard = canAccessAdvancedWorkflows || featureFlags.dashboard === true;
  const canAccessTasksAdvice = canAccessAdvancedWorkflows || featureFlags.tasks_advice === true;
  const canAccessInitiatives = canAccessAdvancedWorkflows || featureFlags.initiatives === true;
  const canAccessProcesses = canAccessAdvancedWorkflows || featureFlags.processes === true;
  const canAccessInteractions = canAccessAdvancedWorkflows || featureFlags.interactions === true;
  const canAccessReports = canAccessAdvancedWorkflows || featureFlags.reports === true;
  const canAccessVentureScout = canAccessAdvancedWorkflows || featureFlags.venture_scout === true;
  const hasAnyWorkflowFeature = canAccessDashboard || canAccessTasksAdvice || canAccessInitiatives || canAccessProcesses || canAccessInteractions || canAccessReports || canAccessVentureScout;
  // In MVP mode show the simplified nav — unless feature flags have unlocked specific workflow views.
  const showMvpEsoNav = isMvpMode && !isClient && !hasAnyWorkflowFeature;
  const isPlatformAdmin = currentRole === 'platform_admin';
  // Platform admin always sees all system views (they configure the flags; feature flags gate other roles only).
  const canAccessApiConsole = isPlatformAdmin || (isPrivileged && featureFlags.api_console === true);
  const canAccessDataQuality = isPlatformAdmin || (isPrivileged && featureFlags.data_quality === true);
  const canAccessDataStandards = isPlatformAdmin || (isPrivileged && featureFlags.data_standards === true);
  const canAccessMetricsManager = isPlatformAdmin || (isSuper && featureFlags.metrics_manager === true);
  const canAccessInboundIntake = isPlatformAdmin || ((currentRole === 'ecosystem_manager') && featureFlags.inbound_intake === true);

  const iconClass = "w-5 h-5";
  const isDemoMode = CONFIG.IS_DEMO_MODE;

  // Filter Portal Links based on Audience
  const visiblePortalLinks = currentEcosystem.portal_links?.filter(link => {
      if (link.label === 'Community Calendar') return false;
      if (link.audience === 'all') return true;
      if (isClient && link.audience === 'entrepreneur') return true;
      if (!isClient && link.audience === 'eso') return true;
      return false;
  }) || [];

  // Determine the organization name the user is acting for
  const actingContextLabel = actingOrganizationName || (currentRole === 'platform_admin' || currentRole === 'ecosystem_manager'
    ? 'Cross-ecosystem access'
    : 'No active organization');
  const actingContextHint = actingOrganizationName
    ? 'Organization context'
    : (currentRole === 'platform_admin' || currentRole === 'ecosystem_manager'
      ? 'You are operating above the organization level.'
      : 'This account is not currently assigned to an organization.');

  const handleNav = (v: ViewMode) => {
      setIsMobileMenuOpen(false);
      onNavigate(v);
  };

  const handleOpenProfile = () => {
    setIsAccountMenuOpen(false);
    onOpenProfile();
  };

  const handlePasswordReset = async () => {
    setAccountError(null);
    setAccountMessage(null);
    setIsAccountActionBusy(true);
    try {
      await sendPasswordReset(user.email);
      setAccountMessage(`Password reset email sent to ${user.email}.`);
      setIsAccountMenuOpen(false);
    } catch (error: any) {
      setAccountError(error?.message || 'Unable to send password reset email.');
    } finally {
      setIsAccountActionBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAccountError(null);
    setAccountMessage(null);
    setIsAccountActionBusy(true);
    try {
      await signOutUser();
      setIsAccountMenuOpen(false);
    } catch (error: any) {
      setAccountError(error?.message || 'Unable to sign out.');
    } finally {
      setIsAccountActionBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {CONFIG.IS_DEMO_MODE && <DemoWarningBanner />}
      
      {/* Mobile Header */}
      <div className={`md:hidden ${theme.sidebarBg} p-4 flex justify-between items-center text-white z-30 relative shadow-md`}>
         <div className="font-bold text-lg tracking-tight">Entrepreneurship <span className={theme.itemIcon === 'text-white' ? 'text-indigo-200' : 'text-indigo-500'}>Nexus</span></div>
         <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-white hover:bg-white/10 p-1 rounded transition-colors">
             {isMobileMenuOpen ? <IconX className="w-6 h-6" /> : <IconMenu className="w-6 h-6" />}
         </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {isMobileMenuOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* Sidebar */}
        <aside className={`absolute inset-y-0 left-0 z-40 w-64 ${theme.sidebarBg} flex flex-col flex-shrink-0 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
           <div className={`p-4 border-b ${theme.sidebarBorder} hidden md:block`}>
             <h1 className={`font-bold text-lg tracking-tight ${theme.headerTitle}`}>Entrepreneurship <span className={theme.itemIcon === 'text-white' ? 'text-indigo-200' : 'text-indigo-500'}>Nexus</span></h1>
             
             {/* Ecosystem Switcher */}
             <div className="relative mt-3">
                 <button 
                    onClick={() => setIsEcoDropdownOpen(!isEcoDropdownOpen)}
                    className="w-full flex items-center justify-between text-left text-xs bg-black/20 hover:bg-black/30 text-white rounded px-2 py-1.5 transition"
                 >
                     <span className="truncate">{currentEcosystem.name}</span>
                     {availableEcosystems.length > 1 && <span className="ml-1 text-[10px]">▼</span>}
                 </button>
                 
                 {isEcoDropdownOpen && availableEcosystems.length > 1 && (
                     <div className="absolute top-full left-0 w-full mt-1 bg-white rounded shadow-lg z-50 overflow-hidden text-xs">
                         {availableEcosystems.map(eco => (
                             <button
                                key={eco.id}
                                onClick={() => { onSwitchEcosystem(eco.id); setIsEcoDropdownOpen(false); }}
                                className={`block w-full text-left px-3 py-2 text-gray-800 hover:bg-gray-100 ${eco.id === currentEcosystem.id ? 'bg-indigo-50 font-bold' : ''}`}
                             >
                                 {eco.name}
                             </button>
                         ))}
                     </div>
                 )}
             </div>

             {/* Acting As Context */}
             <div className="mt-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                 Acting On Behalf Of
             </div>
             <div className="relative mt-1">
                 <button
                    type="button"
                    onClick={() => actingOrganizations.length > 1 && setIsActingOrgDropdownOpen((open) => !open)}
                    className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left ${actingOrganizations.length > 1 ? 'hover:bg-white/5' : ''}`}
                 >
                     {actingOrganizationName ? (
                        <CompanyLogo src={null} name={actingOrganizationName} size="sm" className="w-6 h-6 rounded" />
                     ) : (
                        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/80">ORG</div>
                     )}
                     <div className={`text-sm font-medium ${theme.itemText} truncate flex-1`}>
                         {actingContextLabel}
                     </div>
                     {actingOrganizations.length > 1 && <span className={`text-[10px] ${theme.headerSub}`}>▼</span>}
                 </button>
                 {actingOrganizationId && onSelectOrganization && (
                     <button
                         type="button"
                         onClick={() => onSelectOrganization(actingOrganizationId)}
                         className={`mt-0.5 text-[11px] ${theme.headerSub} hover:text-white/80 underline-offset-2 hover:underline block`}
                         title="View org profile"
                     >
                         View org profile →
                     </button>
                 )}
                 {isActingOrgDropdownOpen && actingOrganizations.length > 1 && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded bg-white text-xs shadow-lg">
                      {actingOrganizations.map((affiliation) => (
                        <button
                          key={affiliation.organization_id}
                          type="button"
                          onClick={() => {
                            onSwitchActingOrganization?.(affiliation.organization_id);
                            setIsActingOrgDropdownOpen(false);
                          }}
                          className={`block w-full px-3 py-2 text-left text-gray-800 hover:bg-gray-100 ${affiliation.name === actingOrganizationName ? 'bg-indigo-50 font-bold' : ''}`}
                        >
                          <div>{affiliation.name}</div>
                          {affiliation.role_title && <div className="text-[10px] text-gray-500">{affiliation.role_title}</div>}
                        </button>
                      ))}
                    </div>
                 )}
             </div>
             <div className={`mt-1 text-[11px] ${theme.headerSub}`}>
                 {actingContextHint}
             </div>
           </div>
           
           <nav className="flex-1 overflow-y-auto py-4">
             
             {/* ESO / Admin Common Views */}
             {!isClient && (
                <>
                    <SidebarItem 
                    active={view === 'directory'} 
                    onClick={() => handleNav('directory')} 
                    label="Organizations" 
                    icon={<IconBuilding className={iconClass} />} 
                    textColor={theme.itemText} 
                    iconColor={theme.itemIcon} 
                    hoverClass={theme.itemHover}
                    />
                    <SidebarItem 
                    active={view === 'contacts'} 
                    onClick={() => handleNav('contacts')} 
                    label="People" 
                    icon={<IconUsers className={iconClass} />} 
                    textColor={theme.itemText} 
                    iconColor={theme.itemIcon} 
                    hoverClass={theme.itemHover}
                    />
                 <SidebarItem 
                   active={view === 'referrals'} 
                   onClick={() => handleNav('referrals')} 
                   label="Referrals" 
                   icon={<IconShare className={iconClass} />} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 {!showMvpEsoNav && (
                   <>
                     {(canAccessDashboard || canAccessTasksAdvice || canAccessInitiatives || canAccessProcesses || canAccessInteractions || canAccessReports || canAccessVentureScout) && (
                       <>
                         {canAccessDashboard && (
                           <SidebarItem 
                           active={view === 'dashboard'} 
                           onClick={() => handleNav('dashboard')} 
                           label="Dashboard" 
                           icon={<IconDashboard className={iconClass} />} 
                           textColor={theme.itemText} 
                           iconColor={theme.itemIcon} 
                           hoverClass={theme.itemHover}
                           />
                         )}
                         {canAccessTasksAdvice && (
                           <SidebarItem 
                           active={view === 'todos'} 
                           onClick={() => handleNav('todos')} 
                           label="Tasks & Data" 
                           icon={<IconList className={iconClass} />} 
                           textColor={theme.itemText} 
                           iconColor={theme.itemIcon} 
                           hoverClass={theme.itemHover}
                           />
                         )}
                         <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>Workflows</div>
                         {canAccessInitiatives && (
                           <SidebarItem 
                             active={view === 'initiatives'} 
                             onClick={() => handleNav('initiatives')} 
                             label="Initiatives" 
                             icon={<IconBriefcase className={iconClass} />} 
                             textColor={theme.itemText} 
                             iconColor={theme.itemIcon} 
                             hoverClass={theme.itemHover}
                           />
                         )}
                         {canAccessProcesses && (
                           <SidebarItem 
                             active={view === 'pipelines'} 
                             onClick={() => handleNav('pipelines')} 
                             label="Processes" 
                             icon={<IconRocket className={iconClass} />} 
                             textColor={theme.itemText} 
                             iconColor={theme.itemIcon} 
                             hoverClass={theme.itemHover}
                           />
                         )}
                         {canAccessInteractions && (
                           <SidebarItem 
                             active={view === 'interactions'} 
                             onClick={() => handleNav('interactions')} 
                             label="Interactions" 
                             icon={<IconChat className={iconClass} />} 
                             textColor={theme.itemText} 
                             iconColor={theme.itemIcon} 
                             hoverClass={theme.itemHover}
                           />
                         )}
                         {canAccessReports && (
                           <SidebarItem 
                             active={view === 'reports'} 
                             onClick={() => handleNav('reports')} 
                             label="Reports" 
                             icon={<IconChart className={iconClass} />} 
                             textColor={theme.itemText} 
                             iconColor={theme.itemIcon} 
                             hoverClass={theme.itemHover}
                           />
                         )}
                       </>
                     )}
                     {canAccessVentureScout && (
                       <SidebarItem 
                         active={view === 'scout'} 
                         onClick={() => handleNav('scout')} 
                         label="Venture Scout" 
                         icon={<IconScout className={iconClass} />} 
                         textColor={theme.itemText} 
                         iconColor={theme.itemIcon} 
                         hoverClass={theme.itemHover}
                       />
                     )}
                   </>
                 )}
               </>
             )}

             {/* Entrepreneur Views */}
             {isClient && (
               <>
                 <SidebarItem 
                   active={view === 'my_ventures'} 
                   onClick={() => handleNav('my_ventures')} 
                   label="Dashboard" 
                   icon={<IconRocket className={iconClass} />} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 <SidebarItem 
                   active={view === 'my_org'} 
                   onClick={() => handleNav('my_org')} 
                   label="My Business" 
                   icon={<IconBuilding className={iconClass} />} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />
                 {canAccessInitiatives && (
                   <SidebarItem 
                     active={view === 'my_projects'} 
                     onClick={() => handleNav('my_projects')} 
                     label="Initiatives" 
                     icon={<IconBriefcase className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
                 {canAccessTasksAdvice && (
                   <SidebarItem 
                     active={view === 'todos'} 
                     onClick={() => handleNav('todos')} 
                     label="Tasks & Advice" 
                     icon={<IconList className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
               </>
             )}

             {/* System Admin Views */}
             {isPrivileged && (
               <>
                 <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>System</div>
                 {isPlatformAdmin && <SidebarItem
                   active={view === 'platform_admin'}
                   onClick={() => handleNav('platform_admin')}
                   label="Platform Admin"
                   icon={<IconShield className={iconClass} />}
                   textColor={theme.itemText}
                   iconColor={theme.itemIcon}
                   hoverClass={theme.itemHover}
                 />}
                 {isSuper && <SidebarItem
                   active={view === 'ecosystem_config'}
                   onClick={() => handleNav('ecosystem_config')}
                   label="Ecosystem Config"
                   icon={<IconSettings className={iconClass} />}
                   textColor={theme.itemText}
                   iconColor={theme.itemIcon}
                   hoverClass={theme.itemHover}
                 />}
                 {isSuper && canAccessProcesses && (
                  <SidebarItem 
                    active={view === 'pipelines'} 
                    onClick={() => handleNav('pipelines')} 
                    label="Processes" 
                    icon={<IconMap className={iconClass} />} 
                    textColor={theme.itemText} 
                    iconColor={theme.itemIcon} 
                    hoverClass={theme.itemHover}
                  />
                 )}
                 {isPrivileged && <SidebarItem 
                   active={view === 'user_management'} 
                   onClick={() => handleNav('user_management')} 
                   label="User Management" 
                   icon={<IconShield className={iconClass} />} 
                   textColor={theme.itemText} 
                   iconColor={theme.itemIcon} 
                   hoverClass={theme.itemHover}
                 />}
                 {canAccessDataQuality && (
                   <SidebarItem 
                     active={view === 'data_quality'} 
                     onClick={() => handleNav('data_quality')} 
                     label="Data Quality" 
                     icon={<IconDatabase className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
                 {canAccessMetricsManager && (
                   <SidebarItem 
                     active={view === 'metrics_manager'} 
                     onClick={() => handleNav('metrics_manager')} 
                     label="Metrics Manager" 
                     icon={<IconChart className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
                 {canAccessDataStandards && (
                   <SidebarItem 
                     active={view === 'data_standards'} 
                     onClick={() => handleNav('data_standards')} 
                     label="Data Standards" 
                     icon={<IconBook className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
                 {canAccessApiConsole && (
                   <SidebarItem 
                     active={view === 'api_console'} 
                     onClick={() => handleNav('api_console')} 
                     label="API Console" 
                     icon={<IconTerminal className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
                 {canAccessInboundIntake && (
                   <SidebarItem 
                     active={view === 'inbound_intake'} 
                     onClick={() => handleNav('inbound_intake')} 
                     label="Inbound Intake" 
                     icon={<IconChat className={iconClass} />} 
                     textColor={theme.itemText} 
                     iconColor={theme.itemIcon} 
                     hoverClass={theme.itemHover}
                   />
                 )}
               </>
             )}

             {/* Dynamic Portal Links (Resources) */}
             {visiblePortalLinks.length > 0 && (
                 <>
                    <div className={`pt-4 pb-1 px-4 text-xs font-bold uppercase tracking-wider ${theme.headerSub}`}>External Resources</div>
                    {visiblePortalLinks.map(link => (
                        <DemoLink 
                            key={link.id}
                            href={link.url}
                            className={`w-full flex items-center space-x-3 px-4 py-3 transition-colors ${theme.itemText} ${theme.itemHover} hover:text-white group`}
                            title={link.label}
                        >
                            {/* Grayscale filter makes emojis match the monochromatic theme better by default */}
                            <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all`}>
                                {link.icon}
                            </div>
                            <span className="font-medium text-sm truncate flex-1">{link.label}</span>
                            <IconExternalLink className="w-3 h-3 opacity-50" />
                        </DemoLink>
                    ))}
                 </>
           )}
          </nav>
           <div className={`p-4 ${theme.footerBg} border-t ${theme.footerBorder}`}>
             <div className="relative">
               <button
                 type="button"
                 className={`flex w-full items-center gap-3 rounded p-2 text-left transition-colors ${theme.itemHover}`}
                 onClick={isDemoMode ? onSwitchUser : () => setIsAccountMenuOpen((open) => !open)}
               >
                 <Avatar src={user.avatar_url} name={`${user.first_name} ${user.last_name}`} size="sm" />
                 <div className="min-w-0 overflow-hidden">
                   <div className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name}</div>
                   <div className="flex items-center gap-1">
                     <span className={`inline-block w-2 h-2 rounded-full ${theme.contextColor}`}></span>
                     <div className={`text-xs truncate ${theme.headerSub}`}>{currentRole.replace('_', ' ')}</div>
                   </div>
                 </div>
                 <div className={`ml-auto text-xs ${theme.headerSub}`}>{isDemoMode ? '⇄' : isAccountMenuOpen ? '▲' : '▼'}</div>
               </button>
               {!isDemoMode && isAccountMenuOpen && (
                 <div className="mt-2 rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
                   <button
                     type="button"
                     onClick={handleOpenProfile}
                     className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
                   >
                     Account settings
                   </button>
                   <button
                     type="button"
                     onClick={() => void handlePasswordReset()}
                     disabled={isAccountActionBusy}
                     className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                   >
                     Send password reset email
                   </button>
                   <button
                     type="button"
                     onClick={() => void handleSignOut()}
                     disabled={isAccountActionBusy}
                     className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                   >
                     Log out
                   </button>
                 </div>
               )}
             </div>
             {isDemoMode && (
               <button onClick={onStartDemo} className="mt-3 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded shadow-sm transition-colors">
                 Start Demo Tour
                </button>
             )}
             {!isDemoMode && accountError && (
               <div className="mt-3 rounded border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                 {accountError}
               </div>
             )}
             {!isDemoMode && accountMessage && (
               <div className="mt-3 rounded border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                 {accountMessage}
               </div>
             )}
           </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
           {children}
        </main>
        
        {/* Global Privacy Legend (Fixed Position) */}
        <PrivacyLegend />

        {/* Feedback Widget */}
        {feedbackContext && <FeedbackWidget context={feedbackContext} />}
      </div>
    </div>
  );
};
