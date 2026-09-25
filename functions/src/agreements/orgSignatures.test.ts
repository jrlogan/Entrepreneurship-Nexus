import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrgSignatures } from './orgSignatures';
import { AGREEMENT_VERSIONS } from './content';

const sig = (type: string, version = AGREEMENT_VERSIONS[type as keyof typeof AGREEMENT_VERSIONS]) => ({ agreement_type: type, version });

describe('what an organization must sign depends on its tier', () => {
  it('a member signs the membership terms, the compact and the data agreement', () => {
    const status = evaluateOrgSignatures([sig('network_membership'), sig('federation_compact'), sig('data_usage_agreement')]);
    assert.equal(status.signed, true);
    assert.equal(status.tier, 'member');
    assert.equal(evaluateOrgSignatures([sig('network_membership'), sig('data_usage_agreement')]).signed, false);
  });

  it('a referral partner signs its own terms and the data agreement — the membership terms do not count', () => {
    assert.equal(evaluateOrgSignatures([sig('referral_partner_terms'), sig('data_usage_agreement')], 'referral_partner').signed, true);
    const wrongDocs = evaluateOrgSignatures([sig('network_membership'), sig('federation_compact'), sig('data_usage_agreement')], 'referral_partner');
    assert.equal(wrongDocs.signed, false);
    assert.deepEqual(wrongDocs.missing, ['referral_partner_terms']);
  });

  it('an old version or a revoked signature does not count', () => {
    assert.equal(evaluateOrgSignatures([sig('referral_partner_terms', '0.0-pilot'), sig('data_usage_agreement')], 'referral_partner').signed, false);
    assert.equal(evaluateOrgSignatures([{ ...sig('referral_partner_terms'), revoked_at: '2026-09-25' }, sig('data_usage_agreement')], 'referral_partner').signed, false);
  });
});
