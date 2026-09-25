/**
 * The integration brief — everything a partner's developer, or their AI
 * coding assistant, needs to connect the partner's system to the network,
 * with the partner's own identifiers filled in.
 *
 * One source for two places: the in-app integration guide shows it (and
 * offers it to copy or download), and docs/partner-api/INTEGRATION_BRIEF.md
 * is generated from it with placeholders (`npm run docs:integration-brief`;
 * a unit test fails if the committed copy is stale).
 *
 * Pure: no React, no Firebase.
 */

export interface IntegrationBriefInput {
  orgId: string;
  orgName: string;
  ecosystemId: string;
  ecosystemName: string;
  /** e.g. https://us-central1-PROJECT.cloudfunctions.net */
  functionsBaseUrl: string;
  /** e.g. https://entrepreneurship-nexus.web.app */
  appBaseUrl: string;
}

/** The shared sandbox every partner develops against before touching production. */
export const SANDBOX = {
  functionsBaseUrl: 'https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net',
  appBaseUrl: 'https://entrepreneurship-nexus-staging.web.app',
  ecosystemId: 'eco_connecticut',
};

export const PLACEHOLDER_INPUT: IntegrationBriefInput = {
  orgId: '<YOUR_ORG_ID>',
  orgName: '<Your Organization>',
  ecosystemId: '<ECOSYSTEM_ID>',
  ecosystemName: '<Network name>',
  functionsBaseUrl: '<FUNCTIONS_BASE_URL>',
  appBaseUrl: '<NEXUS_APP_URL>',
};

export const buildEmbedSnippet = (input: IntegrationBriefInput) =>
  `<div data-nexus-consent
     data-terms-url="${input.functionsBaseUrl}/getConsentTerms"
     data-organization="${input.orgName}"></div>
<script src="${input.appBaseUrl}/embed/nexus-consent.js" defer></script>`;

export const buildIntegrationBrief = (input: IntegrationBriefInput): string => {
  const B = input.functionsBaseUrl;
  return `# Connecting ${input.orgName} to ${input.ecosystemName}

You are integrating ${input.orgName}'s own system (its CRM, member database, program
signup, or website) with a shared entrepreneurship network. Read this whole brief
before writing code. It is the complete contract; follow it exactly.

## What the network is

Independent support organizations keep their own systems and records. When they
work with the same entrepreneur, the network lets them coordinate: make and answer
referrals, see that a partner is also helping someone, and report together — without
anyone handing over a database. ${input.orgName} has signed the network's agreements;
this integration is how it keeps them.

## Rules this integration must follow

These come from the agreements ${input.orgName} signed. Code that breaks them is a
breach of those agreements, not a style issue.

1. **Push only people ${input.orgName} actually works with**, at the moment it starts
   working with them. No bulk imports of whole contact lists, and no backfills of
   people who have not interacted with ${input.orgName}.
2. **Ask the entrepreneur.** When someone signs up for a program, show them the
   network's consent terms (step 3) in the network's exact words, and only send
   \`consent\` if they ticked the agreement. Never pre-tick, never default to yes.
   If you cannot show the terms, the network emails them itself (step 1).
3. **Notes stay private.** Notes you send on activity are stored for
   ${input.orgName} only. Still, do not send sensitive case notes, financials, health,
   immigration or similar information — the network does not need them.
4. **Only refer people who asked or agreed.** \`partnerCreateReferral\` requires
   \`entrepreneur_agreed: true\`; set it only when that is true.
5. **Keep the API key secret.** Store it in a secret manager or environment variable,
   server-side only. Never put it in a browser, a mobile app, a repository, or a log.
6. **Answer referrals.** Referrals to ${input.orgName} must be accepted or declined,
   and completed with an outcome when the work is done.

## Develop against the sandbox first

Do not run your first test against production. The network runs a sandbox: a
separate project with the same API, invented people only, purged periodically.

| | Sandbox | Production |
|---|---|---|
| API base URL | \`${SANDBOX.functionsBaseUrl}\` | \`${B}\` |
| App / consent block host | \`${SANDBOX.appBaseUrl}\` | \`${input.appBaseUrl}\` |
| \`ecosystem_id\` | \`${SANDBOX.ecosystemId}\` | \`${input.ecosystemId}\` |
| \`eso_org_id\` and API key | mint your own: \`POST ${SANDBOX.functionsBaseUrl}/provisionDemoAgency\` with \`{"name": "${input.orgName}", "invite_code": "<from the network administrator>"}\` — returns \`organization.id\` and a key shown once | the values below |

Build with the base URL, ecosystem id, org id and key all read from configuration,
so moving to production is a configuration change and nothing else. Prove the
integration on the sandbox with the twelve checks in
\`docs/partner-api/AI_AGENT_ACCEPTANCE_TEST.md\` (in the repository linked at the
end), then switch the four values to production. Use \`example.com\` addresses in
the sandbox: anyone added without consent attached is emailed the notice, and the
sandbox may deliver it. Never send real people to the sandbox.

## Your identifiers

| | |
|---|---|
| API base URL | \`${B}\` |
| Organization ID (\`eso_org_id\`) | \`${input.orgId}\` |
| Network ID (\`ecosystem_id\`) | \`${input.ecosystemId}\` |
| API key | from the network's API Keys page (an admin of ${input.orgName} creates it). Read it from an environment variable, e.g. \`NEXUS_API_KEY\`. |
| Source name | choose one stable string for your system, e.g. \`${input.orgId.replace(/^org_/, '')}_crm\`. Never change it. |

Every request is HTTPS JSON with the header \`X-Nexus-API-Key: <key>\`.
Responses are \`{ "ok": true, ... }\` or \`{ "error": "...", "reason"?: "..." }\`.

**Your record IDs are the identity anchor.** Everything you push carries
\`external_ref: { "source": SOURCE, "id": "<your record id>" }\`. The same ref always
updates the same record, so every call is safe to retry. Other organizations never
see your IDs, and you never see theirs.

## Step 1 — Send the entrepreneur when you start working with them

\`POST ${B}/partnerUpsertPerson\`

\`\`\`json
{
  "external_ref": { "source": "SOURCE", "id": "12345" },
  "ecosystem_id": "${input.ecosystemId}",
  "eso_org_id": "${input.orgId}",
  "first_name": "Grace",
  "last_name": "Hopper",
  "email": "grace@example.com",
  "consent": {
    "agreed": true,
    "terms_hash": "<from the consent block or getConsentTerms>",
    "directory_listing": false,
    "share_details": false,
    "accepted_at": "2026-09-24T15:04:05Z"
  }
}
\`\`\`

- \`consent\` is optional. Include it only when the entrepreneur ticked the network
  agreement (step 3). Omit it otherwise — the person is still created, and nothing
  beyond the compact's "always shared" tier happens until they choose.
- Response: \`{ "ok": true, "nexus_id": "...", "action": "created" | "updated" | "linked",
  "consent": { "terms_accepted", "directory_listed", "shares_details" } }\`.
  \`linked\` means another partner already works with this person (matched by email):
  that is the network working, not an error. Store \`nexus_id\` if convenient.
- \`consent_terms_outdated: true\` in the response (with \`current_terms_hash\`): the
  terms changed since the entrepreneur agreed. The push itself succeeded and any
  consent already on file stands, but nothing new was recorded — the network asks
  the entrepreneur directly. Show them the current terms next time they are on your
  site and resend; do not resend with a guessed hash.
- If you send no \`consent\`, the network emails the entrepreneur the consent notice
  itself, with a link to make their choices — automatically, and you cannot switch
  it off. Nobody is added to the network without being told. The response says
  whether that happened (\`consent_notice_sent\`). Each partner that adds them
  triggers one notice naming that partner; you never trigger a second one.

To read a person back: \`GET ${B}/partnerGetPerson?source=SOURCE&id=12345&ecosystem_id=${input.ecosystemId}\`
(returns your own refs and their consent state in this network).

## Step 2 — Send program participation

\`POST ${B}/partnerUpsertParticipation\` — after the person exists.

\`\`\`json
{
  "person_external_ref": { "source": "SOURCE", "id": "12345" },
  "participation_external_ref": { "source": "SOURCE", "id": "12345_accelerator_2026" },
  "ecosystem_id": "${input.ecosystemId}",
  "eso_org_id": "${input.orgId}",
  "participation_type": "program",
  "name": "Hardware Accelerator — Spring 2026",
  "status": "active",
  "start_date": "2026-03-01"
}
\`\`\`

- \`participation_type\`: \`program | membership | application | residency | rental | event | service\`.
- \`status\`: \`applied | waitlisted | active | past\`. When it ends, send \`status: "past"\`
  with \`end_date\` — never delete; the history is what partners and the statistics use.
- Always send \`participation_external_ref\` so updates don't create duplicates.
- Partners who work with the same person see that they are in "a program with
  ${input.orgName}" and its status and dates; the program \`name\` only if the
  entrepreneur chose to share details.

## Step 3 — Put the consent terms in your signup form

The entrepreneur must see the network's terms in the network's words.

**If your site already has an opt-in** ("share my profile with partner
organizations", a "join the network" checkbox), it does not count as consent to
the network: the network never learned the person said yes, and the words were
yours, not the network's. Replace its wording with the terms below and record the
\`terms_hash\` shown; keep any local flag you need alongside. This is the mistake the
first pilot partner made — see the worked example at the end.

Pick one of these to show the terms:

**A. The consent block (recommended for web forms).** Paste inside your existing
\`<form>\`:

\`\`\`html
${buildEmbedSnippet(input)}
\`\`\`

It is one checkbox, not an extra page: "Join the network" with a four-line summary in
the network's own words and a link to the full terms (\`terms_url\`), and — once ticked —
the two choices (directory listing pre-ticked, detail sharing off). It adds hidden
fields to your form: \`nexus_consent_agreed\`, \`nexus_consent_terms_hash\`,
\`nexus_consent_directory_listing\`, \`nexus_consent_share_details\`,
\`nexus_consent_accepted_at\`. Your server maps them to the \`consent\` object in step 1,
and sends \`consent\` only when \`nexus_consent_agreed == "true"\` (omit \`accepted_at\`
if the field is empty). The block never blocks your own signup: joining the network is
optional for the entrepreneur.

Options on the element: \`data-default-agreed="true"\` pre-ticks joining (the timestamp
is then taken when the form is submitted; use this only where the surrounding form
makes the choice obvious — an unticked box is stronger evidence of consent);
\`data-layout="full"\` shows the full terms inline and all choices up front;
\`data-field-prefix\` renames the hidden fields.

Preview what entrepreneurs see: ${input.appBaseUrl}/consent?demo=1

**B. Render the terms yourself** (server-rendered forms, native apps): \`GET ${B}/getConsentTerms\`
returns \`summary\` (heading, intro, always, choice, never), \`choices\` (labels, help
text and defaults for \`agree\`, \`directory_listing\`, \`share_details\` — respect the
defaults: directory on, details off), \`terms_url\` (link to the full text), the full
\`documents\` and \`terms_hash\`. Show the summary and choice labels verbatim, link or
show the full documents, and send back \`terms_hash\` with the answers. Cache the response
for a few minutes, not permanently: a stale hash records nothing (the push still
succeeds, with \`consent_terms_outdated: true\`).
If the terms cannot be fetched, do not offer joining — nobody can agree to terms
they have not seen.

**No system of your own yet?** Staff can add clients directly in Nexus (People →
Add person). The network sends them the consent notice itself, the record is your
organization's to work with, and you can connect a system later without re-entering
anyone.

**C. Send them to the network's page.** \`POST ${B}/partnerCreateConsentLink\` with
\`{ "ecosystem_id", "external_ref": { "source", "id" }, "return_url"? }\` returns a
one-time \`consent_url\`. Redirect the entrepreneur there; they come back to
\`return_url\` (https, on your own website) with \`?nexus_consent=accepted|declined\`.

**Whichever you pick, store the answers on the person's account** — \`terms_hash\`,
the two choices, and when they agreed — and attach them as \`consent\` on **every**
push for that person, not only the first. A push triggered later from your CRM
(a tag applied, a status change) must carry the same consent, or the network will
treat it as a person who has not been asked. That means you need the mapping from
your CRM record to the account the person signs in with; find it before writing
the consent code.

## Step 4 — Referrals

**Send a referral** when an entrepreneur you work with asks to be introduced:

\`POST ${B}/partnerCreateReferral\`

\`\`\`json
{
  "ecosystem_id": "${input.ecosystemId}",
  "person_external_ref": { "source": "SOURCE", "id": "12345" },
  "receiving_org_id": "<partner org id>",
  "notes": "Grace is building a marine sensor and needs help with patents.",
  "entrepreneur_agreed": true,
  "referral_external_ref": { "source": "SOURCE", "id": "ref-889" }
}
\`\`\`

The notes are the introduction — only ${input.orgName} and the receiving partner see them.
Partner organization IDs are listed on the network's Organizations page.

**Receive referrals** either by webhook (step 6) or by polling:
\`GET ${B}/partnerListReferrals?ecosystem_id=${input.ecosystemId}&direction=incoming&status=pending\`.
Each includes the entrepreneur's name and, if you already know them, \`your_external_ref\`.
Their email arrives once you accept — a pending referral names the person without
contact details, so nobody in the network can be contacted by an organization that
has not taken them on.

**Answer them:** \`POST ${B}/partnerUpdateReferral\` with
\`{ "referral_id", "status": "accepted" | "rejected" | "completed", "response_notes"?, "outcome"? }\`.
Lifecycle: \`pending → accepted | rejected\`, \`accepted → completed\`. A \`409\` with
\`reason: "invalid_transition"\` means the referral is already past that step.
Staff can also answer referrals from the email the network sends, without logging in.

## Step 5 — Activity (optional, recommended)

When staff meet with an entrepreneur, record the fact so partners can coordinate:

\`POST ${B}/partnerLogActivity\`

\`\`\`json
{
  "ecosystem_id": "${input.ecosystemId}",
  "person_external_ref": { "source": "SOURCE", "id": "12345" },
  "activity_external_ref": { "source": "SOURCE", "id": "meeting-5521" },
  "type": "meeting",
  "date": "2026-09-24",
  "share_fact": true,
  "notes": "Optional — stored for ${input.orgName} only."
}
\`\`\`

With \`share_fact: true\`, partners who also work with this entrepreneur see
"${input.orgName} — meeting — 2026-09-24". Nothing else. Set it to \`false\` for
anything you would rather not signal at all.

## Step 6 — Webhooks (optional)

\`POST ${B}/partnerRegisterWebhook\` with \`{ "url": "https://...", "events": ["referral.received", "referral.updated"] }\`
returns a \`signing_secret\` once — store it. Each delivery carries
\`X-Nexus-Signature: sha256=<hex>\`, the HMAC-SHA256 of the raw body with that secret;
verify it with a constant-time comparison before trusting the payload. Payloads carry
IDs, types, dates and statuses — never notes.

## Errors and retries

| Status | Meaning | What to do |
|---|---|---|
| 400 | Bad payload | Log it and fix the mapping. Do not retry unchanged. |
| 401 | Missing, invalid or revoked key | Stop and alert a human. Do not retry. |
| 403 | Wrong network or organization | Check \`ecosystem_id\` and \`eso_org_id\`. |
| 404 | Unknown person reference | Push the person (step 1) first, then retry. |
| 409 | Terms outdated / invalid referral step | See the step above; do not blindly retry. |
| 429 | Rate limited | Back off and retry later. |
| 5xx / network | Transient | Retry with exponential backoff (1s → 60s), same payload. |

All upserts are idempotent, so retrying the same payload is always safe.

## Before you call it done

- [ ] The API key is read from a secret, server-side only, and never logged.
- [ ] A new program signup creates or updates the person (step 1) with the same
      \`external_ref\` every time.
- [ ] The consent block (or your own rendering of the terms) appears in the signup
      form; \`consent\` is sent only when the agreement box was ticked.
- [ ] Program status changes update participation, ending with \`status: "past"\`.
- [ ] Incoming referrals reach a person at ${input.orgName} who answers them.
- [ ] Errors follow the table above; 401s alert a human.
- [ ] The twelve sandbox checks pass (\`AI_AGENT_ACCEPTANCE_TEST.md\`), and the only
      difference between sandbox and production in your code is configuration.
- [ ] After switching to production: push one real person your organization works
      with, read them back with \`partnerGetPerson\`, and confirm they appear on the
      network's People page for your organization.

Full API reference: \`docs/partner-api/openapi.yaml\` in
https://github.com/jrlogan/Entrepreneurship-Nexus. A worked example — the first
pilot partner's open-source Drupal/CiviCRM integration, and the three things it
got wrong before it got them right — is \`docs/partner-api/EXAMPLE_MAKEHAVEN.md\`
in the same repository. Questions go to the network administrator.
`;
};
