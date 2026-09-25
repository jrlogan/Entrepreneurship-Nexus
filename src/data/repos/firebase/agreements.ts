
import { setDocument, queryCollection, whereEquals } from '../../../services/firestoreClient';
import type { AgreementAcceptance, AgreementType } from '../../../domain/agreements/types';
import { AGREEMENT_VERSIONS } from '../../../domain/agreements/types';
import { acceptanceIsCurrent } from '../../../../functions/src/consent/terms';

/** One acceptance as stored — enough to tell whether the person has seen the current words. */
export interface AcceptanceSummary {
  version: string;
  accepted_at: string;
}

const COLLECTION = 'agreement_acceptances';

function docId(authUid: string, ecosystemId: string, type: AgreementType): string {
  return `${authUid}_${ecosystemId}_${type}`;
}

export class FirebaseAgreementsRepo {
  async recordAcceptance(
    authUid: string,
    personId: string,
    ecosystemId: string,
    type: AgreementType,
    via: AgreementAcceptance['accepted_via'],
    textHash?: string,
  ): Promise<void> {
    const id = docId(authUid, ecosystemId, type);
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      auth_uid: authUid,
      person_id: personId,
      ecosystem_id: ecosystemId,
      agreement_type: type,
      version: AGREEMENT_VERSIONS[type],
      accepted_at: now,
      accepted_via: via,
    };
    if (textHash) record.text_hash = textHash;
    await setDocument(COLLECTION, id, record);
  }

  async hasAccepted(authUid: string, ecosystemId: string, type: AgreementType): Promise<boolean> {
    const id = docId(authUid, ecosystemId, type);
    const results = await queryCollection<Record<string, unknown>>(COLLECTION, [
      whereEquals('auth_uid', authUid),
      whereEquals('ecosystem_id', ecosystemId),
      whereEquals('agreement_type', type),
    ]);
    return results.length > 0;
  }

  /**
   * The agreements this person has accepted in a network. An acceptance older
   * than the re-consent lever does not count (they will be asked again); an
   * acceptance of an older VERSION does — a new version is not a re-prompt,
   * only a note in their settings (see getAcceptances).
   */
  async getAcceptedTypes(authUid: string, ecosystemId: string): Promise<Set<AgreementType>> {
    const results = await queryCollection<Record<string, unknown>>(COLLECTION, [
      whereEquals('auth_uid', authUid),
      whereEquals('ecosystem_id', ecosystemId),
    ]);
    return new Set(
      results
        .filter((r) => acceptanceIsCurrent(r['accepted_at'] as string | undefined))
        .map((r) => r['agreement_type'] as AgreementType)
    );
  }

  async getAcceptances(authUid: string, ecosystemId: string): Promise<Partial<Record<AgreementType, AcceptanceSummary>>> {
    const results = await queryCollection<Record<string, unknown>>(COLLECTION, [
      whereEquals('auth_uid', authUid),
      whereEquals('ecosystem_id', ecosystemId),
    ]);
    const out: Partial<Record<AgreementType, AcceptanceSummary>> = {};
    for (const r of results) {
      out[r['agreement_type'] as AgreementType] = {
        version: String(r['version'] || ''),
        accepted_at: String(r['accepted_at'] || ''),
      };
    }
    return out;
  }
}
