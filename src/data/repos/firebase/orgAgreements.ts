
import { setDocument, queryCollection, updateDocument, whereEquals } from '../../../services/firestoreClient';
import type { OrgAgreementAcceptance, OrgAgreementType } from '../../../domain/agreements/types';
import { AGREEMENT_VERSIONS } from '../../../domain/agreements/types';
import type { SystemRole } from '../../../domain/people/types';

const COLLECTION = 'org_agreement_acceptances';

function docId(orgId: string, ecosystemId: string, type: OrgAgreementType): string {
  return `${orgId}_${ecosystemId}_${type}`;
}

export interface SignOrgAgreementInput {
  orgId: string;
  ecosystemId: string;
  agreementType: OrgAgreementType;
  textHash?: string;
  signedByUid: string;
  signedByPersonId: string;
  signedByName: string;
  signedByRole: SystemRole;
}

export class FirebaseOrgAgreementsRepo {
  async sign(input: SignOrgAgreementInput): Promise<OrgAgreementAcceptance> {
    const id = docId(input.orgId, input.ecosystemId, input.agreementType);
    const now = new Date().toISOString();
    const record: OrgAgreementAcceptance = {
      id,
      org_id: input.orgId,
      ecosystem_id: input.ecosystemId,
      agreement_type: input.agreementType,
      version: AGREEMENT_VERSIONS[input.agreementType],
      signed_by_uid: input.signedByUid,
      signed_by_person_id: input.signedByPersonId,
      signed_by_name: input.signedByName,
      signed_by_role: input.signedByRole,
      signed_at: now,
      ...(input.textHash ? { text_hash: input.textHash } : {}),
    };
    await setDocument(COLLECTION, id, record, false);
    return record;
  }

  async revoke(orgId: string, ecosystemId: string, type: OrgAgreementType, revokedByUid: string, reason?: string): Promise<void> {
    const id = docId(orgId, ecosystemId, type);
    const patch: Partial<OrgAgreementAcceptance> = {
      revoked_at: new Date().toISOString(),
      revoked_by_uid: revokedByUid,
      ...(reason ? { revoked_reason: reason } : {}),
    };
    await updateDocument<OrgAgreementAcceptance>(COLLECTION, id, patch);
  }

  async getCurrentSignature(orgId: string, ecosystemId: string, type: OrgAgreementType): Promise<OrgAgreementAcceptance | null> {
    const results = await queryCollection<OrgAgreementAcceptance>(COLLECTION, [
      whereEquals('org_id', orgId),
      whereEquals('ecosystem_id', ecosystemId),
      whereEquals('agreement_type', type),
    ]);
    return results[0] ?? null;
  }

  async getForOrg(orgId: string, ecosystemId?: string): Promise<OrgAgreementAcceptance[]> {
    const constraints = [whereEquals('org_id', orgId)];
    if (ecosystemId) constraints.push(whereEquals('ecosystem_id', ecosystemId));
    return queryCollection<OrgAgreementAcceptance>(COLLECTION, constraints);
  }

  async hasValidSignature(orgId: string, ecosystemId: string, type: OrgAgreementType, requiredVersion: string): Promise<boolean> {
    const sig = await this.getCurrentSignature(orgId, ecosystemId, type);
    if (!sig) return false;
    if (sig.revoked_at) return false;
    return sig.version === requiredVersion;
  }
}
