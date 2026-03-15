# Postmark Integration

This project supports Postmark inbound email ingestion without storing secrets in committed code.

## What To Configure In Postmark

Use the Default Inbound Stream or a dedicated inbound stream for introduction/referral mail.

Webhook target:

```text
https://YOUR_FUNCTION_HOST/postmarkInboundWebhook?secret=YOUR_POSTMARK_INBOUND_WEBHOOK_SECRET
```

For local emulator testing:

```text
http://127.0.0.1:55001/entrepreneurship-nexus-local/us-central1/postmarkInboundWebhook?secret=YOUR_POSTMARK_INBOUND_WEBHOOK_SECRET
```

Recommended inbound recipient:

```text
newhaven+introduction@inbound.example.org
```

Recommended staging inbound recipient:

```text
mail-test+introduction@inbound.entrepreneurship.nexus
```

## Secrets

Do not commit these values.

Local emulator secrets should go in:

- `functions/.env.local` or `functions/.env`

Frontend-only helper values can live in root `.env` for local test scripts.

Recommended function env vars:

```text
POSTMARK_INBOUND_WEBHOOK_SECRET=
POSTMARK_INBOUND_ALLOWED_RECIPIENTS=newhaven+introduction@inbound.example.org
POSTMARK_SERVER_TOKEN=
POSTMARK_FROM_EMAIL=
POSTMARK_MESSAGE_STREAM=outbound
```

## Current Implementation

The inbound endpoint is:

- `postmarkInboundWebhook`

It:

1. validates the shared secret from the webhook URL or `x-postmark-webhook-secret`
2. optionally enforces an allowlist of inbound recipient addresses
3. maps the Postmark payload into the existing internal inbound format
4. passes the normalized email into the same intake path used by local/manual testing

## Local Test

With the emulators running and reference data seeded:

```bash
npm run simulate:postmark-inbound
```

If you want to override the secret for local testing:

```bash
POSTMARK_INBOUND_WEBHOOK_SECRET=local-postmark-secret npm run simulate:postmark-inbound
```

## Staging Test

Use a separate Postmark inbound stream and a separate Firebase project for staging. Do not point test inbound mail at production while tuning parsing behavior.

Seed the staging route and organizations:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging npm run staging:seed-mail-test
```

Then simulate a staging webhook against deployed Functions:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging \
FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net \
POSTMARK_INBOUND_WEBHOOK_SECRET=YOUR_STAGING_SECRET \
NEXUS_MAIL_TEST_ROUTE_ADDRESS=mail-test+introduction@inbound.entrepreneurship.nexus \
npm run simulate:postmark-inbound
```

When you want to clear generated test artifacts but keep the route and seeded orgs:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging npm run staging:cleanup-mail-test
```

## Notes

- The scaffold now handles inbound webhooks and outbound queued notices.
- Outbound sending uses the `sendQueuedNotices` function and reads `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL`, and `POSTMARK_MESSAGE_STREAM` from env.
- No Postmark secret or token is stored in repo code or committed config.
