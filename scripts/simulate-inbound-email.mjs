const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;

const payload = {
  provider: 'manual',
  route_address: 'newhaven+introduction@inbound.example.org',
  from_email: 'coach@makehaven.org',
  to_emails: ['intake@network.org', 'advisor@sbdc.org'],
  subject: 'Introduction: Jane Smith',
  text_body: `Hi SBDC,

I'd like to introduce Jane Smith, founder of Smith Studio.

Jane is looking for funding and marketing support.

--- NETWORK REFERRAL DATA ---
client_name: Jane Smith
client_email: jane@example.com
client_venture: Smith Studio
referrer_email: coach@makehaven.org
receiving_org: SBDC

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
};

const response = await fetch(`${baseUrl}/processInboundEmail`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const json = await response.json();
console.log(JSON.stringify(json, null, 2));
