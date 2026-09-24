import { setDocument } from '../../../services/firestoreClient';
import type { Interaction } from '../../../domain/interactions/types';
import type { ViewerContext } from '../../../domain/access/policy';
import type { NetworkViewSource } from '../../networkView';

export class FirebaseInteractionsRepo {
  constructor(private networkView: NetworkViewSource) {}

  // Reads go through the network view (getNetworkView Cloud Function):
  // Firestore rules only let an organization read interactions it authored.
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Interaction[]> {
    return (await this.networkView.get(viewer, ecosystemId)).interactions;
  }

  async listForOrgForViewer(viewer: ViewerContext, orgId: string): Promise<Interaction[]> {
    return (await this.getAll(viewer)).filter((interaction) => interaction.organization_id === orgId);
  }

  async add(interaction: Interaction): Promise<void> {
    await setDocument('interactions', interaction.id, interaction);
    this.networkView.invalidate();
  }
}
