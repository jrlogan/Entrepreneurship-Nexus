import { queryCollection, whereEquals, setDocument } from '../../../services/firestoreClient';
import type { Interaction } from '../../../domain/interactions/types';
import type { ViewerContext } from '../../../domain/access/policy';

export class FirebaseInteractionsRepo {
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Interaction[]> {
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];

    const constraints = [whereEquals('ecosystem_id', scope)];
    const interactions = await queryCollection<Interaction>('interactions', constraints);

    // Filter by visibility (metadata is generally visible in scope)
    // Detailed content filtering happens in the UI via canViewInteractionContent
    // but we can do a coarse filter here if needed.
    return interactions;
  }

  async listForOrgForViewer(viewer: ViewerContext, orgId: string): Promise<Interaction[]> {
    const scope = viewer.ecosystemId;
    if (!scope) return [];

    const constraints = [
        whereEquals('organization_id', orgId),
        whereEquals('ecosystem_id', scope)
    ];
    return queryCollection<Interaction>('interactions', constraints);
  }

  async listForInitiative(viewer: ViewerContext, initiativeId: string): Promise<Interaction[]> {
    const scope = viewer.ecosystemId;
    if (!scope) return [];

    const constraints = [
        whereEquals('initiative_id', initiativeId),
        whereEquals('ecosystem_id', scope)
    ];
    return queryCollection<Interaction>('interactions', constraints);
  }

  async add(interaction: Interaction): Promise<void> {
    await setDocument('interactions', interaction.id, interaction);
  }
}
