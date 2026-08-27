# Live Demo Script — Federated Model, Code Only

Companion to `docs/federated-demo-plan.md` and the "Federated Compact" deck.
Every command below was run and verified against the emulator on 2026-08-27.

Two tools, both in `scripts/`:

- `demo-federated-walkthrough.mjs --step` — the rehearsed Act 1. Runs the
  agreed prototype spec end-to-end, pausing between steps.
- `nexus-call.mjs` — the improv tool for Act 2. Fire **any** partner API call
  as **any** agency, live, and show the raw request/response. This is what
  makes the demo flexible for a technical audience: nothing is canned, and
  the room can dictate what happens next.

## Setup

Local rehearsal:

```bash
./scripts/start-local-dev.sh                 # terminal 1: emulators
node scripts/seed-local-reference-data.mjs   # terminal 2: seed
```

Against the hosted sandbox (deployed to staging 2026-08-27, seeded with the
CT demo ecosystem):

```bash
export FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net
```

The seeded demo keys (`--as ef|ipf|new`) work against it. ⚠️ Those keys are
deterministic and visible in this repo — fine for a purgeable sandbox among
the consortium, but mint proper keys via `generatePartnerApiKey` before
sharing beyond the group. Re-seed / effectively purge by re-running the seed
endpoint (`ALLOW_LOCAL_ONLY_FUNCTIONS=true` is set on staging for this;
never on production).

**Postman / Insomnia users**: import
`docs/partner-api/nexus-partner-api.postman_collection.json` — it ships with
the sandbox base URL, one variable set per org, six ready-made requests
(create → link → read → participation → webhook) plus the 401/403 guard
demos, each annotated with what to watch for. The two-person trick for
meetings: two attendees set different org keys and push the same email — the
second sees `action: "linked"`.

Seeded demo agencies (local aliases for `--as`):

| Alias | Organization | Org ID |
|---|---|---|
| `ef` | Entrepreneurship Foundation | `org_ef` |
| `ipf` | IP Factory | `org_ipfactory` |
| `new` | New Agency (live demo slot) | `org_new_agency` |
| `none` | no API key — for showing the 401 | — |

`nexus-call` auto-fills `ecosystem_id` and `eso_org_id` from the chosen
agency so live typing stays short; passing them explicitly overrides (used
below to demonstrate the 403 guard).

## Act 1 — the rehearsed spec (4 min)

```bash
node scripts/demo-federated-walkthrough.mjs --step
```

Narrate the `action` field: `created` at provider A → `linked` at provider B →
B reads with A offline → webhook subscription. (Deck slides 2–6 frame this.)

## Act 2 — improv, driven by the room (5–10 min, pick freely)

### A new entrepreneur, from real activity — with consent

Ask the room for a name. The story: EF staff just saved this person after a
mentoring intake — **that activity** is what creates the shared record, and
the consent email goes out at the same moment. No bulk import, ever.

```bash
node scripts/nexus-call.mjs --as ef partnerUpsertPerson \
  '{"external_ref":{"source":"ef_tracker","id":"live-demo-1"},"first_name":"Grace","last_name":"Hopper","email":"grace.demo@example.com","tags":["entrepreneur"],"send_consent_email":true}'
# → HTTP 201  { "action": "created" }
```

Point at `send_consent_email: true`: the entrepreneur gets the shared
agreement right then; until they click it, `network_directory_consent`
stays false and they are invisible in the cross-org directory.

### The same person walks into IP Factory

```bash
node scripts/nexus-call.mjs --as ipf partnerUpsertPerson \
  '{"external_ref":{"source":"ipfactory_matching","id":"m-77"},"first_name":"Grace","last_name":"Hopper","email":"grace.demo@example.com","tags":["patent"]}'
# → HTTP 200  { "action": "linked", "nexus_id": <same id> }
```

### IP Factory reads it back — and sees only its own IDs

```bash
node scripts/nexus-call.mjs --as ipf --get partnerGetPerson 'source=ipfactory_matching&id=m-77'
# → external_refs contains ONLY ipfactory_matching — EF's contact ID is never disclosed.
# Tags merged from both orgs: ["entrepreneur", "patent"].
```

### A brand-new agency joins, live

Offer the room: "someone volunteer your org." The third key plays them.

```bash
node scripts/nexus-call.mjs --as new partnerUpsertPerson \
  '{"external_ref":{"source":"new_agency_crm","id":"n-1"},"first_name":"Grace","last_name":"Hopper","email":"grace.demo@example.com"}'
# → { "action": "linked" } — third org, same shared record, its own IDs.

node scripts/nexus-call.mjs --as new partnerUpsertParticipation \
  '{"person_external_ref":{"source":"new_agency_crm","id":"n-1"},"participation_external_ref":{"source":"new_agency_crm","id":"n-1_membership"},"participation_type":"membership","name":"Founding Member","status":"active","start_date":"2026-08-27"}'
# → HTTP 201 — dated journey context other orgs can build on.
```

(On the hosted sandbox this moment is even better live: provision the
volunteer's org on the spot —
`curl -s -X POST $BASE/provisionDemoAgency -H "Content-Type: application/json" -d '{"name":"Their Org"}'`
returns a fresh org id + key in one call, and their first push can run
seconds later. Attendees can also self-provision from their own laptops; see
`docs/partner-api/TRY_IT.md`. On a real network, keys are issued by each
org's admin via `generatePartnerApiKey` instead.)

### Security guards — worth showing to a technical group

```bash
# No key → 401
node scripts/nexus-call.mjs --as none partnerUpsertPerson \
  '{"external_ref":{"source":"x","id":"1"},"first_name":"A","last_name":"B","email":"a@b.com","eso_org_id":"org_ef"}'
# → HTTP 401 { "error": "X-Nexus-API-Key header required for partner API" }

# EF's key trying to write as IP Factory → 403
node scripts/nexus-call.mjs --as ef partnerUpsertPerson \
  '{"external_ref":{"source":"ef_tracker","id":"live-demo-1"},"first_name":"Grace","last_name":"Hopper","email":"grace.demo@example.com","eso_org_id":"org_ipfactory"}'
# → HTTP 403 { "error": "API key organization does not match eso_org_id" }
```

The message: every write is attributable, keys are org-scoped, and one org
can never impersonate another.

### Real-time events

```bash
node scripts/nexus-call.mjs --as ipf partnerRegisterWebhook \
  '{"url":"https://example.com/nexus-demo-webhook","events":["referral.received","referral.updated","person.linked"],"description":"Live demo webhook"}'
# → HTTP 201 { "webhook_id": ..., "signing_secret": "whsec_..." }
```

For a stronger moment, register a https://webhook.site URL beforehand and
show the signed delivery arrive on screen when a referral is created.

## For attendees who want to type along

Any HTTP client works — that's the point. curl equivalent of the first call:

```bash
curl -s -X POST "$FIREBASE_FUNCTIONS_BASE_URL/partnerUpsertPerson" \
  -H "Content-Type: application/json" \
  -H "X-Nexus-API-Key: <your sandbox key>" \
  -d '{"external_ref":{"source":"your_system","id":"1"},"ecosystem_id":"eco_connecticut","eso_org_id":"<your org id>","first_name":"Test","last_name":"Person","email":"test@example.com"}'
```

Hand out sandbox keys privately; never put a hosted key on a slide.

## Reset between rehearsals

Local: re-running the seed is idempotent; person records accumulate but the
scripts use fresh IDs per run, so replays stay clean. Hosted sandbox: purge
periodically (mirroring Chris's sandbox policy) by clearing the demo
project's Firestore data and re-seeding.
