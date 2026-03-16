import type { Service } from '../../domain/services/types';
import { MOCK_SERVICES } from '../mockData';

export class ServicesRepo {
  async getAll(ecosystemId?: string): Promise<Service[]> {
    if (!ecosystemId) {
      return Promise.resolve(MOCK_SERVICES);
    }

    return Promise.resolve(
      MOCK_SERVICES.filter((service) => {
        return true;
      })
    );
  }

  async add(service: Service): Promise<void> {
    MOCK_SERVICES.push(service);
    return Promise.resolve();
  }

  async update(id: string, updates: Partial<Service>): Promise<void> {
    const service = MOCK_SERVICES.find((entry) => entry.id === id);
    if (service) {
      Object.assign(service, updates);
    }
    return Promise.resolve();
  }
}
