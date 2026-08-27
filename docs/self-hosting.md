# Self-Hosting the Entrepreneurship Nexus

The Nexus is MIT-licensed (`LICENSE.md`). Any organization — or a consortium
jointly — can run its own instance ("node") without depending on MakeHaven or
any other single operator. This is the sovereignty guarantee behind the
federated model: the software, the data standards, and your data are yours.

## Who this is for

- A consortium that wants to operate the shared node under joint governance
  (e.g. a council with one seat per member organization).
- A state or regional group standing up its own ecosystem instance.
- An individual ESO that wants full control of its node and to connect to
  other nodes via the partner API.

## What you need

- A Google Firebase project (Firestore, Cloud Functions, Hosting, Auth,
  Storage). The free/Blaze tier is sufficient for a pilot.
- A Postmark account if you want inbound/outbound email flows (consent emails,
  referral notifications). Optional for a demo.
- Node.js 22+ and the Firebase CLI.

## Steps

1. **Fork or clone this repository.**
2. **Create your Firebase project** and update `.firebaserc` with your project
   id (see `docs/firebase-deployment.md` for the full environment-variable
   reference for both frontend and Functions).
3. **Deploy**:
   ```bash
   npm install && npm run build
   firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
   ```
4. **Bootstrap your first admin** — `docs/first-admin-bootstrap.md`.
5. **Create your ecosystem and organizations** through the admin UI, and mint
   partner API keys per organization via `generatePartnerApiKey`.
6. **(Sandbox only)** To seed demo data on a non-production instance, deploy
   Functions with `ALLOW_LOCAL_ONLY_FUNCTIONS=true` and call
   `seedLocalReferenceData`. Never enable this on a production instance — it
   also exposes test-account endpoints.

For local evaluation without any cloud project:

```bash
./scripts/start-local-dev.sh
node scripts/seed-local-reference-data.mjs
node scripts/demo-federated-walkthrough.mjs   # runs the federated demo end-to-end
```

## Connecting to other Nexus instances

There are three ways a self-hosted node relates to the wider network today:

1. **Join an existing node as a partner.** Your systems push/pull against
   another instance's partner API with your org's API key, and receive events
   via webhooks. You keep your own applications and IDs (`external_ref`);
   the shared node only holds the compact's core fields. See
   `docs/partner-api/PLAYBOOK.md`.
2. **Offer SSO from your node.** Register your OAuth2/OIDC server on the other
   instance via `partnerRegisterOidcProvider` — entrepreneurs sign in to that
   instance with their account from your system, and keep working even if your
   server is later offline (sessions are minted independently).
3. **Run fully independent, share the standards.** Adopt
   `data-standards/v1.0/` so records exported from your node aggregate cleanly
   with others' (the "FirstName vs First Name" problem). Periodic exports or
   partner-API bridges between two Nexus nodes work today because every node
   exposes the same idempotent upsert API — a bridge is just a script that
   reads from one node and pushes to another with stable `external_ref`s.

True node-to-node live replication (peering) is not built yet; if the
consortium wants it, the partner API + webhook layer is the intended
foundation — each node subscribes to the others' events and mirrors the agreed
core fields, with consent rules enforced at each node.

## Governance notes for a jointly-hosted node

- Keys are scoped per organization; every write is attributable to the org
  whose key made it, and each org only ever sees its own external IDs on
  shared records.
- Entrepreneurs control shared-directory visibility via the consent flow, and
  can request data removal (`requestDataRemoval`).
- Fork-ability is the ultimate check: if the operator of a shared node loses
  the group's trust, any member can stand up a replacement node from this
  repository and re-import its own data.
