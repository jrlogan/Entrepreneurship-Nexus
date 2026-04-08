
import { setDocument, queryCollection, whereEquals } from '../../../services/firestoreClient';
import type { AgreementAcceptance, AgreementType } from '../../../domain/agreements/types';
import { AGREEMENT_VERSIONS } from '../../../domain/agreements/types';

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
    via: AgreementAcceptance['accepted_via']
  ): Promise<void> {
    const id = docId(authUid, ecosystemId, type);
    const now = new Date().toISOString();
    await setDocument(COLLECTION, id, {
      auth_uid: authUid,
      person_id: personId,
      ecosystem_id: ecosystemId,
      agreement_type: type,
      version: AGREEMENT_VERSIONS[type],
      accepted_at: now,
      accepted_via: via,
    });
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

  async getAcceptedTypes(authUid: string, ecosystemId: string): Promise<Set<AgreementType>> {
    const results = await queryCollection<Record<string, unknown>>(COLLECTION, [
      whereEquals('auth_uid', authUid),
      whereEquals('ecosystem_id', ecosystemId),
    ]);
    return new Set(results.map((r) => r['agreement_type'] as AgreementType));
  }
}
