
import type { Interaction } from '../../domain/interactions/types';
import { MOCK_INTERACTIONS, ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, canViewInteractionMetadata, canViewInteractionContent, validateEcosystemScope } from '../../domain/access/policy';
import { redactInteraction } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

export class InteractionsRepo {
  
  constructor(private consentRepo: ConsentRepo) {}

  // Get all interactions visible to the viewer within the scoped ecosystem
  getAll(viewer: ViewerContext, ecosystemId?: string): Interaction[] {
    const scope = validateEcosystemScope(viewer, ecosystemId);
    
    // 0. Filter by Ecosystem Scope
    const scopedInteractions = MOCK_INTERACTIONS.filter(i => i.ecosystem_id === scope);

    // 1. Filter by Metadata Visibility (Who is helping who)
    // Generally, the existence of an interaction is visible if you have access to the ecosystem
    const visibleMetadata = scopedInteractions.filter(int => canViewInteractionMetadata(viewer, int));

    // 2. Redact Content if necessary
    // This enforces the 'note_confidential' rule via canViewInteractionContent
    return visibleMetadata.map(int => this.applySecurity(viewer, int));
  }

  // List specifically for an org context (e.g. Org Detail View)
  listForOrgForViewer(viewer: ViewerContext, orgId: string): Interaction[] {
      // 1. Enforce Ecosystem Scope: Ensure we only return interactions for the viewer's active ecosystem
      const scope = validateEcosystemScope(viewer);

      const orgInteractions = MOCK_INTERACTIONS.filter(i => 
          i.organization_id === orgId && 
          i.ecosystem_id === scope
      );
      
      return orgInteractions.map(int => this.applySecurity(viewer, int));
  }

  // List specifically for an initiative context
  listForInitiative(viewer: ViewerContext, initiativeId: string): Interaction[] {
      // 1. Enforce Ecosystem Scope
      const scope = validateEcosystemScope(viewer);

      const initInteractions = MOCK_INTERACTIONS.filter(i => 
          i.initiative_id === initiativeId && 
          i.ecosystem_id === scope
      );
      
      return initInteractions.map(int => this.applySecurity(viewer, int));
  }

  add(interaction: Interaction): void {
    MOCK_INTERACTIONS.push(interaction);
  }

  // Helper to centralize redaction logic
  private applySecurity(viewer: ViewerContext, int: Interaction): Interaction {
      const subjectOrg = ALL_ORGANIZATIONS.find(o => o.id === int.organization_id);
      
      // If we can't find the org context, default to safe redaction
      if (!subjectOrg) return redactInteraction(int);

      const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, subjectOrg.id, viewer.ecosystemId);

      if (canViewInteractionContent(viewer, int, subjectOrg, hasConsent)) {
        return int;
      }
      
      return redactInteraction(int);
  }
}
