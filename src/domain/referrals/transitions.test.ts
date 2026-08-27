import { describe, expect, it } from 'vitest';
import {
  canTransitionReferral,
  assertReferralTransition,
  InvalidReferralTransitionError,
} from './transitions';
import type { ReferralStatus } from './types';

describe('referral transitions', () => {
  it('allows pending -> accepted and pending -> rejected', () => {
    expect(canTransitionReferral('pending', 'accepted')).toBe(true);
    expect(canTransitionReferral('pending', 'rejected')).toBe(true);
  });

  it('allows accepted -> completed only', () => {
    expect(canTransitionReferral('accepted', 'completed')).toBe(true);
    expect(canTransitionReferral('accepted', 'rejected')).toBe(false);
    expect(canTransitionReferral('accepted', 'pending')).toBe(false);
  });

  it('blocks skipping accept (pending -> completed)', () => {
    expect(canTransitionReferral('pending', 'completed')).toBe(false);
  });

  it('treats rejected and completed as terminal', () => {
    const targets: ReferralStatus[] = ['pending', 'accepted', 'rejected', 'completed'];
    for (const to of targets) {
      expect(canTransitionReferral('rejected', to)).toBe(false);
      expect(canTransitionReferral('completed', to)).toBe(false);
    }
  });

  it('blocks re-accepting an accepted referral (preserves the SLA clock)', () => {
    expect(canTransitionReferral('accepted', 'accepted')).toBe(false);
  });

  it('assertReferralTransition throws a typed error on invalid moves', () => {
    expect(() => assertReferralTransition('rejected', 'completed')).toThrow(InvalidReferralTransitionError);
    expect(() => assertReferralTransition('pending', 'accepted')).not.toThrow();
  });
});
