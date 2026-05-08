
import {
  AGREEMENT_VERSIONS,
  ORG_REQUIRED_AGREEMENTS,
  type OrgAgreementType,
} from './types';
import { FirebaseOrgAgreementsRepo } from '../../data/repos/firebase/orgAgreements';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const orgAgreementsRepo = new FirebaseOrgAgreementsRepo();

export interface ViewerSignatureStatus {
  signed: boolean;                    // viewer org has a current, non-revoked signature for every required agreement
  missingTypes: OrgAgreementType[];   // never signed, or revoked
  staleTypes: OrgAgreementType[];     // signed but at an older version than AGREEMENT_VERSIONS
  isDraftPhase: boolean;              // any required agreement is still '-draft'
}

const isDraftVersion = (v: string): boolean => v.includes('-draft');

export function isHardEnforcementActive(): boolean {
  return ORG_REQUIRED_AGREEMENTS.every((t) => !isDraftVersion(AGREEMENT_VERSIONS[t]));
}

const draftPhase = (): boolean =>
  ORG_REQUIRED_AGREEMENTS.some((t) => isDraftVersion(AGREEMENT_VERSIONS[t]));

export async function getViewerSignatureStatus(args: {
  viewerOrgId: string;
  ecosystemId: string;
}): Promise<ViewerSignatureStatus> {
  const { viewerOrgId, ecosystemId } = args;
  const isDraft = draftPhase();

  // In demo / non-Firebase contexts, signatures aren't persisted; treat as
  // signed so dev workflows aren't blocked. The banner will still render its
  // summary; it just won't show a missing-signature warning.
  if (!isFirebaseEnabled() || !viewerOrgId || !ecosystemId) {
    return { signed: true, missingTypes: [], staleTypes: [], isDraftPhase: isDraft };
  }

  const all = await orgAgreementsRepo.getForOrg(viewerOrgId, ecosystemId);
  const missingTypes: OrgAgreementType[] = [];
  const staleTypes: OrgAgreementType[] = [];

  for (const type of ORG_REQUIRED_AGREEMENTS) {
    const sig = all.find((s) => s.agreement_type === type && !s.revoked_at);
    if (!sig) {
      missingTypes.push(type);
    } else if (sig.version !== AGREEMENT_VERSIONS[type]) {
      staleTypes.push(type);
    }
  }

  return {
    signed: missingTypes.length === 0 && staleTypes.length === 0,
    missingTypes,
    staleTypes,
    isDraftPhase: isDraft,
  };
}
