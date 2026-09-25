
import type { Interaction } from '../../domain/interactions/types';
import { MOCK_INTERACTIONS } from '../mockData';
import type { ViewerContext } from '../../domain/access/policy';
import type { NetworkViewSource } from '../networkView';

export class InteractionsRepo {

  constructor(private networkView: NetworkViewSource) {}

  // Everything visible to the viewer in the network, already redacted by the
  // compact's privacy policy: full for your own organization's records, the
  // fact (who, what kind, when) for partners' records, never partners' notes.
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Interaction[]> {
    return (await this.networkView.get(viewer, ecosystemId)).interactions;
  }

  async listForOrgForViewer(viewer: ViewerContext, orgId: string): Promise<Interaction[]> {
    return (await this.getAll(viewer)).filter((interaction) => interaction.organization_id === orgId);
  }

  async add(interaction: Interaction): Promise<void> {
    MOCK_INTERACTIONS.push(interaction);
    this.networkView.invalidate();
  }
}
