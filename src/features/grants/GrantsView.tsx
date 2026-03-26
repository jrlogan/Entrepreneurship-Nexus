import React, { useEffect, useMemo, useState } from 'react';
import { 
  GrantElevationSummary, 
  GrantOpportunity, 
  GrantInterestSignal, 
  Initiative, 
  Organization, 
  MonitoredGrantSource, 
  GrantDraft,
  GrantWorkflowQueue 
} from '../../domain/grants/types';
import { Card, Badge, DemoLink, InfoBanner, Modal } from '../../shared/ui/Components';
import { 
  IconBook, 
  IconRocket, 
  IconUsers, 
  IconBriefcase, 
  IconExternalLink, 
  IconCheck, 
  IconSearch, 
  IconFileText, 
  IconChartBar,
  IconPlus,
  IconLock
} from '../../shared/ui/Icons';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { RESTRICTED_INITIATIVE_NAME } from '../../domain/access/redaction';
import { callFunction } from '../../services/functionsClient';

interface InitiativeMatch {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  score: number;
  sharedKeywords: string[];
  isCollaborationReady: boolean;
}

interface EnrichedGrantOpportunity extends GrantOpportunity {
  matches: InitiativeMatch[];
  elevation_summary: GrantElevationSummary;
  interest_signals: GrantInterestSignal[];
}

interface GrantsViewProps {
  onLinkToInitiative?: (organizationId: string) => void;
}

type GrantTab = 'monitoring' | 'identification' | 'drafting' | 'results';

export const GrantsView = ({ onLinkToInitiative }: GrantsViewProps) => {
  const viewer = useViewer();
  const repos = useRepos();
  const [activeTab, setActiveTab] = useState<GrantTab>('identification');
  const [grants, setGrants] = useState<GrantOpportunity[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sources, setSources] = useState<MonitoredGrantSource[]>([]);
  const [drafts, setDrafts] = useState<GrantDraft[]>([]);
  const [isAddUrlOpen, setIsAddUrlOpen] = useState(false);
  const [researchUrl, setResearchUrl] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  
  // Promote to Draft state
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [strategyAngle, setStrategyAngle] = useState('');
  const [viewAudience, setViewAudience] = useState<'all' | 'eso' | 'entrepreneur'>('all');

  useEffect(() => {
    let isCancelled = false;

    const loadContext = async () => {
      const [
        visibleInitiatives, 
        visibleOrganizations, 
        availableGrants,
        monitoredSources,
        activeDrafts
      ] = await Promise.all([
        repos.pipelines.getInitiativesForViewer(viewer, viewer.ecosystemId),
        repos.organizations.getAll(viewer, viewer.ecosystemId),
        repos.grants.getAll(viewer, viewer.ecosystemId),
        repos.grants.getMonitoredSources(viewer, viewer.ecosystemId),
        repos.grants.getDrafts(viewer, viewer.ecosystemId),
      ]);

      if (isCancelled) return;

      setInitiatives(visibleInitiatives.filter((initiative) => initiative.status === 'active'));
      setOrganizations(visibleOrganizations);
      setGrants(availableGrants);
      setSources(monitoredSources);
      setDrafts(activeDrafts);
    };

    void loadContext();

    return () => {
      isCancelled = true;
    };
  }, [repos, viewer, viewer.ecosystemId]);

  const organizationNameById = useMemo(
    () => Object.fromEntries(organizations.map((org) => [org.id, org.name])),
    [organizations]
  );

  const refreshData = async () => {
    const [availableGrants, activeDrafts] = await Promise.all([
      repos.grants.getAll(viewer, viewer.ecosystemId),
      repos.grants.getDrafts(viewer, viewer.ecosystemId),
    ]);
    setGrants(availableGrants);
    setDrafts(activeDrafts);
  };

  const contextualGrants = useMemo<EnrichedGrantOpportunity[]>(() => (
    grants.map((grant) => enrichGrantOpportunity(grant, initiatives, organizationNameById))
  ), [grants, initiatives, organizationNameById]);

  const toggleInterest = async (grant: GrantOpportunity) => {
    if ('toggleInterest' in repos.grants && typeof repos.grants.toggleInterest === 'function') {
      await repos.grants.toggleInterest(grant.id, viewer.orgId, grant.interested_eso_ids);
      await refreshData();
    }
  };

  const updateGrantQueue = async (grantId: string, queue: GrantWorkflowQueue, note?: string) => {
    await repos.grants.updateWorkflow(grantId, queue, note);
    await refreshData();
  };

  const handleResearchUrl = async () => {
    if (!researchUrl) return;
    
    setIsResearching(true);
    try {
      const response = await callFunction<{ url: string, mode: string }, { ok: boolean, data: any }>('extractGrantData', { 
        url: researchUrl, 
        mode: 'discovery' 
      });

      if (response.ok) {
        const opportunities = response.data.opportunities || [];
        
        if (opportunities.length === 0) {
          alert("No specific grant opportunities found at this URL. The AI might have only found general funder info.");
          return;
        }

        for (const item of opportunities) {
          const newGrant: GrantOpportunity = {
            id: `grant_${Math.random().toString(36).substr(2, 9)}`,
            funder_id: 'pending_resolve',
            funder_name: item.funder_name || 'Extracted Funder',
            title: item.title || 'Extracted Grant',
            summary: item.summary || 'Summary extracted by Nexus AI.',
            deadline: item.deadline || undefined,
            award_amount: {
              min: item.min_amount || 0,
              max: item.max_amount || 0,
              currency: 'USD'
            },
            scale: 'regional',
            tags: item.tags || [],
            status: 'new',
            elevation_level: 0,
            interested_eso_ids: [],
            pursuing_eso_ids: [],
            workflow_queue: 'identification',
            ecosystem_id: viewer.ecosystemId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            application_url: researchUrl,
            target_audience: item.target_audience || 'eso',
            source_evidence: [{
              source_name: 'AI Extraction',
              source_type: 'website',
              source_url: researchUrl,
              discovered_at: new Date().toISOString(),
              confidence: 'high'
            }]
          };

          if ('add' in repos.grants && typeof repos.grants.add === 'function') {
            await repos.grants.add(newGrant);
          }
        }
        
        setIsAddUrlOpen(false);
        setResearchUrl('');
        await refreshData();
      }
    } catch (error) {
      console.error('AI Research failed', error);
      alert('Failed to extract grant details. Please try again or add manually.');
    } finally {
      setIsResearching(false);
    }
  };

  const handlePromoteToDraft = async () => {
    if (!selectedGrantId) return;
    
    setIsResearching(true); // Re-use state for loading
    try {
      const grant = grants.find(g => g.id === selectedGrantId);
      let extractedQuestions = [];
      
      // If we have a URL, try to extract questions
      if (grant?.application_url) {
        try {
          const response = await callFunction<{ url: string, mode: string }, { ok: boolean, data: { questions: any[] } }>('extractGrantData', { 
            url: grant.application_url, 
            mode: 'drafting' 
          });
          if (response.ok) {
            extractedQuestions = response.data.questions;
          }
        } catch (e) {
          console.warn('Question extraction failed, proceeding with empty draft', e);
        }
      }

      const draftId = await repos.grants.promoteToDraft(selectedGrantId, viewer, strategyAngle);
      
      // Update draft with extracted questions
      if (extractedQuestions.length > 0 && 'updateDraft' in repos.grants && typeof repos.grants.updateDraft === 'function') {
        await repos.grants.updateDraft(draftId, { 
          questions: extractedQuestions
        });
      }

      setIsPromoteOpen(false);
      setSelectedGrantId(null);
      setStrategyAngle('');
      await refreshData();
      setActiveTab('drafting');
    } catch (error) {
      console.error('Promotion failed', error);
    } finally {
      setIsResearching(false);
    }
  };

  const filteredGrants = useMemo(() => {
    return contextualGrants.filter((grant) => {
      const queue = grant.workflow_queue || (grant.elevation_level >= 2 ? 'identification' : 'identification'); // Default fallback
      if (queue === 'archived' || queue === 'duplicate') return false;
      
      // Filter by audience
      if (viewAudience !== 'all' && grant.target_audience !== viewAudience) return false;

      return queue === activeTab;
    }).sort((a, b) => {
      if (activeTab === 'results') {
        return (b.submission_date || '').localeCompare(a.submission_date || '');
      }
      return b.relevance_score! - a.relevance_score!;
    });
  }, [contextualGrants, activeTab]);

  const counts = useMemo(() => ({
    monitoring: sources.length,
    identification: contextualGrants.filter(g => (g.workflow_queue || 'identification') === 'identification').length,
    drafting: drafts.length,
    results: contextualGrants.filter(g => g.workflow_queue === 'results').length,
  }), [sources, contextualGrants, drafts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Grant Lab</h2>
          <p className="text-sm text-gray-500">Collaborative grant research, automated matching, and joint drafting.</p>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          <TabButton 
            active={activeTab === 'monitoring'} 
            onClick={() => setActiveTab('monitoring')} 
            icon={<IconSearch className="w-4 h-4" />}
            label="Monitoring"
            count={counts.monitoring}
          />
          <TabButton 
            active={activeTab === 'identification'} 
            onClick={() => setActiveTab('identification')} 
            icon={<IconRocket className="w-4 h-4" />}
            label="Identification"
            count={counts.identification}
          />
          <TabButton 
            active={activeTab === 'drafting'} 
            onClick={() => setActiveTab('drafting')} 
            icon={<IconFileText className="w-4 h-4" />}
            label="Drafting"
            count={counts.drafting}
          />
          <TabButton 
            active={activeTab === 'results'} 
            onClick={() => setActiveTab('results')} 
            icon={<IconChartBar className="w-4 h-4" />}
            label="Results"
            count={counts.results}
          />
        </div>
      </div>

      <div className="flex justify-start gap-2 border-b border-gray-200 pb-4">
        <AudienceToggle active={viewAudience === 'all'} onClick={() => setViewAudience('all')} label="All Grants" />
        <AudienceToggle active={viewAudience === 'eso'} onClick={() => setViewAudience('eso')} label="For ESOs" />
        <AudienceToggle active={viewAudience === 'entrepreneur'} onClick={() => setViewAudience('entrepreneur')} label="For Founders" />
      </div>

      {activeTab === 'monitoring' && (
        <MonitoringView 
          sources={sources} 
          onAddUrl={() => setIsAddUrlOpen(true)} 
        />
      )}

      {activeTab === 'identification' && (
        <>
          <InfoBanner title="Discovery & Scoring Active">
            Opportunities are automatically scored based on initiative matches across the network. 
            Flag interest to signal your ESO's desire to partner or lead.
          </InfoBanner>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredGrants.map(grant => (
              <GrantCard 
                key={grant.id} 
                grant={grant} 
                viewerOrgId={viewer.orgId}
                onToggleInterest={() => { void toggleInterest(grant); }}
                onLinkToInitiative={onLinkToInitiative}
                onPromote={() => { 
                  setSelectedGrantId(grant.id);
                  setIsPromoteOpen(true);
                }}
                onArchive={() => { void updateGrantQueue(grant.id, 'archived', 'Archived from Identification.'); }}
              />
            ))}
          </div>
        </>
      )}

      {activeTab === 'drafting' && (
        <DraftingView 
          drafts={drafts} 
          grants={contextualGrants}
          viewerOrgId={viewer.orgId}
          onUpdateDraft={async () => { await refreshData(); }}
        />
      )}

      {activeTab === 'results' && (
        <ResultsView 
          grants={filteredGrants} 
        />
      )}

      {/* Research Modal */}
      <Modal isOpen={isAddUrlOpen} onClose={() => setIsAddUrlOpen(false)} title="Add Monitored Source">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Nexus AI will periodically check this URL for new funding opportunities.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Funder or RFP URL</label>
            <input 
              type="url" 
              value={researchUrl}
              onChange={(e) => setResearchUrl(e.target.value)}
              placeholder="https://example-foundation.org/grants"
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsAddUrlOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md">Cancel</button>
            <button 
              onClick={handleResearchUrl}
              disabled={!researchUrl || isResearching}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isResearching ? 'Extracting...' : 'Add Source'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Promote to Draft Modal */}
      <Modal isOpen={isPromoteOpen} onClose={() => setIsPromoteOpen(false)} title="Start Collaborative Proposal">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Define your angle for this grant. Other interested ESOs will be notified and can join the draft.
          </p>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Drafting Strategy / Angle</label>
            <textarea 
              value={strategyAngle}
              onChange={(e) => setStrategyAngle(e.target.value)}
              placeholder="e.g. Focus on hardware prototyping for urban manufacturing..."
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm min-h-[100px]"
            />
          </div>

          {selectedGrantId && (
            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="text-xs font-bold text-indigo-700 uppercase mb-2">Recommended Partners (Initiative Matches)</div>
              <div className="space-y-2">
                {contextualGrants.find(g => g.id === selectedGrantId)?.matches.slice(0, 3).map(match => (
                  <div key={match.id} className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-800">{match.organizationName}</span>
                    <Badge color="indigo">{match.name}</Badge>
                  </div>
                ))}
                {contextualGrants.find(g => g.id === selectedGrantId)?.matches.length === 0 && (
                  <div className="text-xs text-gray-400 italic">No network matches found for this specific grant.</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsPromoteOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md">Cancel</button>
            <button 
              onClick={handlePromoteToDraft}
              disabled={isResearching}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isResearching ? 'Extracting Questions...' : 'Start Draft'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const AudienceToggle = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 text-sm font-medium rounded-full transition-all ${active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
  >
    {label}
  </button>
);

const TabButton = ({ active, onClick, icon, label, count }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
  >
    {icon}
    {label}
    {count !== undefined && count > 0 && (
      <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>
        {count}
      </span>
    )}
  </button>
);

const MonitoringView = ({ sources, onAddUrl }: { sources: MonitoredGrantSource[], onAddUrl: () => void }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold text-gray-800">Funder & RFP Monitoring</h3>
      <button onClick={onAddUrl} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
        <IconPlus className="w-4 h-4" />
        Add Source
      </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sources.map(source => (
        <Card key={source.id} title={source.name}>
          <div className="space-y-3">
            <div className="text-xs text-gray-500 truncate">{source.url}</div>
            <div className="flex justify-between items-center">
              <Badge color={source.status === 'active' ? 'green' : 'gray'}>{source.status.toUpperCase()}</Badge>
              <div className="text-[10px] text-gray-400 uppercase font-bold">{source.frequency}</div>
            </div>
            {source.last_checked_at && (
              <div className="text-[11px] text-gray-400">
                Last checked: {new Date(source.last_checked_at).toLocaleDateString()}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button className="text-xs text-indigo-600 font-medium hover:underline">Edit Rules</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const GrantCard = ({
  grant,
  viewerOrgId,
  onToggleInterest,
  onLinkToInitiative,
  onPromote,
  onArchive,
}: {
  grant: EnrichedGrantOpportunity,
  viewerOrgId: string,
  onToggleInterest: () => void,
  onLinkToInitiative?: (organizationId: string) => void,
  onPromote: () => void,
  onArchive: () => void,
}) => {
  const isInterested = grant.interested_eso_ids.includes(viewerOrgId);
  const isElevated = grant.elevation_level >= 2;
  const ownMatches = grant.matches.filter((match) => match.organizationId === viewerOrgId);
  const partnerMatches = grant.matches.filter((match) => match.organizationId !== viewerOrgId);
  const primaryMatch = ownMatches[0] || grant.matches[0];

  return (
    <Card 
      title={
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isElevated ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
            {isElevated ? <IconRocket className="w-5 h-5" /> : <IconBook className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">{grant.funder_name}</div>
            <div className="text-gray-900">{grant.title}</div>
          </div>
        </div>
      }
      className={isElevated ? 'border-amber-200 ring-1 ring-amber-50 shadow-md' : ''}
      action={
        <div className="flex items-center gap-2">
           <div className="flex flex-col items-end mr-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Fit Score</span>
              <span className={`text-lg font-black ${grant.relevance_score && grant.relevance_score > 90 ? 'text-green-600' : 'text-indigo-600'}`}>
                {grant.relevance_score}%
              </span>
           </div>
           <button 
             onClick={(e) => { e.stopPropagation(); onToggleInterest(); }}
             className={`px-4 py-2 rounded-md text-sm font-bold transition-all shadow-sm ${
               isInterested 
                 ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                 : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
             }`}
           >
             {isInterested ? '★ Interested' : 'Flag Interest'}
           </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">{grant.summary}</p>
        
        <div className="grid grid-cols-2 gap-4 py-3 border-y border-gray-50">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase">Deadline</div>
            <div className="text-sm font-medium text-gray-700">{grant.deadline || 'Rolling'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase">Award Range</div>
            <div className="text-sm font-medium text-gray-700">
              {grant.award_amount
                ? `$${grant.award_amount.min.toLocaleString()} - $${grant.award_amount.max.toLocaleString()}`
                : 'Not specified'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge color={grant.target_audience === 'entrepreneur' ? 'green' : 'blue'}>
            {grant.target_audience === 'entrepreneur' ? 'FOR FOUNDERS' : 'FOR ESOS'}
          </Badge>
          <Badge color={grant.scale === 'national' ? 'purple' : 'blue'}>{grant.scale.toUpperCase()}</Badge>
          <Badge color={grant.interested_eso_ids.length >= 2 ? 'yellow' : 'gray'}>
            {grant.interested_eso_ids.length} Interested
          </Badge>
          {grant.tags.map(tag => <Badge key={tag} color="gray">{tag}</Badge>)}
        </div>

        <div className={`p-4 rounded-lg border ${isElevated ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex justify-between items-start mb-3">
             <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
               <IconUsers className="w-4 h-4 text-gray-500" />
               NETWORK PULSE
             </div>
             {isElevated && <Badge color="yellow">ELEVATED</Badge>}
          </div>

          <div className="space-y-1.5 mb-3">
            {grant.elevation_summary?.reasons.slice(0, 2).map((reason) => (
              <div key={reason} className="text-[11px] text-gray-600">• {reason}</div>
            ))}
          </div>

          {partnerMatches.length > 0 && (
            <div className="pt-2 border-t border-gray-200">
              <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Partner Matches</div>
              <div className="space-y-1">
                {partnerMatches.slice(0, 2).map(m => (
                  <div key={m.id} className="text-[11px] text-gray-700">
                    <strong>{m.organizationName}</strong> · {m.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onArchive} className="text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors">Archive</button>
          <button onClick={onPromote} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded text-xs font-bold hover:bg-indigo-100 transition-colors">Promote to Draft</button>
          <DemoLink href={grant.application_url || '#'} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600">
            <IconExternalLink className="w-3 h-3" /> Website
          </DemoLink>
        </div>
      </div>
    </Card>
  );
};

const DraftingView = ({ drafts, grants, viewerOrgId, onUpdateDraft }: { drafts: GrantDraft[], grants: EnrichedGrantOpportunity[], viewerOrgId: string, onUpdateDraft: () => Promise<void> }) => {
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(drafts[0]?.id || null);
  const activeDraft = drafts.find(d => d.id === selectedDraftId);
  const grant = grants.find(g => g.id === activeDraft?.opportunity_id);

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <IconFileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600">No active drafts</h3>
        <p className="text-gray-400">Promote an opportunity from Identification to start a shared draft.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1 space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase px-2">Active Proposals</h3>
        {drafts.map(d => (
          <button 
            key={d.id}
            onClick={() => setSelectedDraftId(d.id)}
            className={`w-full text-left p-3 rounded-lg border transition-all ${selectedDraftId === d.id ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}
          >
            <div className="text-xs font-bold text-indigo-700 mb-1">{d.status.toUpperCase()}</div>
            <div className="text-sm font-medium text-gray-900 leading-tight">{d.title}</div>
          </button>
        ))}
      </div>
      
      <div className="lg:col-span-3 space-y-6">
        {activeDraft && grant && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{activeDraft.title}</h3>
                  <p className="text-sm text-gray-500">Drafting Lead: <strong>{activeDraft.lead_org_id === viewerOrgId ? 'You' : activeDraft.lead_org_id}</strong></p>
                </div>
                <Badge color={activeDraft.status === 'drafting' ? 'blue' : 'yellow'}>{activeDraft.status.toUpperCase()}</Badge>
              </div>
              
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-gray-600">
                  <IconUsers className="w-4 h-4" />
                  3 ESOs participating
                </div>
                <div className="flex items-center gap-1.5 text-gray-600">
                  <IconCheck className="w-4 h-4" />
                  {activeDraft.answers.filter(a => a.text).length} / {activeDraft.questions.length} questions answered
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {activeDraft.status === 'moved_to_google_doc' ? (
                <div className="text-center py-8">
                  <IconLock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h4 className="text-lg font-bold text-gray-800">Drafting Moved to Google Docs</h4>
                  <p className="text-gray-600 mb-6">Editing in Nexus is locked to prevent version confusion.</p>
                  <a 
                    href={activeDraft.google_doc_url || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    <IconExternalLink className="w-4 h-4" />
                    Open Google Doc
                  </a>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2">
                      <IconFileText className="w-5 h-5 text-indigo-600" />
                      Extracted Questions & Draft Answers
                    </h4>
                    <button className="text-sm text-indigo-600 font-bold hover:underline">Lock & Move to Google Doc</button>
                  </div>
                  
                  <div className="space-y-6">
                    {activeDraft.questions.map(q => {
                      const answer = activeDraft.answers.find(a => a.question_id === q.id);
                      return (
                        <div key={q.id} className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-gray-500 uppercase">{q.section_label || 'Section'}</span>
                            {q.char_limit && <span className="text-gray-400">{answer?.text.length || 0} / {q.char_limit} chars</span>}
                          </div>
                          <div className="text-sm font-medium text-gray-800">{q.question_text}</div>
                          <textarea 
                            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[100px]"
                            placeholder="Type your draft answer here..."
                            value={answer?.text || ''}
                            onChange={() => {}} // Placeholder
                          />
                          <div className="flex justify-between items-center">
                            <div className="text-[10px] text-gray-400 italic">
                              {answer?.last_revised ? `Last edited ${new Date(answer.last_revised).toLocaleTimeString()} by ${answer.revised_by}` : 'No edits yet'}
                            </div>
                            <button className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Save Version</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ResultsView = ({ grants }: { grants: EnrichedGrantOpportunity[] }) => {
  const stats = useMemo(() => {
    const awarded = grants.filter(g => g.status === 'awarded');
    return {
      total: grants.length,
      awardedCount: awarded.length,
      totalAmount: awarded.reduce((sum, g) => sum + (g.actual_award_amount || 0), 0),
      winRate: grants.length > 0 ? (awarded.length / grants.length) * 100 : 0
    };
  }, [grants]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ResultMetric label="Applications" value={stats.total} />
        <ResultMetric label="Awarded" value={stats.awardedCount} tone="green" />
        <ResultMetric label="Total Funding" value={`$${(stats.totalAmount / 1000).toFixed(0)}k`} tone="blue" />
        <ResultMetric label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} tone="purple" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Opportunity</th>
              <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Submission</th>
              <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Outcome</th>
              <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Artifacts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {grants.map(grant => (
              <tr key={grant.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-gray-900">{grant.title}</div>
                  <div className="text-xs text-gray-500">{grant.funder_name}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {grant.submission_date ? new Date(grant.submission_date).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <Badge color={grant.status === 'awarded' ? 'green' : grant.status === 'submitted' ? 'blue' : 'gray'}>
                    {grant.status.toUpperCase()}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">
                  {grant.actual_award_amount ? `$${grant.actual_award_amount.toLocaleString()}` : '-'}
                </td>
                <td className="px-6 py-4">
                  {grant.final_submission_url && (
                    <a href={grant.final_submission_url} className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline">
                      <IconFileText className="w-3.5 h-3.5" />
                      Final PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {grants.length === 0 && (
          <div className="text-center py-12 text-gray-400 italic">No submitted grants in the history.</div>
        )}
      </div>
    </div>
  );
};

const ResultMetric = ({ label, value, tone = 'gray' }: { label: string, value: string | number, tone?: 'gray' | 'green' | 'blue' | 'purple' }) => {
  const tones = {
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <div className={`p-4 rounded-xl border ${tones[tone]}`}>
      <div className="text-[10px] font-bold uppercase opacity-60 mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
};

// --- Logic Helpers ---

const enrichGrantOpportunity = (
  grant: GrantOpportunity,
  initiatives: Initiative[],
  organizationNameById: Record<string, string>
): EnrichedGrantOpportunity => {
  const grantText = [grant.title, grant.summary, grant.description, ...grant.tags].filter(Boolean).join(' ').toLowerCase();

  const matches: InitiativeMatch[] = initiatives
    .filter((init) => init.name !== RESTRICTED_INITIATIVE_NAME)
    .map((init) => {
      const keywords = [...(init.grant_research_context?.funding_keywords || []), ...(init.initiative_profile?.normalized_focus_areas || [])];
      const shared = keywords.filter(k => grantText.includes(k.toLowerCase()));
      const ready = init.grant_research_context?.is_open_for_collaboration === true || init.initiative_profile?.collaboration_visibility === 'network_shared';
      const score = Math.min(100, shared.length * 25 + (ready ? 20 : 0));
      
      return {
        id: init.id,
        name: init.name,
        organizationId: init.organization_id,
        organizationName: organizationNameById[init.organization_id] || 'Unknown',
        score,
        sharedKeywords: shared,
        isCollaborationReady: ready
      };
    })
    .filter(m => m.sharedKeywords.length > 0)
    .sort((a, b) => b.score - a.score);

  const interestCount = grant.interested_eso_ids.length;
  const eligibleCount = new Set(matches.map(m => m.organizationId)).size;
  const readyCount = new Set(matches.filter(m => m.isCollaborationReady).map(m => m.organizationId)).size;
  
  const score = Math.min(100, 20 + eligibleCount * 12 + readyCount * 14 + interestCount * 10);

  const reasons = [
    `${eligibleCount} initiative match${eligibleCount === 1 ? '' : 'es'} in the network.`,
    `${readyCount} partner${readyCount === 1 ? '' : 's'} ready to collaborate.`,
    interestCount > 0 ? `${interestCount} ESO interest flagged.` : 'No interest flagged yet.'
  ];

  return {
    ...grant,
    matches,
    interest_signals: [], // Simplified for now
    elevation_summary: {
      score,
      interest_count: interestCount,
      eligible_match_count: eligibleCount,
      collaboration_ready_match_count: readyCount,
      reasons
    },
    relevance_score: score
  };
};
