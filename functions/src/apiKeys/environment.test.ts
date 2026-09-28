import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiKeyPrefixFor, environmentForProject, environmentOfKey, unrecognizedKeyError, ENVIRONMENTS } from './environment';

describe('API key environments', () => {
  it('maps projects to environments', () => {
    assert.equal(environmentForProject('entrepreneurship-nexus'), 'production');
    assert.equal(environmentForProject('entrepreneurship-nexus-staging'), 'sandbox');
    assert.equal(environmentForProject('entrepreneurship-nexus-local'), 'local');
  });

  it('issues sk_live_ only in production', () => {
    assert.equal(apiKeyPrefixFor('production'), 'sk_live_');
    assert.equal(apiKeyPrefixFor('sandbox'), 'sk_test_');
    assert.equal(apiKeyPrefixFor('local'), 'sk_test_');
  });

  it('reads the environment from the key prefix', () => {
    assert.equal(environmentOfKey('sk_live_abc'), 'production');
    assert.equal(environmentOfKey('sk_test_abc'), 'sandbox');
    assert.equal(environmentOfKey('nxk_demo_abc'), 'sandbox');
    assert.equal(environmentOfKey('test-api-key-demo001'), null);
  });

  it('tells a partner sending a production key to the sandbox where it belongs', () => {
    const body = unrecognizedKeyError('sk_live_abc', 'sandbox');
    assert.equal(body.reason, 'wrong_environment');
    assert.match(body.error, /^Invalid or revoked API key/);
    assert.match(body.error, /production key/);
    assert.ok(body.hint.includes(ENVIRONMENTS.production.functionsBaseUrl));
  });

  it('and the reverse', () => {
    const body = unrecognizedKeyError('nxk_demo_abc', 'production');
    assert.equal(body.reason, 'wrong_environment');
    assert.ok(body.hint.includes(ENVIRONMENTS.sandbox.functionsBaseUrl));
  });

  it('names both environments when the key matches this one but is unknown', () => {
    const body = unrecognizedKeyError('sk_live_abc', 'production');
    assert.equal(body.reason, 'unknown_key');
    assert.match(body.error, /Nexus production does not recognize/);
    assert.ok(body.hint.includes(ENVIRONMENTS.sandbox.functionsBaseUrl));
  });

  it('never claims a wrong environment on the local emulator', () => {
    assert.equal(unrecognizedKeyError('sk_live_abc', 'local').reason, 'unknown_key');
  });
});
