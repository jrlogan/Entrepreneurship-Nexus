import { MOCK_DIRECTORY_LISTINGS, MOCK_WITHDRAWN } from '../mockData';
import { getDocument, setDocument } from '../../services/firestoreClient';

/**
 * A founder's own network choices, per network: whether they are listed in
 * the directory, and whether partners they work with may see the details of
 * each other's records. Both off by default; the founder changes them here or
 * on the hosted consent page. Stored on network_profiles/{personId}, which
 * only the founder (and network operators) can read — see firestore.rules.
 */
export interface NetworkChoices {
  directoryListed: boolean;
  sharesDetails: boolean;
  /** Left this network: nothing about them crosses between organizations. */
  withdrawn: boolean;
}

export interface NetworkProfilesRepo {
  getChoices(personId: string, ecosystemId: string): Promise<NetworkChoices>;
  setChoice(personId: string, ecosystemId: string, choice: keyof NetworkChoices, on: boolean): Promise<void>;
}

const FIELDS: Record<keyof NetworkChoices, string> = {
  directoryListed: 'directory_listed_ecosystems',
  sharesDetails: 'detail_sharing_ecosystems',
  withdrawn: 'withdrawn_ecosystems',
};

const toggle = (list: unknown, value: string, on: boolean): string[] => {
  const current = Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string' && v !== value) : [];
  return on ? [...current, value] : current;
};

export class FirebaseNetworkProfilesRepo implements NetworkProfilesRepo {
  async getChoices(personId: string, ecosystemId: string): Promise<NetworkChoices> {
    const profile = await getDocument<Record<string, unknown>>('network_profiles', personId);
    const has = (field: string) => Array.isArray(profile?.[field]) && (profile![field] as string[]).includes(ecosystemId);
    return { directoryListed: has(FIELDS.directoryListed), sharesDetails: has(FIELDS.sharesDetails), withdrawn: has(FIELDS.withdrawn) };
  }

  async setChoice(personId: string, ecosystemId: string, choice: keyof NetworkChoices, on: boolean): Promise<void> {
    const profile = await getDocument<Record<string, unknown>>('network_profiles', personId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      person_id: personId,
      [FIELDS[choice]]: toggle(profile?.[FIELDS[choice]], ecosystemId, on),
      consent_updated_at: now,
    };
    // Leaving the network also switches off listing and sharing there.
    if (choice === 'withdrawn' && on) {
      patch[FIELDS.directoryListed] = toggle(profile?.[FIELDS.directoryListed], ecosystemId, false);
      patch[FIELDS.sharesDetails] = toggle(profile?.[FIELDS.sharesDetails], ecosystemId, false);
    }
    await setDocument('network_profiles', personId, patch, true);
    // Audit trail the founder and operators can review. Best effort: the
    // choice itself is already saved.
    await setDocument('consent_events', `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, {
      timestamp: now,
      actor_id: personId,
      action: on ? 'granted' : 'revoked',
      resource_id: personId,
      viewer_id: ecosystemId,
      reason: `${choice === 'directoryListed' ? 'Directory listing' : choice === 'sharesDetails' ? 'Detail sharing with partners they work with' : 'Left the network'} ${choice === 'withdrawn' ? (on ? '' : '(rejoined)') : `turned ${on ? 'on' : 'off'}`} from privacy settings.`.replace('  ', ' '),
    }).catch(() => undefined);
  }
}

/** Demo: the same choices over the sample data. */
export class LocalNetworkProfilesRepo implements NetworkProfilesRepo {
  private sharing = new Set<string>();

  async getChoices(personId: string, ecosystemId: string): Promise<NetworkChoices> {
    return {
      directoryListed: MOCK_DIRECTORY_LISTINGS.some((l) => l.person_id === personId && l.ecosystem_id === ecosystemId),
      sharesDetails: this.sharing.has(`${personId}|${ecosystemId}`),
      withdrawn: MOCK_WITHDRAWN.has(`${personId}|${ecosystemId}`),
    };
  }

  async setChoice(personId: string, ecosystemId: string, choice: keyof NetworkChoices, on: boolean): Promise<void> {
    if (choice === 'directoryListed') {
      const index = MOCK_DIRECTORY_LISTINGS.findIndex((l) => l.person_id === personId && l.ecosystem_id === ecosystemId);
      if (on && index < 0) MOCK_DIRECTORY_LISTINGS.push({ person_id: personId, ecosystem_id: ecosystemId });
      if (!on && index >= 0) MOCK_DIRECTORY_LISTINGS.splice(index, 1);
    } else if (choice === 'withdrawn') {
      const key = `${personId}|${ecosystemId}`;
      if (on) {
        MOCK_WITHDRAWN.add(key);
        this.sharing.delete(key);
        const index = MOCK_DIRECTORY_LISTINGS.findIndex((l) => l.person_id === personId && l.ecosystem_id === ecosystemId);
        if (index >= 0) MOCK_DIRECTORY_LISTINGS.splice(index, 1);
      } else {
        MOCK_WITHDRAWN.delete(key);
      }
    } else {
      const key = `${personId}|${ecosystemId}`;
      if (on) this.sharing.add(key); else this.sharing.delete(key);
    }
  }
}
