"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractClientEmail = exports.extractReferralNote = exports.parseFooter = exports.extractNameFromSubject = exports.extractEmails = exports.stripOutlookWrapper = void 0;
/**
 * Strips Outlook's hyperlink wrapper formats from a string value:
 *   [text<mailto:url>]  → text
 *   [text<https://url>] → text
 *   [text]              → text
 * Falls back to extracting a bare email if the result still looks malformed.
 */
const stripOutlookWrapper = (value) => {
    // [display<mailto:target>] or [display<https://target>]
    const angleMatch = value.match(/^\[([^\]<]+)<[^>]+>\]$/);
    if (angleMatch)
        return angleMatch[1].trim();
    // [plain text]
    const bracketMatch = value.match(/^\[([^\]]+)\]$/);
    if (bracketMatch)
        return bracketMatch[1].trim();
    return value;
};
exports.stripOutlookWrapper = stripOutlookWrapper;
const extractEmails = (text) => {
    if (!text)
        return [];
    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};
exports.extractEmails = extractEmails;
const extractNameFromSubject = (subject) => {
    const match = (subject || '').match(/Introduction:\s*(.+?)(?:\s+to\s+.+)?$/i);
    return match?.[1]?.trim();
};
exports.extractNameFromSubject = extractNameFromSubject;
const parseFooter = (text) => {
    const blockMatch = (text || '').match(/--- NETWORK REFERRAL DATA ---([\s\S]*?)--- END NETWORK REFERRAL DATA ---/i);
    if (!blockMatch)
        return null;
    const block = blockMatch[1];
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const result = {};
    let currentSection = null;
    for (const line of lines) {
        const keyValueMatch = line.match(/^([a-z_]+):\s*(.*)$/i);
        if (keyValueMatch) {
            const [, key, rawValue] = keyValueMatch;
            const normalizedKey = key.toLowerCase();
            if (rawValue) {
                result[normalizedKey] = (0, exports.stripOutlookWrapper)(rawValue);
                currentSection = normalizedKey;
            }
            else {
                currentSection = normalizedKey;
                result[normalizedKey] = [];
            }
            continue;
        }
        const checkboxMatch = line.match(/^- \[x\]\s+(.*)$/i);
        if (checkboxMatch && currentSection) {
            const [, option] = checkboxMatch;
            const existing = result[currentSection];
            if (Array.isArray(existing)) {
                existing.push((0, exports.stripOutlookWrapper)(option.trim()));
            }
        }
    }
    return result;
};
exports.parseFooter = parseFooter;
const extractReferralNote = (text) => {
    const raw = text || '';
    const [beforeFooter] = raw.split(/--- NETWORK REFERRAL DATA ---/i);
    const candidate = (beforeFooter || raw)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return candidate || raw.trim();
};
exports.extractReferralNote = extractReferralNote;
const normalize = (val) => (val || '').toLowerCase().trim();
/**
 * Extracts the entrepreneur's email from an inbound email payload.
 * Convention: To = receiving agency, CC = entrepreneur(s), BCC = inbound system address.
 * Priority: structured footer > CC field > text body scan.
 */
const extractClientEmail = (opts) => {
    const { footerEmail, ccEmails, textBody, senderEmail, routeAddress } = opts;
    const normalizedCc = ccEmails.map(normalize).filter(Boolean);
    const clientEmailFromCc = normalizedCc.find((e) => e !== normalize(senderEmail) && e !== normalize(routeAddress));
    const clientEmail = footerEmail
        || clientEmailFromCc
        || (0, exports.extractEmails)(textBody).find((e) => e !== normalize(senderEmail))
        || '';
    const additionalCcEmails = normalizedCc.filter((e) => e !== normalize(senderEmail) && e !== normalize(routeAddress) && e !== clientEmail);
    return { clientEmail, additionalCcEmails };
};
exports.extractClientEmail = extractClientEmail;
