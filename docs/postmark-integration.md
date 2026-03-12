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

## Notes

- The scaffold now handles inbound webhooks and outbound queued notices.
- Outbound sending uses the `sendQueuedNotices` function and reads `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL`, and `POSTMARK_MESSAGE_STREAM` from env.
- No Postmark secret or token is stored in repo code or committed config.
