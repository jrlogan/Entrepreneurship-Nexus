import assert from 'node:assert/strict';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;

// This script assumes the local emulators are running and seeded with reference data.
// It will attempt to use a known seed organization's API key if available, 
// or you can pass one via NEXUS_API_KEY env var.

async function runValidation() {
    console.log('🚀 Starting MVP API Validation...');

    // 1. Test Security: No Key
    console.log('\n--- 1. Testing Security: No Key ---');
    const resNoKey = await fetch(`${baseUrl}/resolvePerson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
    });
    console.log(`Status: ${resNoKey.status} (Expected: 401)`);
    assert.equal(resNoKey.status, 401);

    // 2. Test Security: Invalid Key
    console.log('\n--- 2. Testing Security: Invalid Key ---');
    const resInvalidKey = await fetch(`${baseUrl}/resolvePerson`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-Nexus-API-Key': 'sk_invalid_123'
        },
        body: JSON.stringify({ email: 'test@example.com' })
    });
    console.log(`Status: ${resInvalidKey.status} (Expected: 401)`);
    assert.equal(resInvalidKey.status, 401);

    // Note: To test valid keys, we'd need to programmatically extract one from Firestore 
    // or assume a fixed one from the seed script. 
    // For now, we'll document that as a manual validation step or a task for the seed script.
    console.log('\n⚠️ Note: Valid API Key and Push Interaction tests require a seeded API Key.');
    console.log('To fully validate, ensure your seed script adds an API key to "org_makehaven"');
    console.log('and pass it via NEXUS_API_KEY environment variable.');

    const validApiKey = process.env.NEXUS_API_KEY;
    if (validApiKey) {
        console.log('\n--- 3. Testing Valid API Key (Resolve) ---');
        const resResolve = await fetch(`${baseUrl}/resolvePerson`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Nexus-API-Key': validApiKey
            },
            body: JSON.stringify({ email: 'coach@makehaven.org' })
        });
        const resolveData = await resResolve.json();
        console.log('Resolve Result:', JSON.stringify(resolveData, null, 2));
        assert.equal(resResolve.status, 200);
        assert.ok(resolveData.match_found);

        console.log('\n--- 4. Testing Interaction Push ---');
        const resPush = await fetch(`${baseUrl}/pushInteraction`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Nexus-API-Key': validApiKey
            },
            body: JSON.stringify({
                ecosystem_id: 'eco_new_haven',
                organization_id: 'org_test_client', // Generic test ID
                notes: 'Validated interaction push via script.',
                type: 'call',
                recorded_by: 'MVP Validator'
            })
        });
        const pushData = await resPush.json();
        console.log('Push Result:', JSON.stringify(pushData, null, 2));
        assert.equal(resPush.status, 200);
        assert.ok(pushData.interaction_id);
    }

    console.log('\n✅ Validation script completed.');
}

runValidation().catch(err => {
    console.error('❌ Validation failed:', err);
    process.exit(1);
});
