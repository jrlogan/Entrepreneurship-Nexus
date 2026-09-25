/** Mirrors src/domain/referrals/types.ts ReferralStatus. */
export type ReferralStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

/**
 * Single source of truth for the referral lifecycle.
 *
 *   pending  -> accepted | rejected
 *   accepted -> completed
 *   rejected  (terminal)
 *   completed (terminal)
 *
 * Shared by the web app (src/domain/referrals/transitions.ts re-exports it)
 * and the partner API (partnerUpdateReferral). referralEmailAction in
 * functions/src/index.ts still carries its own copy of these rules.
 */
export const REFERRAL_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  pending: ['accepted', 'rejected'],
  accepted: ['completed'],
  rejected: [],
  completed: [],
};

export const canTransitionReferral = (from: ReferralStatus, to: ReferralStatus): boolean =>
  REFERRAL_TRANSITIONS[from]?.includes(to) ?? false;

export class InvalidReferralTransitionError extends Error {
  constructor(public readonly from: ReferralStatus, public readonly to: ReferralStatus) {
    super(`Invalid referral transition: ${from} -> ${to}`);
    this.name = 'InvalidReferralTransitionError';
  }
}

export const assertReferralTransition = (from: ReferralStatus, to: ReferralStatus): void => {
  if (!canTransitionReferral(from, to)) {
    throw new InvalidReferralTransitionError(from, to);
  }
};
