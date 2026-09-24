import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConsentTerms, parseFounderConsent } from './terms';
import { validateReturnUrl } from './recordConsent';

describe('consent terms', () => {
  it('are stable: the same text always yields the same terms_hash', async () => {
    const a = await buildConsentTerms();
    const b = await buildConsentTerms();
    assert.equal(a.terms_hash, b.terms_hash);
    assert.match(a.terms_hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(a.documents.map((d) => d.type), ['federation_compact', 'privacy_policy']);
  });

  it('default both optional choices to off', async () => {
    const terms = await buildConsentTerms();
    assert.equal(terms.choices.directory_listing.default, false);
    assert.equal(terms.choices.share_details.default, false);
  });
});

describe('parseFounderConsent', () => {
  it('accepts consent against the current terms', async () => {
    const terms = await buildConsentTerms();
    const result = parseFounderConsent({ agreed: true, terms_hash: terms.terms_hash, directory_listing: true }, terms);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.value.directory_listing, true);
      assert.equal(result.value.share_details, false);
    }
  });

  it('refuses to record consent the founder did not give', async () => {
    const terms = await buildConsentTerms();
    for (const agreed of [false, 'true', undefined, 1]) {
      const result = parseFounderConsent({ agreed, terms_hash: terms.terms_hash }, terms);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'not_agreed');
    }
  });

  it('refuses consent given against outdated terms', async () => {
    const terms = await buildConsentTerms();
    const result = parseFounderConsent({ agreed: true, terms_hash: 'a'.repeat(64) }, terms);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.reason, 'terms_outdated');
    }
  });

  it('refuses a future accepted_at', async () => {
    const terms = await buildConsentTerms();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = parseFounderConsent({ agreed: true, terms_hash: terms.terms_hash, accepted_at: future }, terms);
    assert.equal(result.ok, false);
  });

  it('requires booleans for the choices — no truthy strings', async () => {
    const terms = await buildConsentTerms();
    const result = parseFounderConsent({ agreed: true, terms_hash: terms.terms_hash, directory_listing: 'yes' }, terms);
    assert.equal(result.ok, false);
  });
});

describe('validateReturnUrl', () => {
  const org = { url: 'https://www.makehaven.org' };

  it('allows no return URL', () => {
    assert.deepEqual(validateReturnUrl(undefined, org), { ok: true, url: null });
  });

  it('allows https URLs on the partner\'s own site and subdomains', () => {
    assert.equal(validateReturnUrl('https://makehaven.org/join/done', org).ok, true);
    assert.equal(validateReturnUrl('https://members.makehaven.org/welcome', org).ok, true);
  });

  it('refuses other hosts — the consent page is not an open redirect', () => {
    assert.equal(validateReturnUrl('https://evil.example/phish', org).ok, false);
    assert.equal(validateReturnUrl('https://makehaven.org.evil.example/', org).ok, false);
  });

  it('refuses plain http', () => {
    assert.equal(validateReturnUrl('http://makehaven.org/done', org).ok, false);
  });

  it('allows a registered origin even off the main site', () => {
    const registered = { url: 'https://example.org', consent_return_origins: ['https://signup.partner-forms.io'] };
    assert.equal(validateReturnUrl('https://signup.partner-forms.io/thanks', registered).ok, true);
  });
});
