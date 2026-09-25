# Integration acceptance test — hand this to your AI agent

Companion to the integration brief (`INTEGRATION_BRIEF.md`, or the pre-filled
copy on the app's Connect Your System page). The brief gets your assistant to
**write** the integration; this one gets it to **prove the integration works**
before you show anyone.

Give your assistant (Claude, ChatGPT, Cursor, Copilot — any of them) the block
below along with one sentence about your stack, plus the sandbox invite code
(ask JR — it is not published, because this repository is public). The block
contains everything else: the sandbox address, how to mint credentials, the
eight checks that constitute "integrated", and what each result means.

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

STEP 0 — get credentials
  You need a short invite code, supplied by the network admin (JR,
  jrlogan@makehaven.org). It is not in the repository: the repo is public, so
  a published code would be scraped and the sandbox flooded. If you were not
  given one, stop and ask — do not try to work around it.

  POST $BASE/provisionDemoAgency
    Content-Type: application/json
    {"name":"<my organization name>", "invite_code":"<the code you were given>"}
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
  - Anyone I add without a `consent` object is emailed the consent notice by
    the network. Use invented addresses (example.com) so nobody real is mailed.
  - Referrals require entrepreneur_agreed: true. Notes on activity are stored
    for my organization only and never shared.

You need TWO sandbox organizations for checks 9-11 (referrals go between
organizations). Provision a second one with a different name using the same
invite code and keep both keys; call them KEY_A (mine) and KEY_B (the partner).

RUN THESE TWELVE CHECKS AND REPORT PASS/FAIL FOR EACH

  1. CREATE
     POST $BASE/partnerUpsertPerson with external_ref {source:<mine>, id:"T1"},
     ecosystem_id, eso_org_id, first_name, last_name, email (an example.com
     address).
     EXPECT: HTTP 201, action = "created", a nexus_id, consent with all three
     flags false, and consent_notice_sent (true if the sandbox can send mail,
     false otherwise — either is a pass).
     THEN: store that nexus_id against my local record.

  2. IDEMPOTENCY
     Send the exact same request again.
     EXPECT: action = "updated" and the SAME nexus_id.
     FAIL MEANS: my sync would create duplicates on every re-run.

  3. UPDATE
     Send it again with a corrected last_name.
     EXPECT: action = "updated", same nexus_id, new name persisted.

  4. READ-BACK AND REF SCOPING
     GET $BASE/partnerGetPerson?source=<mine>&id=T1&ecosystem_id=<eco>
     EXPECT: HTTP 200; external_refs contains ONLY my source; person.consent
     is present.
     FAIL MEANS: I am seeing another organization's internal IDs — report it.

  5. PARTICIPATION ORDERING
     POST $BASE/partnerUpsertParticipation for a person_external_ref that does
     NOT exist.
     EXPECT: HTTP 404. Then push the person and retry: EXPECT 201.
     Valid participation_type: membership | program | application | residency |
     rental | event | service.  Valid status: active | past | applied | waitlisted.
     start_date is required (YYYY-MM-DD). Always send participation_external_ref.
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

  8. CONSENT FROM MY OWN FORM
     GET $BASE/getConsentTerms (no key needed). Note terms_hash.
     POST partnerUpsertPerson for a NEW person T2 with
       consent: {agreed: true, terms_hash: <that hash>, directory_listing: true,
                 share_details: false}
     EXPECT: 201, consent = {terms_accepted: true, directory_listed: true,
     shares_details: false}, consent_notice_sent = false.
     THEN send T3 with consent.terms_hash = "0000…" (64 zeros).
     EXPECT: 409 with reason "terms_outdated". Nothing is created.
     FAIL MEANS: my form is not showing the network's current terms, or I am
     sending consent the entrepreneur did not give.

  9. SEND A REFERRAL (KEY_A)
     POST $BASE/partnerCreateReferral
       {ecosystem_id, person_external_ref: {source:<mine>, id:"T1"},
        receiving_org_id: <org B id>, notes: "<an introduction>",
        entrepreneur_agreed: true,
        referral_external_ref: {source:<mine>, id:"R1"}}
     EXPECT: 201, status "pending", a referral_id. Send it again: EXPECT the
     same referral_id with action "existing".
     Also send one WITHOUT entrepreneur_agreed. EXPECT: 400.

 10. RECEIVE IT (KEY_B)
     GET $BASE/partnerListReferrals?ecosystem_id=<eco>&direction=incoming&status=pending
     EXPECT: 200; the referral from check 9 is listed with the entrepreneur's
     name, email, my intro notes, and your_external_ref = null (B has never
     pushed this person, so B knows no ID for them).

 11. ANSWER IT (KEY_B), AND ONLY B CAN
     POST $BASE/partnerUpdateReferral {referral_id, status:"completed"} with
     KEY_B. EXPECT: 409 invalid_transition (pending cannot jump to completed).
     Then {referral_id, status:"accepted", response_notes:"…"}. EXPECT: 200.
     Then the same with KEY_A. EXPECT: 404 (A is not the receiver).
     Then {referral_id, status:"completed", outcome:"service_delivered"} with
     KEY_B. EXPECT: 200.

 12. LOG ACTIVITY (KEY_A)
     POST $BASE/partnerLogActivity
       {ecosystem_id, person_external_ref: {source:<mine>, id:"T1"},
        activity_external_ref: {source:<mine>, id:"M1"}, type:"meeting",
        date:"YYYY-MM-DD", share_fact: true, notes:"<anything>"}
     EXPECT: 201 with activity_id. Send it again: EXPECT 200, same activity_id.

  OPTIONAL — WEBHOOK
     Get a URL from https://webhook.site, then
     POST $BASE/partnerRegisterWebhook {"url":"<https url>",
       "events":["referral.received","referral.updated"]}
     EXPECT: 201 with a signing_secret (shown once — store it).
     Verify deliveries with HMAC-SHA256 over the RAW request body, compared to
     the X-Nexus-Signature header as "sha256=<hex>". Use a constant-time
     comparison. Reject anything that fails verification. Repeat check 9 and
     watch referral.received arrive at B's URL; the payload carries no notes.

THEN WRITE, FOR MY STACK
  - A push function called on contact create/update, sending only fields I
    actually hold. Do not fabricate values to fill the schema.
  - The consent block (or the getConsentTerms text) in my signup form, with
    `consent` sent only when the agreement box was ticked.
  - A push on membership/enrolment status change, mapping my program names to
    the vocabulary in check 5 and setting status past + end_date when it ends.
  - Sending referrals when an entrepreneur asks for one, and a way for staff
    to see and answer incoming referrals (polling check 10, or a webhook).
  - Persistent storage of the returned nexus_id next to my record.
  - Retries with backoff on 5xx and 429; do NOT retry 400/401/403/409 — those
    are my bugs or my state.
  - Secrets from the environment, never committed.

RULES
  - Do not build a bulk import of my whole database. Records enter the network
    from real activity, one person at a time, so consent can travel with them.
  - Do not send fields the API does not define; unknown fields are ignored.
  - Report anything that behaves differently from the expectations above
    rather than working around it.

FINALLY
  Print a table of the twelve checks with PASS/FAIL and the HTTP status seen,
  then list exactly what remains for a human to do.
````

---

## What "integrated" means

An organization is integrated when checks 1–12 pass from its own system, using
its own record IDs, without a human retyping anything. The optional webhook is
what turns an incoming referral into a real-time event instead of a poll.

## If a check fails

| Check | Failure usually means |
|---|---|
| 2 (idempotency) | You are generating a new `external_ref.id` per sync instead of using your stable primary key. |
| 4 (ref scoping) | If you can see another org's refs, that is a platform issue — report it. |
| 5 (ordering) | Your sync pushes participations before people; reorder. |
| 6 (validation) | You are sending your own program vocabulary instead of mapping it. |
| 7 (authorisation) | Your `eso_org_id` doesn't match the key. Check which key you loaded. |
| 8 (consent) | Your form is not fetching the current terms, or is sending consent without the box ticked. |
| 9–11 (referrals) | You are sending referrals nobody asked for, or answering with the wrong key. |

## For the humans afterwards

Two things an AI agent cannot decide for you: which of your fields map onto
the shared core (a 30-minute conversation, not a technical problem), and where
in your own signup flow the consent block goes so entrepreneurs actually see
it. Both are covered in the integration brief.
