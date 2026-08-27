# Integration acceptance test — hand this to your AI agent

Companion to `AI_INTEGRATION_PROMPT.md`. That file gets your assistant to
**write** the integration; this one gets it to **prove the integration works**
before you show anyone.

Give your assistant (Claude, ChatGPT, Cursor, Copilot — any of them) the block
below along with one sentence about your stack. It contains everything needed:
the sandbox address, how to get credentials without asking a human, the eight
checks that constitute "integrated", and what each result means.

Nothing here touches production or real people. The sandbox holds test data
only and is purged periodically.

---

## Prompt block — copy everything inside the fence

````
You are verifying my organization's integration with the Entrepreneurship
Nexus Partner API, a shared record layer used by entrepreneur-support
organizations. Work against the SANDBOX only, and use invented people.

SANDBOX
  BASE = https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net
  ecosystem_id = eco_connecticut

STEP 0 — get credentials (no human needed)
  POST $BASE/provisionDemoAgency
    Content-Type: application/json
    {"name":"<my organization name>"}
  The response gives organization.id (use as eso_org_id) and api_key
  (send as the X-Nexus-API-Key header). The key is shown once — save it to
  an environment variable, never to a file in the repo.

CORE CONCEPTS YOU MUST HONOUR
  - external_ref = {source, id}: MY system's own record identifier.
    `source` is a stable name for my system (e.g. "acme_salesforce").
    `id` is my primary key. Never invent or renumber these; they are how the
    network maps my records without me adopting anyone else's IDs.
  - Every upsert is idempotent on external_ref. Re-sending must be safe.
  - Identity is resolved by external_ref first, then exact email. Never by
    name spelling.
  - I only ever see MY OWN external_refs on a shared record. If a response
    shows only my refs, that is correct behaviour, not missing data.

RUN THESE EIGHT CHECKS AND REPORT PASS/FAIL FOR EACH

  1. CREATE
     POST $BASE/partnerUpsertPerson with external_ref {source:<mine>, id:"T1"},
     ecosystem_id, eso_org_id, first_name, last_name, email.
     EXPECT: HTTP 201, action = "created", a nexus_id returned.
     THEN: store that nexus_id against my local record.

  2. IDEMPOTENCY
     Send the exact same request again.
     EXPECT: action = "updated" and the SAME nexus_id.
     FAIL MEANS: my sync would create duplicates on every re-run.

  3. UPDATE
     Send it again with a corrected last_name.
     EXPECT: action = "updated", same nexus_id, new name persisted.

  4. READ-BACK AND REF SCOPING
     GET $BASE/partnerGetPerson?source=<mine>&id=T1
     EXPECT: HTTP 200; external_refs contains ONLY my source.
     FAIL MEANS: I am seeing another organization's internal IDs — report it.

  5. PARTICIPATION ORDERING
     POST $BASE/partnerUpsertParticipation for a person_external_ref that does
     NOT exist.
     EXPECT: HTTP 404. Then push the person and retry: EXPECT 201.
     Valid participation_type: membership | program | application | residency |
     rental | event | service.  Valid status: active | past | applied | waitlisted.
     start_date is required (YYYY-MM-DD).
     FAIL MEANS: my sync ordering is wrong — people must be pushed first.

  6. VALIDATION
     Send a participation with participation_type "mentorship".
     EXPECT: HTTP 400 naming participation_type.
     This confirms I am mapping my program names onto the shared vocabulary
     rather than inventing values.

  7. AUTHORISATION
     (a) Send any push with no X-Nexus-API-Key. EXPECT: 401.
     (b) Send a push with eso_org_id set to some other org id. EXPECT: 403.
     FAIL MEANS: stop and report — a key must only ever write as its own org.

  8. WEBHOOK (optional but recommended)
     Get a URL from https://webhook.site, then
     POST $BASE/partnerRegisterWebhook {"url":"<https url>",
       "events":["referral.received","referral.updated"]}
     EXPECT: 201 with a signing_secret (shown once — store it).
     Verify deliveries with HMAC-SHA256 over the RAW request body, compared to
     the X-Nexus-Signature header as "sha256=<hex>". Use a constant-time
     comparison. Reject anything that fails verification.

THEN WRITE, FOR MY STACK
  - A push function called on contact create/update, sending only fields I
    actually hold. Do not fabricate values to fill the schema.
  - A push on membership/enrolment status change, mapping my program names to
    the vocabulary in check 5 and setting status past + end_date when it ends.
  - Persistent storage of the returned nexus_id next to my record.
  - Retries with backoff on 5xx; do NOT retry 400/401/403 — those are my bugs.
  - Secrets from the environment, never committed.

RULES
  - Do not build a bulk import of my whole database. Records enter the network
    from real activity, one person at a time, so consent can travel with them.
  - Do not send fields the API does not define; unknown fields are ignored.
  - Report anything that behaves differently from the expectations above
    rather than working around it.

FINALLY
  Print a table of the eight checks with PASS/FAIL and the HTTP status seen,
  then list exactly what remains for a human to do.
````

---

## What "integrated" means

An organization is integrated when checks 1–7 pass from its own system, using
its own record IDs, without a human retyping anything. Check 8 is what turns a
referral from an email into a tracked, closing loop.

## If a check fails

| Check | Failure usually means |
|---|---|
| 2 (idempotency) | You are generating a new `external_ref.id` per sync instead of using your stable primary key. |
| 4 (ref scoping) | If you can see another org's refs, that is a platform issue — report it. |
| 5 (ordering) | Your sync pushes participations before people; reorder. |
| 6 (validation) | You are sending your own program vocabulary instead of mapping it. |
| 7 (authorisation) | Your `eso_org_id` doesn't match the key. Check which key you loaded. |

## For the humans afterwards

Two things an AI agent cannot decide for you: which of your fields map onto
the shared core (a 30-minute conversation, not a technical problem), and
whether an entrepreneur has consented to appear in the shared directory. Both
are covered in `PLAYBOOK.md`.
