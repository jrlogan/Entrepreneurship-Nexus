# AI Integration Prompt — Nexus Partner API

This file contains a self-contained prompt block that any ESO developer can
paste into Claude, ChatGPT, Cursor, or any AI assistant to generate working
integration code for their specific stack.

---

## How to use

1. Copy the prompt block below (everything inside the triple backtick fence).
2. Paste it into your AI assistant.
3. Add one sentence describing your system, e.g.:
   - "My system is a Django app using PostgreSQL. Contacts are in a `Contact`
     model. Membership status is in a `Membership` model with a `status` field."
   - "My system is Salesforce. Entrepreneurs are Contacts. Programs are
     Opportunities."
   - "My system is a Node/Express API. I use Prisma with a `User` table."
4. Ask for what you need, e.g.:
   - "Write a sync function that pushes all active entrepreneurs on a nightly cron."
   - "Write a webhook handler that updates our database when we receive a referral."
   - "Write the backfill script to push our existing 800 contacts."

---

## Prompt block

````
You are helping me integrate my organization's data system with the
Entrepreneurship Nexus Partner API. Below is the complete API contract.
Use it to generate correct integration code for my stack.

─────────────────────────────────────────────────────────────────────────────
NEXUS PARTNER API — COMPLETE CONTRACT
─────────────────────────────────────────────────────────────────────────────

BASE URL:
  https://us-central1-entrepreneurship-nexus.cloudfunctions.net

AUTH:
  All endpoints require the header:
    X-Nexus-API-Key: <our_api_key>
  This is machine-to-machine only. Never send user JWTs to these endpoints.

CREDENTIALS (fill in before generating code):
  API_KEY     = <our_api_key>       # from Nexus admin
  ECOSYSTEM_ID = <our_ecosystem_id> # e.g. "greater-new-haven"
  ESO_ORG_ID   = <our_eso_org_id>   # e.g. "org_yourorg"
  SOURCE       = <our_source_name>  # e.g. "yourorg_crm" — stable, never change

─────────────────────────────────────────────────────────────────────────────
KEY CONCEPTS
─────────────────────────────────────────────────────────────────────────────

EXTERNAL REF — identity anchor:
  Every entity you push includes an external_ref:
    { "source": SOURCE, "id": "<record_id_in_our_system>" }
  The Nexus indexes this for O(1) lookups. The ID must be stable — never reuse.

IDEMPOTENCY:
  All upsert calls are safe to replay. The same external_ref always updates
  the existing record, never creates a duplicate. You can push on every save.

RESPONSE — action field:
  "created" = new record made
  "updated" = existing record found by external_ref and updated
  "linked"  = existing person/org found by email/name; external_ref added

CALL ORDER:
  1. partnerUpsertPerson       — push the person first
  2. partnerUpsertOrganization — push their business (optional)
  3. partnerUpsertParticipation — push their membership/program status
     (REQUIRES the person to exist first — will 404 otherwise)

─────────────────────────────────────────────────────────────────────────────
ENDPOINT 1: POST /partnerUpsertPerson
─────────────────────────────────────────────────────────────────────────────

PURPOSE: Create or update a person (entrepreneur) in the Nexus.

REQUEST BODY (all required unless marked optional):
  external_ref        { source: string, id: string }  — your CRM record ID
  ecosystem_id        string                           — ECOSYSTEM_ID constant
  eso_org_id          string                           — ESO_ORG_ID constant
  first_name          string
  last_name           string
  email               string
  tags                string[]  optional               — merged, never replaced
  send_consent_email  boolean   optional, default false
                                Set true on staff-initiated referrals to trigger
                                the network directory opt-in email. The person
                                becomes visible to ESO staff immediately regardless.

RESPONSE 201 (created) or 200 (updated/linked):
  { ok: true, nexus_id: string, action: "created"|"updated"|"linked" }
  Store nexus_id alongside your record for direct lookups.

ERRORS:
  400  external_ref.source and external_ref.id are required
  400  ecosystem_id, first_name, last_name, and email are required
  401  X-Nexus-API-Key header required / Invalid or revoked API key
  403  API key organization does not match eso_org_id

─────────────────────────────────────────────────────────────────────────────
ENDPOINT 2: GET /partnerGetPerson?source=SOURCE&id=RECORD_ID
─────────────────────────────────────────────────────────────────────────────

PURPOSE: Retrieve a Nexus person record by your external ID.

QUERY PARAMS:
  source  string  — SOURCE constant
  id      string  — your CRM record ID

RESPONSE 200:
  {
    ok: true,
    person: {
      nexus_id, first_name, last_name, email, status,
      tags: string[], external_refs: [{ source, id }],
      created_at, updated_at
    }
  }

ERRORS:
  400  source and id query parameters are required
  404  No person found for the given external reference

─────────────────────────────────────────────────────────────────────────────
ENDPOINT 3: POST /partnerUpsertOrganization
─────────────────────────────────────────────────────────────────────────────

PURPOSE: Create or update an entrepreneur's business entity (optional).

REQUEST BODY:
  external_ref  { source, id }   required
  ecosystem_id  string           required
  eso_org_id    string           required
  name          string           required
  description   string           optional
  email         string           optional
  url           string           optional
  tax_status    string           optional  "non_profit"|"for_profit"|"government"|"other"
  tags          string[]         optional

RESPONSE: same shape as UpsertPerson response.

─────────────────────────────────────────────────────────────────────────────
ENDPOINT 4: POST /partnerUpsertParticipation
─────────────────────────────────────────────────────────────────────────────

PURPOSE: Track a person's structured involvement (membership, program, etc.).
         PERSON MUST ALREADY EXIST — call partnerUpsertPerson first.

REQUEST BODY:
  person_external_ref         { source, id }  required — must resolve to existing person
  participation_external_ref  { source, id }  STRONGLY RECOMMENDED
                              Idempotency key. Convention: id = "{contactId}_{type}"
                              e.g. { source: "yourorg_crm", id: "42_membership" }
  ecosystem_id        string  required
  eso_org_id          string  required
  participation_type  string  required
                      "membership"|"program"|"application"|"residency"|
                      "rental"|"event"|"service"
  name                string  required  human label, e.g. "Full Membership"
  status              string  required
                      "active"|"past"|"applied"|"waitlisted"
  start_date          string  required  ISO date "YYYY-MM-DD"
  end_date            string  optional  ISO date — set when participation ends
  description         string  optional

STATUS TRANSITIONS:
  When membership/program ends: set status="past" + end_date. Do NOT delete.
  This preserves history and is how other ESOs see someone's trajectory.

RESPONSE 201 (created) or 200 (updated):
  { ok: true, participation_id: string, action: "created"|"updated" }

ERRORS:
  400  person_external_ref required
  400  ecosystem_id, participation_type, name, start_date required
  400  Invalid participation_type / Invalid status
  404  No person found for the given person_external_ref  ← push person first

─────────────────────────────────────────────────────────────────────────────
ENDPOINT 5: POST /partnerRegisterWebhook
─────────────────────────────────────────────────────────────────────────────

PURPOSE: Register an HTTPS endpoint to receive real-time Nexus events.

REQUEST BODY:
  url          string    HTTPS endpoint URL
  events       string[]  event types (or ["*"] for all)
                Valid: "interaction.logged", "referral.received",
                       "referral.updated", "organization.created",
                       "organization.updated"
  description  string    optional

RESPONSE 201:
  { ok: true, webhook_id: string, signing_secret: string }
  signing_secret is returned ONCE — store immediately. Cannot be retrieved again.

VERIFYING DELIVERIES:
  Every delivery has header: X-Nexus-Signature: sha256=<hex>
  Compute: sha256 = HMAC-SHA256(signing_secret, raw_request_body)
  Then:    assert "sha256=" + sha256 == X-Nexus-Signature
  Use timing-safe comparison to prevent timing attacks.

DELIVERY PAYLOAD:
  {
    id: string,        // unique delivery ID
    event: string,     // e.g. "referral.received"
    timestamp: string, // ISO datetime
    data: { ... }      // event-specific fields (see below)
  }

EVENT DATA SHAPES:
  interaction.logged:
    { interaction_id, ecosystem_id, organization_id, person_id,
      date, type, recorded_by, source }
    (notes are intentionally omitted — fetch full record if needed)

  referral.received / referral.updated:
    { referral_id, ecosystem_id, status, referring_org_id,
      receiving_org_id, subject_person_id, date, intake_type }

─────────────────────────────────────────────────────────────────────────────
ERROR HANDLING RULES (apply to all endpoints)
─────────────────────────────────────────────────────────────────────────────

- On 5xx or network error: retry with exponential backoff (start at 1s, cap at 60s)
- On 401: stop and alert — key may be revoked; do not retry automatically
- On 403: check eso_org_id matches your API key's organization
- On 404 for participation: push the person first, then retry the participation
- On 400: log and skip — do not retry without fixing the payload
- All responses are JSON with { ok: true, ... } on success or { error: string } on failure

─────────────────────────────────────────────────────────────────────────────
IMPLEMENTATION NOTES
─────────────────────────────────────────────────────────────────────────────

- Store the returned nexus_id on your local record (optional but useful).
- Your SOURCE string must be stable. Pick it once: "{orgslug}_{systemname}".
- For backfills: loop in batches of 50-100 with a short sleep between batches.
- The participation external ref convention "{contactId}_{type}" is required
  for reliable upserts — without it, every call creates a new participation.
- For membership sync: trigger on the event that changes membership status in
  your system (role add/remove, subscription status change, form submission, etc.).
- send_consent_email should only be true on explicit staff referrals, not on
  every contact sync — entrepreneurs will find mass consent emails spammy.

─────────────────────────────────────────────────────────────────────────────
MY SYSTEM
─────────────────────────────────────────────────────────────────────────────

[DESCRIBE YOUR SYSTEM HERE — replace this section before using the prompt]

Examples:
- "Django app, PostgreSQL. Entrepreneurs are in a Contact model with fields:
  id, first_name, last_name, email, is_entrepreneur (bool).
  Memberships are in a Membership model: contact_id, status ('active'/'lapsed'),
  start_date, end_date. Status changes via Stripe webhooks."

- "Salesforce org. Entrepreneurs are Contacts. Programs are Opportunities
  with a custom field Member_Status__c. Status changes via workflow rules."

- "Airtable base with an Entrepreneurs table (Name, Email, Status, Start Date)
  and a Programs table. I run Python scripts via GitHub Actions."

─────────────────────────────────────────────────────────────────────────────
WHAT I NEED
─────────────────────────────────────────────────────────────────────────────

[DESCRIBE WHAT YOU WANT THE AI TO GENERATE — replace this section]

Examples:
- "Write a Python function that pushes a contact to Nexus. It should be called
  from a Django post_save signal on Contact."

- "Write a Node.js webhook handler (Express) that receives Nexus events,
  verifies the signature, and logs referral.received events to our database."

- "Write a backfill script in Python that reads all entrepreneurs from our
  PostgreSQL database and pushes them to Nexus in batches of 50."

- "Write the full sync: on Stripe subscription.created or subscription.updated,
  push the person and their membership participation to Nexus."
````

---

## Tips for better results

**Be specific about your stack.** The more detail you give about your data model,
the more accurate the generated code. Name the table/model fields, not just the
concept.

**Ask for error handling explicitly** if you need production-grade code:
> "Include retry logic with exponential backoff for 5xx errors."

**Ask for tests** if you want them:
> "Also generate pytest tests for the sync function using pytest-httpx to mock
> the API calls."

**Iterate on one piece at a time.** Get the person push working first, then
participations, then webhooks. Don't try to generate everything in one shot.

**For Salesforce / HubSpot / Airtable** — tell the AI which SDK or API client
you're using (e.g. "use the `simple_salesforce` Python library",
"use the HubSpot Python SDK v3", "use the `pyairtable` library").

---

## Example output (Python / Django)

What the AI should produce when you describe a Django system and ask for a
post-save signal:

```python
# nexus_sync.py
import os
import time
import requests
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Contact, Membership

NEXUS_BASE    = "https://us-central1-entrepreneurship-nexus.cloudfunctions.net"
NEXUS_API_KEY = os.environ["NEXUS_API_KEY"]
ECOSYSTEM_ID  = os.environ["NEXUS_ECOSYSTEM_ID"]
ESO_ORG_ID    = os.environ["NEXUS_ESO_ORG_ID"]
SOURCE        = "yourorg_django"


def nexus_post(path: str, payload: dict, retries: int = 3) -> dict:
    headers = {
        "X-Nexus-API-Key": NEXUS_API_KEY,
        "Content-Type": "application/json",
    }
    delay = 1
    for attempt in range(retries):
        try:
            r = requests.post(f"{NEXUS_BASE}{path}", json=payload, headers=headers, timeout=15)
            if r.status_code in (200, 201):
                return r.json()
            if r.status_code == 400:
                # Bad payload — don't retry
                raise ValueError(f"Nexus 400: {r.text}")
            if r.status_code == 401:
                raise PermissionError(f"Nexus API key invalid or revoked")
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
        time.sleep(delay)
        delay = min(delay * 2, 60)
    raise RuntimeError("Nexus push failed after retries")


def push_person(contact: Contact, send_consent_email: bool = False) -> str:
    response = nexus_post("/partnerUpsertPerson", {
        "external_ref": {"source": SOURCE, "id": str(contact.id)},
        "ecosystem_id": ECOSYSTEM_ID,
        "eso_org_id": ESO_ORG_ID,
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "email": contact.email,
        "send_consent_email": send_consent_email,
    })
    return response["nexus_id"]


def push_membership(contact: Contact, membership: Membership) -> str:
    payload = {
        "person_external_ref": {"source": SOURCE, "id": str(contact.id)},
        "participation_external_ref": {"source": SOURCE, "id": f"{contact.id}_membership"},
        "ecosystem_id": ECOSYSTEM_ID,
        "eso_org_id": ESO_ORG_ID,
        "participation_type": "membership",
        "name": "Full Membership",
        "status": "active" if membership.status == "active" else "past",
        "start_date": membership.start_date.isoformat(),
    }
    if membership.end_date:
        payload["end_date"] = membership.end_date.isoformat()
    response = nexus_post("/partnerUpsertParticipation", payload)
    return response["participation_id"]


@receiver(post_save, sender=Contact)
def sync_contact_to_nexus(sender, instance, created, **kwargs):
    if not instance.is_entrepreneur:
        return
    push_person(instance, send_consent_email=created)


@receiver(post_save, sender=Membership)
def sync_membership_to_nexus(sender, instance, **kwargs):
    push_person(instance.contact)  # ensure person exists first
    push_membership(instance.contact, instance)
```

This is illustrative — your AI assistant will generate code tailored to your
actual data model when you fill in the prompt sections.
