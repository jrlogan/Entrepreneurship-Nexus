"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const terms_1 = require("./terms");
const recordConsent_1 = require("./recordConsent");
(0, node_test_1.describe)('consent terms', () => {
    (0, node_test_1.it)('are stable: the same text always yields the same terms_hash', async () => {
        const a = await (0, terms_1.buildConsentTerms)();
        const b = await (0, terms_1.buildConsentTerms)();
        strict_1.default.equal(a.terms_hash, b.terms_hash);
        strict_1.default.match(a.terms_hash, /^[0-9a-f]{64}$/);
        strict_1.default.deepEqual(a.documents.map((d) => d.type), ['federation_compact', 'privacy_policy']);
    });
    (0, node_test_1.it)('default both optional choices to off', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        strict_1.default.equal(terms.choices.directory_listing.default, false);
        strict_1.default.equal(terms.choices.share_details.default, false);
    });
});
(0, node_test_1.describe)('parseFounderConsent', () => {
    (0, node_test_1.it)('accepts consent against the current terms', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        const result = (0, terms_1.parseFounderConsent)({ agreed: true, terms_hash: terms.terms_hash, directory_listing: true }, terms);
        strict_1.default.ok(result.ok);
        if (result.ok) {
            strict_1.default.equal(result.value.directory_listing, true);
            strict_1.default.equal(result.value.share_details, false);
        }
    });
    (0, node_test_1.it)('refuses to record consent the founder did not give', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        for (const agreed of [false, 'true', undefined, 1]) {
            const result = (0, terms_1.parseFounderConsent)({ agreed, terms_hash: terms.terms_hash }, terms);
            strict_1.default.equal(result.ok, false);
            if (!result.ok)
                strict_1.default.equal(result.reason, 'not_agreed');
        }
    });
    (0, node_test_1.it)('refuses consent given against outdated terms', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        const result = (0, terms_1.parseFounderConsent)({ agreed: true, terms_hash: 'a'.repeat(64) }, terms);
        strict_1.default.equal(result.ok, false);
        if (!result.ok) {
            strict_1.default.equal(result.status, 409);
            strict_1.default.equal(result.reason, 'terms_outdated');
        }
    });
    (0, node_test_1.it)('refuses a future accepted_at', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const result = (0, terms_1.parseFounderConsent)({ agreed: true, terms_hash: terms.terms_hash, accepted_at: future }, terms);
        strict_1.default.equal(result.ok, false);
    });
    (0, node_test_1.it)('requires booleans for the choices — no truthy strings', async () => {
        const terms = await (0, terms_1.buildConsentTerms)();
        const result = (0, terms_1.parseFounderConsent)({ agreed: true, terms_hash: terms.terms_hash, directory_listing: 'yes' }, terms);
        strict_1.default.equal(result.ok, false);
    });
});
(0, node_test_1.describe)('validateReturnUrl', () => {
    const org = { url: 'https://www.makehaven.org' };
    (0, node_test_1.it)('allows no return URL', () => {
        strict_1.default.deepEqual((0, recordConsent_1.validateReturnUrl)(undefined, org), { ok: true, url: null });
    });
    (0, node_test_1.it)('allows https URLs on the partner\'s own site and subdomains', () => {
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('https://makehaven.org/join/done', org).ok, true);
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('https://members.makehaven.org/welcome', org).ok, true);
    });
    (0, node_test_1.it)('refuses other hosts — the consent page is not an open redirect', () => {
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('https://evil.example/phish', org).ok, false);
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('https://makehaven.org.evil.example/', org).ok, false);
    });
    (0, node_test_1.it)('refuses plain http', () => {
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('http://makehaven.org/done', org).ok, false);
    });
    (0, node_test_1.it)('allows a registered origin even off the main site', () => {
        const registered = { url: 'https://example.org', consent_return_origins: ['https://signup.partner-forms.io'] };
        strict_1.default.equal((0, recordConsent_1.validateReturnUrl)('https://signup.partner-forms.io/thanks', registered).ok, true);
    });
});
