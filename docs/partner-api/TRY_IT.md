# Try the Nexus Partner API — 5 minutes, any HTTP tool

> **Just want to click around?** The full UI with sample data is at
> **https://entrepreneurship-nexus-demo.web.app** — no signup, nothing to
> install, and it resets on reload. Switch personas from the bottom-left to
> see it as an entrepreneur (their support network, activity, and sharing
> controls) or as agency staff. The API sandbox below is the other half:
> calling the network from your own system.

A live, throwaway sandbox of the federated entrepreneur network is running
at:

```
https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net
```

It's seeded with a demo "Connecticut Regional Entrepreneur Community"
ecosystem (`eco_connecticut`) and demo organizations. Anything you write is
test data and is purged periodically — **use made-up people only**.

## What you need

| Variable | Demo value |
|---|---|
| Base URL | `https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net` |
| `ecosystem_id` | `eco_connecticut` |
| Your org + key | **Self-service — mint your own in one call** (see below), or ask JR (jrlogan@makehaven.org) |

Mint your own demo org + key (returned once — save it):

```bash
BASE=https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net

curl -s -X POST $BASE/provisionDemoAgency \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Org Name"}'
# → { "organization": { "id": "org_demo_your_org_name_ab12cd", ... },
#     "api_key": "nxk_demo_…", "ecosystem_id": "eco_connecticut" }
```

Use the returned `organization.id` as your `eso_org_id` and the `api_key` as
your `X-Nexus-API-Key` in everything below. (Self-provisioning exists only on
this sandbox; on a real network, keys are issued by each org's admin.)

## Fastest path: curl

Create an entrepreneur (as your org, from "your system"). Paste the whole
block into any terminal, editing only the two `PASTE_` placeholders:

```bash
BASE=https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net

curl -s -X POST $BASE/partnerUpsertPerson \
  -H "Content-Type: application/json" \
  -H "X-Nexus-API-Key: PASTE_YOUR_KEY" \
  -d '{"external_ref":{"source":"my_crm","id":"contact-1"},
      "ecosystem_id":"eco_connecticut",
      "eso_org_id":"PASTE_YOUR_ORG",
      "first_name":"Ada","last_name":"Founder",
      "email":"ada.trial@example.com","tags":["entrepreneur"]}'
# → {"ok":true,"nexus_id":"…","action":"created"}
# Run it again → "action":"updated", same nexus_id (idempotent — no duplicates, ever)
```

Read it back — note you only ever see your own `external_refs`:

```bash
curl -s "$BASE/partnerGetPerson?source=my_crm&id=contact-1" -H "X-Nexus-API-Key: $KEY"
```

**The federated moment** (needs a second person or a second org key): have
someone at another org push the *same email* from *their* system with
*their* key. The response is `"action": "linked"` with the **same
nexus_id** — one shared identity, no central signup, no duplicate, and
neither of you can see the other's internal IDs.

Guards worth trying: omit the key → `401`. Put someone else's org in
`eso_org_id` → `403 "API key organization does not match eso_org_id"`.
Every write in the network is attributable to exactly one org.

## Postman / Insomnia / Bruno / Hoppscotch

Import the ready-made collection (works in all four tools):

- **From URL** (Postman: Import → Link; Hoppscotch: Import → From URL):
  `https://raw.githubusercontent.com/jrlogan/Entrepreneurship-Nexus/main/docs/partner-api/nexus-partner-api.postman_collection.json`
- Or download that file and import it.

Then set the collection variables (`api_key`, `eso_org_id`) and run the
requests top to bottom — each one's description says what to watch for.
[Hoppscotch](https://hoppscotch.io) is the zero-install option: it runs in
the browser, no account needed.

## What the calls are

| Endpoint | What it does |
|---|---|
| `POST /partnerUpsertPerson` | Add/update an entrepreneur from your system (idempotent; links by email across orgs) |
| `GET /partnerGetPerson?source&id` | Read the shared record by your own ID |
| `POST /partnerUpsertOrganization` | Add/update a venture/business |
| `POST /partnerUpsertParticipation` | Record typed, dated involvement (program, membership…) |
| `POST /partnerRegisterWebhook` | Get HMAC-signed real-time events (try a https://webhook.site URL) |

Full reference: `openapi.yaml` (importable) · integration walkthrough:
`PLAYBOOK.md` · AI-assisted scaffolding: `AI_INTEGRATION_PROMPT.md` ·
field standard: `../../data-standards/v1.0/`.

## Ground rules

- Sandbox only: fake people, fake ventures. No real client data.
- Data is purged without notice; nothing here is durable.
- Keys are org-scoped and revocable; don't share yours outside your org.
