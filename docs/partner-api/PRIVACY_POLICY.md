# Nexus Partner API — Privacy & Consent Policy

Reference document for how consent governs what a partner system (CiviCRM,
Salesforce, etc.) is allowed to push to the Nexus. All partner integrations must
follow this policy. The MakeHaven CiviCRM bridge is the first implementation.

---

## Principles

1. **Consent precedes push.** No individual's data enters the Nexus without an
   identifiable basis: their own opt-in, a staff-sent invitation they accepted,
   or a link to a record whose consent was granted through another partner.
2. **Default to the tighter model.** When in doubt between two paths, choose the
   one that requires more explicit consent.
3. **Public data is still bounded.** Public-record business info is freely
   shareable, but only the subset relevant to ecosystem discovery — not
   everything we happen to know.
4. **Linking is not creating.** If a record already exists in Nexus through
   another partner, connecting our local record to it does not transfer new
   personal data and is always allowed.

---

## Consent paths for individuals

A person is pushed to Nexus **only** if one of these three conditions is met.

### Path 1 — Direct opt-in
The individual opts in themselves, through a MakeHaven-hosted form or profile
checkbox ("Join the Entrepreneurship Ecosystem"). Consent is recorded on the
CiviCRM contact with a timestamp.

- Push: `partnerUpsertPerson` with `network_directory_consent: true` at push time
- Participation: allowed immediately
- Interactions / referrals: allowed

### Path 2 — Staff-initiated invitation
A staff member uses a CiviCRM contact action ("Invite to Nexus") to initiate a
push. Staff cannot grant consent on the member's behalf — they initiate an
invitation; the member grants consent by clicking the opt-in email.

- Push: `partnerUpsertPerson` with `send_consent_email: true`
- Record lands in Nexus with `network_directory_consent: false` — invisible in
  the directory until the member confirms
- Participation / interactions: held until consent is confirmed

### Path 3 — Lookup match to existing Nexus person
If the individual already exists in Nexus (created by another partner), we link
our CiviCRM contact to their existing Nexus record rather than creating new data.

- Call: `partnerLookupPerson` by email (endpoint to be added)
- On match: write the Nexus UUID to our CiviCRM contact; no `upsertPerson` call
- The individual's existing Nexus consent state carries; we do not alter it
- Participation can now be recorded against their existing record

If the lookup returns no match, the flow falls back to Path 1 or 2. It does not
silently create.

---

## Consent models for organizations

Every CiviCRM organization contact carries a field:

```
nexus_consent_model: "personal" (default) | "organizational"
```

### `personal` — default
The organization is treated as a person for consent purposes. No push to Nexus
until the linked individual satisfies one of the three paths above. Org data is
then pushed as part of, or alongside, the individual's record.

Applies to: solo founders, single-member LLCs, freelancers operating under a
business name, consultancies where the business is indistinguishable from one
person.

### `organizational` — staff-set exception
The org has its own distinct public identity. Staff reclassify to this value
when the organization has a public presence independent of any one founder
(multi-employee, commercial address, public team listing, operating history).

- **Tier 1 (public profile)**: pushable without individual consent — legal name,
  address, website, sector, founding date, registration status. Only subsets
  drawn from public-record sources (state filings, company website).
- **Tier 2 (rich profile)**: stage, team size, funding, self-reported needs and
  offerings. Requires one authorized person at the organization to complete a
  Nexus opt-in on behalf of the company. The first such opt-in is treated as
  authoritative; the org can later designate additional representatives.

"Organizational" classification does not weaken individual consent. Interactions,
referrals, and personal data about employees still require those individuals to
go through Paths 1–3.

### Organization lookup
As with individuals, before creating an org record we check whether Nexus
already has it.

- Call: `partnerLookupOrganization` by legal name + state, or EIN (endpoint to
  be added)
- On match: link our CiviCRM org contact to the existing Nexus org; no new data
  transferred
- On no match: fall back to the consent-model logic above

---

## Data tiers by record type

| Record | Tier 1 (no consent, public) | Tier 2 (consent required) |
|---|---|---|
| Person | None — people have no public tier | Everything: name, email, participation, interactions |
| Org (`personal`) | None — treated as person | Everything, riding on the linked person's consent |
| Org (`organizational`) | Legal name, address, website, sector, founding date, registration status | Stage, team size, funding, needs, offerings, staff-recorded context |
| Participation | Never public-tier | Membership, program, residency, rental, event, service — all require person or authorized-rep consent |
| Interaction / referral | Never public-tier | Always requires the individual's consent |

---

## Triggers — what is and is not allowed

### Removed (previously auto-pushed)
- **EntityTag-based auto-push** (`entrepreneur_nexus_bridge.module:37-40`):
  removed. Applying any tag to a CiviCRM contact is too easy to do
  accidentally (bulk operations, CSV imports, Rules actions).
- **Activity-based auto-push** (`entrepreneur_nexus_bridge.module:41-44`):
  removed. Logging an activity should not silently share a contact.

### Added
- **Individual consent webform** — front-end opt-in producing a CiviCRM contact
  with `nexus_ecosystem_consent = true` and a timestamp.
- **"Invite to Nexus" contact action** — CiviCRM contact-page button that
  enqueues a Path 2 push.
- **Classification field on org contacts** — `nexus_consent_model`, defaulting
  to `personal`.
- **Lookup-first behavior in the push worker** — every push attempt starts with
  a `partnerLookupPerson` / `partnerLookupOrganization` call.

---

## Staff workflow reference

| Scenario | Correct action |
|---|---|
| Member asks to join the ecosystem | Point them at the opt-in form (Path 1) |
| Staff wants to introduce a member to the ecosystem | Use "Invite to Nexus" (Path 2) |
| Member mentions they already have a Nexus account via another ESO | Do nothing — the next push attempt will lookup-link automatically |
| Staff wants to list a public business | Set the org's `nexus_consent_model` to `organizational`; Tier 1 push happens on next sync |
| Staff wants to push rich business info (stage, funding) | Have an authorized contact at the company complete an org-level opt-in; Tier 2 unlocks |
| Staff wants to push notes/interactions for an individual | Confirm the individual has completed Path 1, 2, or 3 first |

---

## Implementation checklist

**Nexus side**
- [ ] Add `partnerLookupPerson` endpoint (email → match | null, never creates)
- [ ] Add `partnerLookupOrganization` endpoint (name+state or EIN → match | null)
- [ ] Extend `partnerUpsertOrganization` with `tier: "public" | "rich"` and enforce consent on rich

**CiviCRM / Drupal bridge side**
- [ ] Add `nexus_ecosystem_consent` field on Individual contacts (bool + timestamp)
- [ ] Add `nexus_consent_model` field on Organization contacts (default `personal`)
- [ ] Remove EntityTag and Activity auto-push hooks
- [ ] Add opt-in webform → sets consent field → enqueues push
- [ ] Add "Invite to Nexus" contact action → enqueues Path 2 push
- [ ] Update `NexusPushWorker` to lookup-first, then route by consent state
- [ ] Kernel/functional tests for each path

**Before enabling on live**
- [ ] Dry-run mode proven on `dev` env against staging Nexus project
- [ ] Pilot with a narrow set of volunteer contacts
- [ ] Staff SOP documented for the two manual actions (opt-in form, Invite button)

---

## Revocation

### Individual opt-out
An individual who previously opted in can withdraw at any time. Full deletion
is not guaranteed — other ESOs may have participation, referral, or interaction
records attached to the same Nexus person record, and those are not ours to
delete unilaterally. Instead:

- Flip `network_directory_consent` to `false` → person disappears from the
  shared directory immediately
- Stop all future pushes from MakeHaven (our side of the consent flag flips too)
- Existing participation records that other partners attached stay with those
  partners; MakeHaven-originated participation records are suppressed from the
  directory but retained for audit
- A separate hard-delete process can be requested manually; it requires
  coordination across partners and is not automated

### Organization revocation
An authorized representative of an `organizational` org can revoke which
partners have access to the company's rich (Tier 2) profile. Tier 1 public
data stays — it was built from public records and is not the org's to remove
from Nexus. Revocation controls sharing going forward, not the existence of
the public record.

---

## Sole-prop address handling (Tier 1 safety rule)

State business filings often list a registered agent address that is actually
the founder's home. To avoid leaking personal data through a Tier 1 org push:

**Tier 1 address comes from MakeHaven's own records of the business's operating
address. Not from public-record filings.** If MakeHaven does not have a distinct
operating address for the org, the Tier 1 push omits the address entirely.

Public records can be used to confirm legal name and existence, but never as the
source of an address we push. This rule applies regardless of
`nexus_consent_model` value — it is the simplest way to prevent accidental
home-address disclosure when a solo-flagged org is later reclassified.
