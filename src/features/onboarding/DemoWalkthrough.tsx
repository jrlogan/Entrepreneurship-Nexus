
import React, { useEffect, useState, useRef } from 'react';
import { ViewMode } from '../../app/types';
import { SystemRole } from '../../domain/types';
import { DARKSTAR_MARINE, STEALTH_STARTUP } from '../../data/mockData';

interface DemoStep {
  title: string;
  description: string;
  targetView: ViewMode;
  targetUserRole?: SystemRole;
  targetEntityId?: string; // New: For navigating to specific records
  targetTab?: string; // New: For opening specific tabs
  highlight?: string; // CSS Selector for highlighting
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'; // Control where the box appears
}

// --- Scenario Definitions ---

const COMMITTEE_TOUR: DemoStep[] = [
    {
        title: "Step 1: The Problem",
        description: "Ecosystems suffer from fragmented data. Entrepreneurs enter the same info into 5 different forms. This Directory solves that by federating records from State Registries, CRMs, and ESOs into one live view.",
        targetView: 'directory',
        targetUserRole: 'eso_admin',
        highlight: 'main' // Highlight the whole main area
    },
    {
        title: "Step 2: Unified View",
        description: "We navigate to 'DarkStar Marine'. Instead of a silo, we see a 360° view: their Team, active Initiatives, and verified Metrics. This data is pulled from Salesforce and HubSpot automatically.",
        targetView: 'detail',
        targetEntityId: DARKSTAR_MARINE.id,
        targetUserRole: 'eso_admin',
        highlight: '.bg-white.border.rounded-lg.shadow-sm.p-6' // Highlight the header card
    },
    {
        title: "Step 3: Referral Handoff",
        description: "No more lost emails. We track 'Warm Handoffs' as structured workflows. See exactly when a client was introduced, who accepted it, and the final outcome (e.g. Funding Secured).",
        targetView: 'referrals',
        targetUserRole: 'eso_admin',
        highlight: 'table' // Highlight the table
    },
    {
        title: "Step 4: Privacy by Design",
        description: "Trust is critical. We are now viewing 'Project X' (Stealth). Notice the operational data is locked. ESOs must request access, giving the entrepreneur full control over their data visibility.",
        targetView: 'detail',
        targetEntityId: STEALTH_STARTUP.id,
        targetUserRole: 'eso_admin',
        highlight: '.bg-slate-50.border.border-slate-200' // Highlight the restricted banner
    },
    {
        title: "Step 5: CRM Integration",
        description: "We don't replace your tools. The API Console allows agencies to connect their existing Salesforce/AirTable instances via Webhooks for bidirectional real-time sync.",
        targetView: 'api_console',
        targetUserRole: 'platform_admin',
        highlight: 'main > div > div:nth-child(3)' // Highlight webhook section (approx)
    },
    {
        title: "Step 6: Impact Reporting",
        description: "Because all data is standardized (HSDS), we can aggregate impact instantly. View Jobs Created, Capital Raised, and Network Velocity across the entire region in real-time.",
        targetView: 'reports',
        targetUserRole: 'platform_admin',
        highlight: '.grid.grid-cols-1.md\\:grid-cols-4' // Highlight metrics grid
    }
];

const ENTREPRENEUR_TOUR: DemoStep[] = [
    {
        title: "Welcome Founder!",
        description: "As an entrepreneur, Nexus is your hub for managing your venture's growth. We've switched your view to 'Sarah Connor' (DarkStar Marine).",
        targetView: 'my_ventures',
        targetUserRole: 'entrepreneur'
    },
    {
        title: "My Business Profile",
        description: "Your central record. Update your pitch, industry tags, and team here. You also control Data Privacy—deciding which ESOs can see your detailed metrics.",
        targetView: 'my_org',
        targetUserRole: 'entrepreneur',
        position: 'top-right'
    },
    {
        title: "Project Tracking",
        description: "Manage specific initiatives like 'Series A Fundraising' or 'Product Launch'. Moving a project to the next stage automatically updates your support network.",
        targetView: 'my_projects',
        targetUserRole: 'entrepreneur'
    },
    {
        title: "AI Advisor & Actions",
        description: "Need help? The AI Advisor suggests personalized next steps, grants, and connections based on your current stage and ecosystem resources.",
        targetView: 'todos',
        targetUserRole: 'entrepreneur'
    }
];

const ESO_TOUR: DemoStep[] = [
    {
        title: "Welcome ESO Staff!",
        description: "We've switched you to 'Sam Staff' (MakeHaven). As a support staff member, your goal is to track clients and coordinate care.",
        targetView: 'dashboard',
        targetUserRole: 'eso_staff' // Switch to Sam Staff
    },
    {
        title: "The Directory (CRM)",
        description: "Find the organization you are working with. The Directory is federated, showing profiles from across the ecosystem, not just your silo.",
        targetView: 'directory',
        targetUserRole: 'eso_staff'
    },
    {
        title: "Client 360 View",
        description: "Viewing 'DarkStar Marine'. Here you can see their active Initiatives, Metrics, and Team. Because they granted consent, you can see deep operational details.",
        targetView: 'detail',
        targetEntityId: DARKSTAR_MARINE.id,
        targetUserRole: 'eso_staff'
    },
    {
        title: "Interaction Logging",
        description: "The most critical step: logging your support. Use the 'Log Interaction' button to record meeting notes. You can choose to share them with the network or keep them private to your agency.",
        targetView: 'detail',
        targetEntityId: DARKSTAR_MARINE.id,
        targetTab: 'interactions',
        targetUserRole: 'eso_staff'
    },
    {
        title: "Closing the Loop",
        description: "Need to hand off the client? Use the Referral tool to send a warm intro to a Funder or another ESO. You can then track if that referral was Accepted or Rejected.",
        targetView: 'referrals',
        targetUserRole: 'eso_staff'
    }
];

const COACH_TOUR: DemoStep[] = [
    {
        title: "Welcome Coach/Mentor!",
        description: "We've switched you to 'Dave Dual' (Fabrication Coach). As a mentor, you care about specific people, not the whole database.",
        targetView: 'contacts',
        targetUserRole: 'eso_coach'
    },
    {
        title: "My Connections",
        description: "Notice the filter 'My Interactions'. This view cuts through the noise, showing only the entrepreneurs you have personally met with or advised.",
        targetView: 'contacts',
        targetUserRole: 'eso_coach'
    },
    {
        title: "Action Plan",
        description: "Check your Task list. The system (or ESO Staff) might assign you follow-ups, like 'Review Pitch Deck for Sarah'.",
        targetView: 'todos',
        targetUserRole: 'eso_coach'
    }
];

const PRIVACY_TOUR: DemoStep[] = [
    {
        title: "Step 1: Entrepreneur Control",
        description: "We've switched you to 'Sarah Connor' (Entrepreneur). Navigate to 'My Business' -> 'Data Settings'. You can toggle your Extended Data between 'Open to Ecosystem' and 'Restricted'. Note that your basic Directory Listing is always public to ensure you can be found.",
        targetView: 'my_org',
        targetTab: 'privacy', // Open the settings tab
        targetUserRole: 'entrepreneur',
        position: 'top-right'
    },
    {
        title: "Step 2: Restricted View (ESO)",
        description: "Now we've switched you to 'J.R. Logan' (ESO Staff) viewing a different startup ('Project X') that has kept their data Private. Notice you can see they exist (Header), but the tabs are locked.",
        targetView: 'detail',
        targetUserRole: 'eso_admin',
        targetEntityId: STEALTH_STARTUP.id
    },
    {
        title: "Step 3: Requesting Access",
        description: "As an ESO, if you need to see more to help them, click the 'Request Access' button. This sends a consent request to the founder, putting them in control of the relationship.",
        targetView: 'detail',
        targetUserRole: 'eso_admin',
        targetEntityId: STEALTH_STARTUP.id
    }
];

const ADMIN_TOUR: DemoStep[] = [
    {
        title: "System Administrator",
        description: "We've switched you to 'Neo Nexus' (Platform Admin). You manage the infrastructure that connects everyone.",
        targetView: 'data_quality',
        targetUserRole: 'platform_admin'
    },
    {
        title: "Data Quality Engine",
        description: "Prevent fragmentation. Our fuzzy-matching engine detects if 'DarkStar Marine' and 'Dark Star LLC' are the same entity, allowing you to merge records into a Golden ID.",
        targetView: 'data_quality',
        targetUserRole: 'platform_admin'
    },
    {
        title: "Data Standards",
        description: "Define the schema. Here you control the taxonomies (e.g., 'Industry Tags', 'Referral Outcomes') used across all ecosystem portals to ensure consistent reporting.",
        targetView: 'data_standards',
        targetUserRole: 'platform_admin'
    },
    {
        title: "API Console",
        description: "Nexus is API-first. Issue keys to partners so they can sync their CRMs (Salesforce, HubSpot) or build custom tools on top of the directory.",
        targetView: 'api_console',
        targetUserRole: 'platform_admin'
    }
];

// --- Component ---

export const DemoWalkthrough = ({ 
  isOpen, 
  onClose, 
  onNavigate, 
  onSwitchUser 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onNavigate: (view: ViewMode, entityId?: string, tab?: string) => void,
  onSwitchUser: (role: SystemRole) => void
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [activeScenario, setActiveScenario] = useState<DemoStep[] | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  
  // Auto-Play State
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset or Stop when opened/closed
  useEffect(() => {
      if (isOpen && !activeScenario) {
          // Fresh open
          setCurrentStepIndex(0);
          setIsAutoPlay(false);
          setProgress(0);
          setShowSummary(false);
      } else if (!isOpen) {
          // Closed - Ensure we stop any running timers immediately
          setIsAutoPlay(false);
          if (timerRef.current) clearInterval(timerRef.current);
      }
  }, [isOpen]);

  // Handle Step Changes & Highlighting
  useEffect(() => {
    if (activeScenario && activeScenario[currentStepIndex] && isOpen) {
      const step = activeScenario[currentStepIndex];
      
      // 1. Switch Role/View
      if (step.targetUserRole) {
        onSwitchUser(step.targetUserRole);
      }
      onNavigate(step.targetView, step.targetEntityId, step.targetTab);

      // 2. Reset Progress for Auto-Play
      setProgress(0);

      // 3. Highlight Element
      if (step.highlight) {
          // Delay to allow DOM update
          const timeout = setTimeout(() => {
              const el = document.querySelector(step.highlight!);
              if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('ring-4', 'ring-indigo-500', 'ring-offset-4', 'transition-all', 'duration-500');
              }
          }, 600); // 600ms delay to wait for view render

          return () => {
              clearTimeout(timeout);
              const el = document.querySelector(step.highlight!);
              if (el) el.classList.remove('ring-4', 'ring-indigo-500', 'ring-offset-4', 'transition-all', 'duration-500');
          };
      }
    }
  }, [currentStepIndex, activeScenario, isOpen]);

  // Auto-Play Timer
  useEffect(() => {
      // Must be open, auto-play enabled, not summary, and have scenario
      if (isOpen && isAutoPlay && !showSummary && activeScenario) {
          const stepDuration = 8000; // 8 seconds per step (Increased from 5s)
          const intervalRate = 100; // Update every 100ms
          
          timerRef.current = setInterval(() => {
              setProgress(prev => {
                  const newProgress = prev + (intervalRate / stepDuration * 100);
                  if (newProgress >= 100) {
                      // Move to next step or finish
                      if (currentStepIndex < activeScenario.length - 1) {
                          setCurrentStepIndex(c => c + 1);
                          return 0; // Reset progress
                      } else {
                          // End of tour
                          setIsAutoPlay(false);
                          setShowSummary(true);
                          return 100;
                      }
                  }
                  return newProgress;
              });
          }, intervalRate);
      }

      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, [isOpen, isAutoPlay, showSummary, currentStepIndex, activeScenario]);

  const startScenario = (scenario: DemoStep[], autoPlay: boolean = false) => {
      setActiveScenario(scenario);
      setCurrentStepIndex(0);
      setIsAutoPlay(autoPlay);
      setShowSummary(false);
  };

  const handleNext = () => {
    if (!activeScenario) return;
    
    if (currentStepIndex === activeScenario.length - 1) {
      setShowSummary(true); // Go to summary instead of closing
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStepIndex(prev => Math.max(0, prev - 1));
  };

  const finishTour = () => {
      onClose();
      setActiveScenario(null);
      setCurrentStepIndex(0);
      setIsAutoPlay(false);
      setShowSummary(false);
  };

  if (!isOpen) return null;

  // --- 0. Splash Screen (Intro) ---
  if (showIntro) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500 relative">
                {/* Hero Section */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-repeat" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E")` }}></div>
                    
                    {/* Skip Button (Top Right) */}
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm font-medium transition-colors bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full"
                    >
                        Skip &times;
                    </button>

                    <div className="relative z-10 mt-2">
                        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
                            Entrepreneurship <span className="text-indigo-400">Nexus</span>
                        </h1>
                        <p className="text-slate-300 text-base max-w-lg mx-auto">
                            Prototype: AI-Driven Ecosystem Orchestration
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    <div className="text-sm text-gray-600 leading-relaxed space-y-4">
                        <p>
                            The underlying motive of this prototype is to <strong>explore the data structure</strong> and how it might exist if we followed the Agency Specification. It serves as a tool to better understand our requirements and rapidly iterate on potential solutions.
                        </p>
                        <p>
                            Modern AI options make it feasible for us to build our own solution. This prototype is released under the <strong>MIT License</strong>, making it freely available for the community. The code for this project is accessible at <a href="https://ai.studio/apps/drive/1IcUvd7VmDWyHIIN_bKgxsW3O-UraSwCL" target="_blank" rel="noreferrer" className="text-indigo-600 font-bold hover:underline">Google AI Studio</a>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <div className="text-xl mb-2">🔌</div>
                            <h3 className="font-bold text-indigo-900 text-sm">API-First Architecture</h3>
                            <p className="text-indigo-800 text-xs mt-1 leading-relaxed">
                                The interface you see is just one way to interact. The system is architected to <strong>ingest data</strong> from other systems (CRMs, State Registries) rather than replace them.
                            </p>
                        </div>
                        <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                            <div className="text-xl mb-2">✅</div>
                            <h3 className="font-bold text-green-900 text-sm">Functional Prototype</h3>
                            <p className="text-green-800 text-xs mt-1 leading-relaxed">
                                This is more than a slide deck. The app is <strong>functional</strong>. You can add orgs, log interactions, and see the <strong>real HSDS-compliant data structure</strong> in action. Data persists during your session but resets on reload.
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowIntro(false)}
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold rounded-xl shadow-lg transform transition hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        Explore the Demos <span>→</span>
                    </button>

                    <div className="text-center">
                        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 underline decoration-dotted">
                            I've seen this, take me to the dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // --- 1. Role Selection Screen ---
  if (!activeScenario) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[95vh] overflow-y-auto">
                <div className="bg-slate-900 text-white p-8 text-center relative">
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-white"
                    >
                        <span className="sr-only">Close</span>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                    <h2 className="text-3xl font-bold mb-2">Welcome to Entrepreneurship Nexus</h2>
                    <p className="text-slate-300">Select a guided tour to explore specific capabilities.</p>
                </div>

                {/* Featured Tour */}
                <div className="p-8 pb-0">
                    <div 
                        className="w-full group p-4 border-2 border-indigo-100 bg-indigo-50 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden cursor-pointer"
                    >
                        <div className="absolute right-0 top-0 bg-indigo-200 text-indigo-800 text-[10px] font-bold px-2 py-1 rounded-bl uppercase">Start Here</div>
                        <div className="text-4xl group-hover:scale-110 transition-transform">🏛️</div>
                        <div className="flex-1">
                            <h3 className="font-bold text-indigo-900 text-lg">Committee Walkthrough</h3>
                            <p className="text-sm text-indigo-700 mt-1">A high-level tour of the EcosystemOS value proposition: From fragmentation to unified impact.</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => startScenario(COMMITTEE_TOUR, true)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm transition-transform active:scale-95 flex items-center gap-2"
                            >
                                <span>▶</span> Auto-Play Demo
                            </button>
                            <button 
                                onClick={() => startScenario(COMMITTEE_TOUR, false)}
                                className="bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-bold px-4 py-2 rounded-lg shadow-sm transition-transform active:scale-95"
                            >
                                Manual Tour
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <button 
                        onClick={() => startScenario(ENTREPRENEUR_TOUR)}
                        className="group p-6 border-2 border-gray-100 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex flex-col"
                    >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🚀</div>
                        <h3 className="font-bold text-gray-900 text-lg mb-2">Entrepreneur</h3>
                        <p className="text-sm text-gray-500 leading-relaxed flex-1">Manage my venture, self-report progress, and find resources.</p>
                        <span className="text-xs font-bold text-indigo-600 mt-4 uppercase">Client Portal</span>
                    </button>

                    <button 
                        onClick={() => startScenario(ESO_TOUR)}
                        className="group p-6 border-2 border-gray-100 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex flex-col"
                    >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🤝</div>
                        <h3 className="font-bold text-gray-900 text-lg mb-2">ESO Staff</h3>
                        <p className="text-sm text-gray-500 leading-relaxed flex-1">Track referrals, log interactions, and coordinate client care.</p>
                        <span className="text-xs font-bold text-indigo-600 mt-4 uppercase">Daily Workflow</span>
                    </button>

                    <button 
                        onClick={() => startScenario(COACH_TOUR)}
                        className="group p-6 border-2 border-gray-100 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex flex-col"
                    >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🧭</div>
                        <h3 className="font-bold text-gray-900 text-lg mb-2">Coach/Mentor</h3>
                        <p className="text-sm text-gray-500 leading-relaxed flex-1">Manage specific mentees, track follow-up tasks, and log advice.</p>
                        <span className="text-xs font-bold text-indigo-600 mt-4 uppercase">My Network</span>
                    </button>

                    <button 
                        onClick={() => startScenario(ADMIN_TOUR)}
                        className="group p-6 border-2 border-gray-100 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex flex-col"
                    >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">⚙️</div>
                        <h3 className="font-bold text-gray-900 text-lg mb-2">Sys Admin</h3>
                        <p className="text-sm text-gray-500 leading-relaxed flex-1">Data Quality, API Integration, and Taxonomy management.</p>
                        <span className="text-xs font-bold text-indigo-600 mt-4 uppercase">Infrastructure</span>
                    </button>
                </div>
                
                {/* Secondary row for Privacy tour to keep grid balanced */}
                <div className="px-8 pb-8 flex justify-center">
                    <button 
                        onClick={() => startScenario(PRIVACY_TOUR)}
                        className="w-full max-w-2xl group p-4 border-2 border-gray-100 hover:border-indigo-500 rounded-xl text-left transition-all hover:shadow-lg flex items-center gap-6"
                    >
                        <div className="text-3xl group-hover:scale-110 transition-transform">🔒</div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">Privacy & Trust Model</h3>
                            <p className="text-sm text-gray-500 mt-1">See how our Tiered Privacy Model protects sensitive data while maintaining ecosystem awareness.</p>
                        </div>
                    </button>
                </div>

                <div className="bg-gray-50 p-4 text-center border-t border-gray-100 flex justify-between items-center px-8">
                    <span className="text-xs text-indigo-600 font-medium">💡 Tip: You can switch users anytime by clicking the profile picture in the sidebar to explore different roles.</span>
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 font-medium underline decoration-dotted">Skip Tour</button>
                </div>
            </div>
        </div>
      );
  }

  // --- 2. Summary Slide ---
  if (showSummary) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="bg-indigo-900 text-white p-8 text-center">
                    <div className="text-5xl mb-4">✨</div>
                    <h2 className="text-3xl font-bold mb-2">Demo Complete</h2>
                    <p className="text-indigo-200">You've seen the core capabilities of Entrepreneurship Nexus.</p>
                </div>
                <div className="p-8">
                    <h3 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-wide">Key Takeaways</h3>
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="p-4 bg-gray-50 rounded border border-gray-200">
                            <div className="font-bold text-indigo-600 mb-1">Federated Data</div>
                            <p className="text-sm text-gray-600">Single source of truth syncing State Registry, CRMs, and Partners.</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded border border-gray-200">
                            <div className="font-bold text-indigo-600 mb-1">Privacy by Design</div>
                            <p className="text-sm text-gray-600">Granular consent controls building trust between Founders and ESOs.</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded border border-gray-200">
                            <div className="font-bold text-indigo-600 mb-1">Automated Workflows</div>
                            <p className="text-sm text-gray-600">Referrals, Intros, and Data Collection handled automatically.</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded border border-gray-200">
                            <div className="font-bold text-indigo-600 mb-1">Real-Time Impact</div>
                            <p className="text-sm text-gray-600">Live aggregation of jobs, revenue, and capital across the network.</p>
                        </div>
                    </div>

                    <h3 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-wide border-t border-gray-100 pt-6">Explore Specific Roles</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <button onClick={() => startScenario(ENTREPRENEUR_TOUR)} className="p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm text-sm font-medium text-gray-700 flex flex-col items-center gap-1 transition-all">
                            <span className="text-xl">🚀</span> Founder
                        </button>
                        <button onClick={() => startScenario(ESO_TOUR)} className="p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm text-sm font-medium text-gray-700 flex flex-col items-center gap-1 transition-all">
                            <span className="text-xl">🤝</span> ESO Staff
                        </button>
                        <button onClick={() => startScenario(COACH_TOUR)} className="p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm text-sm font-medium text-gray-700 flex flex-col items-center gap-1 transition-all">
                            <span className="text-xl">🧭</span> Coach
                        </button>
                        <button onClick={() => startScenario(ADMIN_TOUR)} className="p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm text-sm font-medium text-gray-700 flex flex-col items-center gap-1 transition-all">
                            <span className="text-xl">⚙️</span> Admin
                        </button>
                    </div>

                    <div className="flex gap-4 justify-center border-t border-gray-100 pt-6">
                        <button onClick={() => startScenario(COMMITTEE_TOUR, true)} className="px-6 py-2 bg-indigo-50 text-indigo-700 font-bold rounded hover:bg-indigo-100 transition-colors">
                            Replay Main Tour
                        </button>
                        <button onClick={finishTour} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 shadow-lg transition-transform active:scale-95">
                            Explore Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // --- 3. Step Walkthrough Screen ---
  const step = activeScenario[currentStepIndex];
  const isLast = currentStepIndex === activeScenario.length - 1;

  // Determine positioning class
  const positionMap = {
      'top-right': 'items-start justify-end pt-16', // Added top padding to avoid header overlap
      'top-left': 'items-start justify-start pt-16',
      'bottom-left': 'items-end justify-start',
      'bottom-right': 'items-end justify-end'
  };
  const positionClass = positionMap[step.position || 'bottom-right'];

  return (
    <div className={`fixed inset-0 z-50 flex ${positionClass} pointer-events-none p-4 sm:p-6`}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl pointer-events-auto border-2 border-indigo-600 overflow-hidden relative transform transition-all animate-in fade-in slide-in-from-right-8 duration-300">
        
        {/* Progress Bar for Auto-Play */}
        {isAutoPlay && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gray-200 z-20">
                <div 
                    className="h-full bg-indigo-500 transition-all ease-linear" 
                    style={{ width: `${progress}%`, transitionDuration: '100ms' }}
                ></div>
            </div>
        )}

        {/* Header with Progress */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded">DEMO TOUR</div>
            <span className="text-sm font-medium text-slate-300">Step {currentStepIndex + 1} of {activeScenario.length}</span>
          </div>
          <div className="flex items-center gap-2">
              {/* Play/Pause Control */}
              <button 
                onClick={() => setIsAutoPlay(!isAutoPlay)}
                className="text-slate-400 hover:text-white transition-colors p-1"
                title={isAutoPlay ? "Pause Auto-Play" : "Resume Auto-Play"}
              >
                  {isAutoPlay ? '⏸️' : '▶️'}
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <span className="sr-only">Close</span>
                &times;
              </button>
          </div>
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
             {activeScenario.map((_, i) => (
               <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentStepIndex ? 'bg-indigo-600' : 'bg-gray-300'}`} />
             ))}
          </div>

          <button 
            onClick={handleNext}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-6 py-2 rounded-md shadow-sm transition-transform active:scale-95"
          >
            {isLast ? "Finish" : "Next Step →"}
          </button>
        </div>
      </div>
    </div>
  );
};
