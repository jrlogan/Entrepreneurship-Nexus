import { describe, it, expect } from 'vitest';
import { policyAppliesInEcosystem } from './types';
import { effectiveVisibility } from '../access/policy';

/**
 * Consent is given inside a network. An entrepreneur in two networks who opens
 * up to their county cluster must not thereby open up statewide — that was the
 * behaviour before scoping existed, while the UI promised otherwise.
 */
describe('policyAppliesInEcosystem', () => {
  it('applies a scoped grant only in the network it was made in', () => {
    const grant = { ecosystemId: 'eco_new_haven' };
    expect(policyAppliesInEcosystem(grant, 'eco_new_haven')).toBe(true);
    expect(policyAppliesInEcosystem(grant, 'eco_connecticut')).toBe(false);
  });

  it('treats a legacy grant with no network as in force everywhere', () => {
    // Upgrading must never silently revoke access an organization relies on;
    // these are surfaced in the UI as unscoped so they can be re-made or revoked.
    expect(policyAppliesInEcosystem({}, 'eco_new_haven')).toBe(true);
    expect(policyAppliesInEcosystem({ ecosystemId: undefined }, 'eco_connecticut')).toBe(true);
  });

  it('does not filter when no network context is supplied', () => {
    expect(policyAppliesInEcosystem({ ecosystemId: 'eco_new_haven' }, undefined)).toBe(true);
  });
});

describe('effectiveVisibility', () => {
  const org = {
    operational_visibility: 'restricted' as const,
    operational_visibility_by_ecosystem: { eco_new_haven: 'open' as const },
  };

  it('uses the per-network setting where one exists', () => {
    expect(effectiveVisibility(org, 'eco_new_haven')).toBe('open');
  });

  it('is restricted in networks with no explicit choice — consent is off by default', () => {
    expect(effectiveVisibility(org, 'eco_connecticut')).toBe('restricted');
  });

  it('opening one network does not open another', () => {
    expect(effectiveVisibility(org, 'eco_new_haven')).toBe('open');
    expect(effectiveVisibility(org, 'eco_ct_makers')).toBe('restricted');
  });

  it('is restricted when no network is given', () => {
    expect(effectiveVisibility(org, undefined)).toBe('restricted');
  });

  it('ignores the legacy org-wide field, which defaulted to open and records no choice', () => {
    expect(effectiveVisibility({ operational_visibility: 'open' }, 'eco_anything')).toBe('restricted');
  });
});
