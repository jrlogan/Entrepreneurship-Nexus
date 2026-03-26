import type { GrantOpportunity, GrantWorkflowQueue, MonitoredGrantSource, GrantDraft } from '../../domain/grants/types';
import { MOCK_GRANTS, MOCK_MONITORED_SOURCES, MOCK_GRANT_DRAFTS } from '../mockData';
import { type ViewerContext, validateEcosystemScope } from '../../domain/access/policy';

export class GrantsRepo {
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<GrantOpportunity[]> {
    const scope = validateEcosystemScope(viewer, ecosystemId);
    return Promise.resolve(MOCK_GRANTS.filter((grant) => grant.ecosystem_id === scope));
  }

  async add(grant: GrantOpportunity): Promise<void> {
    MOCK_GRANTS.push(grant);
    return Promise.resolve();
  }

  async getMonitoredSources(viewer: ViewerContext, ecosystemId?: string): Promise<MonitoredGrantSource[]> {
    // In a real app, sources might be ecosystem-scoped or org-scoped
    return Promise.resolve(MOCK_MONITORED_SOURCES);
  }

  async getDrafts(viewer: ViewerContext, ecosystemId?: string): Promise<GrantDraft[]> {
    const scope = validateEcosystemScope(viewer, ecosystemId);
    return Promise.resolve(MOCK_GRANT_DRAFTS.filter((draft) => draft.ecosystem_id === scope));
  }

  async updateDraft(id: string, updates: Partial<GrantDraft>): Promise<void> {
    const draft = MOCK_GRANT_DRAFTS.find((entry) => entry.id === id);
    if (draft) {
      Object.assign(draft, updates, { updated_at: new Date().toISOString() });
    }
    return Promise.resolve();
  }

  async update(id: string, updates: Partial<GrantOpportunity>): Promise<void> {
    const grant = MOCK_GRANTS.find((entry) => entry.id === id);
    if (grant) {
      Object.assign(grant, updates, { updated_at: new Date().toISOString() });
    }
    return Promise.resolve();
  }

  async updateWorkflow(id: string, queue: GrantWorkflowQueue, note?: string, duplicateOfGrantId?: string): Promise<void> {
    return this.update(id, {
      workflow_queue: queue,
      workflow_note: note,
      duplicate_of_grant_id: duplicateOfGrantId,
    });
  }

  async promoteToDraft(id: string, viewer: ViewerContext, strategyAngle?: string): Promise<string> {
    const grant = MOCK_GRANTS.find((entry) => entry.id === id);
    if (!grant) throw new Error('Grant not found');

    const draftId = `draft_${Math.random().toString(36).substr(2, 9)}`;
    const newDraft: GrantDraft = {
      id: draftId,
      title: `${grant.title} Proposal`,
      opportunity_id: grant.id,
      strategy_angle: strategyAngle,
      lead_org_id: viewer.orgId,
      status: 'extracting',
      questions: [],
      answers: [],
      ecosystem_id: grant.ecosystem_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: viewer.personId || 'unknown',
    };

    MOCK_GRANT_DRAFTS.push(newDraft);
    
    // Update the grant workflow
    await this.updateWorkflow(id, 'drafting', `Promoted to draft by ${viewer.orgId}`);
    
    return draftId;
  }

  async toggleInterest(id: string, orgId: string, _currentInterestedEsoIds?: string[]): Promise<void> {
    const grant = MOCK_GRANTS.find((entry) => entry.id === id);
    if (!grant) return Promise.resolve();

    grant.interested_eso_ids = grant.interested_eso_ids.includes(orgId)
      ? grant.interested_eso_ids.filter((entry) => entry !== orgId)
      : [...grant.interested_eso_ids, orgId];
    grant.updated_at = new Date().toISOString();
    return Promise.resolve();
  }
}
