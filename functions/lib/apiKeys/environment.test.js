"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const environment_1 = require("./environment");
(0, node_test_1.describe)('API key environments', () => {
    (0, node_test_1.it)('maps projects to environments', () => {
        strict_1.default.equal((0, environment_1.environmentForProject)('entrepreneurship-nexus'), 'production');
        strict_1.default.equal((0, environment_1.environmentForProject)('entrepreneurship-nexus-staging'), 'sandbox');
        strict_1.default.equal((0, environment_1.environmentForProject)('entrepreneurship-nexus-local'), 'local');
    });
    (0, node_test_1.it)('issues sk_live_ only in production', () => {
        strict_1.default.equal((0, environment_1.apiKeyPrefixFor)('production'), 'sk_live_');
        strict_1.default.equal((0, environment_1.apiKeyPrefixFor)('sandbox'), 'sk_test_');
        strict_1.default.equal((0, environment_1.apiKeyPrefixFor)('local'), 'sk_test_');
    });
    (0, node_test_1.it)('reads the environment from the key prefix', () => {
        strict_1.default.equal((0, environment_1.environmentOfKey)('sk_live_abc'), 'production');
        strict_1.default.equal((0, environment_1.environmentOfKey)('sk_test_abc'), 'sandbox');
        strict_1.default.equal((0, environment_1.environmentOfKey)('nxk_demo_abc'), 'sandbox');
        strict_1.default.equal((0, environment_1.environmentOfKey)('test-api-key-demo001'), null);
    });
    (0, node_test_1.it)('tells a partner sending a production key to the sandbox where it belongs', () => {
        const body = (0, environment_1.unrecognizedKeyError)('sk_live_abc', 'sandbox');
        strict_1.default.equal(body.reason, 'wrong_environment');
        strict_1.default.match(body.error, /^Invalid or revoked API key/);
        strict_1.default.match(body.error, /production key/);
        strict_1.default.ok(body.hint.includes(environment_1.ENVIRONMENTS.production.functionsBaseUrl));
    });
    (0, node_test_1.it)('and the reverse', () => {
        const body = (0, environment_1.unrecognizedKeyError)('nxk_demo_abc', 'production');
        strict_1.default.equal(body.reason, 'wrong_environment');
        strict_1.default.ok(body.hint.includes(environment_1.ENVIRONMENTS.sandbox.functionsBaseUrl));
    });
    (0, node_test_1.it)('names both environments when the key matches this one but is unknown', () => {
        const body = (0, environment_1.unrecognizedKeyError)('sk_live_abc', 'production');
        strict_1.default.equal(body.reason, 'unknown_key');
        strict_1.default.match(body.error, /Nexus production does not recognize/);
        strict_1.default.ok(body.hint.includes(environment_1.ENVIRONMENTS.sandbox.functionsBaseUrl));
    });
    (0, node_test_1.it)('never claims a wrong environment on the local emulator', () => {
        strict_1.default.equal((0, environment_1.unrecognizedKeyError)('sk_live_abc', 'local').reason, 'unknown_key');
    });
});
