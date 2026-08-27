# Centralized vs. Federated — Prototype Comparison

Status: internal working notes · Last updated: 2026-08-26
Companion to `docs/federated-demo-plan.md`.

Based on a hands-on walkthrough of Chris Kalish's centralized prototype
(`theipfactory.org/CentralRegistry/EntrepreneurLink.php`, tested Aug 26 with a
throwaway account per his "it's a sandbox, test whatever you'd like"
invitation) and the Nexus federated walkthrough
(`scripts/demo-federated-walkthrough.mjs`).

## 1. What Chris actually built

**Architecture**: a central identity provider ("Entrepreneur Central") with
partner services as OAuth-style clients — exactly the model from his April
email (a central entity "owns the list"; partners authenticate against it like
"Login with Google").

Observed flow:

1. **Central registration** — a 5-step wizard ("Create Account → Verify Email
   → Profile Details → Review & Submit → Link Services"). Step 1 requires, up
   front: first/last name, email, **phone, date of birth, street address,
   city/state/zip, country**, and a 12-char password. Tagline: *"One Profile.
   Many Opportunities."* Copy: *"Register in the central repository…"*
2. **Sequential EntrepreneurID** — the central registry assigns an integer ID
   (our test account was #14); this is the shared key for the whole network.
3. **Email verification** gates partner SSO (prototype prints the verify link
   on screen).
4. **Central dashboard** — shows "Your Central Identity" and a "Link Your
   Accounts" panel with per-service Connect buttons (each service is an OAuth
   client: `client_id`, `redirect_uri`, `state` → `api/sso_authorize.php` →
   authorization code → service `callback.php`).
5. **What a service receives on SSO**: the **complete central profile as
   JSON** — EntrepreneurID, name, email, phone, date of birth, full street
   address, verification status. Every connected service gets the same full
   record.

Build quality notes (credit where due): real authorization-code flow with
per-session `state` (a forged state was correctly rejected), CSRF tokens on
every form, email verification before SSO, decent password minimum. EF and
MakeHaven service apps are placeholders that just display the received JSON;
the IP Factory client redirects into their real matching application.

Not present (yet, and mostly by design — the agreed spec didn't ask for them):
referrals, participations/journey tracking, consent granularity, aggregate
reporting, field standards beyond his own schema, and any way for a partner to
keep its own IDs.

## 2. The philosophical difference

Same OAuth machinery, opposite direction of gravity:

- **Chris's model**: the *center* is the source of truth. The entrepreneur's
  primary relationship is with the registry ("Entrepreneur Central"); service
  providers are satellites that consume its profile. Registration happens at
  the center, then fans out ("One Profile. Many Opportunities.").
- **Nexus model**: the *edges* are the source of truth. The entrepreneur's
  primary relationship is with whichever ESO they walked into; the shared
  layer only reconciles identity (`action: "linked"`) and carries the agreed
  minimum. Registration happens anywhere, and converges.

Everything else follows from that one choice:

| Dimension | Centralized (EntrepreneurLink) | Federated (Nexus) |
|---|---|---|
| Who owns the entrepreneur list | Central entity (DECD/CI "or whomever manages EntrepreneurLink") | No one — each ESO keeps its own records + IDs; the shared record is jointly written |
| Identity key | Sequential central `EntrepreneurID`, minted at central signup | Email/`external_ref` reconciliation; every ESO keeps its own IDs |
| Data collected at signup | Full PII required up front (phone, DOB, street address) before any service access | Name + email minimum; each ESO collects what its mission needs |
| What partners see | The full central profile JSON, identical for every connected service | Core fields + tags; each org sees only its *own* external refs; directory visibility gated by entrepreneur consent |
| Entrepreneur consent | Implicit in "Connect" per service (all-or-nothing profile share) | Explicit opt-in email for shared directory; per-org data scoping; data-removal flow |
| Failure mode | Central registry down → **no logins anywhere** (services have no local accounts) | Nexus node down → cross-org sync and Nexus logins pause, but every ESO's own system keeps running; A offline never blocks B |
| Partner integration cost | Implement his SSO client; abandon or dual-run your own registration | Keep your system; push via idempotent API (or register your OIDC server); AI integration prompt provided |
| Referrals / journey / metrics | Out of scope so far | Referral loop w/ ownership + follow-ups + webhooks; participations; consent-aware aggregate reporting path |
| Governance question it forces | Must be answered **first**: who runs and funds the center? (Mike's four scenarios) | Can be answered **later**: compact + standards now, host is replaceable (MIT, self-hostable) |
| Sovereignty | Partners cede the primary relationship to the center | "Each org is autonomous and sovereign" (Mike's phrase) — the network is an agreement, not a platform |

## 3. Where we actually agree (worth saying at the meeting)

- Both prototypes use the **same SSO mechanics** (authorization-code flow,
  client registrations, state/CSRF discipline). The disagreement is not
  technical — it's about *where the account of record lives*.
- Both verify email before sharing anything.
- Both accept that some shared schema is unavoidable — his central profile
  fields vs. our `data-standards/v1.0`. The group's "FirstName vs First Name"
  conversation is needed in either model.
- Both are honest prototypes of the two options the group explicitly asked to
  see. This is the bake-off working as intended.

## 4. The bridge argument (strongest card to play)

The two prototypes are not mutually exclusive — the federated model can
*contain* the centralized one:

- **EntrepreneurLink as one more identity provider.** His central registry is
  an OAuth server; Nexus registers arbitrary OIDC providers via
  `partnerRegisterOidcProvider`. His "Entrepreneur Central" could be a
  sign-in option inside the federated network on day one — entrepreneurs who
  registered there keep working.
- **Nexus as the registry behind his services.** His service clients need an
  identity/profile API; the Nexus partner API + OIDC layer provides the same
  contract without requiring a single owner of the list.

So the group doesn't have to pick a loser: adopt the federated *compact*
(standards, consent, referral vocabulary, identity linking), and anyone who
wants to operate a central registration front-door can run one as a
first-class member of the network.

## 5. Points to raise carefully (not gotchas — design questions for the group)

1. **Full-profile broadcast**: is every service entitled to phone + DOB +
   street address on connect? Mike's April note: access to entrepreneur data
   should be "granted by the entrepreneurs." Both models need a field-level
   answer; today his shares everything, ours shares a minimum.
2. **Mandatory PII at signup**: requiring DOB and street address before an
   entrepreneur can reach *any* service is high friction and a honeypot risk;
   the state-run-registry history Mike cited (entrepreneur reluctance) is
   relevant.
3. **Single point of failure**: central down = the whole network can't log in.
   (Fairness note: a jointly-hosted Nexus node is also a hub — the difference
   is ESO systems remain primary and the host is replaceable/forkable.)
4. **Who runs the center** must be settled before his model can launch;
   the federated compact lets the group start collaborating first.
