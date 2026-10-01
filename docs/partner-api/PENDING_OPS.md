# Pending ops: MakeHaven venture linking

Configuration steps owed after the `makehaven-venture-linking` change
(founder_ref on `partnerUpsertOrganization`; owner-scoped SSO refs) is
deployed. Nothing here is done by the code. Remove each item when it is done
and verified.

## 1. Order of operations

1. **Deploy the functions** (this change). Safe on its own: the new request
   fields are optional, and providers without `ref_sources` behave as before.
2. **MakeHaven's Drupal side** sends `founder_ref` on business pushes and
   changes userinfo `ventures[].id` to the **CiviCRM organization contact id**
   (the id the bridge pushes the business under).
3. **Only then** add `venture_id` to the provider's `ref_sources` (step 2
   below). Mapping it while userinfo still sends Drupal node ids would look
   node id N up as CiviCRM contact N and could attach a founder to someone
   else's business.

## 2. Set MakeHaven's provider `ref_sources`

Target value on `oidc_providers/oidc_<MakeHaven org id>`:

```json
"ref_sources": { "civi_contact_id": "makehaven_civicrm", "venture_id": "makehaven_civicrm" }
```

First read what is there now (public, no secret returned):

```bash
curl -s "$FUNCTIONS_BASE/oidcGetProvider?provider_id=oidc_<MakeHaven org id>"
```

Then either:

- **Firestore console (simplest, keeps the client secret):** edit the
  `ref_sources` map field on that document to the value above. Change nothing
  else.
- **Or re-register through the API** with MakeHaven's API key.
  `partnerRegisterOidcProvider` **replaces the whole record**, so resend every
  current value from the read above, plus `client_secret` if the Drupal
  consumer is confidential (omit it for a public PKCE client):

  ```bash
  curl -s -X POST "$FUNCTIONS_BASE/partnerRegisterOidcProvider" \
    -H "X-Nexus-API-Key: $MAKEHAVEN_KEY" -H "Content-Type: application/json" \
    -d '{
      "display_name": "<current>",
      "authorization_endpoint": "<current>",
      "token_endpoint": "<current>",
      "userinfo_endpoint": "<current>",
      "client_id": "<current>",
      "scopes": ["<current>"],
      "logo_url": "<current, if any>",
      "ref_sources": { "civi_contact_id": "makehaven_civicrm", "venture_id": "makehaven_civicrm" }
    }'
  ```

If the current `ref_sources` already maps other keys (e.g. `drupal_uid`), keep
or drop them deliberately: every mapped key is now treated as MakeHaven's own
partner ID (owner-scoped). Existing ownerless index entries still resolve, so
nothing already linked breaks; the first sign-in after the change records the
scoped ref alongside the old one, which fires one more `person.linked` webhook
for that person.

## 3. Verify (staging first, then production)

- Re-push one member business with `founder_ref`; the response should say
  `founder_linked: true`.
- With the founder listed in the directory, the venture appears on another
  signed partner's directory page.
- That founder signs in with MakeHaven: no new `oidc_shell` organization with
  the venture's name, no new `dedup_flags` entry with `source:
  "oidc:oidc_<MakeHaven org id>"`.

## 4. Existing duplicates

Ventures created by earlier MakeHaven sign-ins (`source: "oidc_shell"`,
refs `oidc_<org>:venture_id`) are not merged by this change. Merge each into
the bridge-pushed venture with the admin record merge, once the bridge has
re-pushed businesses with `founder_ref`.
