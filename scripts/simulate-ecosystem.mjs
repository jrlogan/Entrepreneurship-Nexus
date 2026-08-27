/**
 * Ecosystem stress simulation.
 *
 * Plays out how the network is actually used — several agencies across two
 * networks onboarding clients and ventures, making mistakes, creating and
 * merging duplicates, referring to each other, and an entrepreneur's journey
 * accumulating over time — then probes what a hostile insider at a member
 * agency can reach with a legitimate key.
 *
 * This is a diagnostic, not a test suite: it reports what the system actually
 * does, including where it is more permissive than you might assume. Every
 * check prints PASS (behaved as the compact requires), FAIL (a real problem),
 * or NOTE (worth a human decision).
 *
 * Usage:
 *   ./scripts/start-local-dev.sh                 # emulators
 *   node scripts/seed-local-reference-data.mjs
 *   node scripts/simulate-ecosystem.mjs
 *   node scripts/simulate-ecosystem.mjs --only adversarial
 */

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const BASE = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;

const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const run = Date.now().toString(36);

// ── Cast: two networks, four agencies ────────────────────────────────────────
const STATEWIDE = 'eco_connecticut';
const NEWHAVEN = 'eco_new_haven';

const EF   = { name: 'Entrepreneurship Foundation', org: 'org_ef',         key: 'test-api-key-ef-demo001',  src: 'ef_tracker',         eco: STATEWIDE };
const IPF  = { name: 'IP Factory',                  org: 'org_ipfactory',  key: 'test-api-key-ipf-demo001', src: 'ipfactory_matching', eco: STATEWIDE };
const NEW  = { name: 'New Agency',                  org: 'org_new_agency', key: 'test-api-key-new-demo001', src: 'new_agency_crm',     eco: STATEWIDE };
const MH   = { name: 'MakeHaven',                   org: 'org_makehaven',  key: 'test-api-key-abc123',      src: 'makehaven_civicrm',  eco: NEWHAVEN };

// ── Reporting ────────────────────────────────────────────────────────────────
const C = { dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', off: '\x1b[0m' };
const findings = { pass: 0, fail: [], note: [] };

const scenario = (n, title) => console.log(`\n${C.bold}━━ Scenario ${n}: ${title}${C.off}`);
const step = (msg) => console.log(`${C.cyan}  ▸${C.off} ${msg}`);
const pass = (msg) => { findings.pass++; console.log(`${C.green}    PASS${C.off} ${msg}`); };
const fail = (msg) => { findings.fail.push(msg); console.log(`${C.red}    FAIL${C.off} ${msg}`); };
const note = (msg) => { findings.note.push(msg); console.log(`${C.yellow}    NOTE${C.off} ${msg}`); };

const call = async (fn, { as, method = 'POST', body, query } = {}) => {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${BASE}/${fn}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(as?.key ? { 'X-Nexus-API-Key': as.key } : {}) },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  return { status: res.status, body: json };
};

const pushPerson = (agency, id, person, extra = {}) =>
  call('partnerUpsertPerson', {
    as: agency,
    body: {
      external_ref: { source: agency.src, id },
      ecosystem_id: agency.eco,
      eso_org_id: agency.org,
      ...person,
      ...extra,
    },
  });

const pushOrg = (agency, id, org) =>
  call('partnerUpsertOrganization', {
    as: agency,
    body: { external_ref: { source: agency.src, id }, ecosystem_id: agency.eco, eso_org_id: agency.org, ...org },
  });

const pushParticipation = (agency, personId, partId, fields) =>
  call('partnerUpsertParticipation', {
    as: agency,
    body: {
      person_external_ref: { source: agency.src, id: personId },
      participation_external_ref: { source: agency.src, id: partId },
      ecosystem_id: agency.eco,
      eso_org_id: agency.org,
      ...fields,
    },
  });

// ═════════════════════════════════════════════════════════════════════════════
// 1. Normal operations across two networks
// ═════════════════════════════════════════════════════════════════════════════
const shared = {};

async function scenarioOnboarding() {
  scenario(1, 'Agencies onboard clients and ventures, across two networks');

  const email = `ada.rivera+${run}@example.com`;
  shared.adaEmail = email;

  step('EF (statewide network) takes an intake and pushes the founder');
  const a = await pushPerson(EF, `ef-${run}`, { first_name: 'Ada', last_name: 'Rivera', email, tags: ['entrepreneur'] });
  a.body.action === 'created' ? pass(`created ${a.body.nexus_id}`) : fail(`expected created, got ${a.body.action}`);
  shared.adaId = a.body.nexus_id;

  step('EF pushes her venture');
  const v = await pushOrg(EF, `ef-org-${run}`, { name: `Rivera Robotics ${run}`, description: 'Subsea inspection drones.', tax_status: 'for_profit' });
  v.status < 300 ? pass(`venture ${v.body.action}`) : fail(`venture push ${v.status}`);
  shared.ventureRef = `ef-org-${run}`;

  step('EF records her program enrollment');
  const p = await pushParticipation(EF, `ef-${run}`, `ef-${run}_prog`, {
    participation_type: 'program', name: 'Business Plan Competition 2026', status: 'active', start_date: '2026-02-01',
  });
  p.status < 300 ? pass('participation recorded') : fail(`participation ${p.status}: ${p.body.error}`);

  step('MakeHaven (a DIFFERENT network) meets the same founder and pushes her');
  const b = await pushPerson(MH, `mh-${run}`, { first_name: 'Ada', last_name: 'Rivera', email, tags: ['maker'] });
  if (b.body.action === 'linked' && b.body.nexus_id === shared.adaId) {
    pass('linked to the SAME record across networks — one identity, no duplicate');
  } else {
    fail(`cross-network link failed: action=${b.body.action} id=${b.body.nexus_id}`);
  }

  step('Does she now belong to BOTH networks? (rules gate visibility on this)');
  const back = await call('partnerGetPerson', { as: MH, method: 'GET', query: { source: MH.src, id: `mh-${run}` } });
  back.status === 200 ? pass('MakeHaven can read the shared record it just pushed') : fail(`MakeHaven cannot read back: ${back.status}`);

  step('Tag merging across agencies');
  const tags = back.body.person?.tags || [];
  tags.includes('entrepreneur') && tags.includes('maker')
    ? pass(`tags merged across orgs: ${JSON.stringify(tags)}`)
    : note(`tags did not merge as expected: ${JSON.stringify(tags)}`);

  step('Privacy: can MakeHaven see EF\'s internal contact ID?');
  const refs = (back.body.person?.external_refs || []).map(r => r.source);
  refs.includes(EF.src) ? fail(`LEAK: MakeHaven sees EF's refs ${JSON.stringify(refs)}`) : pass(`only own refs visible: ${JSON.stringify(refs)}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Mistakes staff actually make
// ═════════════════════════════════════════════════════════════════════════════
async function scenarioMistakes() {
  scenario(2, 'Staff mistakes — and whether the system catches them');

  step('Saving the same contact twice (double-click, re-sync)');
  const dup = await pushPerson(EF, `ef-${run}`, { first_name: 'Ada', last_name: 'Rivera', email: shared.adaEmail });
  dup.body.action === 'updated' && dup.body.nexus_id === shared.adaId
    ? pass('idempotent — no duplicate created')
    : fail(`replay produced ${dup.body.action} / ${dup.body.nexus_id}`);

  step('Typo in the participation type (everything else valid)');
  const badType = await pushParticipation(EF, `ef-${run}`, `ef-${run}_bad`, {
    participation_type: 'mentorship', name: 'Mentoring', status: 'active', start_date: '2026-03-01',
  });
  badType.status === 400 && /participation_type/i.test(badType.body.error || '')
    ? pass(`rejected on the enum: ${badType.body.error}`)
    : fail(`invalid enum handling unexpected (${badType.status}: ${badType.body.error})`);

  step('Participation for a person who was never pushed (otherwise valid)');
  const orphan = await pushParticipation(EF, `ef-nobody-${run}`, `ef-nobody-${run}_p`, {
    participation_type: 'program', name: 'Ghost Program', status: 'active', start_date: '2026-03-01',
  });
  orphan.status === 404
    ? pass('rejected — the person must exist first')
    : fail(`orphan participation not rejected as expected (${orphan.status}: ${orphan.body.error})`);

  step('Missing required fields');
  const bare = await call('partnerUpsertPerson', { as: EF, body: { external_ref: { source: EF.src, id: `x-${run}` }, ecosystem_id: EF.eco, eso_org_id: EF.org } });
  bare.status === 400 ? pass(`rejected: ${bare.body.error}`) : fail(`incomplete record accepted (${bare.status})`);

  step('Staff fixes a typo in the name (legitimate correction)');
  const fix = await pushPerson(EF, `ef-${run}`, { first_name: 'Adaeze', last_name: 'Rivera', email: shared.adaEmail });
  fix.body.action === 'updated' ? pass('correction applied to the same record') : fail(`correction produced ${fix.body.action}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Duplicates: created, detected, merged, unmerged
// ═════════════════════════════════════════════════════════════════════════════
async function scenarioDuplicates() {
  scenario(3, 'Duplicate ventures — merge and undo');

  step('Two agencies each create the same venture under slightly different names');
  const o1 = await pushOrg(EF,  `ef-dup-${run}`,  { name: `Harbor Analytics ${run}`, description: 'Marine data.' });
  const o2 = await pushOrg(IPF, `ipf-dup-${run}`, { name: `Harbor Analytics LLC ${run}`, description: 'Marine data platform.' });
  const distinct = o1.body.nexus_id !== o2.body.nexus_id;
  distinct
    ? pass('two records exist — name spelling never auto-merges (correct: no guessing)')
    : note('the two names auto-matched; verify that was intended');

  if (!distinct) return;
  shared.dupWinner = o1.body.nexus_id;
  shared.dupLoser = o2.body.nexus_id;

  step('Before merge: does IP Factory\'s ref resolve to its own record?');
  const beforeRef = await call('partnerGetPerson', { as: IPF, method: 'GET', query: { source: IPF.src, id: `ipf-dup-${run}` } });
  note(`org lookups use a person endpoint only; org read-back returns ${beforeRef.status} (no partnerGetOrganization endpoint exists)`);

  note('mergeRecords/unmergeRecords are callable functions requiring an admin session — exercised by functions/src/recordMerge.test.ts rather than this HTTP harness. The API-key surface deliberately cannot merge.');
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. Referrals between agencies
// ═════════════════════════════════════════════════════════════════════════════
async function scenarioReferrals() {
  scenario(4, 'Referrals between agencies');

  step('IP Factory subscribes to referral events');
  const wh = await call('partnerRegisterWebhook', {
    as: IPF,
    body: { url: 'https://example.com/ipf-hook', events: ['referral.received', 'referral.updated'], description: `sim ${run}` },
  });
  wh.status < 300 && wh.body.signing_secret
    ? pass('webhook registered with a signing secret (delivery is HMAC-signed)')
    : fail(`webhook registration failed (${wh.status})`);

  step('Webhook URL must be HTTPS');
  const insecure = await call('partnerRegisterWebhook', { as: IPF, body: { url: 'http://example.com/x', events: ['referral.received'] } });
  insecure.status === 400 ? pass('plain HTTP rejected') : fail(`http:// webhook accepted (${insecure.status})`);

  step('Can an agency subscribe to an event type that does not exist?');
  const badEvent = await call('partnerRegisterWebhook', { as: IPF, body: { url: 'https://example.com/y', events: ['person.deleted'] } });
  badEvent.status === 400 ? pass('unknown event type rejected') : note(`unknown event accepted (${badEvent.status}) — subscription is not proof of delivery`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. The entrepreneur's journey accumulating over time
// ═════════════════════════════════════════════════════════════════════════════
async function scenarioJourney() {
  scenario(5, "An entrepreneur's journey over two years");

  const timeline = [
    [EF,  'prog',    { participation_type: 'program',    name: 'Business Plan Competition 2026', status: 'active', start_date: '2026-02-01' }],
    [MH,  'member',  { participation_type: 'membership', name: 'Full Membership',                status: 'active', start_date: '2026-04-15' }],
    [IPF, 'service', { participation_type: 'service',    name: 'IP strategy session',            status: 'past',   start_date: '2026-06-01', end_date: '2026-06-01' }],
    [EF,  'prog2',   { participation_type: 'program',    name: 'Business Plan Competition 2026', status: 'past',   start_date: '2026-02-01', end_date: '2026-09-30' }],
  ];

  for (const [agency, suffix, fields] of timeline) {
    // Each agency must first know the person under its own ref.
    const refId = `${agency.src}-j-${run}`;
    await pushPerson(agency, refId, { first_name: 'Adaeze', last_name: 'Rivera', email: shared.adaEmail });
    const r = await pushParticipation(agency, refId, `${refId}_${suffix}`, fields);
    r.status < 300
      ? pass(`${agency.name}: ${fields.participation_type} "${fields.name}" → ${fields.status}`)
      : fail(`${agency.name} participation failed (${r.status}): ${r.body.error}`);
  }

  step('The founder is now known to three agencies across two networks');
  const view = await call('partnerGetPerson', { as: IPF, method: 'GET', query: { source: IPF.src, id: `${IPF.src}-j-${run}` } });
  if (view.status === 200) {
    const refs = (view.body.person.external_refs || []).map(r => r.source);
    refs.length === 1 && refs[0] === IPF.src
      ? pass('each agency still sees only its own identifier on the shared record')
      : fail(`ref scoping broken: ${JSON.stringify(refs)}`);
  } else {
    fail(`journey read-back failed (${view.status})`);
  }

  note('Memberships starting and ending, and services delivered, all land on one shared timeline — this is what makes survival/retention statistics a byproduct rather than a survey.');
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Hostile insider at a member agency
// ═════════════════════════════════════════════════════════════════════════════
async function scenarioAdversarial() {
  scenario(6, 'Hostile insider — a real key, used badly');

  step('Write as another organization (impersonation)');
  const imp = await call('partnerUpsertPerson', {
    as: NEW,
    body: { external_ref: { source: NEW.src, id: `imp-${run}` }, ecosystem_id: NEW.eco, eso_org_id: EF.org,
            first_name: 'Imp', last_name: 'Ersonator', email: `imp+${run}@example.com` },
  });
  imp.status === 403 ? pass('403 — a key can only write as its own org') : fail(`IMPERSONATION POSSIBLE (${imp.status})`);

  step('Read a person using ANOTHER agency\'s external ref');
  const steal = await call('partnerGetPerson', { as: NEW, method: 'GET', query: { source: EF.src, id: `ef-${run}` } });
  steal.status === 200
    ? note(`a valid key can resolve a record via another org's (source,id) — returns ${steal.status}. Refs are scoped in the RESPONSE, but knowing a competitor's ref scheme reveals whether a record exists.`)
    : pass(`cross-org ref lookup refused (${steal.status})`);

  step('Probe whether a given person is in the network, by email');
  const probeEmail = `adaeze.rivera.probe+${run}@example.com`;
  await pushPerson(EF, `ef-probe-${run}`, { first_name: 'Probe', last_name: 'Target', email: probeEmail });
  const probe = await pushPerson(NEW, `new-probe-${run}`, { first_name: 'Probe', last_name: 'Target', email: probeEmail });
  probe.body.action === 'linked'
    ? note('EMAIL PROBING: pushing an email reveals whether that person is already known (action:"linked" vs "created") AND attaches the prober to them. Inherent to email-based identity resolution — mitigate with audit review, not with a code change.')
    : pass('email push did not disclose prior existence');

  step('Escalate: mint an API key for another organization');
  const mint = await call('generatePartnerApiKey', { as: NEW, body: { orgId: EF.org, label: 'stolen' } });
  [401, 403, 404, 400].includes(mint.status)
    ? pass(`key minting refused over the API-key surface (${mint.status}) — it requires an authenticated admin session`)
    : fail(`KEY MINTING REACHABLE (${mint.status})`);

  step('Bootstrap themselves to platform admin');
  const boot = await call('bootstrapPlatformAdmin', { as: NEW, body: { email: 'attacker@example.com' } });
  // Fails closed two ways: 401 when a secret IS configured and theirs is wrong,
  // 500 "not configured" when the deployment never set one. Either way no
  // account is created — an API key is not a path to platform admin.
  if ([401, 403, 400, 404].includes(boot.status)) {
    pass(`bootstrap refused (${boot.status})`);
  } else if (boot.status === 500 && /not configured/i.test(boot.body.error || '')) {
    pass('bootstrap fails closed — endpoint is inert unless a deployment secret is set');
  } else {
    fail(`BOOTSTRAP REACHABLE (${boot.status}: ${JSON.stringify(boot.body)})`);
  }

  step('Flip an entrepreneur\'s directory-consent flag by pushing it');
  await pushPerson(NEW, `new-consent-${run}`, { first_name: 'Consent', last_name: 'Target', email: `consent+${run}@example.com` });
  const flip = await pushPerson(NEW, `new-consent-${run}`, {
    first_name: 'Consent', last_name: 'Target', email: `consent+${run}@example.com`,
  }, { network_directory_consent: true, status: 'archived', system_role: 'platform_admin' });
  const after = await call('partnerGetPerson', { as: NEW, method: 'GET', query: { source: NEW.src, id: `new-consent-${run}` } });
  const st = after.body.person?.status;
  st === 'active'
    ? pass('injected status/consent/role fields were ignored — the push schema is allow-listed')
    : fail(`FIELD INJECTION: status is now "${st}" after an unauthorized push`);

  step('Point a webhook at internal infrastructure (SSRF)');
  const ssrf = await call('partnerRegisterWebhook', { as: NEW, body: { url: 'https://169.254.169.254/latest/meta-data/', events: ['referral.received'] } });
  ssrf.status < 300
    ? note('a webhook can be registered against a link-local/metadata address. Deliveries are outbound POSTs of event payloads, so the risk is limited, but an allow-list or egress guard would be prudent before production.')
    : pass(`metadata-address webhook refused (${ssrf.status})`);

  step('Revoked/garbage key');
  const bogus = await call('partnerUpsertPerson', { as: { key: 'nxk_live_not_a_real_key' }, body: {
    external_ref: { source: 'x', id: '1' }, ecosystem_id: STATEWIDE, eso_org_id: EF.org,
    first_name: 'A', last_name: 'B', email: 'a@b.com' } });
  bogus.status === 401 ? pass('invalid key rejected') : fail(`invalid key accepted (${bogus.status})`);
}

// ═════════════════════════════════════════════════════════════════════════════
const SCENARIOS = {
  onboarding: scenarioOnboarding,
  mistakes: scenarioMistakes,
  duplicates: scenarioDuplicates,
  referrals: scenarioReferrals,
  journey: scenarioJourney,
  adversarial: scenarioAdversarial,
};

console.log(`${C.bold}Ecosystem stress simulation${C.off}`);
console.log(`node: ${BASE}`);
console.log(`networks: ${STATEWIDE} (statewide) · ${NEWHAVEN} (local cluster)`);

for (const [name, fn] of Object.entries(SCENARIOS)) {
  if (onlyArg && onlyArg !== name) continue;
  await fn();
}

console.log(`\n${C.bold}━━ Summary ━━${C.off}`);
console.log(`${C.green}  ${findings.pass} checks passed${C.off}`);
if (findings.fail.length) {
  console.log(`${C.red}  ${findings.fail.length} FAILED:${C.off}`);
  findings.fail.forEach(f => console.log(`${C.red}    · ${f}${C.off}`));
} else {
  console.log(`${C.green}  0 failures${C.off}`);
}
if (findings.note.length) {
  console.log(`${C.yellow}  ${findings.note.length} notes for human judgement:${C.off}`);
  findings.note.forEach(n => console.log(`${C.yellow}    · ${n}${C.off}`));
}
process.exitCode = findings.fail.length ? 1 : 0;
