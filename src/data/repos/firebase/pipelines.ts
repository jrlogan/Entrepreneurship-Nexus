import { queryCollection, whereEquals, getDocument, setDocument, updateDocument, whereIn } from '../../../services/firestoreClient';
import type { PipelineDefinition, Initiative } from '../../../domain/pipelines/types';
import type { ViewerContext } from '../../../domain/access/policy';
import { canViewOperationalDetails, validateEcosystemScope } from '../../../domain/access/policy';
import { redactInitiative } from '../../../domain/access/redaction';
import { ConsentRepo } from '../consent';

export class FirebasePipelinesRepo {
  constructor(private consentRepo: ConsentRepo) {}

  async getPipelines(ecosystemId?: string): Promise<PipelineDefinition[]> {
    const constraints = ecosystemId ? [whereEquals('ecosystem_id', ecosystemId)] : [];
    return queryCollection<PipelineDefinition>('pipelines', constraints);
  }

  async getInitiativesForViewer(viewer: ViewerContext, ecosystemId?: string): Promise<Initiative[]> {
    const scope = validateEcosystemScope(viewer, ecosystemId);
    
    const constraints = [whereEquals('ecosystem_id', scope)];
    const initiatives = await queryCollection<Initiative>('initiatives', constraints);

    // Filter and redact initiatives
    const results: Initiative[] = [];
    
    for (const init of initiatives) {
        // We need to resolve the organization for the initiative to check access
        const org = await getDocument<any>('organizations', init.organization_id);
        if (!org) continue;

        const hasConsent = await this.consentRepo.hasOperationalAccessAsync(viewer.orgId, org.id, viewer.ecosystemId);

        if (canViewOperationalDetails(viewer, org, hasConsent)) {
            results.push(init);
        } else {
            results.push(redactInitiative(init));
        }
    }

    return results;
  }

  async addInitiative(initiative: Initiative): Promise<void> {
    const now = new Date().toISOString();
    const doc = {
        ...initiative,
        created_at: initiative.created_at || now,
        updated_at: initiative.updated_at || now,
    };
    await setDocument('initiatives', initiative.id, doc);
  }

  async updateInitiative(id: string, updates: Partial<Initiative>): Promise<void> {
    await updateDocument('initiatives', id, {
        ...updates,
        updated_at: new Date().toISOString()
    });
  }
}
