import type { ReferralStatus } from './types';

/**
 * Single source of truth for the referral lifecycle.
 *
 *   pending  -> accepted | rejected
 *   accepted -> completed
 *   rejected  (terminal)
 *   completed (terminal)
 *
 * Mirrored server-side in functions/src/index.ts (referralEmailAction) —
 * keep the two in sync if the lifecycle changes.
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
