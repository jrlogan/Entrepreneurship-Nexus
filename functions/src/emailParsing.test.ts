import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmails,
  extractNameFromSubject,
  parseFooter,
  extractReferralNote,
  extractClientEmail,
  stripOutlookWrapper,
} from './emailParsing';

// ---------------------------------------------------------------------------
// stripOutlookWrapper
// ---------------------------------------------------------------------------
describe('stripOutlookWrapper', () => {
  it('strips [email<mailto:email>] format', () => {
    assert.equal(stripOutlookWrapper('[squirt.first@yo.com<mailto:squirt.first@yo.com>]'), 'squirt.first@yo.com');
  });

  it('strips [text<https://url>] format', () => {
    assert.equal(stripOutlookWrapper('[ClimateHaven<https://climatehaven.org>]'), 'ClimateHaven');
  });

  it('strips plain [text] bracket wrapping', () => {
    assert.equal(stripOutlookWrapper('[ClimateHaven]'), 'ClimateHaven');
  });

  it('returns value unchanged when no brackets', () => {
    assert.equal(stripOutlookWrapper('squirt.first@yo.com'), 'squirt.first@yo.com');
    assert.equal(stripOutlookWrapper('ClimateHaven'), 'ClimateHaven');
  });
});

// ---------------------------------------------------------------------------
// extractEmails
// ---------------------------------------------------------------------------
describe('extractEmails', () => {
  it('extracts a single email from plain text', () => {
    const result = extractEmails('Please contact jane@example.com for details.');
    assert.deepEqual(result, ['jane@example.com']);
  });

  it('extracts multiple emails and deduplicates', () => {
    const result = extractEmails('From: a@foo.com, also a@foo.com and b@bar.org');
    assert.deepEqual(result, ['a@foo.com', 'b@bar.org']);
  });

  it('normalises to lowercase', () => {
    const result = extractEmails('Contact JANE@EXAMPLE.COM');
    assert.deepEqual(result, ['jane@example.com']);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(extractEmails(''), []);
    assert.deepEqual(extractEmails(undefined), []);
  });

  it('returns empty array when no emails present', () => {
    assert.deepEqual(extractEmails('No emails here.'), []);
  });
});

// ---------------------------------------------------------------------------
// extractNameFromSubject
// ---------------------------------------------------------------------------
describe('extractNameFromSubject', () => {
  it('extracts name from "Introduction: Name" format', () => {
    assert.equal(extractNameFromSubject('Introduction: Jane Smith'), 'Jane Smith');
  });

  it('extracts name and ignores "to Org" suffix', () => {
    assert.equal(extractNameFromSubject('Introduction: Jane Smith to MakeHaven'), 'Jane Smith');
  });

  it('is case-insensitive on the keyword', () => {
    assert.equal(extractNameFromSubject('introduction: Jane Smith'), 'Jane Smith');
  });

  it('returns undefined for unstructured subjects', () => {
    assert.equal(extractNameFromSubject('Fwd: quick intro'), undefined);
    assert.equal(extractNameFromSubject(''), undefined);
    assert.equal(extractNameFromSubject(undefined), undefined);
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

describe('parseFooter', () => {
  it('returns null when no footer block present', () => {
    assert.equal(parseFooter('Just a normal email body.'), null);
    assert.equal(parseFooter(''), null);
    assert.equal(parseFooter(undefined), null);
  });

  it('parses key-value fields', () => {
    const result = parseFooter(SAMPLE_FOOTER);
    assert.ok(result);
    assert.equal(result['client_name'], 'Jane Smith');
    assert.equal(result['client_email'], 'jane@example.com');
    assert.equal(result['client_venture'], 'Acme Co');
    assert.equal(result['receiving_org'], 'MakeHaven');
  });

  it('parses checked checkboxes into arrays', () => {
    const result = parseFooter(SAMPLE_FOOTER);
    assert.ok(result);
    assert.deepEqual(result['intro_contact_permission'], ['on_file']);
    assert.deepEqual(result['support_needs'], ['funding', 'business_coaching']);
    assert.deepEqual(result['venture_stage'], ['idea']);
  });

  it('is case-insensitive on delimiter', () => {
    const text = '--- network referral data ---\nclient_name: Test\n--- end network referral data ---';
    const result = parseFooter(text);
    assert.ok(result);
    assert.equal(result['client_name'], 'Test');
  });

  it('strips Outlook [value<mailto:>] wrapper from footer fields', () => {
    const text = [
      '--- NETWORK REFERRAL DATA ---',
      'client_name: [Squirt First<mailto:squirt.first@yo.com>]',
      'client_email: [squirt.first@yo.com<mailto:squirt.first@yo.com>]',
      'receiving_org: [ClimateHaven<https://climatehaven.org>]',
      '--- END NETWORK REFERRAL DATA ---',
    ].join('\n');
    const result = parseFooter(text);
    assert.ok(result);
    assert.equal(result['client_name'], 'Squirt First');
    assert.equal(result['client_email'], 'squirt.first@yo.com');
    assert.equal(result['receiving_org'], 'ClimateHaven');
  });

  it('strips Outlook wrappers from checkbox list items', () => {
    const text = [
      '--- NETWORK REFERRAL DATA ---',
      'support_needs:',
      '- [x] [funding<mailto:funding>]',
      '--- END NETWORK REFERRAL DATA ---',
    ].join('\n');
    const result = parseFooter(text);
    assert.ok(result);
    assert.deepEqual(result['support_needs'], ['funding']);
  });

  it('handles Windows line endings (CRLF)', () => {
    const text = '--- NETWORK REFERRAL DATA ---\r\nclient_name: Test\r\n--- END NETWORK REFERRAL DATA ---';
    const result = parseFooter(text);
    assert.ok(result);
    assert.equal(result['client_name'], 'Test');
  });
});

// ---------------------------------------------------------------------------
// extractReferralNote
// ---------------------------------------------------------------------------
describe('extractReferralNote', () => {
  it('returns text before the footer block', () => {
    const text = 'Hi team, great meeting Jane.\n\n--- NETWORK REFERRAL DATA ---\nclient_name: Jane\n--- END NETWORK REFERRAL DATA ---';
    assert.equal(extractReferralNote(text), 'Hi team, great meeting Jane.');
  });

  it('returns full text when no footer present', () => {
    assert.equal(extractReferralNote('Just a plain email.'), 'Just a plain email.');
  });

  it('collapses excessive blank lines', () => {
    const text = 'Line one.\n\n\n\nLine two.';
    assert.equal(extractReferralNote(text), 'Line one.\n\nLine two.');
  });

  it('returns empty string for empty input', () => {
    assert.equal(extractReferralNote(''), '');
    assert.equal(extractReferralNote(undefined), '');
  });
});

// ---------------------------------------------------------------------------
// extractClientEmail — CC convention
// ---------------------------------------------------------------------------
describe('extractClientEmail', () => {
  const ROUTE = 'abc123@inbound.postmarkapp.com';
  const SENDER = 'advisor@agency.org';

  it('picks entrepreneur from CC field', () => {
    const { clientEmail, additionalCcEmails } = extractClientEmail({
      ccEmails: ['jane@example.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'jane@example.com');
    assert.deepEqual(additionalCcEmails, []);
  });

  it('prefers footer email over CC', () => {
    const { clientEmail } = extractClientEmail({
      footerEmail: 'footer@example.com',
      ccEmails: ['cc@example.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'footer@example.com');
  });

  it('excludes sender from CC candidates', () => {
    const { clientEmail } = extractClientEmail({
      ccEmails: [SENDER, 'entrepreneur@example.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'entrepreneur@example.com');
  });

  it('excludes route address from CC candidates', () => {
    const { clientEmail } = extractClientEmail({
      ccEmails: [ROUTE, 'entrepreneur@example.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'entrepreneur@example.com');
  });

  it('falls back to body scan when CC is empty', () => {
    const { clientEmail } = extractClientEmail({
      ccEmails: [],
      textBody: 'Please connect with jane@startup.com about her venture.',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'jane@startup.com');
  });

  it('returns empty string when no email found anywhere', () => {
    const { clientEmail } = extractClientEmail({
      ccEmails: [],
      textBody: 'No emails here.',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, '');
  });

  it('handles multiple CC entrepreneurs — first is primary, rest are additional', () => {
    const { clientEmail, additionalCcEmails } = extractClientEmail({
      ccEmails: ['first@startup.com', 'second@startup.com', 'third@startup.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'first@startup.com');
    assert.deepEqual(additionalCcEmails, ['second@startup.com', 'third@startup.com']);
  });

  it('normalises email addresses to lowercase', () => {
    const { clientEmail } = extractClientEmail({
      ccEmails: ['JANE@EXAMPLE.COM'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    assert.equal(clientEmail, 'jane@example.com');
  });

  it('notify_entrepreneurs false — treats missing flag as false (no email sent)', () => {
    // This test documents the expected behaviour: when the flag is missing/falsy
    // the entrepreneur email should not be included in recipients.
    // The flag check happens in index.ts; here we just confirm extractClientEmail
    // still finds the email (the suppression is a separate concern).
    const { clientEmail } = extractClientEmail({
      ccEmails: ['entrepreneur@example.com'],
      textBody: '',
      senderEmail: SENDER,
      routeAddress: ROUTE,
    });
    // extractClientEmail always finds the email — suppression is downstream
    assert.equal(clientEmail, 'entrepreneur@example.com');
  });
});
