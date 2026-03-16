import { execFileSync } from 'node:child_process';
import { flushFirestoreEmulator } from './helpers/firestore-emulator-rest.mjs';
import { getAdminDocument, listAdminDocuments } from './helpers/firestore-emulator-admin.mjs';
import { signInWithPassword } from './helpers/emulator-auth.mjs';
import { LOCAL_EMAIL_FIXTURES, getFixtureById } from './local-email-fixtures.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const routeAddress = process.env.NEXUS_MAIL_TEST_ROUTE_ADDRESS || 'newhaven+introduction@inbound.example.org';
const webhookSecret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET || 'local-postmark-secret';
const adminEmail = 'coach@makehaven.org';
const adminPassword = process.env.TEST_USERS_PASSWORD || 'Password123!';

const args = process.argv.slice(2);
const shouldReset = args.includes('--reset');
const fixtureIds = args.filter((arg) => !arg.startsWith('--'));

let idToken = null;

const selectedFixtures = fixtureIds.length > 0
  ? fixtureIds.map((id) => {
      const fixture = getFixtureById(id);
      if (!fixture) {
        throw new Error(`Unknown local email fixture: ${id}`);
      }
      return fixture;
    })
  : LOCAL_EMAIL_FIXTURES;

const runScript = (scriptName) => {
  execFileSync('npm', ['run', scriptName], {
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_FUNCTIONS_REGION: region,
      FIREBASE_FUNCTIONS_BASE_URL: baseUrl,
    },
  });
};

const resetLocalData = async () => {
  await flushFirestoreEmulator(projectId);
  runScript('simulate:seed-local');
  runScript('simulate:seed-test-accounts');
};

const buildManualPayload = (fixture) => ({
  provider: 'manual',
  route_address: routeAddress,
  from_email: fixture.fromEmail,
  to_emails: [routeAddress, 'advisor@sbdc.org'],
  cc_emails: ['advisor@sbdc.org'],
  subject: fixture.subject,
  text_body: fixture.textBody,
  html_body: '<p>Local fixture test</p>',
  raw_payload: { fixture_id: fixture.id },
});

const buildPostmarkPayload = (fixture) => ({
  MessageID: `postmark-fixture-${fixture.id}-${Date.now()}`,
  MessageStream: 'inbound',
  MailboxHash: 'newhaven+introduction',
  Date: new Date().toISOString(),
  From: `${fixture.fromEmail} <${fixture.fromEmail}>`,
  FromName: fixture.fromEmail.split('@')[0],
  FromFull: {
    Email: fixture.fromEmail,
    Name: fixture.fromEmail.split('@')[0],
  },
  To: routeAddress,
  ToFull: [{ Email: routeAddress, Name: 'Local Intake' }],
  Subject: fixture.subject,
  TextBody: fixture.textBody,
  HtmlBody: '<p>Local fixture test</p>',
  OriginalRecipient: routeAddress,
});

const invokeFixture = async (fixture) => {
  const url = fixture.mode === 'manual'
    ? `${baseUrl}/processInboundEmail`
    : `${baseUrl}/postmarkInboundWebhook?secret=${encodeURIComponent(webhookSecret)}`;
  const payload = fixture.mode === 'manual' ? buildManualPayload(fixture) : buildPostmarkPayload(fixture);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(json?.error || `Fixture ${fixture.id} failed with status ${response.status}`);
  }

  return json;
};

const approveMessage = async (inboundMessageId, parseResult) => {
    const url = `${baseUrl}/approveInboundMessage`;
    
    const body = {
        inbound_message_id: inboundMessageId,
        person_email: parseResult.candidate_person_email,
        person_name: parseResult.candidate_person_name,
        venture_name: parseResult.candidate_venture_name,
        receiving_org_id: parseResult.candidate_receiving_org_id || 'org_sbdc',
        referring_org_id: parseResult.candidate_referring_org_id
    };

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(body),
        });

        const json = await response.json().catch(() => ({}));
        if (response.ok) {
            return json;
        }
        
        lastError = json?.error || `Approval failed with status ${response.status}`;
        if (lastError !== 'Inbound message not found') {
            // Log full error for debugging
            console.error(`Approval error for ${inboundMessageId}: ${lastError}`, { body });
            break; 
        }
    }

    throw new Error(`Approval failed for ${inboundMessageId}: ${lastError}`);
};

const includesAll = (haystack, needles = []) => needles.every((needle) => haystack.includes(needle));
const excludesAll = (haystack, needles = []) => needles.every((needle) => !haystack.includes(needle));

const remediationForCheck = (check) => {
  if (check.label === 'candidate_referring_org_id') {
    return 'Review authorized sender domain policy and org mapping for this ecosystem. If the sender should not auto-affiliate, adjust access_policy/allow_sender_affiliation.';
  }
  if (check.label.startsWith('review_reasons')) {
    return 'Review parsing heuristics and manual-review rules. If this is expected noise, tighten parser extraction; otherwise confirm the message should route to human review.';
  }
  if (check.label.startsWith('notice_types')) {
    return 'Review sender follow-up policy. Fix domain policy, known-user detection, or notice branching before retesting.';
  }
  if (check.label.startsWith('note_')) {
    return 'Review extractReferralNote and footer/thread stripping. Human-facing referral notes should keep only the actionable intro text.';
  }
  if (check.label === 'referral_date_present') {
    return 'Review inbound referral persistence so new referrals always store a valid ISO date for timeline sorting and UI display.';
  }
  return 'Inspect the fixture payload and resulting Firestore records to decide whether parsing, policy, or manual review needs adjustment.';
};

const evaluateFixture = async (fixture, intakeResult) => {
  const parseResultDoc = await getAdminDocument('inbound_parse_results', intakeResult.parse_result_id);
  if (!parseResultDoc) {
      throw new Error(`Parse result not found for fixture ${fixture.id}`);
  }
  const parseResult = parseResultDoc.fields;

  // Manual Approval to trigger referral and notices
  const approvalResult = await approveMessage(intakeResult.inbound_message_id, parseResult);
  
  const referral = approvalResult.referral_id ? await getAdminDocument('referrals', approvalResult.referral_id) : null;
  const allNotices = await listAdminDocuments('notice_queue');
  const relatedNotices = allNotices.filter((doc) => doc.fields?.payload?.inbound_message_id === intakeResult.inbound_message_id);

  const checks = [];
  const reviewReasons = parseResult?.needs_review_reasons || [];
  const noticeTypes = relatedNotices.map((doc) => doc.fields?.type).filter(Boolean);
  const note = referral?.fields?.notes || '';

  if ('candidateReferringOrgId' in fixture.expected) {
    checks.push({
      label: 'candidate_referring_org_id',
      ok: (parseResult?.candidate_referring_org_id || null) === fixture.expected.candidateReferringOrgId,
      actual: parseResult?.candidate_referring_org_id || null,
      expected: fixture.expected.candidateReferringOrgId,
    });
  }

  if (fixture.expected.reviewReasonsIncludes) {
    checks.push({
      label: 'review_reasons_includes',
      ok: includesAll(reviewReasons, fixture.expected.reviewReasonsIncludes),
      actual: reviewReasons,
      expected: fixture.expected.reviewReasonsIncludes,
    });
  }

  if (fixture.expected.reviewReasonsExcludes) {
    checks.push({
      label: 'review_reasons_excludes',
      ok: excludesAll(reviewReasons, fixture.expected.reviewReasonsExcludes),
      actual: reviewReasons,
      expected: fixture.expected.reviewReasonsExcludes,
    });
  }

  if (fixture.expected.noticeTypesIncludes) {
    checks.push({
      label: 'notice_types_includes',
      ok: includesAll(noticeTypes, fixture.expected.noticeTypesIncludes),
      actual: noticeTypes,
      expected: fixture.expected.noticeTypesIncludes,
    });
  }

  if (fixture.expected.noticeTypesExcludes) {
    checks.push({
      label: 'notice_types_excludes',
      ok: excludesAll(noticeTypes, fixture.expected.noticeTypesExcludes),
      actual: noticeTypes,
      expected: fixture.expected.noticeTypesExcludes,
    });
  }

  if (fixture.expected.noteIncludes) {
    checks.push({
      label: 'note_includes',
      ok: includesAll(note, fixture.expected.noteIncludes),
      actual: note,
      expected: fixture.expected.noteIncludes,
    });
  }

  if (fixture.expected.noteExcludes) {
    checks.push({
      label: 'note_excludes',
      ok: excludesAll(note, fixture.expected.noteExcludes),
      actual: note,
      expected: fixture.expected.noteExcludes,
    });
  }

  if ('ownerIdExpected' in fixture.expected) {
    checks.push({
      label: 'owner_id_expected',
      ok: (referral?.fields?.owner_id ?? null) === fixture.expected.ownerIdExpected,
      actual: referral?.fields?.owner_id ?? null,
      expected: fixture.expected.ownerIdExpected,
    });
  }

  checks.push({
    label: 'referral_date_present',
    ok: typeof referral?.fields?.date === 'string' && referral.fields.date.length > 0,
    actual: referral?.fields?.date || null,
    expected: 'non-empty string',
  });

  return {
    fixture: fixture.id,
    description: fixture.description,
    response: intakeResult,
    approval: approvalResult,
    parse_result: parseResult || null,
    referral: referral?.fields || null,
    notice_types: noticeTypes,
    checks: checks.map((check) => ({
      ...check,
      remediation: check.ok ? null : remediationForCheck(check),
    })),
    passed: checks.every((check) => check.ok),
  };
};

if (shouldReset) {
  await resetLocalData();
}

// Ensure we have an auth token for approval
const authRes = await signInWithPassword(adminEmail, adminPassword);
idToken = authRes.idToken;

const reports = [];
for (const fixture of selectedFixtures) {
  const result = await invokeFixture(fixture);
  reports.push(await evaluateFixture(fixture, result));
}

const failed = reports.filter((report) => !report.passed);
console.log(JSON.stringify({
  ok: failed.length === 0,
  project_id: projectId,
  ran: reports.length,
  failed: failed.length,
  fixtures: reports,
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
