# Email Intake Testing

The repository includes scripts for testing inbound referral email parsing, Postmark-style webhook payloads, local notice generation, and staging mail fixtures.

## Local Fixture Suite

Run the complete local suite:

```bash
npm run simulate:local-email-tests -- --reset
```

Run one targeted fixture:

```bash
npm run simulate:local-email-tests -- gmail-request-access
```

Run multiple targeted fixtures after local data is already seeded:

```bash
npm run simulate:local-email-tests -- approved-known-staff reply-chain-top-posted
```

Preview queued local notice emails:

```bash
npm run simulate:preview-local-notices
```

## What the Suite Covers

The local suite includes scenarios for:

- Approved known ESO staff
- Approved unknown staff
- Unapproved senders
- Reply chains and quoted threads
- Approved-domain plus aliases
- No-footer fallback parsing
- Signature-heavy trailing noise
- Malformed footer cases

It validates:

- Inferred referring organization
- Manual-review reasons
- Queued notice types
- Clean referral notes
- Default owner assignment state
- Referral date presence

When a check fails, the script emits remediation hints to help identify whether the fix belongs in parsing, sender-domain policy, or manual-review handling.

## Suggested Local Iteration Loop

1. Run the full fixture suite with reset.
2. Read the failed check and remediation hint.
3. Fix the relevant area.
4. Rerun the single failing fixture first.
5. Rerun the full suite.
6. Repeat the same scenario in staging only after local coverage passes.

Example targeted rerun:

```bash
npm run simulate:local-email-tests -- signature-noise-after-footer
```

Common fix areas:

- Parsing and note cleanup: `functions/src/emailParsing.ts` and `functions/src/index.ts`
- Sender-domain policy and organization mapping: `authorized_sender_domains`
- Receiver-side review behavior: app UI and referral intake views

## Staging Mail Testing

Use a dedicated Firebase staging project and a staging-only ecosystem for repeated inbound mail testing. Avoid pointing test inbound mail at production while tuning parsing behavior.

Seed staging mail-test fixtures:

```bash
FIREBASE_PROJECT_ID=YOUR_STAGING_PROJECT_ID npm run staging:seed-mail-test
```

Clean up staging-generated mail artifacts while keeping seeded routes and organizations:

```bash
FIREBASE_PROJECT_ID=YOUR_STAGING_PROJECT_ID npm run staging:cleanup-mail-test
```

Simulate an inbound Postmark webhook against deployed staging Functions:

```bash
FIREBASE_PROJECT_ID=YOUR_STAGING_PROJECT_ID \
FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-YOUR_STAGING_PROJECT_ID.cloudfunctions.net \
POSTMARK_INBOUND_WEBHOOK_SECRET=YOUR_STAGING_SECRET \
NEXUS_MAIL_TEST_ROUTE_ADDRESS=YOUR_STAGING_INBOUND_ROUTE \
npm run simulate:postmark-inbound
```

Recommended staging workflow:

1. Deploy Functions and Hosting to staging.
2. Bootstrap a staging admin.
3. Seed staging mail-test routes and organizations.
4. Point a dedicated Postmark inbound stream at the staging webhook URL.
5. Run repeated inbound tests in staging.
6. Periodically run cleanup to remove generated test artifacts.
