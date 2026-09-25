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
import {
  AGREEMENT_VERSIONS,
  FEDERATION_COMPACT_CONTENT,
  PRIVACY_POLICY_CONTENT,
  computeTextHash,
  type AgreementContent,
} from '../agreements/content';

export const FOUNDER_AGREEMENTS = ['federation_compact', 'privacy_policy'] as const;
export type FounderAgreementType = typeof FOUNDER_AGREEMENTS[number];

const CONTENT: Record<FounderAgreementType, AgreementContent> = {
  federation_compact: FEDERATION_COMPACT_CONTENT,
  privacy_policy: PRIVACY_POLICY_CONTENT,
};

/**
 * The plain-language summary shown above the checkboxes. This is the part
 * people actually read, so it states the whole model in three lines: what is
 * always shared (and that email waits until it is needed), what the founder
 * chooses (directory on by default, details off), and what never moves.
 */
export const CONSENT_SUMMARY = {
  heading: 'Join the regional entrepreneurship network',
  intro: 'Organizations that support entrepreneurs in this region share a little information so they can coordinate instead of asking you the same questions again. Every one of them is approved by the network and has signed an agreement not to sell your information or use it to spam you.',
  always: 'Organizations you work with see your name, and that other partners are also helping you (who, what kind of support, when). Your email reaches an organization only once it needs it — when it accepts a referral for you.',
  choice: 'You choose whether to be listed in the network directory, so organizations you have not worked with yet can find you (on unless you turn it off), and whether organizations you work with can see the details of each other\'s records (off unless you turn it on).',
  never: 'Notes staff write about your meetings and each organization\'s internal record numbers are never shared, and the network does not collect financial information. The network publishes only anonymous totals — how many entrepreneurs were served, referred and helped — never anything that identifies you.',
};

export const CONSENT_CHOICES = {
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

export interface ConsentTermsDocument {
  type: FounderAgreementType;
  version: string;
  title: string;
  sections: Array<{ heading: string; body: string }>;
  text_hash: string;
}

export interface ConsentTerms {
  /** One hash over both documents' text hashes — what a partner sends back. */
  terms_hash: string;
  /** The hosted page with the full text, for a "read the full terms" link. */
  terms_url?: string;
  versions: Record<FounderAgreementType, string>;
  summary: typeof CONSENT_SUMMARY;
  choices: typeof CONSENT_CHOICES;
  documents: ConsentTermsDocument[];
}

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const buildConsentTerms = async (options: { termsUrl?: string } = {}): Promise<ConsentTerms> => {
  const documents: ConsentTermsDocument[] = [];
  for (const type of FOUNDER_AGREEMENTS) {
    const content = CONTENT[type];
    documents.push({
      type,
      version: AGREEMENT_VERSIONS[type],
      title: content.title,
      sections: content.sections,
      text_hash: await computeTextHash(content),
    });
  }
  const terms_hash = await sha256Hex(documents.map((d) => `${d.type}@${d.version}:${d.text_hash}`).join('|'));
  return {
    terms_hash,
    ...(options.termsUrl ? { terms_url: options.termsUrl } : {}),
    versions: {
      federation_compact: AGREEMENT_VERSIONS.federation_compact,
      privacy_policy: AGREEMENT_VERSIONS.privacy_policy,
    },
    summary: CONSENT_SUMMARY,
    choices: CONSENT_CHOICES,
    documents,
  };
};

// ---------------------------------------------------------------------------
// Validating what a partner (or the hosted page) sends back
// ---------------------------------------------------------------------------

export interface FounderConsentChoices {
  terms_hash: string;
  directory_listing: boolean;
  share_details: boolean;
  /** When the founder ticked the box, per the partner's system. */
  accepted_at: string;
}

export type ConsentParseResult =
  | { ok: true; value: FounderConsentChoices }
  | { ok: false; status: number; error: string; reason: string };

/**
 * Validate a consent attestation. `agreed` must be literally true — a partner
 * may not record consent the founder did not give — and the terms hash must
 * match the current terms, so consent is always tied to the words shown.
 */
export const parseFounderConsent = (input: unknown, current: ConsentTerms, now: Date = new Date()): ConsentParseResult => {
  if (!input || typeof input !== 'object') {
    return { ok: false, status: 400, error: 'consent must be an object', reason: 'invalid_consent' };
  }
  const body = input as Record<string, unknown>;
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
  for (const key of ['directory_listing', 'share_details'] as const) {
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
