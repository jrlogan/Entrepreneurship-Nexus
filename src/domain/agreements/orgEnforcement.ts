
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
 * Per-signature classification: how does this signature stand against the
 * currently-required version?
 *
 *   'missing' — no signature at all, or the signature has been revoked.
 *   'stale'   — signature exists but at a different version (older terms).
 *   'signed'  — current and active.
 *
 * Used by both the aggregate `computeSignatureStatus` (across required
 * types) and the per-row UI in OrgCompactSignatures, so the rules can't drift.
 */
export type SignatureClass = 'signed' | 'stale' | 'missing';

export function classifySignature(
  signature: OrgAgreementAcceptance | null | undefined,
  requiredVersion: string,
): SignatureClass {
  if (!signature) return 'missing';
  if (signature.revoked_at) return 'missing';
  if (signature.version !== requiredVersion) return 'stale';
  return 'signed';
}

/**
 * Pure missing/stale computation across an org's full set of signatures.
 * Wraps classifySignature for each required type.
 */
export function computeSignatureStatus(
  signatures: OrgAgreementAcceptance[],
  required: readonly OrgAgreementType[],
  requiredVersions: Record<OrgAgreementType, string>,
): Omit<ViewerSignatureStatus, 'isDraftPhase'> {
  const missingTypes: OrgAgreementType[] = [];
  const staleTypes: OrgAgreementType[] = [];

  for (const type of required) {
    const sig = signatures.find((s) => s.agreement_type === type);
    const cls = classifySignature(sig, requiredVersions[type]);
    if (cls === 'missing') missingTypes.push(type);
    else if (cls === 'stale') staleTypes.push(type);
  }

  return {
    signed: missingTypes.length === 0 && staleTypes.length === 0,
    missingTypes,
    staleTypes,
  };
}

// ─── Banner tone selection ──────────────────────────────────────────────────

export interface BannerTone {
  toneClasses: string;
  textClasses: string;
  mutedTextClasses: string;
  badge: { label: string; classes: string } | null;
}

const TONE_NEUTRAL: BannerTone = {
  toneClasses: 'border-indigo-200 bg-indigo-50',
  textClasses: 'text-indigo-900',
  mutedTextClasses: 'text-indigo-800',
  badge: null,
};

const TONE_BLOCKING: BannerTone = {
  toneClasses: 'border-rose-300 bg-rose-50',
  textClasses: 'text-rose-900',
  mutedTextClasses: 'text-rose-800',
  badge: { label: 'Compact signature required', classes: 'bg-rose-200 text-rose-900' },
};

const TONE_ADVISORY: BannerTone = {
  toneClasses: 'border-amber-300 bg-amber-50',
  textClasses: 'text-amber-900',
  mutedTextClasses: 'text-amber-800',
  badge: { label: 'Compact unsigned (advisory)', classes: 'bg-amber-200 text-amber-900' },
};

const TONE_SIGNED: BannerTone = {
  ...TONE_NEUTRAL,
  badge: { label: 'Compact signed', classes: 'bg-emerald-200 text-emerald-900' },
};

/**
 * Decides which visual tone the ConsortiumBanner should render based on
 * signature status and whether hard enforcement is active.
 *
 * Priority order:
 *   1. hasGap + enforcement → blocking (rose) — gate is live, this is a real block
 *   2. hasGap + draft       → advisory (amber) — gate not live yet, just a warning
 *   3. signed               → neutral with green "Compact signed" pill
 *   4. otherwise            → neutral (loading or non-applicable)
 */
export function selectBannerTone(args: {
  signed: boolean;
  hasGap: boolean;
  isDraft: boolean;
  enforcementActive: boolean;
}): BannerTone {
  if (args.hasGap && args.enforcementActive) return TONE_BLOCKING;
  if (args.hasGap && args.isDraft) return TONE_ADVISORY;
  if (args.signed) return TONE_SIGNED;
  return TONE_NEUTRAL;
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
