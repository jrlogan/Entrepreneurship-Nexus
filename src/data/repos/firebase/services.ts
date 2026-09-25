import { setDocument, updateDocument } from '../../../services/firestoreClient';
import type { Service } from '../../../domain/services/types';
import type { ViewerContext } from '../../../domain/access/policy';
import type { NetworkViewSource } from '../../networkView';

const normalizeService = (service: Service): Service => ({
  ...service,
  participation_type: service.participation_type || 'service',
  status: service.status || 'active',
});

// Participation records (programs, memberships, rentals, applications).
export class FirebaseServicesRepo {
  constructor(private networkView: NetworkViewSource) {}

  // Reads go through the network view: Firestore rules only let an
  // organization read the participation records it provides.
  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Service[]> {
    const view = await this.networkView.get(viewer, ecosystemId);
    return view.participations.map(normalizeService);
  }

  async add(service: Service): Promise<void> {
    await setDocument('participations', service.id, normalizeService(service));
    this.networkView.invalidate();
  }

  async update(id: string, updates: Partial<Service>): Promise<void> {
    await updateDocument('participations', id, updates);
    this.networkView.invalidate();
  }
}
