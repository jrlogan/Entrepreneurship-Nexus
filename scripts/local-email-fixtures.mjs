const footerBlock = ({
  clientName = 'Jane Smith',
  clientEmail = 'jane@example.com',
  clientVenture = 'Smith Studio',
  referrerEmail,
  receivingOrg = 'SBDC',
  introContactPermission = 'newly_confirmed',
  ventureStage = 'prototype',
  supportNeeds = ['funding', 'marketing'],
}) => `--- NETWORK REFERRAL DATA ---
client_name: ${clientName}
client_email: ${clientEmail}
client_venture: ${clientVenture}
referrer_email: ${referrerEmail}
receiving_org: ${receivingOrg}

intro_contact_permission:
- [${introContactPermission === 'newly_confirmed' ? 'x' : ' '}] newly_confirmed
- [${introContactPermission === 'on_file' ? 'x' : ' '}] on_file
- [${introContactPermission === 'not_confirmed' ? 'x' : ' '}] not_confirmed

venture_stage:
- [${ventureStage === 'idea' ? 'x' : ' '}] idea
- [${ventureStage === 'prototype' ? 'x' : ' '}] prototype
- [${ventureStage === 'early_revenue' ? 'x' : ' '}] early_revenue
- [${ventureStage === 'sustaining' ? 'x' : ' '}] sustaining
- [${ventureStage === 'multi_person' ? 'x' : ' '}] multi_person
- [${ventureStage === 'established' ? 'x' : ' '}] established
- [${ventureStage === 'unknown' ? 'x' : ' '}] unknown

support_needs:
- [${supportNeeds.includes('funding') ? 'x' : ' '}] funding
- [${supportNeeds.includes('marketing') ? 'x' : ' '}] marketing
- [${supportNeeds.includes('legal') ? 'x' : ' '}] legal
- [${supportNeeds.includes('business_coaching') ? 'x' : ' '}] business_coaching
- [${supportNeeds.includes('product_development') ? 'x' : ' '}] product_development
- [${supportNeeds.includes('manufacturing') ? 'x' : ' '}] manufacturing
- [${supportNeeds.includes('sales') ? 'x' : ' '}] sales
- [${supportNeeds.includes('hiring') ? 'x' : ' '}] hiring
- [${supportNeeds.includes('workspace') ? 'x' : ' '}] workspace
- [${supportNeeds.includes('networking') ? 'x' : ' '}] networking
- [${supportNeeds.includes('other') ? 'x' : ' '}] other
--- END NETWORK REFERRAL DATA ---`;

const baseIntro = (receivingOrg = 'SBDC') => `Hi ${receivingOrg},

I'd like to introduce Jane Smith, founder of Smith Studio.

Jane is looking for funding and marketing support.`;

const ownerChecks = {
  ownerIdExpected: null,
};

export const LOCAL_EMAIL_FIXTURES = [
  {
    id: 'approved-known-staff',
    description: 'Known ESO staff sender on an approved domain should infer referring org, queue a sender receipt, notify the receiving org, and invite the entrepreneur.',
    mode: 'postmark',
    fromEmail: 'eso.staff@makehaven.org',
    subject: 'Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

${footerBlock({ referrerEmail: 'eso.staff@makehaven.org', receivingOrg: 'SBDC' })}`,
    expected: {
      candidateReferringOrgId: 'org_makehaven',
      reviewReasonsExcludes: ['unknown_sender_domain'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_referral_receipt', 'referral_new_intake'],
      noteExcludes: ['NETWORK REFERRAL DATA'],
      ...ownerChecks,
    },
  },
  {
    id: 'approved-unknown-staff',
    description: 'Approved domain sender without an account should queue a claim notice, not a direct sender receipt.',
    mode: 'postmark',
    fromEmail: 'new.staff@makehaven.org',
    subject: 'Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

${footerBlock({
  clientName: 'Marco Alvarez',
  clientEmail: 'marco@alvarezlabs.com',
  clientVenture: 'Alvarez Labs',
  referrerEmail: 'new.staff@makehaven.org',
  receivingOrg: 'SBDC',
  supportNeeds: ['legal', 'sales'],
})}`,
    expected: {
      candidateReferringOrgId: 'org_makehaven',
      noticeTypesIncludes: ['referral_follow_up', 'sender_domain_claim', 'referral_new_intake'],
      noticeTypesExcludes: ['sender_referral_receipt', 'sender_access_request'],
      ...ownerChecks,
    },
  },
  {
    id: 'gmail-request-access',
    description: 'Generic personal email should not infer an org and should queue an access-request notice.',
    mode: 'postmark',
    fromEmail: 'johnrichardlogan@gmail.com',
    subject: 'Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

${footerBlock({
  clientName: 'Asha Patel',
  clientEmail: 'asha@patelfoods.com',
  clientVenture: 'Patel Foods',
  referrerEmail: 'johnrichardlogan@gmail.com',
  receivingOrg: 'SBDC',
  ventureStage: 'early_revenue',
  supportNeeds: ['funding', 'hiring'],
})}`,
    expected: {
      candidateReferringOrgId: null,
      reviewReasonsIncludes: ['unknown_sender_domain'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_access_request', 'referral_new_intake'],
      noticeTypesExcludes: ['sender_domain_claim', 'sender_referral_receipt'],
      ...ownerChecks,
    },
  },
  {
    id: 'reply-chain-top-posted',
    description: 'Top-posted replies with quoted history below the footer should keep only the top intro in referral notes.',
    mode: 'postmark',
    fromEmail: 'eso.staff@makehaven.org',
    subject: 'Re: Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

Sharing this across the thread so you have context.

${footerBlock({ referrerEmail: 'eso.staff@makehaven.org', receivingOrg: 'SBDC' })}

On Fri, Mar 15, 2026 at 3:00 PM Someone Else <partner@example.org> wrote:
> Prior discussion
> More history
> Attached context`,
    expected: {
      candidateReferringOrgId: 'org_makehaven',
      noteIncludes: ['Sharing this across the thread so you have context.'],
      noteExcludes: ['On Fri, Mar 15, 2026', 'NETWORK REFERRAL DATA'],
      ...ownerChecks,
    },
  },
  {
    id: 'approved-plus-alias',
    description: 'Approved-domain senders using a plus alias should still infer the org and queue a claim notice.',
    mode: 'postmark',
    fromEmail: 'eso.staff+triage@makehaven.org',
    subject: 'Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

${footerBlock({ referrerEmail: 'eso.staff+triage@makehaven.org', receivingOrg: 'SBDC' })}`,
    expected: {
      candidateReferringOrgId: 'org_makehaven',
      reviewReasonsExcludes: ['unknown_sender_domain'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_domain_claim'],
      noticeTypesExcludes: ['sender_referral_receipt'],
      ...ownerChecks,
    },
  },
  {
    id: 'approved-partner-domain-match',
    description: 'A second approved ESO domain should infer the mapped partner organization.',
    mode: 'postmark',
    fromEmail: 'partner.staff@ctinnovations.org',
    subject: 'Introduction: Leah Brooks',
    textBody: `Hi SBDC,

I am introducing Leah Brooks from Harbor Analytics.

${footerBlock({
  clientName: 'Leah Brooks',
  clientEmail: 'leah@harboranalytics.com',
  clientVenture: 'Harbor Analytics',
  referrerEmail: 'partner.staff@ctinnovations.org',
  receivingOrg: 'SBDC',
  supportNeeds: ['marketing', 'networking'],
})}`,
    expected: {
      candidateReferringOrgId: 'org_ct_innovations',
      reviewReasonsExcludes: ['unknown_sender_domain'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_domain_claim'],
      noteIncludes: ['I am introducing Leah Brooks from Harbor Analytics.'],
      ...ownerChecks,
    },
  },
  {
    id: 'no-footer-fallback-email-extraction',
    description: 'Messages without the structured footer should still extract the client email from the prose and flag sender-domain review.',
    mode: 'manual',
    fromEmail: 'johnrichardlogan@gmail.com',
    subject: 'Introduction: Jane Smith',
    textBody: `Hi SBDC,

I'd like to introduce Jane Smith from Smith Studio.

Please reach out to jane@example.com about funding support and early customer discovery.

Thanks,
JR`,
    expected: {
      candidateReferringOrgId: null,
      reviewReasonsIncludes: ['unknown_sender_domain'],
      reviewReasonsExcludes: ['missing_client_email'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_access_request'],
      noteIncludes: ['Please reach out to jane@example.com about funding support and early customer discovery.'],
      ...ownerChecks,
    },
  },
  {
    id: 'signature-noise-after-footer',
    description: 'Long signatures after the structured footer should not leak into the stored referral notes.',
    mode: 'postmark',
    fromEmail: 'eso.staff@makehaven.org',
    subject: 'Introduction: Jane Smith',
    textBody: `${baseIntro('SBDC')}

${footerBlock({ referrerEmail: 'eso.staff@makehaven.org', receivingOrg: 'SBDC' })}

--
JR Logan
Executive Director
MakeHaven
https://www.makehaven.org/
Instagram https://www.instagram.com/makehaven/`,
    expected: {
      candidateReferringOrgId: 'org_makehaven',
      noteExcludes: ['JR Logan', 'https://www.makehaven.org/', 'NETWORK REFERRAL DATA'],
      noticeTypesIncludes: ['referral_follow_up', 'sender_referral_receipt'],
      ...ownerChecks,
    },
  },
  {
    id: 'missing-client-email',
    description: 'Malformed footer without client_email should still create intake records and flag the review reason.',
    mode: 'manual',
    fromEmail: 'eso.staff@makehaven.org',
    subject: 'Introduction: Jane Smith',
    textBody: `Hi SBDC,

I'd like to introduce Jane Smith, founder of Smith Studio.

--- NETWORK REFERRAL DATA ---
client_name: Jane Smith
client_venture: Smith Studio
referrer_email: eso.staff@makehaven.org
receiving_org: SBDC
--- END NETWORK REFERRAL DATA ---`,
    expected: {
      reviewReasonsIncludes: ['missing_client_email'],
      candidateReferringOrgId: 'org_makehaven',
      noticeTypesExcludes: ['referral_follow_up'],
      ...ownerChecks,
    },
  },
];

export const getFixtureById = (id) => LOCAL_EMAIL_FIXTURES.find((fixture) => fixture.id === id);
