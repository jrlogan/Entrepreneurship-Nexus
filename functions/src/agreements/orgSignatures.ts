/**
 * Has an organization signed the network's agreements?
 *
 * An organization signs, per network, the membership terms, the compact and
 * the data-usage agreement (ORG_REQUIRED_AGREEMENTS) at their current
 * versions. Until it has, it gets no API key and sees no other organization's
 * records — only its own.
 */
import type * as admin from 'firebase-admin';
import { AGREEMENT_VERSIONS, ORG_REQUIRED_AGREEMENTS, type OrgAgreementType } from './content';

export interface OrgSignatureStatus {
  signed: boolean;
  missing: OrgAgreementType[];
}

/** Pure: classify signature docs against the required versions. */
export const evaluateOrgSignatures = (
  signatures: Array<{ agreement_type?: string; version?: string; revoked_at?: string | null }>,
): OrgSignatureStatus => {
  const missing = ORG_REQUIRED_AGREEMENTS.filter((type) => !signatures.some((sig) =>
    sig.agreement_type === type && sig.version === AGREEMENT_VERSIONS[type] && !sig.revoked_at
  ));
  return { signed: missing.length === 0, missing: [...missing] };
};

export const getOrgSignatureStatus = async (
  db: admin.firestore.Firestore,
  orgId: string,
  ecosystemId: string,
): Promise<OrgSignatureStatus> => {
  const refs = ORG_REQUIRED_AGREEMENTS.map((type) =>
    db.collection('org_agreement_acceptances').doc(`${orgId}_${ecosystemId}_${type}`)
  );
  const snaps = await db.getAll(...refs);
  return evaluateOrgSignatures(snaps.filter((snap) => snap.exists).map((snap) => snap.data() || {}));
};
