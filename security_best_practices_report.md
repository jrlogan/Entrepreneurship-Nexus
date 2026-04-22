# Security Best Practices Report

Reviewed on 2026-04-22 for public repository readiness.

## Executive Summary

I would not make this repository public or deploy it to production until the critical Firestore rule issues are fixed. The largest risks are not secret leakage in Git; they are authorization rules that let authenticated users modify or read too much data. I did not find committed real `.env` files, private keys, or obvious production API tokens, but I did find tracked generated artifacts and dependency advisories that should be cleaned up before release.

## Critical Findings

### C1. Users Can Likely Escalate Themselves To Admin Through Their Own People Document

**Severity:** Critical

**Location:** `firestore.rules:21`, `firestore.rules:35`, `firestore.rules:95`

**Evidence:**

```firestore
function currentSystemRole() {
  return hasPersonDoc() ? personDoc().data.system_role : null;
}

function isPlatformAdmin() {
  return hasPersonDoc() && personDoc().data.system_role == 'platform_admin';
}

match /people/{personId} {
  allow create: if isAuthenticated() && request.resource.data.auth_uid == request.auth.uid;
  allow update: if isSelf(personId) || isNetworkAdmin();
}
```

**Impact:** Any authenticated user who can create or update `people/{uid}` can set `system_role` to `platform_admin`, `ecosystem_manager`, or an ESO role, then gain broad read/write access across the database.

**Fix:** Do not let clients write authorization fields. Restrict self-create/update to a small allowlist of profile fields, require `personId == request.auth.uid` on self-create, and keep `system_role`, `organization_id`, `primary_organization_id`, `ecosystem_id`, membership fields, and status server-managed only. Prefer Firebase Auth custom claims or server-written membership documents for role checks.

### C2. Organization API Keys And Webhook Secrets Are Readable Via Direct Firestore Access

**Severity:** Critical

**Location:** `firestore.rules:125`, `src/data/repos/firebase/organizations.ts:38`, `src/data/repos/firebase/organizations.ts:129`

**Evidence:**

```firestore
match /organizations/{organizationId} {
  allow read: if isAuthenticated();
}
```

```ts
api_keys: Array.isArray(org.api_keys) ? org.api_keys : [],
webhooks: Array.isArray(org.webhooks) ? org.webhooks : [],

async getApiKeys(orgId: string): Promise<ApiKey[]> {
  const org = await this.getById(orgId);
  return org?.api_keys || [];
}
```

**Impact:** Even if the UI redacts these fields, Firestore rules allow any signed-in user to read raw organization documents directly, including embedded `api_keys` and `webhooks` if present.

**Fix:** Move secrets and API key material out of `organizations` into deny-by-default collections only accessible by Cloud Functions. Store only non-secret metadata in organization docs. Use hashed API key lookup rather than prefix matching against organization records.

## High Findings

### H1. ESO Operators Can Update Any Organization Document

**Severity:** High

**Location:** `firestore.rules:125`

**Evidence:**

```firestore
match /organizations/{organizationId} {
  allow create, update: if isPlatformAdmin() || isEsoOperator();
}
```

**Impact:** A compromised or low-privilege ESO account can modify any organization, including operational metadata and potentially embedded API key/webhook arrays.

**Fix:** Scope ESO writes to the operator’s own organization or explicitly managed organizations. Add field-level restrictions so clients cannot write secrets, roles, ownership, external refs, or system-managed fields.

### H2. Storage Rules Allow Any Authenticated User To Upload Any Avatar Or Logo Path

**Severity:** High

**Location:** `storage.rules:4`, `storage.rules:10`, `storage.rules:15`

**Evidence:**

```firestore
match /{allPaths=**} {
  allow read: if request.auth != null;
}

match /people/{personId}/avatar/{fileName} {
  allow write: if request.auth != null;
}

match /organizations/{orgId}/logo/{fileName} {
  allow write: if request.auth != null;
}
```

**Impact:** Any signed-in user can overwrite another person’s avatar or any organization logo. There are also no visible file size or MIME type restrictions.

**Fix:** Restrict avatar writes to `request.auth.uid == personId` or admins. Restrict logo writes to members/admins of that organization. Add size and content-type checks such as `image/png`, `image/jpeg`, and `image/webp`.

### H3. Authenticated Users Can Read Broad PII Collections

**Severity:** High

**Location:** `firestore.rules:95`, `firestore.rules:125`, `firestore.rules:131`, `firestore.rules:137`, `firestore.rules:143`, `firestore.rules:193`, `firestore.rules:219`

**Evidence:** Many sensitive collections use `allow read: if isAuthenticated()`, including `people`, `organizations`, `network_profiles`, `referrals`, `interactions`, `consent_policies`, and `consent_requests`.

**Impact:** One ordinary authenticated account may be enough to enumerate people, organizations, referrals, consent requests, and interaction history across the whole system.

**Fix:** Apply membership and ecosystem scoping consistently in rules. Public-directory style fields should be split into separate public/basic documents or returned via Cloud Functions that redact data server-side.

### H4. Dependency Audit Reports Critical And High Vulnerabilities

**Severity:** High

**Location:** `package-lock.json`, `functions/package-lock.json`

**Evidence:** `npm audit --omit=dev --json` reported `protobufjs` as critical and `brace-expansion` as moderate in the root project. `npm --prefix functions audit --omit=dev --json` reported `protobufjs` critical, plus high advisories in `fast-xml-parser`, `node-forge`, and `path-to-regexp`.

**Impact:** Some vulnerable packages are in production dependency trees, including Cloud Functions dependencies. Exposure depends on reachable code paths, but these should be treated as release blockers until updated or documented as non-exploitable.

**Fix:** Update dependency ranges and lockfiles, then rerun both audit commands. Be careful with Firebase package major-version recommendations; prefer compatible current Firebase Admin/Functions updates over blind downgrades.

## Medium Findings

### M1. Partner API Keys Are Generated Client-Side With `Math.random()` And Validated By Prefix

**Severity:** Medium

**Location:** `src/data/repos/firebase/organizations.ts:140`, `functions/src/index.ts:227`, `functions/src/partnerApi.ts:117`

**Evidence:**

```ts
const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
const fullKey = `sk_live_${randomPart}`;
```

```ts
k.status === 'active' &&
(k.prefix === apiKey || apiKey.startsWith(k.prefix.replace('...', '')))
```

**Impact:** API key material is created in the browser with a non-cryptographic RNG, only a redacted prefix is stored, and validation appears to accept values based on that prefix. This weakens partner API authentication.

**Fix:** Generate API keys server-side with `crypto.randomBytes`, show the full key once, store only a salted hash or HMAC, and validate by hashing the presented key. Keep lookup metadata in a dedicated `api_keys` collection.

### M2. Public HTTP Functions Use Wildcard CORS

**Severity:** Medium

**Location:** `functions/src/index.ts:127`, `functions/src/partnerApi.ts:97`

**Evidence:**

```ts
res.set('Access-Control-Allow-Origin', '*');
```

**Impact:** Wildcard CORS is not automatically exploitable with bearer tokens, but it allows any origin to call these endpoints from a browser if a user or partner supplies credentials. It increases exposure and makes phishing-assisted misuse easier.

**Fix:** Allowlist the deployed app origins and partner origins where browser access is required. For machine-to-machine APIs, consider not enabling browser CORS at all.

### M3. Postmark Webhook Secret Is Accepted In The Query String

**Severity:** Medium

**Location:** `functions/src/index.ts:4245`, `docs/postmark-integration.md`

**Evidence:**

```ts
const providedSecret = (req.query.secret || req.get('x-postmark-webhook-secret') || '').toString().trim();
```

**Impact:** Query-string secrets are more likely to be copied into logs, browser history, monitoring, and support tickets.

**Fix:** Require the `x-postmark-webhook-secret` header only, or use Postmark webhook signing if available. Rotate the existing secret after changing the integration.

### M4. OIDC Provider Registration Allows Arbitrary HTTPS Endpoints

**Severity:** Medium

**Location:** `functions/src/partnerApi.ts:1274`, `functions/src/partnerApi.ts:1419`

**Evidence:** Partners can register `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint`; `oidcExchangeToken` later fetches those provider endpoints.

**Impact:** A partner API key holder can make Cloud Functions perform outbound requests to arbitrary HTTPS hosts. This is an SSRF-style risk, especially if internal metadata or private network egress is reachable.

**Fix:** Restrict provider endpoint hosts to an allowlist per partner, reject private/link-local/internal IP ranges after DNS resolution, and set tight timeouts.

## Low Findings

### L1. Tracked Playwright Snapshot Contains Test Credentials And Session Context

**Severity:** Low

**Location:** `.playwright-cli/page-2026-03-11T21-26-07-890Z.yml:6`

**Evidence:** The tracked file includes a test email and password value.

**Impact:** The shown password appears to be a documented shared test password, not a production secret. Still, generated browser snapshots can accidentally capture real credentials or private UI data.

**Fix:** Remove `.playwright-cli/` from Git, add it to `.gitignore`, and rotate any credential if it was ever valid outside local/emulator use.

### L2. No Security Headers Are Visible In Firebase Hosting Config

**Severity:** Low

**Location:** `firebase.json:1`, `index.html:10`

**Evidence:** `firebase.json` has rewrites but no headers. `index.html` loads CDN scripts without SRI:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

**Impact:** Missing CSP/clickjacking/nosniff/referrer headers reduces defense in depth. CDN scripts without SRI increase supply-chain exposure.

**Fix:** Add Firebase Hosting headers for CSP, `X-Content-Type-Options`, `Referrer-Policy`, and frame protections. For production, bundle Tailwind locally instead of using `cdn.tailwindcss.com`, and remove the import map CDN dependencies if Vite is bundling from npm.

## Positive Notes

- Real local `.env` files are ignored by `.gitignore`, and only example env files are tracked.
- Firestore denies token collections such as `consent_tokens` and `external_ref_index` to clients.
- Several local-only helper endpoints are gated by `requireLocalOnlyEnvironment`.
- GitHub PR preview deployment is limited to same-repository PRs, reducing fork-based secret exposure.

## Recommended Release Checklist

1. Fix Firestore role escalation and broad reads before making the repo public.
2. Move API keys, webhook secrets, and OIDC client secrets out of client-readable documents.
3. Tighten Storage rules and add file validation.
4. Remove `.playwright-cli/` from Git and ignore future captures.
5. Update dependencies and rerun root and Functions `npm audit --omit=dev`.
6. Add production security headers and remove CDN runtime scripts from `index.html`.
