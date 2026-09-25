"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertReferralTransition = exports.InvalidReferralTransitionError = exports.canTransitionReferral = exports.REFERRAL_TRANSITIONS = void 0;
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
exports.REFERRAL_TRANSITIONS = {
    pending: ['accepted', 'rejected'],
    accepted: ['completed'],
    rejected: [],
    completed: [],
};
const canTransitionReferral = (from, to) => exports.REFERRAL_TRANSITIONS[from]?.includes(to) ?? false;
exports.canTransitionReferral = canTransitionReferral;
class InvalidReferralTransitionError extends Error {
    from;
    to;
    constructor(from, to) {
        super(`Invalid referral transition: ${from} -> ${to}`);
        this.from = from;
        this.to = to;
        this.name = 'InvalidReferralTransitionError';
    }
}
exports.InvalidReferralTransitionError = InvalidReferralTransitionError;
const assertReferralTransition = (from, to) => {
    if (!(0, exports.canTransitionReferral)(from, to)) {
        throw new InvalidReferralTransitionError(from, to);
    }
};
exports.assertReferralTransition = assertReferralTransition;
