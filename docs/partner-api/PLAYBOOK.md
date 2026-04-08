# Nexus Partner API — Integration Playbook

This playbook walks an ESO (Entrepreneurial Support Organization) through integrating
their existing data system with the Entrepreneurship Nexus. By the end you will have
entrepreneurs from your CRM appearing in Nexus, participation history syncing
automatically, and optionally "Sign in with [Your ESO]" SSO enabled.

---

## Contents

1. [What you get](#1-what-you-get)
2. [Prerequisites](#2-prerequisites)
3. [Credential setup](#3-credential-setup)
4. [Integration sequence](#4-integration-sequence)
5. [Key concepts](#5-key-concepts)
6. [Pushing people](#6-pushing-people)
7. [Pushing organizations (businesses)](#7-pushing-organizations-businesses)
8. [Pushing participations](#8-pushing-participations)
9. [Setting up webhooks (optional)](#9-setting-up-webhooks-optional)
10. [Setting up SSO (optional)](#10-setting-up-sso-optional)
11. [Testing checklist](#11-testing-checklist)
12. [Error reference](#12-error-reference)
13. [FAQs](#13-faqs)

---

## 1. What you get

Once integrated, your CRM and the Nexus stay in sync:

| What syncs | How |
|---|---|
| Entrepreneur contact records | `partnerUpsertPerson` on contact create/update |
| Business entities | `partnerUpsertOrganization` (optional) |
| Membership / program status | `partnerUpsertParticipation` on status changes |
| Real-time events back to you | Webhooks (`interaction.logged`, `referral.received`, etc.) |
| "Sign in with [Your ESO]" | OIDC provider registration + `oidcExchangeToken` |

What **stays in your system**: your internal records, billing, access control, full
contact details, and anything not relevant to the regional entrepreneur network. The
Nexus only stores what it needs to facilitate cross-ESO referrals, resource access,
and the shared network directory.

### Consent model

People you push are visible to **ESO staff immediately** — no waiting period. They
do **not** appear in the shared public/network directory until the entrepreneur
clicks the opt-in link in the consent email. You can trigger that email at push
time by passing `send_consent_email: true`, or let the entrepreneur opt in later
through the Nexus app.

---

## 2. Prerequisites

Before you start, gather:

- Your **Nexus ecosystem ID** — assigned when your region's ecosystem was created.
  Example: `greater-new-haven`. Ask your Nexus network admin if unsure.
- Your **ESO's Nexus organization ID** — the `org_...` identifier for your organization
  in the Nexus system. Example: `org_makehaven`. Your Nexus admin can look this up.
- Access to your CRM or data system — you'll need to trigger pushes on contact
  create/update and on membership status changes.
- An HTTPS endpoint if you want to receive webhooks.
- Your OAuth2/OIDC server details if you want SSO.

---

## 3. Credential setup

Contact your Nexus network admin to issue an API key for your organization.
Keys are scoped to your `eso_org_id` — the API enforces that every push comes
from the organization that owns the key.

Keys look like:
```
nxk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (production)
nxk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (sandbox)
```

Store the key in your environment's secrets manager. Never commit it to source control.

All requests must include:
```
X-Nexus-API-Key: nxk_live_...
Content-Type: application/json
```

Base URL (production):
```
https://us-central1-entrepreneurship-nexus.cloudfunctions.net
```

---

## 4. Integration sequence

Always follow this order when setting up a new integration:

```
1. Push people        partnerUpsertPerson
2. Push businesses    partnerUpsertOrganization  (optional)
3. Push participations partnerUpsertParticipation  (requires step 1 first)
4. Register webhook   partnerRegisterWebhook      (optional)
5. Register OIDC      partnerRegisterOidcProvider (optional)
```

**Participations require the person to exist first.** If you push a participation
for an unknown `person_external_ref`, the API returns `404`. Push the person first,
then their participations.

---

## 5. Key concepts

### ExternalRef — your identity anchor

Every person, organization, and participation you push includes an `external_ref`:

```json
{
  "source": "makehaven_civicrm",
  "id": "12345"
}
```

- **`source`** — a stable string identifying your system. Convention:
  `{org_slug}_{system}`, e.g. `makehaven_civicrm`, `bizworks_salesforce`,
  `ctdeep_hubspot`. Pick one and stick with it — this is how the Nexus knows
  records from your system apart from other ESOs'.
- **`id`** — the record's ID in your system. Must be stable. Never reuse IDs.

The Nexus indexes this pair so every subsequent call is an O(1) lookup.
**Store the returned `nexus_id` alongside your record** for direct lookups,
but the `external_ref` is your safety net if you lose it.

### Idempotency

Every upsert endpoint is safe to replay. Calling the same endpoint twice with
the same `external_ref` updates the existing record. This means:

- You can push on every contact save without worrying about duplicates.
- Backfills are just bulk loops over your contact list.
- Network retries are safe.

### Three resolution paths

When you call `partnerUpsertPerson`, the API tries to find the person in this order:

1. **ExternalRef index** (O(1)) — if you've pushed this person before.
2. **Email match** — if someone with that email already exists in the ecosystem
   (e.g. they signed up directly). In this case, your `external_ref` gets added
   to their existing record. Response: `action: "linked"`.
3. **Create** — new person if no match found. Response: `action: "created"`.

---

## 6. Pushing people

### When to push

- On new entrepreneur contact creation in your CRM
- On contact detail updates (name, email)
- On initial backfill (batch loop over all relevant contacts)

### Minimal push

```http
POST /partnerUpsertPerson
X-Nexus-API-Key: nxk_live_...

{
  "external_ref": { "source": "yourorg_crm", "id": "42" },
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com"
}
```

Response:
```json
{ "ok": true, "nexus_id": "abc123xyz", "action": "created" }
```

### Staff-initiated referral (triggers consent email)

When a staff member specifically refers an entrepreneur to the Nexus, add
`send_consent_email: true`. Nexus sends the opt-in email immediately. The person
appears in your ESO's dashboard right away — email consent only gates their
visibility in the shared network directory.

```json
{
  "external_ref": { "source": "yourorg_crm", "id": "42" },
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "tags": ["entrepreneur"],
  "send_consent_email": true
}
```

### Tags

Tags are free-form strings attached to the person record. They're merged
(never replaced) — pushing `["entrepreneur"]` and then `["maker"]` results
in `["entrepreneur", "maker"]`. Useful values: `entrepreneur`, `maker`,
`seeking_funding`, `active_business`, `patent`, etc.

---

## 7. Pushing organizations (businesses)

Optional — use this if your CRM tracks an entrepreneur's business separately
from the person record.

```http
POST /partnerUpsertOrganization
X-Nexus-API-Key: nxk_live_...

{
  "external_ref": { "source": "yourorg_crm", "id": "org-99" },
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "name": "Lovelace Analytics LLC",
  "email": "hello@lovelaceanalytics.com",
  "url": "https://lovelaceanalytics.com",
  "tax_status": "for_profit",
  "tags": ["tech", "ai"]
}
```

Resolution follows the same three-step pattern: ExternalRef index → name match
within ecosystem → create.

---

## 8. Pushing participations

Participations track structured, dated involvement. MakeHaven uses them for
memberships. Other ESOs might use them for program enrollments, residencies,
grant applications, events, etc.

### Activate a membership

```http
POST /partnerUpsertParticipation
X-Nexus-API-Key: nxk_live_...

{
  "person_external_ref":        { "source": "yourorg_crm", "id": "42" },
  "participation_external_ref": { "source": "yourorg_crm", "id": "42_membership" },
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "participation_type": "membership",
  "name": "Full Membership",
  "status": "active",
  "start_date": "2024-03-01"
}
```

Note the `participation_external_ref` — this is your idempotency key. The
recommended convention is `{contactId}_{participation_type}`. This ensures the
same membership is always updated, never duplicated, no matter how many times
you call the endpoint.

### End a membership (lapsed or cancelled)

Don't delete — set `status: "past"` and add `end_date` to preserve history:

```json
{
  "person_external_ref":        { "source": "yourorg_crm", "id": "42" },
  "participation_external_ref": { "source": "yourorg_crm", "id": "42_membership" },
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "participation_type": "membership",
  "name": "Full Membership",
  "status": "past",
  "start_date": "2024-03-01",
  "end_date": "2025-03-01"
}
```

### Valid participation types and statuses

| Type | Use case |
|---|---|
| `membership` | Organizational membership (makerspace, accelerator, etc.) |
| `program` | Cohort program, accelerator, incubator enrollment |
| `application` | Submitted application (pre-acceptance) |
| `residency` | Physical or virtual residency program |
| `rental` | Workspace, storage, or equipment rental |
| `event` | Event registration or attendance |
| `service` | One-on-one service delivery (mentoring, advising) |

| Status | Meaning |
|---|---|
| `active` | Currently participating |
| `past` | Participation ended (completed or lapsed) |
| `applied` | Applied but not yet accepted |
| `waitlisted` | On the waitlist |

---

## 9. Setting up webhooks (optional)

Webhooks let the Nexus push events to your system in real time instead of you
polling for changes.

### Register your endpoint

```http
POST /partnerRegisterWebhook
X-Nexus-API-Key: nxk_live_...

{
  "url": "https://your-crm.example.com/nexus/webhook",
  "events": ["interaction.logged", "referral.received", "referral.updated"],
  "description": "YourOrg CRM bridge"
}
```

Response:
```json
{
  "ok": true,
  "webhook_id": "wh_a1b2c3d4",
  "signing_secret": "whsec_abc123..."
}
```

**Store `signing_secret` immediately** — it is not retrievable again.

### Verify inbound deliveries

Every delivery includes an `X-Nexus-Signature` header:
```
X-Nexus-Signature: sha256=<hex>
```

Verify it before processing:

**PHP:**
```php
$body   = file_get_contents('php://input');
$sig    = hash_hmac('sha256', $body, $signingSecret);
if (!hash_equals("sha256={$sig}", $_SERVER['HTTP_X_NEXUS_SIGNATURE'])) {
    http_response_code(401);
    exit;
}
$event = json_decode($body, true);
```

**Node.js:**
```js
const crypto = require('crypto');
const sig = 'sha256=' + crypto.createHmac('sha256', signingSecret)
  .update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers['x-nexus-signature']))) {
  return res.status(401).send('Invalid signature');
}
```

### Event payload shape

```json
{
  "id": "delivery_uuid",
  "event": "referral.received",
  "timestamp": "2024-03-15T14:23:00Z",
  "data": {
    "referral_id": "...",
    "status": "pending",
    "referring_org_id": "org_xyz",
    "receiving_org_id": "org_yourorg",
    "subject_person_id": "...",
    "date": "2024-03-15",
    "intake_type": "warm"
  }
}
```

Notes are intentionally omitted from webhook payloads. Call `partnerGetPerson`
to fetch the full record if needed.

### Available events

| Event | When it fires |
|---|---|
| `interaction.logged` | A new interaction was logged for a person by your ESO |
| `referral.received` | A new referral was made to your ESO |
| `referral.updated` | Status or notes changed on an existing referral to your ESO |
| `organization.created` | A new organization was created in your ecosystem |
| `organization.updated` | An organization in your ecosystem was updated |

---

## 10. Setting up SSO (optional)

SSO lets entrepreneurs log into the Nexus using their existing account at your
organization — no new password needed.

### What you need

- An OAuth2/OIDC authorization server with PKCE support
- An OAuth client registration with the Nexus redirect URI:
  `https://entrepreneurship-nexus.web.app/auth/callback`
- The endpoints: `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`
- Scopes that return at minimum: `email` and one of `name`/`given_name`+`family_name`

### Register your provider

```http
POST /partnerRegisterOidcProvider
X-Nexus-API-Key: nxk_live_...

{
  "ecosystem_id": "greater-new-haven",
  "eso_org_id": "org_yourorg",
  "display_name": "YourOrg",
  "logo_url": "https://yourorg.example.com/logo.png",
  "authorization_endpoint": "https://yourorg.example.com/oauth/authorize",
  "token_endpoint": "https://yourorg.example.com/oauth/token",
  "userinfo_endpoint": "https://yourorg.example.com/oauth/userinfo",
  "client_id": "nexus-client",
  "client_secret": "...",
  "scopes": ["openid", "email", "profile"]
}
```

Once registered, the Nexus frontend automatically renders a "Sign in with YourOrg"
button on the login page for your ecosystem.

### How the PKCE flow works

1. Browser calls `oidcGetProviders?ecosystem_id=...` to get the list of providers
2. User clicks "Sign in with YourOrg"
3. Browser generates a `code_verifier` (random 64-char string) and
   `code_challenge` = `BASE64URL(SHA256(code_verifier))`
4. Browser redirects user to `authorization_endpoint` with PKCE challenge
5. User authenticates at your server
6. Your server redirects back with `?code=...`
7. Browser posts `{ provider_id, code, redirect_uri, code_verifier }` to
   `oidcExchangeToken`
8. Nexus exchanges code server-side (keeps `client_secret` safe), mints a
   Firebase custom token
9. Browser calls `signInWithCustomToken(firebase_token)` to establish session

---

## 11. Testing checklist

Before going live, verify:

- [ ] `partnerUpsertPerson` with a test contact returns `action: "created"` then
      `action: "updated"` on the second call
- [ ] `partnerGetPerson` returns the same contact by `source` + `id`
- [ ] Pushing the same person twice doesn't create duplicates (check Nexus admin)
- [ ] `partnerUpsertParticipation` with a new person returns `404` (person must
      exist first)
- [ ] Activating then ending a membership shows `status: "past"` in Nexus
- [ ] Webhook delivery signature verification passes on a test event
- [ ] (If SSO) "Sign in with [YourOrg]" button appears in the Nexus login page
      for your ecosystem
- [ ] (If SSO) A successful login creates or links the Nexus account

---

## 12. Error reference

| Status | `error` value | Fix |
|---|---|---|
| 400 | `external_ref.source and external_ref.id are required` | Include both fields in `external_ref` |
| 400 | `ecosystem_id, first_name, last_name, and email are required` | Include all four fields |
| 400 | `url is required and must use HTTPS` | Webhook URL must start with `https://` |
| 400 | `Invalid participation_type` | Use one of: membership, program, application, residency, rental, event, service |
| 400 | `Invalid status` | Use one of: active, past, applied, waitlisted |
| 401 | `X-Nexus-API-Key header required` | Add the header |
| 401 | `Invalid or revoked API key` | Check key value; contact admin if unexpectedly revoked |
| 403 | `API key organization does not match eso_org_id` | `eso_org_id` in body must match the org your key belongs to |
| 404 | `No person found for the given person_external_ref` | Push person via `partnerUpsertPerson` first |
| 404 | `No person found for the given external reference` | Check `source` + `id` are correct |

---

## 13. FAQs

**Can I push the same person from multiple systems?**
Yes. Each system uses a different `source` value (`makehaven_civicrm`,
`makehaven_gravity_forms`, etc.). The Nexus maintains separate `external_refs`
for each source on the same person record.

**What if an entrepreneur already exists in Nexus from another ESO?**
If the email matches, the API returns `action: "linked"` and adds your
`external_ref` to the existing record. The person isn't duplicated.

**Do I need to push participations?**
No — participation sync is optional. But it gives other ESOs in the ecosystem
context about where an entrepreneur is in their journey, which improves referral
quality.

**Can I backfill historical data?**
Yes. Loop over your contacts and call `partnerUpsertPerson` for each. All calls
are idempotent — duplicates are not created. For participations, include
`start_date` and `end_date`/`status: "past"` for historical records.

**How do I handle a person who opts out?**
The consent system handles directory opt-out. If a person asks you to remove
their data entirely, contact the Nexus network admin for a data removal request
— the API does not expose a delete endpoint.

**What's the rate limit?**
There is no hard rate limit, but be a good citizen: batch pushes in bursts of
50-100 with a short sleep between batches rather than pushing thousands of
contacts simultaneously.

---

*Full API reference: `docs/partner-api/openapi.yaml` — importable into Postman,
Insomnia, or any OpenAPI-compatible tool.*
