# Worked example: MakeHaven (Drupal + CiviCRM)

MakeHaven was the first partner to connect, and its integration is open
source. Read this as a pattern, not a prescription: your stack will differ,
but the shape of a correct integration is the same. Hand this file to your
AI coding assistant alongside the integration brief.

- Bridge module (the API client, push queue, webhook receiver):
  https://github.com/makehaven/entrepreneur_nexus_bridge
- The member opt-in page (where consent is collected):
  https://github.com/makehaven/makerspace_entrepreneur_dashboard —
  `src/Form/EcosystemPreferencesForm.php`

## The shape of it

```
member ticks the network terms ──► stored on their account (terms_hash + choices)
        │                                            │
        └──► push queued ───────► queue worker ──────┴──► partnerUpsertPerson { consent }
                                       ▲
staff applies a CiviCRM tag ───────────┘   (same worker, same consent lookup)

Nexus referral.received webhook ──► queue ──► CiviCRM activity on the contact
```

Three decisions made this work, and each one came from getting it wrong first.

### 1. An opt-in checkbox on your site is not consent to the network

MakeHaven already had an "Connect my account to the regional network"
checkbox. It saved a flag on the member's account and nothing else: the
network never learned the member had said yes, and the push was triggered
separately by staff. So the network, correctly, emailed every pushed member
the consent notice — asking people who had already ticked a box.

The fix: the page now fetches the network's terms (`getConsentTerms`) and
shows the summary, the full documents and the two choices in the network's
own words, then stores the member's answers **with the `terms_hash`** they
were shown. If your site has an existing opt-in, do the same — replace its
wording with the network's, and record the hash. A checkbox that says
"share my profile with partners" in your own words does not count.

### 2. Attach consent to every push, not just the first

Pushes at MakeHaven come from two places: the member saving the opt-in page,
and staff applying a CiviCRM tag. Both go through one queue worker, and the
worker looks up the member's stored consent at push time
(`NexusConsentStore::payloadForContact`). That way a staff-triggered push a
month later still carries consent, and an update after the member changes
their choices carries the new answers. Don't attach consent only in the
signup handler.

This needs a mapping from your CRM record to the account the member logged
in with. MakeHaven's is CiviCRM's `civicrm_uf_match` (contact ↔ Drupal user).
Find yours before you write the consent code.

### 3. If the terms can't be loaded, don't offer joining

`getConsentTerms` is fetched live and cached for five minutes. When the
network is unreachable the page shows "joining is not available right now"
instead of the checkboxes. Nobody can agree to terms they have not seen, and
a hardcoded copy of the terms would go stale — the network refuses consent
recorded against an old hash (`409 terms_outdated`), so a stale copy would
silently break signups.

## Smaller things worth copying

- **Server-rendered forms can skip the embed block.** MakeHaven renders the
  terms inside a Drupal form so the answers are ordinary form values with
  the site's own validation. The JavaScript block is for plain HTML forms.
- **Log what the network says back.** The worker logs `consent` and
  `consent_notice_sent` from each response. When someone asks "did they get
  the email?" the log answers it.
- **Withdrawal is one-sided.** The partner API has no call to retract a
  member's consent; members change their choices in their Nexus profile. When
  a member un-ticks the box on MakeHaven's page, the site stops attaching
  consent and points them to those settings.
- **Test against staging, from a dev copy of your site.** MakeHaven's local
  site is pointed at the staging network to check the page before anything
  goes live. Production points at the production network; the page must
  degrade correctly (decision 3) when the two are out of step.
- **Pushes come from real activity.** A tag applied, a program joined, a
  member saving the page. There is no bulk import anywhere in the bridge.

## What MakeHaven has not done yet

Two calls the brief describes that the bridge does not make: membership
status as `partnerUpsertParticipation`, and coaching sessions as
`partnerLogActivity`. Partners see that MakeHaven works with a member, but
not "member since March" or "met last week". Both are additive.
