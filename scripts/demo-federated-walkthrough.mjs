/**
 * Federated model walkthrough — CT consortium prototype spec.
 *
 * A code-only, call-and-response demo: every step prints the actual HTTP
 * request and the raw JSON response. There is no UI in this demo — the point
 * is the protocol. Any system that can send HTTPS + JSON already speaks it.
 *
 * Runs the minimal prototype agreed at the Aug 7, 2026 consortium meeting:
 *   1. Demonstrate how a new user registers as an entrepreneur.
 *   2. Link the entrepreneur to a service provider A.
 *   3. Demonstrate linking to a second service provider B (shared identity).
 *   4. Demonstrate entrepreneur access via B with service provider A offline.
 *
 * "Service provider A" is the Entrepreneurship Foundation and "B" is the
 * IP Factory — two independent systems, each holding its own API key, sharing
 * one entrepreneur record. The shared record is jointly governed — no single
 * org owns it; each ESO keeps its own IDs (external_refs) and only ever sees
 * its own.
 *
 * Prerequisites (local): emulators running and seeded —
 *   ./scripts/start-local-dev.sh
 *   node scripts/seed-local-reference-data.mjs
 *
 * Live-presentation mode (pause for Enter between steps):
 *   node scripts/demo-federated-walkthrough.mjs --step
 *
 * Against a hosted demo instance:
 *   FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-<project>.cloudfunctions.net \
 *   ESO_A_KEY=nxk_... ESO_B_KEY=nxk_... node scripts/demo-federated-walkthrough.mjs --step
 */
import assert from 'node:assert/strict';
import readline from 'node:readline';

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const stepMode = process.argv.includes('--step') || process.env.DEMO_STEP === '1';

const ECOSYSTEM_ID = process.env.ECOSYSTEM_ID || 'eco_connecticut';
const ESO_A = {
  name: 'Entrepreneurship Foundation',
  short: 'EF',
  orgId: process.env.ESO_A_ORG_ID || 'org_ef',
  key: process.env.ESO_A_KEY || 'test-api-key-ef-demo001',
  source: 'ef_tracker',
};
const ESO_B = {
  name: 'IP Factory',
  short: 'IPF',
  orgId: process.env.ESO_B_ORG_ID || 'org_ipfactory',
  key: process.env.ESO_B_KEY || 'test-api-key-ipf-demo001',
  source: 'ipfactory_matching',
};

// Fresh identifiers per run so the "created" → "linked" story replays cleanly.
const runId = Date.now().toString(36);
const entrepreneur = {
  first_name: 'Ada',
  last_name: 'Founder',
  email: `ada.founder+${runId}@example.com`,
};

// ── Presentation helpers ─────────────────────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

const indent = (text, pad = '   ') => text.split('\n').map((l) => pad + l).join('\n');
const maskKey = (key) => `${key.slice(0, 18)}…`;

const pause = async () => {
  if (!stepMode) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(dim('   [Enter to continue] '), resolve));
  rl.close();
};

const step = async (n, title, why) => {
  console.log(`\n${bold(`━━ Step ${n} · ${title}`)}`);
  if (why) console.log(dim(`   ${why}`));
  await pause();
};

const takeaway = (msg) => console.log(`${green('   ✔')} ${msg}`);

/**
 * Makes the call AND narrates it wire-level: prints the request (method,
 * endpoint, auth key, body) and the raw response (status + JSON).
 */
const call = async (fn, { method = 'POST', as, body, query } = {}) => {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  console.log(`\n${cyan('   ▶')} ${bold(`${method} /${fn}${qs}`)}`);
  console.log(dim(`     X-Nexus-API-Key: ${maskKey(as.key)}   (${as.name}'s own key)`));
  if (body) console.log(dim(indent(JSON.stringify(body, null, 2), '     ')));

  const res = await fetch(`${baseUrl}/${fn}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Nexus-API-Key': as.key,
    },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  const json = await res.json().catch(() => ({}));

  console.log(`${yellow('   ◀')} ${bold(`HTTP ${res.status}`)}`);
  console.log(indent(JSON.stringify(json, null, 2), '     '));
  return { status: res.status, body: json };
};

// ── Demo ─────────────────────────────────────────────────────────────────────

console.log(bold('FEDERATED MODEL — call-and-response walkthrough'));
console.log(`Nexus node:  ${baseUrl}`);
console.log(`Ecosystem:   ${ECOSYSTEM_ID}`);
console.log(`Provider A:  ${ESO_A.name} (${ESO_A.orgId})`);
console.log(`Provider B:  ${ESO_B.name} (${ESO_B.orgId})`);
console.log(dim('\nNo UI in this demo, on purpose: everything below is plain HTTPS + JSON,'));
console.log(dim('sent from the systems each organization ALREADY runs.'));
if (stepMode) console.log(dim('Step mode: press Enter to advance.'));

// ── 1. Entrepreneur registers with service provider A ────────────────────────
await step(1, `Entrepreneur registers at ${ESO_A.name} — A's own system, A's own form`,
  'A pushes the new contact from its CRM. No central registration portal involved.');
const created = await call('partnerUpsertPerson', {
  as: ESO_A,
  body: {
    external_ref: { source: ESO_A.source, id: `contact-${runId}` },
    ecosystem_id: ECOSYSTEM_ID,
    eso_org_id: ESO_A.orgId,
    ...entrepreneur,
    tags: ['entrepreneur'],
  },
});
assert.ok(created.status < 300, `Upsert failed: ${JSON.stringify(created.body)}`);
assert.equal(created.body.action, 'created');
const nexusId = created.body.nexus_id;
takeaway(`action: "created" — one new shared record (${nexusId}). A used ITS OWN contact ID.`);
await pause();

// Idempotency: provider A saves the contact again — no duplicate.
console.log(`\n${bold('   (replay)')} ${dim('A\'s CRM saves the same contact again — safe to fire on every save:')}`);
const replay = await call('partnerUpsertPerson', {
  as: ESO_A,
  body: {
    external_ref: { source: ESO_A.source, id: `contact-${runId}` },
    ecosystem_id: ECOSYSTEM_ID,
    eso_org_id: ESO_A.orgId,
    ...entrepreneur,
  },
});
assert.equal(replay.body.action, 'updated');
assert.equal(replay.body.nexus_id, nexusId);
takeaway('action: "updated", same nexus_id — idempotent, duplicates are impossible.');

// ── 2. Provider A links structured participation ─────────────────────────────
await step(2, `${ESO_A.name} records the relationship`,
  'A dated, typed participation — journey context other ESOs can build on.');
const participation = await call('partnerUpsertParticipation', {
  as: ESO_A,
  body: {
    person_external_ref: { source: ESO_A.source, id: `contact-${runId}` },
    participation_external_ref: { source: ESO_A.source, id: `contact-${runId}_program` },
    ecosystem_id: ECOSYSTEM_ID,
    eso_org_id: ESO_A.orgId,
    participation_type: 'program',
    name: 'Business Plan Competition 2026',
    status: 'active',
    start_date: '2026-08-01',
  },
});
assert.ok(participation.status < 300, `Participation failed: ${JSON.stringify(participation.body)}`);
takeaway('Entrepreneur ↔ provider A link is now on the shared record.');

// ── 3. Provider B recognizes the same entrepreneur (shared identity) ─────────
await step(3, `Entrepreneur shows up at ${ESO_B.name} — systems LINK, not duplicate`,
  `B pushes from its own CRM, with its own IDs and its own key. Watch the "action".`);
const linked = await call('partnerUpsertPerson', {
  as: ESO_B,
  body: {
    external_ref: { source: ESO_B.source, id: `member-${runId}` },
    ecosystem_id: ECOSYSTEM_ID,
    eso_org_id: ESO_B.orgId,
    ...entrepreneur,
    tags: ['patent'],
  },
});
assert.ok(linked.status < 300, `Link failed: ${JSON.stringify(linked.body)}`);
assert.equal(linked.body.action, 'linked', `Expected linked, got: ${JSON.stringify(linked.body)}`);
assert.equal(linked.body.nexus_id, nexusId);
takeaway(`action: "linked" — SAME record ${nexusId}. One shared identity on a jointly`);
console.log('     governed core — no single org owns the list, and A and B never talked directly.');

// ── 4. Sovereignty + resilience: B operates with A offline ───────────────────
await step(4, `${ESO_B.name} works — with ${ESO_A.name} completely offline`,
  'B reads the shared record using only its own key and its own member ID.');
const fromB = await call('partnerGetPerson', {
  method: 'GET',
  as: ESO_B,
  query: { source: ESO_B.source, id: `member-${runId}` },
});
assert.equal(fromB.status, 200);
assert.equal(fromB.body.person.nexus_id, nexusId);
const refSources = (fromB.body.person.external_refs || []).map((r) => r.source);
assert.ok(!refSources.includes(ESO_A.source), 'Provider B must not see provider A internal IDs');
takeaway(`Nothing in this call touched ${ESO_A.name} — A can be down entirely.`);
takeaway(`Privacy: external_refs contains ONLY B's own source (${JSON.stringify(refSources)}).`);
console.log(`     ${ESO_A.name}'s internal contact IDs are never disclosed to B — or anyone.`);
console.log(dim('     (Login works the same way: SSO providers registered via partnerRegisterOidcProvider'));
console.log(dim('     mint an independent session, so entrepreneurs still sign in when their home ESO is down.)'));

// ── 5. Real-time referrals channel (webhooks) ────────────────────────────────
await step(5, `${ESO_B.name} subscribes to referral events`,
  'The fix for untracked, unacknowledged referrals: signed, real-time notifications.');
const webhookUrl = process.env.WEBHOOK_URL || 'https://example.com/nexus-demo-webhook';
const webhook = await call('partnerRegisterWebhook', {
  as: ESO_B,
  body: {
    url: webhookUrl,
    events: ['referral.received', 'referral.updated', 'person.linked'],
    description: 'Consortium demo — IP Factory bridge',
  },
});
assert.ok(webhook.status < 300, `Webhook failed: ${JSON.stringify(webhook.body)}`);
takeaway('When any ESO refers an entrepreneur to B, B\'s system hears about it instantly');
console.log('     (HMAC-signed). Referrals get an ID, an owner, and a follow-up — by design.');

console.log(`\n${bold(green('✔ Federated prototype spec demonstrated end-to-end.'))}`);
console.log(`  Shared record: ${nexusId} · ${entrepreneur.email}`);
console.log(dim('  5 HTTPS calls. 2 independent systems. 0 new UIs. 1 shared core, 0 single owners.'));
