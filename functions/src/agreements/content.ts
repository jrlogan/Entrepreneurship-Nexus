/**
 * The network's agreements — the canonical text.
 *
 * Shared by the Cloud Functions (which verify the version and text hash a
 * founder or organization accepted) and the web app (which displays it), so
 * what is shown and what is recorded can never differ. The frontend imports
 * this through src/domain/agreements/content.ts.
 *
 * Pure and dependency-free. `computeTextHash` uses Web Crypto, available both
 * in browsers and in Node 20+.
 */

export type AgreementType =
  | 'privacy_policy'
  | 'data_usage_agreement'
  | 'federation_compact'
  // What an organization commits to in order to JOIN a network. The compact
  // explains the network to entrepreneurs and the DUA governs how staff handle
  // data day to day; neither states the obligations of membership itself —
  // conformance to the standard, honouring consent, answering referrals,
  // protecting keys, and the terms of suspension and exit.
  | 'network_membership';

export const AGREEMENT_VERSIONS: Record<AgreementType, string> = {
  // Pilot versions: the text the pilot partners and their entrepreneurs
  // actually accept. Still open to revision by the consortium — a revision
  // bumps the version, and acceptances record version + text hash so it is
  // always clear which words someone agreed to.
  //
  // 0.2 aligned the entrepreneur-facing text with the privacy model presented
  // to the consortium (always shared / only with consent / never shared):
  // directory listing became opt-in, and notes are never shared.
  // 0.3 / 1.2: email is shared only once an organization needs it (accepting
  // a referral); directory listing is on by default, detail sharing off; the
  // "why not a central database" argument became "who is in the network"
  // (approved members who signed not to sell or spam); anonymous aggregate
  // statistics are stated explicitly.
  privacy_policy: '1.2-pilot',
  data_usage_agreement: '1.0',
  federation_compact: '0.3-pilot',
  // 0.3: the governance clause no longer promises a seat in a governance body
  // that does not exist yet; it states the intent (a member-benefit nonprofit)
  // and that no member is bound by a version it has not signed.
  network_membership: '0.3-pilot',
};

/**
 * What an organization signs, per network it joins, before it can connect:
 * the membership terms, the compact it presents to entrepreneurs, and the
 * data-handling rules its staff follow.
 */
export const ORG_REQUIRED_AGREEMENTS = ['network_membership', 'federation_compact', 'data_usage_agreement'] as const;
export type OrgAgreementType = typeof ORG_REQUIRED_AGREEMENTS[number];

/** Pre-release versions — text may still change before the consortium ratifies it. */
export const isPreReleaseVersion = (version: string) => /-(draft|pilot)$/.test(version);


export type AgreementContent = {
  title: string;
  badge: string;
  badgeColor: string;
  checkLabel: string;
  sections: { heading: string; body: string }[];
};

export const PRIVACY_POLICY_CONTENT: AgreementContent = {
  title: 'Entrepreneur Data & Privacy Notice',
  badge: 'Privacy Policy',
  badgeColor: 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300',
  checkLabel: 'I have read and agree to this Privacy Notice',
  sections: [
    {
      heading: 'What information is stored',
      body: 'When you participate in ecosystem programs, support organizations (ESOs) may record your basic profile (name, contact info, venture name and description), program participation and progress milestones, and interaction notes related to the services they provide to you.',
    },
    {
      heading: 'Who can see your data',
      body: 'Organizations you work with see your name, the records they keep themselves, and the fact that other partners are also supporting you — which organization, what kind of support, and when — so they can coordinate rather than duplicate. Your email is shared with an organization only once it needs it: when it accepts a referral for you, or because you signed up with it directly. Organizations you have not worked with see only your directory listing — name and venture, no contact details — and only while you are listed.',
    },
    {
      heading: 'Cross-organization sharing',
      body: 'The details of one organization\'s records — such as the name of a program you are in, or the outcome of a referral — are shared with another organization only if you approve it, either partner by partner or for every partner you work with in this network. Notes that staff write about their meetings with you are never shared with other organizations, even with your approval.',
    },
    {
      heading: 'Your rights',
      body: 'You can see which organizations have access to your records, turn your directory listing off or on (it is on when you join), approve or revoke sharing, and leave the network altogether at any time from your privacy settings. Each choice applies to one network, and none of them ends your relationship with any individual organization. You can request a copy or deletion of your records by contacting your network administrator.',
    },
    {
      heading: 'Anonymous statistics',
      body: 'The network publishes aggregate statistics — how many entrepreneurs were served, referred and helped, and where organizations record them, businesses started, jobs and capital — to show what the region\'s support organizations do together. Your record counts toward those totals whatever your choices; the totals are anonymous, small groups are suppressed, and nothing published identifies you or your venture.',
    },
    {
      heading: 'What we do not do',
      body: 'Every organization in the network is approved by the network and has signed the same agreements: it may not sell your information, use it to send you unsolicited marketing, or use it for anything other than entrepreneurship support. Nothing is shared outside the network without your consent. Notes stay with the organization that wrote them, each organization\'s internal record numbers stay private to it, and the network does not collect financial information.',
    },
  ],
};

export const DUA_CONTENT: AgreementContent = {
  title: 'Data Access & Responsibility Agreement',
  badge: 'Data Usage Agreement',
  badgeColor: 'bg-indigo-400/10 border-indigo-400/30 text-indigo-300',
  checkLabel: 'I have read and agree to this Data Usage Agreement',
  sections: [
    {
      heading: 'Permitted uses',
      body: 'You may access entrepreneur information solely to provide ecosystem support services: reviewing venture details to offer relevant programs, recording interaction notes and program participation, and coordinating referrals with the entrepreneur\'s explicit consent.',
    },
    {
      heading: 'Confidentiality obligations',
      body: 'You must treat all entrepreneur data as confidential. Do not share venture details, financials, interaction notes, or any personally identifiable information outside this platform or with parties not authorized to access it through this system.',
    },
    {
      heading: 'Prohibited activities',
      body: 'You may not use entrepreneur data for purposes unrelated to providing ecosystem support. You may not share data externally, use it for commercial gain, or access records beyond what your role requires. You may not attempt to access data belonging to organizations outside your assigned scope.',
    },
    {
      heading: 'Audit and accountability',
      body: 'All data access and modifications are logged and may be reviewed by ecosystem administrators. Access is scoped to your assigned organization and role. Administrators may audit activity at any time.',
    },
    {
      heading: 'Reporting obligations',
      body: 'If you become aware of an accidental data disclosure or potential breach, report it immediately to your organization administrator. Any observed misuse of entrepreneur data should be reported through the platform feedback system.',
    },
    {
      heading: 'Consequences of violation',
      body: 'Unauthorized use or disclosure of entrepreneur data may result in immediate access revocation, removal from this ecosystem, and potential civil or legal liability. This agreement survives the end of your participation in this ecosystem.',
    },
  ],
};

// The federation compact. Draft text — a brainstorm until it is published
// as a signed legal document. Updating this text in place during the draft
// phase is intentional (no re-prompt on change); see AGREEMENT_VERSIONS
// for when versioned re-prompting gets turned on.
export const FEDERATION_COMPACT_CONTENT: AgreementContent = {
  title: 'Joining a shared entrepreneurship network',
  badge: 'Network Compact',
  badgeColor: 'bg-amber-400/10 border-amber-400/30 text-amber-300',
  checkLabel: 'I understand and agree to join this federated network',
  sections: [
    {
      heading: 'You are joining something shared by design',
      body: 'This system is part of a federated network of independent entrepreneurship-support organizations. Each organization runs its own tools and keeps control of its own data, and organizations that have signed the shared privacy and standards compact can exchange information about the entrepreneurs they support — with your consent.',
    },
    {
      heading: 'What becomes visible across organizations',
      body: 'Always shared, with organizations you actually work with: your name, their own records with you, and the fact that other partners are helping you (who, what kind of support, when). Your email reaches an organization only once it needs it — when it accepts a referral for you, or because you signed up with it directly. Your choice: being listed in the network directory, where partners you have not worked with can find you (on unless you turn it off), and the details of one organization\'s records being seen by another (off unless you turn it on). Never shared: notes staff write about you and each organization\'s internal record numbers; the network does not collect financial information.',
    },
    {
      heading: 'You stay in control of what moves',
      body: 'You are listed in the network directory unless you turn that off; sharing the details of one organization\'s records with another is off until you turn it on. Each choice applies to one network. A new organization asking to see another\'s records needs your approval. You can change any choice, or leave the network, at any time from your privacy settings, and doing so does not affect your relationship with any individual organization.',
    },
    {
      heading: 'Who is in the network',
      body: 'Every organization in the network was approved by the network before joining and has signed the same membership and data-handling agreements: it may not sell your information, use it to send you unsolicited marketing, or use it for anything other than entrepreneurship support. No single organization holds everyone\'s data — each keeps its own records. An organization that breaks these rules is removed.',
    },
    {
      heading: 'Anonymous statistics',
      body: 'The network publishes aggregate statistics — how many entrepreneurs were served, referred and helped, and where organizations record them, businesses started, jobs and capital. Your record counts toward those totals whatever your choices; the totals are anonymous and nothing published identifies you or your venture.',
    },
    {
      heading: 'What this organization will not do',
      body: 'We do not sell your data, we do not use it to send you unsolicited marketing, we do not share it outside the network without your consent, and we do not use it for purposes unrelated to entrepreneurship support.',
    },
  ],
};

// The organization-facing membership agreement. The compact explains the
// network to entrepreneurs; the DUA governs how staff handle data. Neither
// states what an organization commits to in order to JOIN — so this does.
export const NETWORK_MEMBERSHIP_CONTENT: AgreementContent = {
  title: 'Joining the network: what your organization agrees to',
  badge: 'Network Membership',
  badgeColor: 'bg-sky-400/10 border-sky-400/30 text-sky-300',
  checkLabel: 'I am authorized to commit my organization to these terms',
  sections: [
    {
      heading: 'Who can join',
      body: 'Membership is open to organizations that provide direct support to entrepreneurs — support organizations, funders, and resource providers — operating in the region a network covers. An organization joins a network; it may join more than one, and its obligations are the same in each.',
    },
    {
      heading: 'You keep your own systems and your own data',
      body: 'Joining does not require you to adopt anyone else\'s software, migrate your records, or hand over your database. You keep your own tools, your own record identifiers, and your own client relationships. You share only the agreed common fields, and only for the entrepreneurs you actually work with.',
    },
    {
      heading: 'What you contribute',
      body: 'You agree to map your terms onto the shared data standard, to record referrals you send and receive through the network so they can be tracked to a conclusion, and to keep the status of your own records reasonably current. You are never obliged to collect data you do not already collect.',
    },
    {
      heading: 'You honour the entrepreneur\'s choices',
      body: 'Consent travels with the person, not with your copy of their record. You agree to respect directory and sharing choices as they are recorded in the network, to seek consent before requesting another organization\'s operational data, and to stop using data an entrepreneur has withdrawn from sharing.',
    },
    {
      heading: 'You answer referrals',
      body: 'A referral sent to your organization is a commitment made to an entrepreneur. You agree to accept or decline referrals within a reasonable period, to name someone responsible when you accept, and to record the outcome — including when the outcome is that you were not the right fit.',
    },
    {
      heading: 'You protect your credentials',
      body: 'API keys and sign-in integrations are issued to your organization and identify every action it takes in the network. You agree to store them as secrets, to limit them to staff who need them, and to notify the network administrator promptly if one may have been exposed so it can be revoked.',
    },
    {
      heading: 'How the network is governed',
      body: 'How the network is governed is not yet settled. The intent is for it to become a nonprofit organization run for the benefit of its members, which would then decide changes to the shared standard, to these agreements, and to who operates the network. Until it is formed, a proposed change is sent to every member and takes effect for a member only when that member signs the new version. You are never bound by a version you have not signed, and you may leave at any time.',
    },
    {
      heading: 'Aggregate reporting',
      body: 'Anonymous, aggregate statistics — entrepreneurs served, businesses started and still operating, jobs, capital — may be published by the network to describe the ecosystem\'s impact. Individual entrepreneur data is never published, and no member may present the network\'s aggregate results as solely its own.',
    },
    {
      heading: 'Leaving, and being asked to leave',
      body: 'You may leave a network at any time; your own systems and records are unaffected, your keys are revoked, and records you contributed remain subject to the entrepreneurs\' own consent choices. Membership may be suspended for breach of this agreement or the data usage agreement — including misuse of another member\'s data or an entrepreneur\'s information — by decision of the network\'s governance body.',
    },
    {
      heading: 'This is not an exclusivity arrangement',
      body: 'Membership does not restrict who you may serve, partner with, fund, or compete against. Nothing here obliges you to refer to any particular member, and the network takes no position on relationships between members outside it.',
    },
  ],
};

// Short version of the use-of-data terms shown to ESO staff at point-of-access
// (banner above another ESO's operational data). Distills the DUA + compact
// into 3 bullets that mirror the entrepreneur-facing privacy notice, so what
// staff see lines up with what entrepreneurs agreed to at signup.
export const COMPACT_SUMMARY: string[] = [
  'Use this data only to provide entrepreneurship support — not for commercial purposes, external sharing, or anything outside your role.',
  'Treat venture details and interaction notes as confidential. Don’t share them outside this platform without the entrepreneur’s consent.',
  'Cross-organization access requires explicit consent. Access is logged and may be audited by ecosystem administrators.',
];

export function getContent(type: AgreementType): AgreementContent {
  if (type === 'privacy_policy') return PRIVACY_POLICY_CONTENT;
  if (type === 'data_usage_agreement') return DUA_CONTENT;
  if (type === 'network_membership') return NETWORK_MEMBERSHIP_CONTENT;
  return FEDERATION_COMPACT_CONTENT;
}

// SHA-256 hex of a stable serialization of the content. Stored on acceptance
// records so a later change to the canonical text is detectable and can
// trigger re-prompting once the agreement is finalized to v1.0.
export async function computeTextHash(content: AgreementContent): Promise<string> {
  const canonical = JSON.stringify({
    title: content.title,
    sections: content.sections.map((s) => ({ heading: s.heading, body: s.body })),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
