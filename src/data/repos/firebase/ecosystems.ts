import { queryCollection, setDocument } from '../../../services/firestoreClient';
import type { Ecosystem } from '../../../domain/ecosystems/types';
import { EcosystemsRepo } from '../ecosystems';

/**
 * Firestore-backed ecosystem repository.
 *
 * The ecosystem list used to come from the hardcoded ALL_ECOSYSTEMS array,
 * which meant server-seeded ecosystems (e.g. a federated demo ecosystem)
 * could never appear in the UI and production always fell back to mock
 * feature flags. Reads stay synchronous via a hydrated cache so the ~12
 * render-time call sites don't have to change.
 */
export class FirebaseEcosystemsRepo extends EcosystemsRepo {
  private hydrated = false;

  async hydrate(): Promise<Ecosystem[]> {
    const remote = await queryCollection<Ecosystem>('ecosystems');
    if (remote.length > 0) {
      // Merge local defaults (pipelines/checklist templates are still seeded
      // from code) with the authoritative Firestore config.
      const seeds = new Map(this.list.map((e) => [e.id, e]));
      this.list = remote.map((eco) => {
        const seed = seeds.get(eco.id);
        return seed ? { ...seed, ...eco, settings: { ...seed.settings, ...eco.settings } } : eco;
      });
      // Preserve any seeded ecosystem that has no Firestore document yet.
      for (const seed of seeds.values()) {
        if (!this.list.some((e) => e.id === seed.id)) this.list.push(seed);
      }
    }
    this.hydrated = true;
    return this.list;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Persists ecosystem config and refreshes the local cache. */
  async save(id: string, updates: Partial<Ecosystem>): Promise<void> {
    await setDocument('ecosystems', id, { id, ...updates });
    this.update(id, updates);
  }
}
