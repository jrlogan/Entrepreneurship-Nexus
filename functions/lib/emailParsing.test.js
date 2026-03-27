"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const emailParsing_1 = require("./emailParsing");
// ---------------------------------------------------------------------------
// stripOutlookWrapper
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('stripOutlookWrapper', () => {
    (0, node_test_1.it)('strips [email<mailto:email>] format', () => {
        strict_1.default.equal((0, emailParsing_1.stripOutlookWrapper)('[squirt.first@yo.com<mailto:squirt.first@yo.com>]'), 'squirt.first@yo.com');
    });
    (0, node_test_1.it)('strips [text<https://url>] format', () => {
        strict_1.default.equal((0, emailParsing_1.stripOutlookWrapper)('[ClimateHaven<https://climatehaven.org>]'), 'ClimateHaven');
    });
    (0, node_test_1.it)('strips plain [text] bracket wrapping', () => {
        strict_1.default.equal((0, emailParsing_1.stripOutlookWrapper)('[ClimateHaven]'), 'ClimateHaven');
    });
    (0, node_test_1.it)('returns value unchanged when no brackets', () => {
        strict_1.default.equal((0, emailParsing_1.stripOutlookWrapper)('squirt.first@yo.com'), 'squirt.first@yo.com');
        strict_1.default.equal((0, emailParsing_1.stripOutlookWrapper)('ClimateHaven'), 'ClimateHaven');
    });
});
// ---------------------------------------------------------------------------
// extractEmails
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('extractEmails', () => {
    (0, node_test_1.it)('extracts a single email from plain text', () => {
        const result = (0, emailParsing_1.extractEmails)('Please contact jane@example.com for details.');
        strict_1.default.deepEqual(result, ['jane@example.com']);
    });
    (0, node_test_1.it)('extracts multiple emails and deduplicates', () => {
        const result = (0, emailParsing_1.extractEmails)('From: a@foo.com, also a@foo.com and b@bar.org');
        strict_1.default.deepEqual(result, ['a@foo.com', 'b@bar.org']);
    });
    (0, node_test_1.it)('normalises to lowercase', () => {
        const result = (0, emailParsing_1.extractEmails)('Contact JANE@EXAMPLE.COM');
        strict_1.default.deepEqual(result, ['jane@example.com']);
    });
    (0, node_test_1.it)('returns empty array for empty input', () => {
        strict_1.default.deepEqual((0, emailParsing_1.extractEmails)(''), []);
        strict_1.default.deepEqual((0, emailParsing_1.extractEmails)(undefined), []);
    });
    (0, node_test_1.it)('returns empty array when no emails present', () => {
        strict_1.default.deepEqual((0, emailParsing_1.extractEmails)('No emails here.'), []);
    });
});
// ---------------------------------------------------------------------------
// extractNameFromSubject
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('extractNameFromSubject', () => {
    (0, node_test_1.it)('extracts name from "Introduction: Name" format', () => {
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)('Introduction: Jane Smith'), 'Jane Smith');
    });
    (0, node_test_1.it)('extracts name and ignores "to Org" suffix', () => {
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)('Introduction: Jane Smith to MakeHaven'), 'Jane Smith');
    });
    (0, node_test_1.it)('is case-insensitive on the keyword', () => {
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)('introduction: Jane Smith'), 'Jane Smith');
    });
    (0, node_test_1.it)('returns undefined for unstructured subjects', () => {
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)('Fwd: quick intro'), undefined);
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)(''), undefined);
        strict_1.default.equal((0, emailParsing_1.extractNameFromSubject)(undefined), undefined);
    });
});
// ---------------------------------------------------------------------------
// parseFooter
// ---------------------------------------------------------------------------
const SAMPLE_FOOTER = `
Some email body text here.

--- NETWORK REFERRAL DATA ---
client_name: Jane Smith
client_email: jane@example.com
client_venture: Acme Co
receiving_org: MakeHaven
intro_contact_permission:
- [x] on_file
support_needs:
- [x] funding
- [x] business_coaching
venture_stage:
- [x] idea
--- END NETWORK REFERRAL DATA ---
`.trim();
(0, node_test_1.describe)('parseFooter', () => {
    (0, node_test_1.it)('returns null when no footer block present', () => {
        strict_1.default.equal((0, emailParsing_1.parseFooter)('Just a normal email body.'), null);
        strict_1.default.equal((0, emailParsing_1.parseFooter)(''), null);
        strict_1.default.equal((0, emailParsing_1.parseFooter)(undefined), null);
    });
    (0, node_test_1.it)('parses key-value fields', () => {
        const result = (0, emailParsing_1.parseFooter)(SAMPLE_FOOTER);
        strict_1.default.ok(result);
        strict_1.default.equal(result['client_name'], 'Jane Smith');
        strict_1.default.equal(result['client_email'], 'jane@example.com');
        strict_1.default.equal(result['client_venture'], 'Acme Co');
        strict_1.default.equal(result['receiving_org'], 'MakeHaven');
    });
    (0, node_test_1.it)('parses checked checkboxes into arrays', () => {
        const result = (0, emailParsing_1.parseFooter)(SAMPLE_FOOTER);
        strict_1.default.ok(result);
        strict_1.default.deepEqual(result['intro_contact_permission'], ['on_file']);
        strict_1.default.deepEqual(result['support_needs'], ['funding', 'business_coaching']);
        strict_1.default.deepEqual(result['venture_stage'], ['idea']);
    });
    (0, node_test_1.it)('is case-insensitive on delimiter', () => {
        const text = '--- network referral data ---\nclient_name: Test\n--- end network referral data ---';
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        strict_1.default.equal(result['client_name'], 'Test');
    });
    (0, node_test_1.it)('strips Outlook [value<mailto:>] wrapper from footer fields', () => {
        const text = [
            '--- NETWORK REFERRAL DATA ---',
            'client_name: [Squirt First<mailto:squirt.first@yo.com>]',
            'client_email: [squirt.first@yo.com<mailto:squirt.first@yo.com>]',
            'receiving_org: [ClimateHaven<https://climatehaven.org>]',
            '--- END NETWORK REFERRAL DATA ---',
        ].join('\n');
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        strict_1.default.equal(result['client_name'], 'Squirt First');
        strict_1.default.equal(result['client_email'], 'squirt.first@yo.com');
        strict_1.default.equal(result['receiving_org'], 'ClimateHaven');
    });
    (0, node_test_1.it)('strips Outlook wrappers from checkbox list items', () => {
        const text = [
            '--- NETWORK REFERRAL DATA ---',
            'support_needs:',
            '- [x] [funding<mailto:funding>]',
            '--- END NETWORK REFERRAL DATA ---',
        ].join('\n');
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        strict_1.default.deepEqual(result['support_needs'], ['funding']);
    });
    (0, node_test_1.it)('parses bare bracket checkboxes: [x], [ x], [x ], [ x ]', () => {
        const text = [
            '--- NETWORK REFERRAL DATA ---',
            'venture_stage:',
            '[] idea',
            '[ ] prototype',
            '[x ] early_revenue',
            '[ x] scaling',
            '[ x ] established',
            '[ s] unknown', // typo — NOT checked, should be ignored
            '--- END NETWORK REFERRAL DATA ---',
        ].join('\n');
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        // Only properly-checked variants should appear
        strict_1.default.deepEqual(result['venture_stage'], ['early_revenue', 'scaling', 'established']);
    });
    (0, node_test_1.it)('parses the real-world Horst footer format', () => {
        const text = [
            '--- NETWORK REFERRAL DATA ---',
            'client_name: Horst',
            'client_email: horst@reverttech.com',
            'referrer_email: casey@climatehaven.tech',
            'receiving_org: MakeHaven',
            '',
            'incorporation_status:',
            '[] not_incorporated',
            '[ x] incorporated',
            '[ ] unknown',
            '',
            'venture_stage:',
            '[ ] idea',
            '[x ] prototype',
            '[x ] early_revenue',
            '[ ] scaling',
            '',
            'support_needs:',
            '[ ] funding',
            '[ x] legal',
            '[x ] manufacturing',
            '[x ] hiring',
            '[ s] networking',
            '--- END NETWORK REFERRAL DATA ---',
        ].join('\n');
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        strict_1.default.equal(result['client_name'], 'Horst');
        strict_1.default.equal(result['client_email'], 'horst@reverttech.com');
        strict_1.default.equal(result['receiving_org'], 'MakeHaven');
        strict_1.default.deepEqual(result['incorporation_status'], ['incorporated']);
        strict_1.default.deepEqual(result['venture_stage'], ['prototype', 'early_revenue']);
        strict_1.default.deepEqual(result['support_needs'], ['legal', 'manufacturing', 'hiring']);
    });
    (0, node_test_1.it)('handles Windows line endings (CRLF)', () => {
        const text = '--- NETWORK REFERRAL DATA ---\r\nclient_name: Test\r\n--- END NETWORK REFERRAL DATA ---';
        const result = (0, emailParsing_1.parseFooter)(text);
        strict_1.default.ok(result);
        strict_1.default.equal(result['client_name'], 'Test');
    });
});
// ---------------------------------------------------------------------------
// extractReferralNote
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('extractReferralNote', () => {
    (0, node_test_1.it)('returns text before the footer block', () => {
        const text = 'Hi team, great meeting Jane.\n\n--- NETWORK REFERRAL DATA ---\nclient_name: Jane\n--- END NETWORK REFERRAL DATA ---';
        strict_1.default.equal((0, emailParsing_1.extractReferralNote)(text), 'Hi team, great meeting Jane.');
    });
    (0, node_test_1.it)('returns full text when no footer present', () => {
        strict_1.default.equal((0, emailParsing_1.extractReferralNote)('Just a plain email.'), 'Just a plain email.');
    });
    (0, node_test_1.it)('collapses excessive blank lines', () => {
        const text = 'Line one.\n\n\n\nLine two.';
        strict_1.default.equal((0, emailParsing_1.extractReferralNote)(text), 'Line one.\n\nLine two.');
    });
    (0, node_test_1.it)('returns empty string for empty input', () => {
        strict_1.default.equal((0, emailParsing_1.extractReferralNote)(''), '');
        strict_1.default.equal((0, emailParsing_1.extractReferralNote)(undefined), '');
    });
});
// ---------------------------------------------------------------------------
// extractClientEmail — CC convention
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('extractClientEmail', () => {
    const ROUTE = 'abc123@inbound.postmarkapp.com';
    const SENDER = 'advisor@agency.org';
    (0, node_test_1.it)('picks entrepreneur from CC field', () => {
        const { clientEmail, additionalCcEmails } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: ['jane@example.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'jane@example.com');
        strict_1.default.deepEqual(additionalCcEmails, []);
    });
    (0, node_test_1.it)('prefers footer email over CC', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            footerEmail: 'footer@example.com',
            ccEmails: ['cc@example.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'footer@example.com');
    });
    (0, node_test_1.it)('excludes sender from CC candidates', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: [SENDER, 'entrepreneur@example.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'entrepreneur@example.com');
    });
    (0, node_test_1.it)('excludes route address from CC candidates', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: [ROUTE, 'entrepreneur@example.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'entrepreneur@example.com');
    });
    (0, node_test_1.it)('falls back to body scan when CC is empty', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: [],
            textBody: 'Please connect with jane@startup.com about her venture.',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'jane@startup.com');
    });
    (0, node_test_1.it)('returns empty string when no email found anywhere', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: [],
            textBody: 'No emails here.',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, '');
    });
    (0, node_test_1.it)('handles multiple CC entrepreneurs — first is primary, rest are additional', () => {
        const { clientEmail, additionalCcEmails } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: ['first@startup.com', 'second@startup.com', 'third@startup.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'first@startup.com');
        strict_1.default.deepEqual(additionalCcEmails, ['second@startup.com', 'third@startup.com']);
    });
    (0, node_test_1.it)('normalises email addresses to lowercase', () => {
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: ['JANE@EXAMPLE.COM'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        strict_1.default.equal(clientEmail, 'jane@example.com');
    });
    (0, node_test_1.it)('notify_entrepreneurs false — treats missing flag as false (no email sent)', () => {
        // This test documents the expected behaviour: when the flag is missing/falsy
        // the entrepreneur email should not be included in recipients.
        // The flag check happens in index.ts; here we just confirm extractClientEmail
        // still finds the email (the suppression is a separate concern).
        const { clientEmail } = (0, emailParsing_1.extractClientEmail)({
            ccEmails: ['entrepreneur@example.com'],
            textBody: '',
            senderEmail: SENDER,
            routeAddress: ROUTE,
        });
        // extractClientEmail always finds the email — suppression is downstream
        strict_1.default.equal(clientEmail, 'entrepreneur@example.com');
    });
});
