import { queryCollection, setDocument, updateDocument, whereEquals } from '../../../services/firestoreClient';
import type { GrantOpportunity, GrantWorkflowQueue, MonitoredGrantSource, GrantDraft } from '../../../domain/grants/types';
import type { ViewerContext } from '../../../domain/access/policy';

export class FirebaseGrantsRepo {
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<GrantOpportunity[]> {
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];

    return queryCollection<GrantOpportunity>('grants', [whereEquals('ecosystem_id', scope)]);
  }

  async getMonitoredSources(viewer: ViewerContext, ecosystemId?: string): Promise<MonitoredGrantSource[]> {
    // Sources might be ecosystem-wide or global for now
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];
    return queryCollection<MonitoredGrantSource>('monitored_grant_sources', [whereEquals('ecosystem_id', scope)]);
  }

  async getDrafts(viewer: ViewerContext, ecosystemId?: string): Promise<GrantDraft[]> {
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];
    return queryCollection<GrantDraft>('grant_drafts', [whereEquals('ecosystem_id', scope)]);
  }

  async updateDraft(id: string, updates: Partial<GrantDraft>): Promise<void> {
    await updateDocument('grant_drafts', id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async add(grant: GrantOpportunity): Promise<void> {
    await setDocument('grants', grant.id, grant);
  }

  async addDraft(draft: GrantDraft): Promise<void> {
    await setDocument('grant_drafts', draft.id, draft);
  }

  async update(id: string, updates: Partial<GrantOpportunity>): Promise<void> {
    await updateDocument('grants', id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async updateWorkflow(id: string, queue: GrantWorkflowQueue, note?: string, duplicateOfGrantId?: string): Promise<void> {
    await this.update(id, {
      workflow_queue: queue,
      workflow_note: note,
      duplicate_of_grant_id: duplicateOfGrantId,
    });
  }

  async promoteToDraft(id: string, viewer: ViewerContext, strategyAngle?: string): Promise<string> {
    // In live mode, we might want to trigger a Cloud Function or just create the record
    const draftId = `draft_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // Create the draft record
    const newDraft: GrantDraft = {
      id: draftId,
      title: 'New Proposal Draft', // Will be enriched by AI later
      opportunity_id: id,
      strategy_angle: strategyAngle,
      lead_org_id: viewer.orgId,
      status: 'extracting',
      questions: [],
      answers: [],
      ecosystem_id: viewer.ecosystemId,
      created_at: now,
      updated_at: now,
      created_by: viewer.personId || 'unknown',
    };

    await this.addDraft(newDraft);
    
    // Update the grant workflow
    await this.updateWorkflow(id, 'drafting', `Promoted to draft by ${viewer.orgId}`);
    
    return draftId;
  }

  async toggleInterest(id: string, orgId: string, currentInterestedEsoIds: string[]): Promise<void> {
    const interested_eso_ids = currentInterestedEsoIds.includes(orgId)
      ? currentInterestedEsoIds.filter((entry) => entry !== orgId)
      : [...currentInterestedEsoIds, orgId];
    await this.update(id, { interested_eso_ids });
  }
}
