"use strict";
/**
 * Which Nexus environment a key belongs to, and what to tell a partner who
 * sends a key to the wrong one.
 *
 * Production and the sandbox are separate Firebase projects with separate
 * databases, so a key only exists in the one it was created in. Partners
 * mixing them up (a production key against the sandbox URL) got a bare
 * "Invalid or revoked API key"; keys now carry their environment in the
 * prefix and the 401 names the environment that answered.
 *
 * Pure: shared by Cloud Functions and the web app.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unrecognizedKeyError = exports.environmentOfKey = exports.apiKeyPrefixFor = exports.environmentForProject = exports.ENVIRONMENTS = void 0;
exports.ENVIRONMENTS = {
    production: {
        environment: 'production',
        label: 'Nexus production',
        functionsBaseUrl: 'https://us-central1-entrepreneurship-nexus.cloudfunctions.net',
        appBaseUrl: 'https://entrepreneurship-nexus.web.app',
    },
    sandbox: {
        environment: 'sandbox',
        label: 'Nexus sandbox',
        functionsBaseUrl: 'https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net',
        appBaseUrl: 'https://entrepreneurship-nexus-staging.web.app',
    },
};
const environmentForProject = (projectId) => {
    if (projectId === 'entrepreneurship-nexus')
        return 'production';
    if (projectId === 'entrepreneurship-nexus-staging')
        return 'sandbox';
    return 'local';
};
exports.environmentForProject = environmentForProject;
/** Keys issued in the app: `sk_live_` in production, `sk_test_` everywhere else. */
const apiKeyPrefixFor = (environment) => environment === 'production' ? 'sk_live_' : 'sk_test_';
exports.apiKeyPrefixFor = apiKeyPrefixFor;
/**
 * The environment a key was issued in, read from its prefix. `sandbox`
 * covers every non-production key (`sk_test_`, and `nxk_demo_` from
 * provisionDemoAgency); null for anything else.
 */
const environmentOfKey = (apiKey) => {
    if (apiKey.startsWith('sk_live_'))
        return 'production';
    if (apiKey.startsWith('sk_test_') || apiKey.startsWith('nxk_demo_'))
        return 'sandbox';
    return null;
};
exports.environmentOfKey = environmentOfKey;
/** The 401 body for a key this environment does not know. */
const unrecognizedKeyError = (apiKey, here) => {
    const hereLabel = here === 'local' ? 'local Nexus emulator' : exports.ENVIRONMENTS[here].label;
    const keyEnv = (0, exports.environmentOfKey)(apiKey);
    if (keyEnv && keyEnv !== here && here !== 'local') {
        const target = exports.ENVIRONMENTS[keyEnv];
        return {
            error: `Invalid or revoked API key: this is a ${keyEnv} key, but you are calling the ${hereLabel}.`,
            reason: 'wrong_environment',
            environment: here,
            hint: `Keys work only in the environment that issued them. Send ${keyEnv} keys to ${target.functionsBaseUrl}.`,
        };
    }
    return {
        error: `Invalid or revoked API key: the ${hereLabel} does not recognize this key.`,
        reason: 'unknown_key',
        environment: here,
        hint: `Keys work only in the environment that issued them: keys created at ${exports.ENVIRONMENTS.production.appBaseUrl} go to ${exports.ENVIRONMENTS.production.functionsBaseUrl}; sandbox keys go to ${exports.ENVIRONMENTS.sandbox.functionsBaseUrl}. If the key was revoked, create a new one.`,
    };
};
exports.unrecognizedKeyError = unrecognizedKeyError;
