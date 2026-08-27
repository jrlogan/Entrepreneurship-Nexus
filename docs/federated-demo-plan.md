# Federated Model Demo — CT Consortium Prototype

Status: draft for review · Last updated: 2026-08-26

## 1. Context

At the Aug 7, 2026 consortium meeting (Entrepreneurship Foundation, IP Factory,
MakeHaven, New Haven Community Foundation, and others), the group agreed to a
prototype bake-off:

- **Chris Kalish** builds a **centralized** model prototype — live at
  `https://theipfactory.org/CentralRegistry/EntrepreneurLink.php` ("Connecticut
  Regional Entrepreneur Community"): a central registry owns the entrepreneur
  list, providers authenticate against it.
- **JR** builds a **federated** model prototype — each organization keeps its own
  application and data, cooperating through shared standards, shared identity,
  and machine-to-machine exchange.

The agreed minimal prototype spec:

1. Demonstrate how a new user registers as an entrepreneur.
2. Link the entrepreneur to a service provider A.
3. Demonstrate linking to a second service provider B (single sign-on).
4. Demonstrate entrepreneur login to service provider B with service provider A
   offline.

Related consortium threads this demo should also speak to (see
`docs/discussion/`):

- **Referral tracking** (Mike Roer's FORGE critique, Aug 24): referrals need an
  original record with an ID, purpose, acknowledgment/accept-decline by both
  parties, and follow-up prompts.
- **Success metrics** (Mike Roer, Aug 19): longitudinal outcome tracking and
  anonymous aggregate stats (startups, survival, jobs) to make the state
  funding case.
- **Sovereignty** (April thread): every org keeps control of its own data and
  mission; nobody wants to adopt someone else's master system.

## 2. What the Nexus already demonstrates (verified)

The federated prototype spec is implemented in this repo and verified against
the emulator by `scripts/demo-federated-walkthrough.mjs`:

| Spec step | Nexus mechanism |
|---|---|
| 1. Entrepreneur registers | Provider A's own system pushes the contact via `partnerUpsertPerson` — no central registration form. (Direct signup via the Nexus app also works.) |
| 2. Linked to provider A | `partnerUpsertParticipation` records the structured relationship (program, membership, etc.), keyed by provider A's own IDs (`external_ref`). |
| 3. Linked to provider B | Provider B pushes the same person from its own CRM → `action: "linked"`: one shared record, no duplicate, no central owner of the list. SSO: any ESO registers its OIDC server via `partnerRegisterOidcProvider` → "Sign in with [ESO]" appears on the Nexus login page. |
| 4. B works with A offline | Provider B reads/writes the shared record with only its own API key — no call touches provider A. For login, `oidcExchangeToken` mints an independent Firebase session, so an entrepreneur who linked once can still sign in (email/Google) when the identity-providing ESO is down. |

Plus the consortium's adjacent asks:

- **Referrals**: referral records with status, owner assignment, follow-up due
  dates, reminder/decision emails, and HMAC-signed webhooks
  (`referral.received` / `referral.updated`) to the receiving org's system.
- **Data standards**: `data-standards/v1.0/` — versioned field and enum
  definitions (HSDS 3.0-compatible), the starting point for the group's
  "FirstName vs First Name" standardization discussion.
- **Consent**: partner-pushed people are invisible in the shared directory until
  they opt in via consent email; data-removal request flow exists.
- **Sovereignty**: API keys are scoped per org; each org only ever sees its own
  `external_refs` on a shared person; MIT-licensed so any org (or the group
  jointly) can run its own node — see `docs/self-hosting.md`.

Run the walkthrough locally:

```bash
./scripts/start-local-dev.sh              # emulators
node scripts/seed-local-reference-data.mjs
node scripts/demo-federated-walkthrough.mjs
```

The seed now creates a demo `eco_connecticut` ecosystem ("Connecticut Regional
Entrepreneur Community" — mirroring Chris's sandbox naming) with
`org_ef` (Entrepreneurship Foundation) and `org_ipfactory` (IP Factory), each
holding its own sandbox API key.

## 3. Hosted demo instance — plan

> **Status 2026-08-27: deployed.** Functions + Firestore rules/indexes are
> live on `entrepreneurship-nexus-staging`
> (`https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net`),
> seeded with the CT demo ecosystem. Postman collection:
> `docs/partner-api/nexus-partner-api.postman_collection.json`. Seeded demo
> keys work; mint real keys via `generatePartnerApiKey` before sharing
> beyond the consortium. `functions/.env.entrepreneurship-nexus-staging`
> sets `ALLOW_LOCAL_ONLY_FUNCTIONS=true` (sandbox only — never production).

Goal: a link Chris and Lafir can click and an API they can actually call before
the next consortium meeting.

1. **Environment**: use the staging project (`entrepreneurship-nexus-staging`)
   or a dedicated `entrepreneurship-nexus-demo` hosting target (already in
   `.firebaserc`). Follow `docs/firebase-deployment.md`.
2. **Seeding**: deploy with `ALLOW_LOCAL_ONLY_FUNCTIONS=true` so
   `seedLocalReferenceData` can populate the CT demo ecosystem, then run the
   seed once. ⚠️ This flag also enables `createTestAccount` — acceptable only
   because this is a throwaway sandbox; never set it on production. Purge the
   sandbox periodically (mirroring Chris's "I'll purge the data periodically").
3. **Keys**: for the shared sandbox, mint real keys via `generatePartnerApiKey`
   for "Entrepreneurship Foundation" and "IP Factory" and send them privately
   to Mike/Chris/Lafir (the deterministic seed keys are public in this repo —
   fine for local, not for a hosted link).
4. **Partner packet** to send with the link:
   - `docs/partner-api/PLAYBOOK.md` (integration playbook)
   - `docs/partner-api/openapi.yaml` (importable API reference)
   - `docs/partner-api/AI_INTEGRATION_PROMPT.md` — hand it to an AI assistant
     and get an integration scaffolded (fits how the group is building)
   - `data-standards/v1.0/` (shared field standard draft)
   - sandbox base URL + their org's API key
5. **Optional stretch**: register IP Factory's real matching app as an OIDC
   provider (their `EntrepreneurLink` already redirects to it) so "Sign in with
   IP Factory" is live in the demo — the strongest possible answer to spec
   steps 3–4.

## 4. Meeting walkthrough (10 minutes, code-only)

Deliberately no UI: the pitch is a protocol, not a product. Slides: the
"Federated Compact" deck (published artifact) frames the demo; the demo itself
is the terminal. For sharing after (or instead of) the live session, "The
Compact in Practice" (published artifact) is a self-guided interactive
walkthrough: six scenario players with three columns (Agency A / shared node /
Agency B) that make explicit what updates locally vs. centrally at every step,
plus reference tabs for the data model, taxonomy, agreement tiers, and
required-vs-extended fields. It simulates the verbatim request/response
exchanges verified against the sandbox.

1. **Frame** (3 min, "Title" → "Life of one shared record"): "Centralized
   asks everyone to join one registry. Federated asks everyone to agree on a
   small compact — and keep their own systems." The deck now leads with the
   agreement slide (three sharing tiers + the signable documents) and a flow
   diagram of one record's life; "How to read the wire" decodes the
   call/response format for non-developers before the terminal appears.
2. **Live run** (4 min): `node scripts/demo-federated-walkthrough.mjs --step`
   against the hosted demo — step mode pauses between calls, and every call
   prints the actual request and raw JSON response. Narrate the `action`
   field: `created` at A → `linked` at B (same record) → B reads with A
   offline, seeing only its own IDs → B subscribes to referral webhooks.
   Then improvise with `scripts/nexus-call.mjs` — any call, as any of the
   three seeded agencies (including a "new agency joins live" slot), driven
   by the room. Full command script: `docs/live-demo-script.md`. Adoption
   principle to state out loud: **no bulk imports** — the shared record set
   grows only from real activity, with the consent email sent to each
   entrepreneur as they enter.
3. **Adoption ladder** (2 min): levels 0–3, from "keep using email" to
   SSO/webhooks — value add, not extra work; no bulk imports at any level;
   Entrepreneur Central can plug in at level 3 as one identity provider
   among peers.
4. **Make it real** (2 min, "It already runs at MakeHaven"): the real
   screenshots — the member's opt-in toggle and the push confirmation in
   MakeHaven's own logs — beside an illustrative partner-side panel showing
   the same shared record. Hand out the Postman collection here for the
   technical crowd to try live against the hosted sandbox.
5. **Deep-dive or Q&A reserve** ("Integration step by step", "Mapping",
   "Same agreement, your app"): the six-step integration path, the
   field/taxonomy mapping example, and the consent panels mocked inside each
   org's own brand. Skippable live; they answer the questions directors ask.
6. **Close** ("Already in the box" → "What the group must decide"): referral
   loop, data standard, the signable compact (draft — v1.0 is the group's to
   write); MIT-licensed, self-hostable; then the 8-item decision list.

Honest gap to state up front: today's implementation is still hub-shaped — one
Nexus node holds the shared record. The federated claim is about *governance
and control* (own keys, own IDs, own apps, replaceable host, open source), not
yet about node-to-node replication. If the group wants true multi-node
peering, that's the next design conversation (see §6).

## 4b. MakeHaven bridge — end-to-end verified (2026-08-27)

The real agency-side integration was exercised against the local emulator:
the MakeHaven website's `entrepreneur_nexus_bridge` module (local Lando site)
was pointed at the emulator (`http://172.17.0.1:55001/...`, seeded
`org_makehaven` key), a `field_publish_to_nexus`-flagged business node was
re-saved, and `drush queue:run entrepreneur_nexus_bridge.outbound_queue`
pushed it — Drupal logged "NexusPushWorker: business 42713 (created) → Nexus
ID" and the emulator executed `partnerUpsertOrganization` +
`partnerUpsertPerson`. Element screenshots of the settings form, the
member-facing "Publish to the Founder Resource Network" toggle, and the push
log are embedded in the "Seen at MakeHaven" tab of the Compact in Practice
artifact. Note: the local site's bridge config was left pointing at the
emulator (originals: base_url
`https://us-central1-entrepreneurship-nexus.cloudfunctions.net`, api_key
empty, eso_org_id `org_mmts671b`) — restore with `lando drush cset` if
needed.

## 5. Draft reply to Chris

> Hi Chris — sorry for the slow reply, and thanks for putting your prototype
> up; I created a test ID and it makes the centralized concept easy to grasp.
>
> The federated prototype is ready to show. It runs the exact spec from our
> meeting: an entrepreneur registers with provider A, provider B links to the
> same person via a shared ID (no central owner of the list — each org keeps
> its own system and IDs), and B keeps working, including login, with A
> completely offline. It also covers two things that came up on the other
> threads: a referral loop with acknowledgment/ownership/follow-up (Mike's
> FORGE points) and a draft shared data standard for the field-name problem.
>
> Sandbox: [DEMO URL] — I'll send you and Lafir API keys separately so your
> systems can push/pull against it before we meet, plus an integration
> playbook and OpenAPI spec. It's all MIT-licensed open source, so the
> consortium could self-host it jointly rather than depend on any one of us.
>
> One thought after playing with your sandbox: I don't think our two
> prototypes are actually mutually exclusive. Your Entrepreneur Central is an
> OAuth server, and the federated side registers external identity providers
> as sign-in options — so your central registry could plug in as "Sign in
> with Entrepreneur Central" within the federated network, and anyone who
> registered there would just keep working. That might reframe the choice for
> the group: agree on the compact (shared fields, consent rules, identity
> linking), and a central registration front-door can still exist as one
> member of the network for whoever wants it. Happy to try wiring your
> sandbox in as a live provider before the meeting if you're game.
>
> I'm good to get the group together — [proposed windows]. Want to do a quick
> 30-minute run-through with just the two of us first?
>
> JR

## 6. Open decisions for the group

- **Governance**: who operates the shared node — lead nonprofit, joint council
  (one seat per member org), or each org self-hosts and peers? (Mike's four
  scenarios from the April thread.)
- **Compact v1**: ratify a minimal shared-field standard (start from
  `data-standards/v1.0`), consent rules, and referral status vocabulary.
- **Identity**: which orgs will register OIDC providers vs. rely on
  email/Google linking.
- **Node-to-node roadmap**: if joint hosting is unacceptable to anyone, design
  instance-to-instance exchange (each org's Nexus node syncs agreed fields via
  the same partner API + webhooks it already exposes).
- **Metrics layer**: aggregate anonymous reporting (startups, survival,
  employment) on top of participations/interactions — Mike Roer's funding-case
  need; see `docs/ecosystem-analytics-dashboard-plan.md`.
