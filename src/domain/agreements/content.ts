
import type { AgreementType } from './types';

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
      body: 'Each ESO only sees records they have created or that you have explicitly shared with them. Your information is not visible to organizations you have not worked with. Basic directory information (name, venture, contact) is visible to all ESOs in this ecosystem.',
    },
    {
      heading: 'Cross-organization sharing',
      body: 'If you work with multiple ESOs and want them to coordinate, you must explicitly approve any cross-organization data sharing. You will always be asked before a second organization can access another organization\'s notes or records about you.',
    },
    {
      heading: 'Your rights',
      body: 'You can view which organizations have access to your data from your Privacy Settings at any time. You can restrict or revoke access to your data, and you can request a copy or deletion of your records by contacting your ecosystem administrator.',
    },
    {
      heading: 'What we do not do',
      body: 'We do not sell your data to third parties. We do not share your information outside this ecosystem without your consent. Individual interaction notes are confidential between you and the recording organization.',
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
      body: 'Your core directory information — name, contact, venture name, and a short description — becomes visible to organizations in this ecosystem so they can find and support you. Deeper data (interaction notes, program details, financials) stays with the organization that recorded it unless you explicitly approve cross-organization sharing.',
    },
    {
      heading: 'You stay in control of what moves',
      body: 'Data sharing between specific organizations requires your consent each time a new organization asks for access. You can revoke access at any time from your privacy settings. Revoking your participation here does not affect your membership or relationship with any individual organization.',
    },
    {
      heading: 'Why this is better than a central database',
      body: 'No single organization holds everyone\'s data. Each ecosystem participant keeps control of its own records, and we agree on shared standards so your information can move between organizations with your permission rather than being duplicated or locked behind one system.',
    },
    {
      heading: 'What this organization will not do',
      body: 'We do not sell your data, we do not share it outside the compact without your consent, and we do not use it for purposes unrelated to entrepreneurship support. Organizations violating the compact can be removed from the network.',
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
      heading: 'You participate in governance',
      body: 'Members share responsibility for the standard and the compact. Each member organization is entitled to a seat in the governance of the network, and agrees that changes to the shared standard, the agreements, and the operator arrangement are made collectively rather than by any single organization.',
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
