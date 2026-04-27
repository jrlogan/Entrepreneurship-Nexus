# Phase 1 SSO Test Plan

A full integration test requires live Drupal + Nexus emulator/deployment. This plan enumerates the scenarios to walk through once both sides are configured. Automated coverage is limited to TypeScript compilation and `vite build`; everything below is a manual browser test.

## Prerequisites

### MakeHaven Drupal side
1. `drush en entrepreneurship_api` — installs the module and the `entrepreneurship` OAuth2 scope.
2. Register an OAuth consumer at `/admin/config/services/consumer`:
   - Grant type: **Authorization Code**, PKCE **enabled**, confidential **unchecked**.
   - Redirect URIs: `http://localhost:3000/oauth/callback` (dev) and the production `https://<domain>/oauth/callback`.
   - Scopes: `entrepreneurship` plus any OIDC base scopes (`openid`, `email`, `profile`) if those are installed.
   - Save the Client ID / UUID.
3. Smoke-test the userinfo endpoint by signing in as a Drupal user, granting a token, and hitting `GET /api/entrepreneurship/me` with the Bearer token. The response shape is documented in the module's README.

### Nexus side
1. Register the MakeHaven OIDC provider via `partnerRegisterOidcProvider` (authenticated with a MakeHaven-org API key):
   ```json
   {
     "display_name": "MakeHaven",
     "authorization_endpoint": "https://makehaven.org/oauth/authorize",
     "token_endpoint": "https://makehaven.org/oauth/token",
     "userinfo_endpoint": "https://makehaven.org/api/entrepreneurship/me",
     "client_id": "<uuid from Drupal consumer>",
     "client_secret": "<secret from Drupal consumer>",
     "scopes": ["openid", "email", "profile", "entrepreneurship"],
     "ref_sources": {
       "civi_contact_id": "makehaven_civicrm",
       "employer_org_id": "makehaven_civicrm",
       "drupal_uid": "makehaven_drupal"
     }
   }
   ```
   Response returns `provider_id` (e.g. `oidc_org_makehaven`). Record it for the URL patterns below.
2. Set `VITE_OAUTH_REDIRECT_URI` in the Nexus client env to match the registered redirect URI (or omit to derive from origin).

## Scenarios

Use a provider_id of `oidc_org_makehaven` in the URLs below. Substitute your real provider_id.

### S1 — Happy path, new user via partner deep link
1. Log out of Nexus (clear any existing session).
2. Visit `/sso/oidc_org_makehaven`.
3. You're redirected to MakeHaven's authorize screen; sign in.
4. MakeHaven redirects back to `/oauth/callback?code=...&state=...`.
5. The callback shows "Finishing sign-in…" briefly, then lands on `/`.
6. AgreementGate displays the privacy_policy (if not already accepted in this ecosystem). Accept.
7. AgreementGate displays the federation_compact. Accept.
8. You land on the normal app workspace.

**Expected state in Firestore:**
- `people/<authUid>` — new doc with `source: 'oidc'`, `oidc_provider_id: 'oidc_org_makehaven'`, `external_refs` containing `{ source: 'makehaven_drupal', id: <drupal_uid> }` and `{ source: 'makehaven_civicrm', id: <civi_contact_id> }` (if CiviCRM link exists).
- `external_ref_index/person:makehaven_drupal:<drupal_uid>` pointing at the person.
- `agreement_acceptances/<authUid>_<ecosystemId>_privacy_policy` with `text_hash`.
- `agreement_acceptances/<authUid>_<ecosystemId>_federation_compact` with `text_hash`.
- If the user's MakeHaven profile includes an `employer_org`: `organizations/<orgId>` with `source: 'oidc_shell'`, `external_refs` containing `{ source: 'makehaven_civicrm', id: <civi_org_id> }`. The person's `organization_id` points at it.

### S2 — Returning user, silent auto-link via external_ref
1. Run S1 once, then sign out.
2. Visit `/sso/oidc_org_makehaven` again.
3. Sign in on MakeHaven.

**Expected:** lands on the app workspace with the same `personId` as S1. No duplicate person record. AgreementGate does not re-prompt (acceptances from S1 carry over).

### S3 — Cross-lane dedup with bridge-pushed records
1. Configure `entrepreneur_nexus_bridge` on MakeHaven Drupal to push a test entrepreneur to Nexus via `partnerUpsertPerson` (produces a Nexus person with `external_refs: [{ source: 'makehaven_civicrm', id: '456' }]`).
2. As that same entrepreneur, visit `/sso/oidc_org_makehaven` and sign in.

**Expected:** the userinfo response contains the same `civi_contact_id: 456`. `matchPerson` hits Tier 1 via the `makehaven_civicrm` source. The SSO flow signs the user into the bridge-created person record; no duplicate is created. A new ref `{ source: 'makehaven_drupal', id: <drupal_uid> }` is appended.

**Failure signal:** two separate person docs for the same user in Firestore. If this happens, check that `ref_sources.civi_contact_id` in the provider config is `"makehaven_civicrm"` exactly.

### S4 — Email-match auto-link
1. Create a Nexus person via the normal signup flow with email `foo@example.com`.
2. Sign in as the same email via MakeHaven SSO (where MakeHaven has no existing push record for this person).

**Expected:** Tier 2 (email_exact) triggers. The external_refs from SSO are appended to the existing person record. No duplicate.

### S5 — Weak-signal possible duplicate flagged
1. Create a Nexus person via signup: name "Alex Smith", email `alex@acme.com`, managed by ESO A.
2. Sign in via MakeHaven SSO as a different entrepreneur: name "Alex Smith", email `alex.smith@acme.com`, drupal_uid `789` (brand new to Nexus).

**Expected:** Tier 1 misses (no matching external_ref). Tier 2 misses (different email). Tier 3 detects same domain + high name similarity → creates a new person record AND writes to `dedup_flags` collection with `entity_type: 'person'`, `new_entity_id: <new>`, `candidate_entity_id: <old>`. User is not blocked.

**Not expected:** an auto-merge. Weak signals never merge silently.

### S6 — Linked-elsewhere conflict on link flow
1. Have two Nexus accounts A and B (different auth_uids, different emails).
2. Signed in as A, use settings → "Connect MakeHaven" for a MakeHaven account that's already linked to B (via prior SSO).

**Expected:** server returns 409 with `reason: 'linked_elsewhere'`. The callback surfaces an error screen reading "This account is already linked to a different Nexus profile." A's record is not modified.

### S7 — Compact rejection
1. Run S1 steps 1–5, then at the federation_compact gate, decline (don't check the box, navigate away).

**Expected (current v1 behavior):** the user is effectively logged out of Nexus (they haven't passed the gate). MakeHaven membership is unaffected. No `agreement_acceptances` record for `federation_compact` exists.

**Note:** fully graceful "decline and sign out" UX is not yet implemented — the user has to close the tab or navigate to `/` to escape the gate. Full decline flow is a follow-up.

### S8 — Link from settings
1. Sign in via email/password as a Nexus user who has not linked MakeHaven.
2. Go to My Profile → Settings.
3. Linked Accounts section lists MakeHaven with a "Connect MakeHaven" button.
4. Click it → redirected to `/sso/oidc_org_makehaven/link` → MakeHaven authorize → callback → lands on `/?linked=ok`.
5. Return to settings.

**Expected:** Linked Accounts now shows MakeHaven with a "Linked" badge. The person's `external_refs` include `{ source: 'makehaven_drupal', id: <drupal_uid> }`.

### S9 — Opportunistic banner dismissal
1. Sign in as a Nexus user who has not linked any provider.
2. Dashboard / top of any view shows "Link your MakeHaven account" banner.
3. Click "Not now".

**Expected:** banner disappears for the current provider. `localStorage.nexus.link.banner.dismissed.oidc_org_makehaven` is set to `'1'`. Banner does not reappear on refresh.

4. Clear the localStorage entry and refresh → banner returns.
5. Click "Link account" → complete the SSO link flow → return to app.

**Expected:** banner no longer shows because the user is now linked (dismissal flag is irrelevant once linked).

## Debugging tips

- **Redirect loop on authorize:** redirect URI mismatch between the Drupal consumer config and what the Nexus client sends. Check the `redirect_uri` query param when the browser hits `/oauth/authorize` and compare exactly (including trailing slash).
- **"Provider returned an error":** check MakeHaven's simple_oauth log and the response body of `/oauth/token`. Most common cause is missing `entrepreneurship` scope on the registered consumer.
- **"No access_token in OAuth server response":** the Drupal consumer isn't set to "Authorization Code" grant, or PKCE is disabled.
- **Duplicate person records after S3:** `ref_sources` mismatch between the registered OIDC provider and the bridge module. Check Firestore `oidc_providers/<id>.ref_sources.civi_contact_id` — must be `"makehaven_civicrm"`.
- **Agreement gate loops on acceptance:** check `agreement_acceptances/<authUid>_<ecosystemId>_<type>` actually persisted. If Firestore security rules block the write, the gate silently refuses to advance. Verify client-side errors in console.
- **Banner shows after linking:** check that the user's person record has an `external_refs` entry whose `source` matches one of the provider's `ref_sources` values (or the provider-namespaced default). If the provider has no `ref_sources` and the person was provisioned before adding it, the source will be `oidc_<org_id>:drupal_uid` rather than `makehaven_drupal`.

## Regression surface

Flows to spot-check that existing behavior is not disturbed:

- Normal email/password sign-in (AuthGateView) — untouched.
- Google popup sign-in — untouched.
- Invite token acceptance — untouched.
- Partner API `partnerUpsertPerson` upserts — still use the same dedup paths as before; the new `federationDedup` helper is additive, and the OIDC-specific refs do not collide with `makehaven_civicrm` in existing partner pushes (same source string, indexed once).
- Existing agreement acceptance flow (privacy_policy / data_usage_agreement) — now also persists `text_hash`, but the field is optional; existing records without it continue to satisfy `getAcceptedTypes`.
