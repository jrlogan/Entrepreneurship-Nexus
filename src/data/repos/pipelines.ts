
import type { PipelineDefinition, Initiative } from '../../domain/pipelines/types';
import { NEW_HAVEN_ECOSYSTEM, CT_MAKERSPACES_ECOSYSTEM, INITIATIVE_A, INITIATIVE_B, INITIATIVE_C, INITIATIVE_D, INITIATIVE_E, INITIATIVE_F, INITIATIVE_G, INITIATIVE_H, INITIATIVE_STEALTH_1, ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, canViewOperationalDetails, validateEcosystemScope } from '../../domain/access/policy';
import { redactInitiative } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

// Combine initial initiatives
const INITIAL_INITIATIVES = [INITIATIVE_A, INITIATIVE_B, INITIATIVE_C, INITIATIVE_D, INITIATIVE_E, INITIATIVE_F, INITIATIVE_G, INITIATIVE_H, INITIATIVE_STEALTH_1];

// Admin Viewer for Legacy (Backward Compatibility)
const ADMIN_VIEWER: ViewerContext = {
    personId: 'system_admin',
    orgId: 'org_nexus_admin',
    role: 'platform_admin',
    ecosystemId: 'global'
};

export class PipelinesRepo {
  
  constructor(private consentRepo: ConsentRepo) {}

  async getPipelines(ecosystemId?: string): Promise<PipelineDefinition[]> {
    const all = [...NEW_HAVEN_ECOSYSTEM.pipelines, ...CT_MAKERSPACES_ECOSYSTEM.pipelines];
    
    let result = all;
    if (ecosystemId === NEW_HAVEN_ECOSYSTEM.id) result = NEW_HAVEN_ECOSYSTEM.pipelines;
    else if (ecosystemId === CT_MAKERSPACES_ECOSYSTEM.id) result = CT_MAKERSPACES_ECOSYSTEM.pipelines;
    
    return Promise.resolve(result);
  }

  // Legacy: Returns all (Admin View)
  async getInitiatives(ecosystemId?: string): Promise<Initiative[]> {
    return this.getInitiativesForViewer(ADMIN_VIEWER, ecosystemId);
  }

  // Viewer-Aware: Returns redacted list if access is restricted, scoped to ecosystem
  async getInitiativesForViewer(viewer: ViewerContext, ecosystemId?: string): Promise<Initiative[]> {
    const scope = validateEcosystemScope(viewer, ecosystemId);
    
    // Filter to current ecosystem scope
    const scopedInitiatives = INITIAL_INITIATIVES.filter(i => i.ecosystem_id === scope);

    const results = await Promise.all(scopedInitiatives.map(async init => {
        const org = ALL_ORGANIZATIONS.find(o => o.id === init.organization_id);
        if (!org) return init; // Should not happen

        const hasConsent = await this.consentRepo.hasOperationalAccessAsync(viewer.orgId, org.id, viewer.ecosystemId);

        if (canViewOperationalDetails(viewer, org, hasConsent)) {
            return init;
        }
        return redactInitiative(init);
    }));

    return results;
  }

  async addInitiative(initiative: Initiative): Promise<void> {
    INITIAL_INITIATIVES.push(initiative);
    return Promise.resolve();
  }
}
