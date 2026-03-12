# BCC Introduction Intake Plan

This note evaluates the proposed BCC email intake approach against the current Entrepreneurship Nexus app and identifies the minimum product, data, and security decisions needed to make it fit this system.

## Recommendation

The BCC inbox plan is a good fit for this app if it is treated as an intake layer, not as the referral model itself.

That distinction matters because the current app already models normalized referrals, consent policies, organizations, and people. A BCC inbox will deliver raw, ambiguous data first. The app needs an explicit review-and-normalization step between inbound email capture and `Referral` creation.

The cleanest privacy model for this app is a two-level sharing model:

- network-level basic identity and activity metadata
- partner-granted access to detailed intervention and operational information

## Why This Fits The Current App

The current codebase already has the right long-term concepts:

- multi-ecosystem organizations and people
- structured referrals between known organizations
- privacy and consent primitives
- data standards and shared taxonomies
- API/webhook framing for external integrations

That makes this a strong place to refine the BCC plan. The missing piece is not the overall direction. The missing piece is an ingestion model that can hold partial or uncertain data before it becomes a referral.

It also fits the app's existing privacy direction because the product already distinguishes metadata visibility from access to deeper operational details. The BCC workflow can use that same pattern.

## Main Product Impact

The BCC plan should change the product roadmap in one important way:

- before more referral UI polish, add an intake queue for inbound introductions

Right now the referral workflow assumes the system already knows:

- referring organization
- receiving organization
- subject person
- subject organization

That is true for manual in-app referral creation, but it will not be true for inbound email. A BCC email may only give you:

- sender email
- recipients
- freeform note
- one or two structured footer fields

So the BCC plan introduces a new product stage:

1. ingest raw message
2. extract candidates
3. review / resolve identities
4. create normalized referral

Without that stage, the current referral model will be forced to guess too early.

## Development Impact On This App

### 1. Add An Intake Layer

The app needs a new record type for inbound email capture. At minimum:

- `InboundRoute`
- `InboundMessage`
- `InboundParseResult`

Suggested responsibilities:

- `InboundRoute`: maps destination address to ecosystem and activity type
- `InboundMessage`: stores raw payload, sender, recipients, subject, body, headers, provider IDs, and processing state
- `InboundParseResult`: stores extracted fields, confidence, and match candidates

This layer should exist before any auto-created `Referral`.

### 2. Keep Referrals Normalized

Do not overload the current `Referral` type with raw email fields.

The existing `Referral` model is already clean for the normalized state:

- `referring_org_id`
- `receiving_org_id`
- `subject_person_id`
- `subject_org_id`
- lifecycle fields

That should remain the target object after review or high-confidence parsing.

### 3. Add Canonical Routing Taxonomy

The app needs shared routing metadata across ecosystems:

- ecosystem slug
- activity type
- canonical partner organization name
- allowed partner domains
- destination address

This belongs in admin/config, not buried in parser logic.

### 4. Add Shared Footer Taxonomy Carefully

The optional footer is useful, but only a small shared taxonomy should be promoted into app standards:

- `incorporation_status`
- `venture_stage`
- `support_needs`
- `intro_contact_permission`

Do not import the full MakeHaven-specific business taxonomy into the shared email standard.

The shared footer taxonomy should stay broad enough for multiple ecosystems and later map into richer local systems.

### 5. Separate Intro Contact Permission, Network Consent, And Access Consent

The current consent model in this repo is about who may view operational data inside the platform.

The BCC plan introduces two different upstream consent questions:

- may this person's basic contact information be shared for a direct introduction to a specific organization?
- may this person's information be stored and shared more broadly in the network app for coordination and follow-up?

Those are related, but they are not the same.

The app should eventually distinguish:

- intro contact permission state
- network membership / directory consent state
- network activity metadata visibility
- platform access policies between organizations

Do not try to force the BCC consent model directly into `ConsentPolicy` as it exists today.

### 5A. Make The Two Visibility Levels Explicit

The model you described is the right one:

#### Level 1: Network-Wide Shared Basics

This is the minimum layer visible across the network once the person is in the system.

Suggested examples:

- person name
- venture or company name
- primary ecosystem membership
- that a referral or introduction occurred
- high-level activity titles or categories
- which organizations are involved in the handoff

This layer supports coordination and basic network awareness without exposing case detail.

#### Level 2: Partner Intervention Details

This layer should require separate permission or access grant.

Suggested examples:

- detailed notes
- meeting summaries
- coaching or intervention history
- sensitive narrative context
- progress details
- partner-specific assessments
- internal follow-up notes

This maps closely to the app's current concept of operational detail access and should stay behind explicit sharing controls.

### 5B. Proposed Consent/Visibility Concepts

To align the app with this model, the platform should eventually distinguish:

1. `intro_contact_permission`
   - may basic contact information be used for the direct email introduction
2. `network_directory_consent`
   - may the person exist in the shared network with basic identity fields
3. `network_activity_visibility`
   - may high-level referral/activity metadata be visible across the network
4. `partner_detail_access`
   - which partner organizations may view detailed intervention history

This is a better fit for the app than one broad "consent to share" field.

### 6. Add Review Queue Before Automation

The first internal UI needed is not a public-facing inbox. It is a lightweight review queue for staff or ecosystem managers:

- unmatched receiving org
- ambiguous client identity
- missing client email
- unknown sender domain
- malformed footer
- no valid consent basis

This is the operational control point that keeps the system useful without pretending email parsing is perfect.

## Feasibility

Feasibility is high if scope stays narrow.

### Low Complexity

- dedicated mailbox or inbound email provider
- webhook or polling ingestion
- raw payload storage
- simple footer parser
- exact sender-domain and recipient-domain matching

### Moderate Complexity

- identity resolution against existing organizations and people
- confidence scoring
- review workflow
- duplicate handling
- consent-state handling

### Higher Complexity

- high-quality extraction from freeform email without footer support
- thread/reply deduplication
- automatic referral creation with low false positives

## Best Technical Shape

For this app, the cleanest design is:

1. Postmark inbound or equivalent receives the message
2. webhook creates `InboundMessage`
3. parser resolves route from destination address
4. parser extracts footer and heuristics into `InboundParseResult`
5. review queue resolves orgs/people and creates `Referral`
6. normal referral workflow continues in existing app structures

That fits the current API-first direction better than trying to wire BCC directly into the existing `CreateReferralModal` flow.

## Security And Governance Impact

The plan is reasonable if you keep the shared data narrow and explicit.

Minimum controls:

- dedicated inbox owned by the network, not a personal mailbox
- route-based ecosystem separation
- sender-domain allowlist for auto-processing
- quarantine or review for unknown senders
- preserve provenance for every inbound message
- do not require or encourage sensitive data in intro emails
- ignore or block attachments in v1
- store raw payload access behind admin/reviewer permissions

Important limitation:

domain allowlisting is a triage signal, not proof of trust. The parser should still record messages from unknown or mismatched sources without automatically normalizing them.

## Recommended Template And Footer Standard

The strongest app-aligned version is:

- the human intro email shares only basic contact information needed for the direct introduction
- the BCC intake creates an internal intake record
- the app sends a follow-up notice to the client
- the follow-up email explains that the introduction was logged, asks for broader network permission, and invites the client to create an account or log in

That keeps the partner workflow simple while moving broader network consent into the app, where it can be captured explicitly and audited.

### Recommended Intro Email Shape

```text
Subject: Introduction: [Client Name]

Hi [Receiving Contact or Organization],

I’d like to introduce [Client Name], [brief one-line context].

[Short natural-language note about why this introduction is being made and what support may be helpful.]

Client Email: [Client Email]
Client Venture: [Organization or Venture Name, if relevant]

This introduction includes basic contact information for direct follow-up. The network system may send a separate notice asking the client to confirm broader sharing preferences and create or access an account.
```

This works better with the current app direction because it does not ask partners to carry the full network consent burden in the intro email itself.

### Recommended Structured Footer

The footer should support routing, identity matching, and minimal permission context.

Recommended v1 footer:

```text
--- NETWORK REFERRAL DATA ---
client_name: [Client Name]
client_email: [Client Email]
client_venture: [Organization or Venture Name]
referrer_email: [Referring Staff Email]
receiving_org: [Receiving Organization]

incorporation_status:
- [ ] not_incorporated
- [ ] incorporated
- [ ] unknown

venture_stage:
- [ ] idea
- [ ] prototype
- [ ] early_revenue
- [ ] sustaining
- [ ] multi_person
- [ ] established
- [ ] unknown

support_needs:
- [ ] funding
- [ ] legal
- [ ] business_coaching
- [ ] product_development
- [ ] manufacturing
- [ ] marketing
- [ ] sales
- [ ] hiring
- [ ] workspace
- [ ] networking
- [ ] other

intro_contact_permission:
- [ ] on_file
- [ ] newly_confirmed
- [ ] not_confirmed
--- END NETWORK REFERRAL DATA ---
```

This is the right balance for the app because:

- humans can fill it manually
- a CRM can generate it exactly
- the parser can read it deterministically
- most of the email can remain natural-language
- broader app consent can be captured later in-product instead of being overloaded into the partner email

### Follow-Up Email From The App

After the BCC intro is received, the app should send a follow-up message to the client when an email address is available.

Suggested goals:

- notify them that an introduction was made
- identify the referring organization and receiving organization
- explain what minimal information was logged
- ask them to confirm broader network sharing preferences
- invite them to create an account or sign in

Suggested shape:

```text
Subject: Your introduction to [Receiving Organization]

Hello [Client Name],

[Referring Organization] shared your basic contact information to introduce you to [Receiving Organization].

We also logged this introduction in Entrepreneurship Nexus so the referral can be coordinated. To review this introduction, manage what information can be shared in the network, and track follow-up, please create an account or sign in here:

[link]

If you do not want your information shared beyond this direct introduction, you can update your preferences using the link above.
```

This shifts the app toward a cleaner consent pattern:

- partner can make the direct introduction
- app handles notification and broader network permission
- the client gets a direct path into the portal

## Consent State Recommendation

For this app, the cleaner near-term model is:

1. `intro_contact_permission`
   - permission to share basic contact info in the direct intro email
2. `network_directory_consent`
   - permission for the person to exist in the shared system with basic identity data
3. `network_activity_visibility`
   - permission for the network to see high-level referral/activity metadata
4. `ConsentPolicy`
   - permission for one organization to access another organization's operational details inside the platform

That is a much better fit than treating all of this as one checkbox.

## Organizational Impact On The Starter Plan

The BCC starter plan should be organized around three separate agreements with partners:

### 1. Behavioral Standard

What partners actually do:

- send their normal intro email
- BCC the right network address
- include the footer when possible

### 2. Shared Taxonomy Standard

What the network needs to define once:

- ecosystem slugs
- activity types
- canonical partner org names
- partner domain map
- footer option values

### 3. Consent And Policy Standard

What needs alignment across organizations:

- how network-sharing consent is obtained
- how it is recorded
- whether consent stays on file until revoked
- what baseline privacy-policy language says

If those three agreements are not separated, the discussion will get muddy.

## Suggested Near-Term Build Order

1. Define route scheme and canonical partner/domain registry
2. Finalize the footer spec and partner guidance
3. Add inbound message types and repo scaffolding
4. Add webhook intake endpoint contract in the API docs
5. Build review queue
6. Create normalized referrals from approved intake records

## Bottom Line

This idea strengthens the app if it is used to populate the network with real referral activity before full CRM adoption.

It weakens the app only if the team skips the intake/review layer and tries to treat raw email as already-normalized referral data.

The strongest interpretation of the plan is:

- BCC email is the first ingestion channel
- the app becomes the review and normalization system
- structured referrals remain the clean internal model
- shared taxonomy stays small and cross-partner

## Recommended MVP

The strongest MVP for this app is:

- receive and store BCC introduction emails
- extract enough data to create or match people and organizations
- optionally create draft initiatives when clearly named
- expose a minimal CRM lookup endpoint so partner systems can check whether a person already exists in the network and retrieve the shared ID

This is a better MVP than trying to build a full referral management workflow first.

### Why This MVP Makes Sense

It does three useful things immediately:

1. creates a low-friction habit for partners
2. starts populating the shared network graph with real introductions
3. creates the first useful CRM integration surface

That means the MVP is not just "email capture." It is the first shared identity layer across the network.

### MVP Outcomes

By the end of the MVP, the system should be able to:

- accept inbound BCC introduction emails
- store the raw inbound message and extracted fields
- resolve or create a shared person record
- resolve or create a shared organization or venture record
- create a draft referral/introduction event
- optionally create a draft initiative when a named initiative is explicitly included
- let an external CRM ask "is this person already in the system?"
- return a stable shared ID for future linking

### MVP Scope Boundaries

Keep these out of MVP unless they are trivial:

- rich bidirectional CRM sync
- deep intervention note sharing
- automatic dedupe beyond clear exact or high-confidence matches
- complex workflow automation after referral acceptance
- polished partner-facing portals

### MVP Integration Model

The MVP should support two basic integration patterns:

#### 1. Email-Based Intake

Partners:

- send their normal introduction email
- BCC the network intake address
- optionally include the structured footer

The app:

- stores the message
- extracts identity hints
- creates or matches shared records

#### 2. CRM Identity Lookup

Partner CRMs should be able to ask:

- does this person already exist?
- if yes, what is the shared Nexus ID?

Suggested query keys:

- email
- full name
- organization or venture name
- ecosystem context

Suggested response:

- matched / not matched
- confidence
- shared person ID
- shared organization ID when available
- profile URL when available in the future

This gives technical partners a lightweight way to integrate without waiting for full record sync.

### Suggested MVP API Shape

The first CRM-facing API surface should be intentionally small.

Suggested endpoints:

#### `POST /api/v1/people/resolve`

Purpose:

- match an inbound CRM contact to an existing network person

Suggested request:

```json
{
  "email": "jane@example.com",
  "full_name": "Jane Smith",
  "organization_name": "Smith Studio",
  "ecosystem_id": "new-haven"
}
```

Suggested response:

```json
{
  "match_found": true,
  "confidence": 0.96,
  "person_id": "per_123",
  "organization_id": "org_456",
  "network_profile_url": "/people/per_123"
}
```

#### `POST /api/v1/organizations/resolve`

Purpose:

- match a venture or organization to a shared network record

#### `POST /api/v1/inbound-introductions`

Purpose:

- optional later machine-to-machine fallback for partners that want to send the same data directly instead of by email

The important design choice is that both BCC ingestion and CRM resolution should produce or use the same shared IDs.

### MVP Data Model Priorities

If implementation time is tight, prioritize these entities:

- `people`
- `organizations`
- `network_profiles`
- `inbound_messages`
- `inbound_parse_results`
- `referrals`

Treat `initiatives` as optional for MVP unless the intro clearly names a discrete project or support track.

### MVP UX Value

For non-technical partners:

- they only need to remember to BCC or paste a footer

For technical partners:

- they can query whether the person exists already
- they can store the shared Nexus ID in their CRM
- they can later deep-link into the shared profile

That is exactly the right kind of "light integration first" story.
