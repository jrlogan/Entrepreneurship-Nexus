const parseFooter = (text) => {
  const blockMatch = (text || '').match(/--- NETWORK REFERRAL DATA ---([\s\S]*?)--- END NETWORK REFERRAL DATA ---/i);
  if (!blockMatch) {
    console.log('No block match');
    return null;
  }

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
        result[normalizedKey] = rawValue;
        currentSection = normalizedKey;
      } else {
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
        existing.push(option.trim());
      }
    }
  }

  return result;
};

const textBody = `Hi SBDC,

I'd like to introduce Jane Smith, founder of Smith Studio.

Jane is looking for funding and marketing support.

--- NETWORK REFERRAL DATA ---
client_name: Jane Smith
client_email: jane@example.com
client_venture: Smith Studio
referrer_email: eso.staff@makehaven.org
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
--- END NETWORK REFERRAL DATA ---`;

const footer = parseFooter(textBody);
console.log('Parsed Footer:', JSON.stringify(footer, null, 2));

const extractEmails = (text) => {
  if (!text) return [];
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};

const senderEmail = 'eso.staff@makehaven.org';
const allEmails = extractEmails(textBody);
console.log('All Emails:', allEmails);
const clientEmail = allEmails.find(e => e !== senderEmail);
console.log('Extracted Client Email:', clientEmail);
