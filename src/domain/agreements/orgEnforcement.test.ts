import { describe, it, expect } from 'vitest';
import {
  classifySignature,
  computeSignatureStatus,
  isDraftPhaseForVersions,
  isHardEnforcementActive,
  isHardEnforcementForVersions,
  selectBannerTone,
} from './orgEnforcement';
import {
  AGREEMENT_VERSIONS,
  ORG_REQUIRED_AGREEMENTS,
  type OrgAgreementAcceptance,
  type OrgAgreementType,
} from './types';

const sig = (overrides: Partial<OrgAgreementAcceptance>): OrgAgreementAcceptance => ({
  id: 'org_eco_compact',
  org_id: 'org',
  ecosystem_id: 'eco',
  agreement_type: 'federation_compact',
  version: '1.0',
  signed_by_uid: 'uid_1',
  signed_by_person_id: 'p_1',
  signed_by_name: 'Admin User',
  signed_by_role: 'eso_admin',
  signed_at: '2026-05-01T00:00:00.000Z',
  ...overrides,
});

const VERSIONS_DRAFT: Record<OrgAgreementType, string> = {
  data_usage_agreement: '1.0',
  federation_compact: '0.1-draft',
};

const VERSIONS_FINAL: Record<OrgAgreementType, string> = {
  data_usage_agreement: '1.0',
  federation_compact: '1.0',
};

// ---------------------------------------------------------------------------
// computeSignatureStatus
// ---------------------------------------------------------------------------
describe('computeSignatureStatus', () => {
  it('reports both required types as missing when no signatures exist', () => {
    const status = computeSignatureStatus([], ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(false);
    expect(status.missingTypes.sort()).toEqual([...ORG_REQUIRED_AGREEMENTS].sort());
    expect(status.staleTypes).toEqual([]);
  });

  it('reports the unsigned type as missing when only one is signed', () => {
    const signatures = [sig({ agreement_type: 'federation_compact', version: '1.0' })];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(false);
    expect(status.missingTypes).toEqual(['data_usage_agreement']);
    expect(status.staleTypes).toEqual([]);
  });

  it('reports a stale signature when the version no longer matches', () => {
    const signatures = [
      sig({ agreement_type: 'federation_compact', version: '0.1-draft' }),
      sig({ id: 's2', agreement_type: 'data_usage_agreement', version: '1.0' }),
    ];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(false);
    expect(status.staleTypes).toEqual(['federation_compact']);
    expect(status.missingTypes).toEqual([]);
  });

  it('treats revoked signatures as missing (not stale, not active)', () => {
    const signatures = [
      sig({
        agreement_type: 'federation_compact',
        version: '1.0',
        revoked_at: '2026-05-02T00:00:00.000Z',
      }),
      sig({ id: 's2', agreement_type: 'data_usage_agreement', version: '1.0' }),
    ];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(false);
    expect(status.missingTypes).toEqual(['federation_compact']);
    expect(status.staleTypes).toEqual([]);
  });

  it('returns signed=true when every required type is current and active', () => {
    const signatures = [
      sig({ agreement_type: 'federation_compact', version: '1.0' }),
      sig({ id: 's2', agreement_type: 'data_usage_agreement', version: '1.0' }),
    ];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(true);
    expect(status.missingTypes).toEqual([]);
    expect(status.staleTypes).toEqual([]);
  });

  it('still works with the live AGREEMENT_VERSIONS constant (regression guard)', () => {
    // Ensures the helper composes with the production versions object —
    // catches accidental key mismatches between AGREEMENT_VERSIONS and
    // ORG_REQUIRED_AGREEMENTS.
    const signatures = [
      sig({ agreement_type: 'federation_compact', version: AGREEMENT_VERSIONS.federation_compact }),
      sig({ id: 's2', agreement_type: 'data_usage_agreement', version: AGREEMENT_VERSIONS.data_usage_agreement }),
    ];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, AGREEMENT_VERSIONS);
    expect(status.signed).toBe(true);
  });

  it('ignores signatures of unrequired types', () => {
    const signatures = [
      sig({ agreement_type: 'federation_compact', version: '1.0' }),
      sig({ id: 's2', agreement_type: 'data_usage_agreement', version: '1.0' }),
      // An extra "old" record at a now-superseded type would not affect status;
      // none of our required types match its agreement_type. Use a cast to
      // simulate stale unknown-type rows.
      sig({ id: 's3', agreement_type: 'unknown_type' as OrgAgreementType, version: '0.1' }),
    ];
    const status = computeSignatureStatus(signatures, ORG_REQUIRED_AGREEMENTS, VERSIONS_FINAL);
    expect(status.signed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isHardEnforcementForVersions / isDraftPhaseForVersions
// ---------------------------------------------------------------------------
describe('isHardEnforcementForVersions', () => {
  it('returns false when any required version is "-draft"', () => {
    expect(isHardEnforcementForVersions(VERSIONS_DRAFT)).toBe(false);
  });

  it('returns true when all required versions are non-draft', () => {
    expect(isHardEnforcementForVersions(VERSIONS_FINAL)).toBe(true);
  });

  it('treats any version string containing "-draft" as draft', () => {
    expect(isHardEnforcementForVersions({
      data_usage_agreement: '2.0-draft',
      federation_compact: '1.0',
    })).toBe(false);
  });
});

describe('isDraftPhaseForVersions', () => {
  it('is true when at least one required type is in draft', () => {
    expect(isDraftPhaseForVersions(VERSIONS_DRAFT)).toBe(true);
  });

  it('is false when every required type is finalized', () => {
    expect(isDraftPhaseForVersions(VERSIONS_FINAL)).toBe(false);
  });
});

describe('isHardEnforcementActive (live constants)', () => {
  it('returns false today (compact is "0.1-draft")', () => {
    // Regression guard: when the federation_compact version is bumped to
    // 1.0, this assertion will need to flip — and that's the moment to
    // also wire the actual signature check into canViewOperationalDetails.
    expect(isHardEnforcementActive()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifySignature
// ---------------------------------------------------------------------------
describe('classifySignature', () => {
  it('returns "missing" for null/undefined', () => {
    expect(classifySignature(null, '1.0')).toBe('missing');
    expect(classifySignature(undefined, '1.0')).toBe('missing');
  });

  it('returns "missing" for revoked signatures even at the right version', () => {
    expect(classifySignature(sig({ version: '1.0', revoked_at: '2026-05-02T00:00:00.000Z' }), '1.0')).toBe('missing');
  });

  it('returns "stale" when the version differs', () => {
    expect(classifySignature(sig({ version: '0.1-draft' }), '1.0')).toBe('stale');
  });

  it('returns "signed" when current and active', () => {
    expect(classifySignature(sig({ version: '1.0' }), '1.0')).toBe('signed');
  });
});

// ---------------------------------------------------------------------------
// selectBannerTone
// ---------------------------------------------------------------------------
describe('selectBannerTone', () => {
  it('returns blocking (rose) when there is a gap AND enforcement is active', () => {
    const tone = selectBannerTone({ signed: false, hasGap: true, isDraft: false, enforcementActive: true });
    expect(tone.toneClasses).toMatch(/rose/);
    expect(tone.badge?.label).toBe('Compact signature required');
  });

  it('returns advisory (amber) when there is a gap during draft phase', () => {
    const tone = selectBannerTone({ signed: false, hasGap: true, isDraft: true, enforcementActive: false });
    expect(tone.toneClasses).toMatch(/amber/);
    expect(tone.badge?.label).toBe('Compact unsigned (advisory)');
  });

  it('prefers blocking over advisory when both could apply', () => {
    // hasGap=true, enforcementActive=true, isDraft=true (theoretical edge:
    // someone marked enforcement active despite a draft slipping in)
    const tone = selectBannerTone({ signed: false, hasGap: true, isDraft: true, enforcementActive: true });
    expect(tone.toneClasses).toMatch(/rose/);
  });

  it('returns neutral indigo with a "Compact signed" badge when fully signed', () => {
    const tone = selectBannerTone({ signed: true, hasGap: false, isDraft: false, enforcementActive: true });
    expect(tone.toneClasses).toMatch(/indigo/);
    expect(tone.badge?.label).toBe('Compact signed');
    expect(tone.badge?.classes).toMatch(/emerald/);
  });

  it('returns neutral with no badge when status is unknown (loading)', () => {
    const tone = selectBannerTone({ signed: false, hasGap: false, isDraft: true, enforcementActive: false });
    expect(tone.toneClasses).toMatch(/indigo/);
    expect(tone.badge).toBeNull();
  });
});
