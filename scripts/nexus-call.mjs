#!/usr/bin/env node
/**
 * nexus-call — flexible live-demo CLI for the partner API.
 *
 * Fire any partner API call as any demo agency and see the raw wire exchange:
 *
 *   node scripts/nexus-call.mjs --as ef partnerUpsertPerson \
 *     '{"external_ref":{"source":"ef_tracker","id":"c-1"},"first_name":"Ada","last_name":"Founder","email":"ada@example.com"}'
 *
 *   node scripts/nexus-call.mjs --as ipf --get partnerGetPerson 'source=ipfactory_matching&id=m-1'
 *
 * Agency aliases (seeded by seedLocalReferenceData):
 *   --as ef    Entrepreneurship Foundation   (org_ef)
 *   --as ipf   IP Factory                    (org_ipfactory)
 *   --as new   New Agency (live demo slot)   (org_new_agency)
 *   --as none  no API key (demonstrate the 401)
 *   --key <k> --org <org_id>   any explicit key (e.g. real sandbox keys)
 *
 * Convenience: for POST bodies, ecosystem_id and eso_org_id are auto-filled
 * from the chosen agency when absent — so live typing stays short. Pass them
 * explicitly to override (e.g. to demonstrate the 403 org-mismatch guard).
 *
 * Environment:
 *   FIREBASE_FUNCTIONS_BASE_URL  target node (default: local emulator)
 *   ECOSYSTEM_ID                 default ecosystem (default: eco_connecticut)
 */

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;
const ecosystemId = process.env.ECOSYSTEM_ID || 'eco_connecticut';

const AGENCIES = {
  ef:  { name: 'Entrepreneurship Foundation', orgId: 'org_ef',         key: 'test-api-key-ef-demo001' },
  ipf: { name: 'IP Factory',                  orgId: 'org_ipfactory',  key: 'test-api-key-ipf-demo001' },
  new: { name: 'New Agency (live demo)',      orgId: 'org_new_agency', key: 'test-api-key-new-demo001' },
  none: { name: 'anonymous (no key)',         orgId: '',               key: '' },
};

// ── arg parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let agency = null;
let method = 'POST';
let explicitKey = null;
let explicitOrg = null;
const rest = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--as') agency = AGENCIES[args[++i]];
  else if (a === '--key') explicitKey = args[++i];
  else if (a === '--org') explicitOrg = args[++i];
  else if (a === '--get') method = 'GET';
  else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
  else rest.push(a);
}

function usage() {
  console.log('Usage: node scripts/nexus-call.mjs --as <ef|ipf|new|none> [--get] <functionName> [jsonBody | queryString]');
  console.log('       node scripts/nexus-call.mjs --key <apiKey> --org <org_id> <functionName> [jsonBody]');
  console.log('Aliases: ' + Object.entries(AGENCIES).map(([k, v]) => `${k}=${v.name}`).join(' · '));
}

if (explicitKey) agency = { name: `explicit key (${explicitOrg || 'org from key'})`, orgId: explicitOrg || '', key: explicitKey };
if (!agency || rest.length === 0) { usage(); process.exit(1); }

const fn = rest[0];
const payload = rest[1];

// ── presentation ─────────────────────────────────────────────────────────────
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const indent = (t, p = '  ') => t.split('\n').map((l) => p + l).join('\n');
const maskKey = (k) => (k ? `${k.slice(0, 18)}…` : dim('(none)'));

// ── build request ────────────────────────────────────────────────────────────
let url = `${baseUrl}/${fn}`;
let body;

if (method === 'GET') {
  if (payload) url += `?${payload}`;
} else if (payload) {
  try {
    body = JSON.parse(payload);
  } catch (e) {
    console.error(`Body is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  // Auto-fill boilerplate so live typing stays short; explicit values win.
  if (fn.startsWith('partner')) {
    if (body.ecosystem_id === undefined) body.ecosystem_id = ecosystemId;
    if (body.eso_org_id === undefined && agency.orgId && fn !== 'partnerRegisterWebhook') body.eso_org_id = agency.orgId;
  }
} else {
  body = {};
}

console.log(`\n${cyan('▶')} ${bold(`${method} /${fn}${method === 'GET' && payload ? '?' + payload : ''}`)}`);
console.log(dim(`  X-Nexus-API-Key: ${maskKey(agency.key)}   (as: ${agency.name})`));
if (body && method === 'POST') console.log(dim(indent(JSON.stringify(body, null, 2))));

const started = Date.now();
let res;
try {
  res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(agency.key ? { 'X-Nexus-API-Key': agency.key } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
} catch (e) {
  console.error(`\nRequest failed: ${e.message}`);
  console.error(`Target was: ${url}`);
  process.exit(1);
}
const json = await res.json().catch(() => ({}));

console.log(`${yellow('◀')} ${bold(`HTTP ${res.status}`)} ${dim(`(${Date.now() - started} ms)`)}`);
console.log(indent(JSON.stringify(json, null, 2)));
process.exitCode = res.ok ? 0 : 2;
