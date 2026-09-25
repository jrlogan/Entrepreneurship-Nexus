"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFounderConsent = exports.buildConsentTerms = exports.CONSENT_CHOICES = exports.CONSENT_SUMMARY = exports.acceptanceIsCurrent = exports.RECONSENT_REQUIRED_FOR_ACCEPTANCES_BEFORE = exports.FOUNDER_AGREEMENTS = void 0;
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
/**
 * How founders experience a change to the terms — deliberately undisruptive.
 *
 * A new version does NOT invalidate what a founder agreed to: their choices
 * carry over, partners' stored answers keep working, and the founder is told
 * the next time they visit (a note in their network settings, with a link to
 * the current text and a one-click "I've read them"). Organizations, by
 * contrast, must sign every new version before it applies to them.
 *
 * The one hard lever: when a change is significant enough that the old
 * agreement should no longer be relied on, set this to the moment the new
 * terms took effect. Acceptances recorded before it are then treated as
 * absent — founders are asked again at their next sign-in, and a partner's
 * next push triggers the consent notice. Leave it null for ordinary edits.
 */
exports.RECONSENT_REQUIRED_FOR_ACCEPTANCES_BEFORE = null;
/** Whether an acceptance recorded at `acceptedAt` still counts. */
const acceptanceIsCurrent = (acceptedAt) => {
    if (!exports.RECONSENT_REQUIRED_FOR_ACCEPTANCES_BEFORE)
        return true;
    if (!acceptedAt)
        return false;
    return acceptedAt >= exports.RECONSENT_REQUIRED_FOR_ACCEPTANCES_BEFORE;
};
exports.acceptanceIsCurrent = acceptanceIsCurrent;
const CONTENT = {
    federation_compact: content_1.FEDERATION_COMPACT_CONTENT,
    privacy_policy: content_1.PRIVACY_POLICY_CONTENT,
};
/**
 * The plain-language summary shown above the checkboxes. This is the part
 * people actually read, so it states the whole model in three lines: what is
 * always shared (and that email waits until it is needed), what the founder
 * chooses (directory on by default, details off), and what never moves.
 */
exports.CONSENT_SUMMARY = {
    heading: 'Join the regional entrepreneurship network',
    intro: 'Organizations that support entrepreneurs in this region share a little information so they can coordinate instead of asking you the same questions again. Every one of them is approved by the network and has signed an agreement not to sell your information or use it to spam you.',
    always: 'Organizations you work with see your name, and that other partners are also helping you (who, what kind of support, when). Your email reaches an organization only once it needs it — when it accepts a referral for you.',
    choice: 'You choose whether to be listed in the network directory, so organizations you have not worked with yet can find you (on unless you turn it off), and whether organizations you work with can see the details of each other\'s records (off unless you turn it on).',
    never: 'Notes staff write about your meetings and each organization\'s internal record numbers are never shared, and the network does not collect financial information. The network publishes only anonymous totals — how many entrepreneurs were served, referred and helped — never anything that identifies you.',
};
exports.CONSENT_CHOICES = {
    agree: {
        label: 'I agree to join the network under the Network Compact and Privacy Notice',
        required: true,
    },
    directory_listing: {
        label: 'List me in the network directory, so organizations I have not worked with yet can find me',
        help: 'On by default — this is how the network connects you with help. You can turn it off at any time.',
        default: true,
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
const buildConsentTerms = async (options = {}) => {
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
        ...(options.termsUrl ? { terms_url: options.termsUrl } : {}),
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
