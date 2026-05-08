
import {
  AGREEMENT_VERSIONS,
  ORG_REQUIRED_AGREEMENTS,
  type OrgAgreementAcceptance,
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

// ─── Pure helpers (testable without Firebase) ────────────────────────────────

/**
 * Returns true when every required agreement is at a non-draft version. The
 * banner uses this to flip from advisory (amber) to blocking (rose), and the
 * future canViewOperationalDetails hard gate will read it too.
 */
export function isHardEnforcementForVersions(versions: Record<OrgAgreementType, string>): boolean {
  return ORG_REQUIRED_AGREEMENTS.every((t) => !isDraftVersion(versions[t]));
}

export function isHardEnforcementActive(): boolean {
  return isHardEnforcementForVersions(AGREEMENT_VERSIONS);
}

export function isDraftPhaseForVersions(versions: Record<OrgAgreementType, string>): boolean {
  return ORG_REQUIRED_AGREEMENTS.some((t) => isDraftVersion(versions[t]));
}

/**
 * Pure missing/stale computation. Given a set of an org's signatures, the
 * required agreement types, and the currently-required versions, returns
 * which are missing, which are stale, and whether the org is fully signed.
 *
 * Revoked signatures (revoked_at present) are treated as missing.
 */
export function computeSignatureStatus(
  signatures: OrgAgreementAcceptance[],
  required: readonly OrgAgreementType[],
  requiredVersions: Record<OrgAgreementType, string>,
): Omit<ViewerSignatureStatus, 'isDraftPhase'> {
  const missingTypes: OrgAgreementType[] = [];
  const staleTypes: OrgAgreementType[] = [];

  for (const type of required) {
    const sig = signatures.find((s) => s.agreement_type === type && !s.revoked_at);
    if (!sig) {
      missingTypes.push(type);
    } else if (sig.version !== requiredVersions[type]) {
      staleTypes.push(type);
    }
  }

  return {
    signed: missingTypes.length === 0 && staleTypes.length === 0,
    missingTypes,
    staleTypes,
  };
}

// ─── IO wrapper ──────────────────────────────────────────────────────────────

export async function getViewerSignatureStatus(args: {
  viewerOrgId: string;
  ecosystemId: string;
}): Promise<ViewerSignatureStatus> {
  const { viewerOrgId, ecosystemId } = args;
  const isDraft = isDraftPhaseForVersions(AGREEMENT_VERSIONS);

  // In demo / non-Firebase contexts, signatures aren't persisted; treat as
  // signed so dev workflows aren't blocked. The banner will still render its
  // summary; it just won't show a missing-signature warning.
  if (!isFirebaseEnabled() || !viewerOrgId || !ecosystemId) {
    return { signed: true, missingTypes: [], staleTypes: [], isDraftPhase: isDraft };
  }

  const all = await orgAgreementsRepo.getForOrg(viewerOrgId, ecosystemId);
  const status = computeSignatureStatus(all, ORG_REQUIRED_AGREEMENTS, AGREEMENT_VERSIONS);
  return { ...status, isDraftPhase: isDraft };
}
