import fetch from 'node-fetch';

const projectId = 'entrepreneurship-nexus-local';
const region = 'us-central1';
const baseUrl = `http://127.0.0.1:55001/${projectId}/${region}`;
const secret = 'local-postmark-secret';

async function simulateInbound(messageId, subject = 'Test Referral') {
  const payload = {
    MessageID: messageId,
    MessageStream: 'inbound',
    MailboxHash: 'newhaven+introduction',
    Date: new Date().toISOString(),
    From: 'coach@makehaven.org',
    FromName: 'Coach MakeHaven',
    FromFull: { Email: 'coach@makehaven.org', Name: 'Coach MakeHaven' },
    To: 'newhaven+introduction@inbound.example.org',
    Subject: subject,
    TextBody: `Hi SBDC, I'd like to introduce Test User.
--- NETWORK REFERRAL DATA ---
client_name: Test User
client_email: testuser@example.com
receiving_org: SBDC
--- END NETWORK REFERRAL DATA ---`,
  };

  const response = await fetch(`${baseUrl}/postmarkInboundWebhook?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function approveMessage(inboundMessageId) {
    // This requires an auth token. For the sake of the script in the emulator, we might need to bypass or use a test token.
    // In local emulator, we can often use a custom token or if the function doesn't strictly verify the signature of the token against a real key.
    // However, our `requireUserAuth` likely uses `admin.auth().verifyIdToken`.
    // Let's assume for this validation script we are testing the logic flow and we might need to mock the auth part or use a known test UID.
    
    console.log(`Approving message: ${inboundMessageId}... (This step may require manual UI interaction or a valid Auth token)`);
}

async function runTests() {
  console.log('--- Test 1: Deduplication ---');
  const res1 = await simulateInbound('msg-123');
  console.log('First intake:', res1);

  const res2 = await simulateInbound('msg-123');
  console.log('Second intake (duplicate):', res2);

  if (res2.is_duplicate) {
    console.log('✅ Deduplication working.');
  } else {
    console.log('❌ Deduplication failed.');
  }

  console.log('\n--- Test 2: Intake without immediate referral creation ---');
  const res3 = await simulateInbound('msg-456', 'Fresh Intake');
  console.log('Intake response:', res3);
  
  if (res3.referral_id) {
    console.log('❌ Error: Referral was created immediately (it should not be).');
  } else {
    console.log('✅ Success: No referral created immediately.');
  }

  console.log('\nValidation complete.');
}

runTests().catch(console.error);
