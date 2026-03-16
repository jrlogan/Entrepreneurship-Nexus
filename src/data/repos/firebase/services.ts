import { queryCollection, setDocument, updateDocument } from '../../../services/firestoreClient';
import type { Service } from '../../../domain/services/types';

const normalizeService = (service: Service): Service => ({
  ...service,
  participation_type: service.participation_type || 'service',
  status: service.status || 'active',
});

export class FirebaseServicesRepo {
  async getAll(): Promise<Service[]> {
    const records = await queryCollection<Service>('participations');
    return records.map(normalizeService);
  }

  async add(service: Service): Promise<void> {
    await setDocument('participations', service.id, normalizeService(service));
  }

  async update(id: string, updates: Partial<Service>): Promise<void> {
    await updateDocument('participations', id, updates);
  }
}
