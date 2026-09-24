"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFounderConsent = exports.buildConsentTerms = exports.CONSENT_CHOICES = exports.CONSENT_SUMMARY = exports.FOUNDER_AGREEMENTS = void 0;
/**
 * The founder-facing consent terms: what an entrepreneur is shown and agrees
 * to when they join the network, whether on the hosted consent page or inside
 * a partner's own signup form.
 *
 * Pure. The same terms object is served by GET getConsentTerms, rendered by
 * the embeddable widget (public/embed/nexus-consent.js) and the hosted page,
 * and checked by the server when consent is recorded — so a partner can only
 * record consent against the exact words the founder was shown.
 */
const content_1 = require("../agreements/content");
exports.FOUNDER_AGREEMENTS = ['federation_compact', 'privacy_policy'];
const CONTENT = {
    federation_compact: content_1.FEDERATION_COMPACT_CONTENT,
    privacy_policy: content_1.PRIVACY_POLICY_CONTENT,
};
/**
 * The plain-language summary shown above the checkboxes. This is the part
 * people actually read, so it states the whole model in three lines.
 */
exports.CONSENT_SUMMARY = {
    heading: 'Join the regional entrepreneurship network',
    intro: 'Organizations that support entrepreneurs in this region share a small amount of information so they can coordinate instead of asking you the same questions again.',
    always: 'Organizations you work with can see your name and email, and that other partners are also helping you (who, what kind of support, when).',
    choice: 'You choose whether to be listed in the network directory and whether partners you work with can see the details of each other\'s records. Both are off unless you turn them on.',
    never: 'Notes staff write about your meetings, your financials, and each organization\'s internal record numbers are never shared.',
};
exports.CONSENT_CHOICES = {
    agree: {
        label: 'I agree to join the network under the Network Compact and Privacy Notice',
        required: true,
    },
    directory_listing: {
        label: 'List me in the network directory, so support organizations I have not worked with yet can find me',
        help: 'Off by default. You can change this at any time.',
        default: false,
    },
    share_details: {
        label: 'Let organizations I work with see the details of each other\'s records about me (such as program names and referral outcomes)',
        help: 'Off by default. Notes are never shared, whatever you choose.',
        default: false,
    },
};
const sha256Hex = async (text) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};
const buildConsentTerms = async () => {
    const documents = [];
    for (const type of exports.FOUNDER_AGREEMENTS) {
        const content = CONTENT[type];
        documents.push({
            type,
            version: content_1.AGREEMENT_VERSIONS[type],
            title: content.title,
            sections: content.sections,
            text_hash: await (0, content_1.computeTextHash)(content),
        });
    }
    const terms_hash = await sha256Hex(documents.map((d) => `${d.type}@${d.version}:${d.text_hash}`).join('|'));
    return {
        terms_hash,
        versions: {
            federation_compact: content_1.AGREEMENT_VERSIONS.federation_compact,
            privacy_policy: content_1.AGREEMENT_VERSIONS.privacy_policy,
        },
        summary: exports.CONSENT_SUMMARY,
        choices: exports.CONSENT_CHOICES,
        documents,
    };
};
exports.buildConsentTerms = buildConsentTerms;
/**
 * Validate a consent attestation. `agreed` must be literally true — a partner
 * may not record consent the founder did not give — and the terms hash must
 * match the current terms, so consent is always tied to the words shown.
 */
const parseFounderConsent = (input, current, now = new Date()) => {
    if (!input || typeof input !== 'object') {
        return { ok: false, status: 400, error: 'consent must be an object', reason: 'invalid_consent' };
    }
    const body = input;
    if (body.agreed !== true) {
        return { ok: false, status: 400, error: 'consent.agreed must be true — record consent only when the founder agreed', reason: 'not_agreed' };
    }
    if (typeof body.terms_hash !== 'string' || body.terms_hash !== current.terms_hash) {
        return {
            ok: false,
            status: 409,
            error: 'consent.terms_hash does not match the current terms. Fetch getConsentTerms again and show the founder the current text.',
            reason: 'terms_outdated',
        };
    }
    for (const key of ['directory_listing', 'share_details']) {
        if (body[key] !== undefined && typeof body[key] !== 'boolean') {
            return { ok: false, status: 400, error: `consent.${key} must be a boolean`, reason: 'invalid_consent' };
        }
    }
    let acceptedAt = now.toISOString();
    if (body.accepted_at !== undefined) {
        const parsed = new Date(String(body.accepted_at));
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 5 * 60 * 1000) {
            return { ok: false, status: 400, error: 'consent.accepted_at must be an ISO timestamp, not in the future', reason: 'invalid_consent' };
        }
        acceptedAt = parsed.toISOString();
    }
    return {
        ok: true,
        value: {
            terms_hash: body.terms_hash,
            directory_listing: body.directory_listing === true,
            share_details: body.share_details === true,
            accepted_at: acceptedAt,
        },
    };
};
exports.parseFounderConsent = parseFounderConsent;
