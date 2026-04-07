export type IntroContactPermission = 'on_file' | 'newly_confirmed' | 'not_confirmed' | 'unknown';

/**
 * Converts an email local part into a human-readable name:
 *   "horst"      → "Horst"
 *   "john.smith" → "John Smith"
 *   "jane_doe"   → "Jane Doe"
 */
export const nameFromEmailLocal = (local: string): string =>
  local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();

/**
 * Strips Outlook's hyperlink wrapper formats from a string value:
 *   [text<mailto:url>]  → text
 *   [text<https://url>] → text
 *   [text]              → text
 * Falls back to extracting a bare email if the result still looks malformed.
 */
export const stripOutlookWrapper = (value: string): string => {
  // [display<mailto:target>] or [display<https://target>]
  const angleMatch = value.match(/^\[([^\]<]+)<[^>]+>\]$/);
  if (angleMatch) return angleMatch[1].trim();
  // [plain text]
  const bracketMatch = value.match(/^\[([^\]]+)\]$/);
  if (bracketMatch) return bracketMatch[1].trim();
  return value;
};

export const extractEmails = (text?: string): string[] => {
  if (!text) return [];
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};

export const extractNameFromSubject = (subject?: string): string | undefined => {
  const match = (subject || '').match(/Introduction:\s*(.+?)(?:\s+to\s+.+)?$/i);
  return match?.[1]?.trim();
};

export const parseFooter = (text?: string): Record<string, string | string[]> | null => {
  const blockMatch = (text || '').match(/--- NETWORK REFERRAL DATA ---([\s\S]*?)--- END NETWORK REFERRAL DATA ---/i);
  if (!blockMatch) return null;

  const block = blockMatch[1];
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: Record<string, string | string[]> = {};
  let currentSection: string | null = null;

  for (const line of lines) {
    const keyValueMatch = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (keyValueMatch) {
      const [, key, rawValue] = keyValueMatch;
      const normalizedKey = key.toLowerCase();
      if (rawValue) {
        result[normalizedKey] = stripOutlookWrapper(rawValue);
        currentSection = normalizedKey;
      } else {
        currentSection = normalizedKey;
        result[normalizedKey] = [];
      }
      continue;
    }

    // Match checked checkboxes in two formats:
    //   Markdown list:  "- [x] value" or "- [ x ] value"
    //   Bare bracket:   "[x] value" or "[ x ] value" or "[x ] value"
    // Spaces around the x are allowed (typos like "[ s]" are intentionally ignored).
    const checkboxMatch = line.match(/^(?:- )?\[\s*[xX]\s*\]\s+(.*)/);
    if (checkboxMatch && currentSection) {
      const [, option] = checkboxMatch;
      const existing = result[currentSection];
      if (Array.isArray(existing)) {
        // Strip Outlook wrappers, then strip any inline label/comment after the ID value.
        // Supports template annotations like "prototype — Pilot / Testing" or "idea (Concept)"
        const cleaned = stripOutlookWrapper(option.trim()).replace(/\s+[-—(].*$/, '').trim();
        existing.push(cleaned);
      }
    }
  }

  return result;
};

export const extractReferralNote = (text?: string): string => {
  const raw = text || '';
  const [beforeFooter] = raw.split(/--- NETWORK REFERRAL DATA ---/i);
  const candidate = (beforeFooter || raw)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return candidate || raw.trim();
};

const normalize = (val?: string | null): string =>
  (val || '').toLowerCase().trim();

/**
 * Extracts the entrepreneur's email from an inbound email payload.
 * Conventions supported:
 *   Standard: To = receiving agency (ESO), CC = entrepreneur, BCC = inbound system address.
 *   Flexible: To may contain both the entrepreneur AND the ESO email — the system detects
 *             which is which by checking against known ESO domains. Any To email whose
 *             domain does NOT match a known ESO domain is treated as the client/entrepreneur.
 * Priority: structured footer > To non-ESO addresses / CC field > text body scan.
 */
export const extractClientEmail = (opts: {
  footerEmail?: string;
  ccEmails: string[];
  toEmails?: string[];
  textBody?: string;
  senderEmail: string;
  routeAddress: string;
  esoDomains?: string[];
}): { clientEmail: string; additionalCcEmails: string[] } => {
  const { footerEmail, ccEmails, toEmails = [], textBody, senderEmail, routeAddress, esoDomains = [] } = opts;

  const normalizedEsoDomains = esoDomains.map((d) => d.toLowerCase().trim());

  const isEsoDomain = (email: string): boolean => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    return normalizedEsoDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  };

  const systemAddresses = new Set([normalize(senderEmail), normalize(routeAddress)]);

  // Check To field for non-ESO addresses (entrepreneur in To alongside the ESO)
  const normalizedTo = toEmails.map(normalize).filter(Boolean);
  const clientEmailFromTo = normalizedEsoDomains.length > 0
    ? normalizedTo.find((e) => !systemAddresses.has(e) && !isEsoDomain(e))
    : undefined;

  const normalizedCc = ccEmails.map(normalize).filter(Boolean);
  const clientEmailFromCc = normalizedCc.find(
    (e) => !systemAddresses.has(e)
  );

  const clientEmail = footerEmail
    || clientEmailFromTo
    || clientEmailFromCc
    || extractEmails(textBody).find((e) => e !== normalize(senderEmail))
    || '';

  const additionalCcEmails = normalizedCc.filter(
    (e) => !systemAddresses.has(e) && e !== clientEmail
  );

  return { clientEmail, additionalCcEmails };
};
