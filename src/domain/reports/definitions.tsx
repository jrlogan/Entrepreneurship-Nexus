import React from 'react';
import { AppRepos } from '../../data/repos';
import { ReportDefinition } from './types';
import { Badge } from '../../shared/ui/Components';
import { calculateDaysBetween } from '../logic';
import { ViewerContext } from '../access/policy';

// Report 1: Pipeline Health
export const PIPELINE_HEALTH_REPORT: ReportDefinition<any> = {
  id: 'pipeline_health',
  title: 'Pipeline Health',
  description: 'Active initiatives, their current stage, and velocity.',
  getData: (repos: AppRepos, viewer: ViewerContext) => {
    const initiatives = repos.pipelines.getInitiatives().filter(i => i.status === 'active');
    const orgs = repos.organizations.getAll(viewer);
    const pipelines = repos.pipelines.getPipelines();
    
    return initiatives.map(init => {
      const org = orgs.find(o => o.id === init.organization_id);
      const pipeline = pipelines.find(p => p.id === init.pipeline_id);
      const stage = pipeline?.stages[init.current_stage_index];
      
      // Calculate days in current stage
      // Find the latest entry in stage_history for the current stage
      const currentEntry = init.stage_history.find(h => h.stage_index === init.current_stage_index);
      const daysInStage = currentEntry ? calculateDaysBetween(currentEntry.entered_at) : 0;
      
      return {
        id: init.id,
        name: init.name,
        orgName: org?.name || 'Unknown',
        pipelineName: pipeline?.name || 'Unknown',
        stageName: stage?.name || 'Unknown',
        daysInStage
      };
    });
  },
  columns: [
    { header: 'Initiative', render: (row) => <span className="font-medium text-indigo-600">{row.name}</span> },
    { header: 'Organization', render: (row) => row.orgName },
    { header: 'Pipeline', render: (row) => <Badge color="gray">{row.pipelineName}</Badge> },
    { header: 'Current Stage', render: (row) => row.stageName },
    { header: 'Days in Stage', render: (row) => <span className={row.daysInStage > 30 ? 'text-red-600 font-bold' : 'text-gray-600'}>{row.daysInStage}</span> }
  ]
};

// Report 2: Funder Snapshot
// Startups, Interactions with Funders, Referrals to Funders
export const FUNDER_SNAPSHOT_REPORT: ReportDefinition<any> = {
  id: 'funder_snapshot',
  title: 'Funder Engagement Snapshot',
  description: 'Overview of startups engaging with capital sources.',
  getData: (repos: AppRepos, viewer: ViewerContext) => {
    const startups = repos.organizations.getAll(viewer).filter(o => o.roles.includes('startup'));
    const referrals = repos.referrals.getAll(viewer);
    // Identify Funder orgs
    const funderIds = repos.organizations.getAll(viewer).filter(o => o.roles.includes('funder')).map(o => o.id);
    
    return startups.map(startup => {
       const outboundReferrals = referrals.filter(r => r.subject_org_id === startup.id && funderIds.includes(r.receiving_org_id));
       const pending = outboundReferrals.filter(r => r.status === 'pending').length;
       const accepted = outboundReferrals.filter(r => r.status === 'accepted').length;
       const completed = outboundReferrals.filter(r => r.status === 'completed').length;
       
       return {
         id: startup.id,
         name: startup.name,
         industry: startup.classification.industry_tags.join(', '),
         referralsStats: { pending, accepted, completed }
       };
    });
  },
  columns: [
    { header: 'Startup', render: (row) => <span className="font-bold">{row.name}</span> },
    { header: 'Industry', render: (row) => <span className="text-xs text-gray-500">{row.industry}</span> },
    { header: 'Funders Engaged', render: (row) => {
        const total = row.referralsStats.pending + row.referralsStats.accepted + row.referralsStats.completed;
        return total === 0 ? <span className="text-gray-400 italic">None</span> : total;
    }},
    { header: 'Referral Status', render: (row) => (
        <div className="flex gap-2 text-xs">
           {row.referralsStats.accepted > 0 && <Badge color="green">{row.referralsStats.accepted} Accepted</Badge>}
           {row.referralsStats.pending > 0 && <Badge color="yellow">{row.referralsStats.pending} Pending</Badge>}
        </div>
    )}
  ]
};

export const ALL_REPORTS = [PIPELINE_HEALTH_REPORT, FUNDER_SNAPSHOT_REPORT];