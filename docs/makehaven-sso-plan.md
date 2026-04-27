# Phase 1 Plan: Federated SSO + Compact Acceptance (MakeHaven as First Deployment)

## Context

Nexus is positioned as an open-source pattern for federated entrepreneurship ecosystems. Phase 1 ships the first concrete federation-adjacent capability: a member of a peer organization can click one button on that org's dashboard and arrive in Nexus fully provisioned — with their person record, (optionally) their organization record, and an acknowledged federation compact.

MakeHaven is the first organization configured as an upstream OIDC provider, because many prospective Nexus users are already MakeHaven members. **The Nexus-side implementation is generic.** Any peer organization running a Drupal (or other OIDC-compliant) identity provider can register the same way via the existing `partnerRegisterOidcProvider` endpoint.

Related: [federation stance memo](~/.claude/plans/i-did-not-copy-fizzy-sifakis.md), [partner API](./partner-api/), [onboarding model](./onboarding-and-role-model.md).

## Scope

**In scope:**
- "Sign in with [Provider]" via PKCE OAuth 2.0 against a registered OIDC provider.
- Server-side token exchange: verify provider token, upsert Nexus person (+ optional org shell) with dedup, record compact acceptance, mint Firebase custom token.
- Cross-source dedup for persons and orgs (external_ref > email > weak signals flagged for admin).
- Compact acceptance gate wired into `AgreementGate.tsx`; text-hash tracking so versioning can be turned on later.
- Account-linking flow for users who arrived via other paths (email signup, Google OAuth) to attach a provider identity after the fact.
- Opportunistic "Link your [Provider] account" banner when signals suggest the user is a member (e.g., email domain match).

**Out of scope (deferred to later phases):**
- Invitation surface on the provider side (MakeHaven dashboard card, email campaigns) — that's provider-side UI work.
- Outbound profile sync (Nexus edits → provider).
- Coaching logs → CiviCRM or any provider CRM.
- Additional federation primitives (presence/discovery endpoint, peer-to-peer handoff).

## Architecture

### Two sides, one contract

| Side | What ships | Notes |
|---|---|---|
| **Provider (Drupal, MakeHaven first)** | Custom module defining an `entrepreneurship` OAuth scope + `GET /api/entrepreneurship/me` userinfo endpoint + OAuth consumer registration | Template: existing `makerspace_sponsorship` module. Scope name is `entrepreneurship` (not `nexus`) because the same endpoint may serve other entrepreneurship-focused integrations. |
| **Nexus** | OIDC login flow, server-side token exchange function, dedup helper, compact-aware `AgreementGate`, account linking UI | Generic for any registered OIDC provider. MakeHaven is configuration, not code. |

### The contract: `/api/entrepreneurship/me` response shape

```json
{
  "drupal_uid": 123,
  "email": "member@example.com",
  "display_name": "Jane Doe",
  "civi_contact_id": 456,
  "employer_org": {
    "id": 789,
    "name": "Acme Ventures",
    "website": "https://acme.example.com",
    "domain": "acme.example.com"
  },
  "is_entrepreneur": true,
  "venture_stage": "ideation"
}
```

All fields beyond `drupal_uid` and `email` are optional. `employer_org` is nullable. `is_entrepreneur` / `venture_stage` are surfaced by the provider if it tracks them; Nexus tolerates their absence.

### Flow (end-to-end happy path)

1. User clicks a button on the provider's site (e.g., MakeHaven dashboard) → browser is redirected to Nexus at `/sso/:providerId` (with `providerId` identifying the registered OIDC provider).
2. Nexus client generates PKCE verifier + challenge, stashes verifier in localStorage, redirects to provider's `/oauth/authorize` with scope `openid email profile entrepreneurship`.
3. Provider authenticates the user, redirects back to Nexus at `/oauth/callback?code=...&state=...`.
4. Nexus client exchanges the code at provider's `/oauth/token` (with PKCE verifier) → gets access_token + refresh_token.
5. Nexus client POSTs the access_token to a new Nexus server function (proposed: `oidcProvisionAndMint` — a generalization of the existing `oidcExchangeToken`).
6. Server function:
   a. Verifies the access_token by calling the provider's userinfo endpoint (URL from the registered provider config).
   b. Runs dedup: person by external_ref match → exact email → weak signals. Org by external_ref → domain → normalized name.
   c. Upserts person with `external_ref.<providerId> = drupal_uid`. Upserts org as shell if absent. Links person to org via existing relationship model.
   d. Records federation compact acceptance as a `ConsentEvent` with the compact text hash.
   e. Mints a Firebase custom token for the Nexus person.
   f. Returns custom token to client.
7. Client signs in to Firebase with the custom token → now authenticated as a Nexus user.
8. `AgreementGate` checks for compact acceptance (just recorded in 6d) + any other required agreements → passes through → lands on the entrepreneur dashboard.

### Dedup priority (applied to both persons and orgs)

| Tier | Signal | Action |
|---|---|---|
| 1 | Matching `external_ref.<providerId>` already present on a record | Silent auto-link; this is the same entity the provider has told us about before. |
| 2 | Exact email match (person) / exact domain match (org) | Silent auto-link; add the provider's `external_ref` to the existing record. |
| 3 | Email-domain + normalized-name similarity (person) / normalized-name similarity (org) | Flag as `possible_duplicate` for admin review; do NOT auto-merge. Create new record to keep the user flow moving. Admin can merge later via existing tooling. |

**Conflict case:** if a Tier 1 match returns a person whose email differs from the provider's email, flag for admin, do not silently overwrite. If the provider's `drupal_uid` is already linked to a different Nexus person, return an error to the client with a clear "this MakeHaven account is already linked to a different Nexus profile" message.

## File-level sketch

### Provider side (`dev.makehaven-website/`)

- **New:** `web/modules/custom/entrepreneurship_api/`
  - `entrepreneurship_api.info.yml` (deps: civicrm, rest, serialization)
  - `entrepreneurship_api.routing.yml` (route `entrepreneurship_api.me` → `/api/entrepreneurship/me`, `_auth: ['oauth2']`)
  - `src/Controller/EntrepreneurshipApiController.php` (mirrors `SponsorshipApiController::getCurrentUser`; adds `is_entrepreneur` / `venture_stage` if MakeHaven tracks them, leaves them out otherwise)
  - `entrepreneurship_api.services.yml` (if custom services needed; likely not for v1)
  - `README.md` (module purpose, the scope contract, how to configure the OAuth consumer)
- **New:** `config/simple_oauth.oauth2_scope.entrepreneurship.yml` (scope config entity, following sponsorship's pattern)
- **Manual in Drupal admin (you):** register a new OAuth consumer for Nexus — grant type Authorization Code, PKCE enabled, no client secret, redirect URIs for Nexus prod + localhost.

### Nexus side

- **New:** `functions/src/oidcProvisionAndMint.ts` (or extend `oidcExchangeToken` in `functions/src/partnerApi.ts` if it fits cleanly — decide during implementation after reading `partnerApi.ts` more carefully).
- **New:** `functions/src/dedup.ts` (shared helper used by both SSO provisioning and partner API upserts).
- **New:** `src/services/oidcLogin.ts` (PKCE flow client-side).
- **New:** `src/pages/SsoStart.tsx` and `src/pages/SsoCallback.tsx` (dedicated routes for `/sso/:providerId` and `/oauth/callback`).
- **Update:** `src/shared/ui/AgreementGate.tsx` — add compact agreement type alongside existing privacy policy + DUA; store text hash with acceptance.
- **Update:** `src/domain/consent/types.ts` — add `text_hash` to `ConsentEvent` if not present; add `federation_compact` as an agreement type.
- **New:** `src/pages/settings/ConnectProvider.tsx` (account-linking UI).
- **New:** `src/shared/ui/LinkProviderBanner.tsx` (opportunistic banner logic).

### No hardcoded MakeHaven

Every piece on the Nexus side is keyed off `providerId`. The MakeHaven-specific configuration (display name, icon, OIDC endpoints, custom scope name) lives in the Firestore record created by `partnerRegisterOidcProvider`. A different peer organization can register a different provider and get the same surfaces automatically.

### `ref_sources` — aligning SSO dedup with other data-sync lanes

`partnerRegisterOidcProvider` accepts an optional `ref_sources` map that tells Nexus which `external_ref.source` string to use for each identifier in the provider's userinfo response. This is what keeps SSO-provisioned and other-lane-provisioned records dedup'd to the same Nexus person/org.

MakeHaven already has the `entrepreneur_nexus_bridge` module pushing CiviCRM contacts to Nexus with `external_ref.source = "makehaven_civicrm"`. For SSO logins to dedup against those existing records (Tier 1, silently), MakeHaven's OIDC provider must be registered with:

```json
{
  "ref_sources": {
    "civi_contact_id":    "makehaven_civicrm",
    "employer_org_id":    "makehaven_civicrm",
    "drupal_uid":         "makehaven_drupal"
  }
}
```

If `ref_sources` is omitted, Nexus falls back to `<provider_id>:<userinfo_key>` — SSO-only dedup still works, but SSO and bridge-pushed records will be two Nexus records for the same person, relying on the weaker Tier 2 (exact email) auto-link.

Other peers register their own `ref_sources`. Nexus never hardcodes any.

## Open decisions (defaults applied unless user pushes back)

- **Compact text source:** starts as a static markdown file in the repo (`src/content/compact/federation-compact.md`); rendered in the gate. Hash is computed at build time and stored alongside. When the compact moves to a real signed document, the source can move to Firestore-hosted content without changing the flow.
- **`providerId` value:** uses the Firestore document ID of the registered OIDC provider. For MakeHaven specifically, something like `makehaven` as the id — but this is config, not code.
- **PKCE verifier storage:** localStorage (same as Sponsorship-Tool and Inventory-App patterns). Simple; known footgun is that any XSS on the callback route could read it — mitigated by short verifier lifetime (single exchange) and by being on a dedicated callback route with minimal surface area.
- **Compact revocation path:** if user revokes compact consent, they are signed out of Nexus and future logins require re-accepting. MakeHaven membership is unaffected.

## Verification

End-to-end test cases (task #9):

1. **Happy path, new user:** User with no prior Nexus presence clicks from MakeHaven dashboard → OAuth flow → compact acceptance → lands on dashboard, person + org provisioned.
2. **Happy path, returning user:** User who signed in before → silent link via external_ref, no duplicate records.
3. **Email-dedup link:** User with a Nexus account created via email signup clicks MakeHaven SSO → matched by exact email, `external_ref.makehaven` added to existing person.
4. **Weak-signal duplicate:** MakeHaven user whose name matches an existing Nexus person created by another ESO → new person created, admin sees "possible duplicate" flag.
5. **Linked-elsewhere conflict:** User's MakeHaven `drupal_uid` is already linked to a different Nexus person → clear error, no link.
6. **Compact rejection:** User reaches compact gate and declines → signed out, no Nexus person created on that visit.
7. **Linking flow from settings:** User created via Google OAuth visits settings → "Connect MakeHaven" → completes OAuth → `external_ref.makehaven` added to their existing person.
8. **Opportunistic banner:** Google-OAuth user with `@makehaven.org` email sees banner suggesting they link their MakeHaven account.
9. **Independent signup path unaffected:** Non-MakeHaven user creates a Nexus account via email signup — no MakeHaven SSO button appears on the default login screen.

## Dependencies

- Provider-side OAuth consumer registered in Drupal admin (user does).
- Custom scope `entrepreneurship` installed via config import after the module is deployed.
- Environment variables: `VITE_OAUTH_REDIRECT_URI` for the Nexus client, plus a provider-config Firestore record seeded with MakeHaven's endpoints, scope, and client_id.

## Risks

- **Provider userinfo contract drift.** If `/api/entrepreneurship/me` changes shape without coordinating, Nexus ingest silently mis-populates. Mitigation: validate response shape, log + alert on unexpected fields, small smoke-test script that calls the endpoint and checks required keys.
- **Dedup false-negatives at scale.** Weak signals will create duplicates that accumulate until admin review. Acceptable for phase 1; build admin review UI in a later phase if volume warrants.
- **PKCE verifier loss.** User closes tab mid-flow, localStorage gets cleared, code is unusable. Error message + offer to retry from scratch.
- **Compact-acceptance pressure.** If a user feels ambushed by the compact gate, they'll bounce. UX should frame it as "you're joining a shared network with these protections," not "accept our terms to continue."
