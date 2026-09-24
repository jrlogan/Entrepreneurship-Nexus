
import type { Service } from '../../domain/services/types';
import type { ViewerContext } from '../../domain/access/policy';
import type { NetworkViewSource } from '../networkView';
import { MOCK_SERVICES } from '../mockData';

// Participation records (programs, memberships, rentals, applications).
export class ServicesRepo {
  constructor(private networkView: NetworkViewSource) {}

  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<Service[]> {
    return (await this.networkView.get(viewer, ecosystemId)).participations;
  }

  async add(service: Service): Promise<void> {
    MOCK_SERVICES.push(service);
    this.networkView.invalidate();
  }

  async update(id: string, updates: Partial<Service>): Promise<void> {
    const service = MOCK_SERVICES.find((entry) => entry.id === id);
    if (service) {
      Object.assign(service, updates);
    }
    this.networkView.invalidate();
  }
}
