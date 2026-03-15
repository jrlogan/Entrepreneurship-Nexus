const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const secret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET || 'local-postmark-secret';
const routeAddress = process.env.NEXUS_MAIL_TEST_ROUTE_ADDRESS || 'newhaven+introduction@inbound.example.org';
const fromEmail = process.env.NEXUS_MAIL_TEST_FROM_EMAIL || 'coach@makehaven.org';
const receivingOrgName = process.env.NEXUS_MAIL_TEST_RECEIVING_ORG || 'SBDC';

const payload = {
  MessageID: 'postmark-local-message-1',
  MessageStream: 'inbound',
  MailboxHash: 'newhaven+introduction',
  Date: new Date().toISOString(),
  From: `Coach MakeHaven <${fromEmail}>`,
  FromName: 'Coach MakeHaven',
  FromFull: {
    Email: fromEmail,
    Name: 'Coach MakeHaven',
  },
  To: routeAddress,
  ToFull: [
    {
      Email: routeAddress,
      Name: 'New Haven Intake',
    },
  ],
  Cc: 'advisor@sbdc.org',
  CcFull: [
    {
      Email: 'advisor@sbdc.org',
      Name: 'SBDC Advisor',
    },
  ],
  Subject: 'Introduction: Jane Smith',
  TextBody: `Hi SBDC,

I'd like to introduce Jane Smith, founder of Smith Studio.

Jane is looking for funding and marketing support.

--- NETWORK REFERRAL DATA ---
client_name: Jane Smith
client_email: jane@example.com
client_venture: Smith Studio
referrer_email: ${fromEmail}
receiving_org: ${receivingOrgName}

intro_contact_permission:
- [x] newly_confirmed
- [ ] on_file
- [ ] not_confirmed

venture_stage:
- [ ] idea
- [x] prototype
- [ ] early_revenue
- [ ] sustaining
- [ ] multi_person
- [ ] established
- [ ] unknown

support_needs:
- [x] funding
- [x] marketing
- [ ] legal
- [ ] business_coaching
- [ ] product_development
- [ ] manufacturing
- [ ] sales
- [ ] hiring
- [ ] workspace
- [ ] networking
- [ ] other
--- END NETWORK REFERRAL DATA ---`,
  HtmlBody: '<p>Postmark local inbound test</p>',
  OriginalRecipient: routeAddress,
};

const response = await fetch(`${baseUrl}/postmarkInboundWebhook?secret=${encodeURIComponent(secret)}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
