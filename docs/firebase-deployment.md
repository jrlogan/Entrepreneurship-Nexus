# Firebase Deployment

This repository includes Firebase Hosting, Firestore, Storage, and Cloud Functions configuration. Use separate Firebase projects for staging and production.

## Prerequisites

Before deploying:

1. Create Firebase projects for staging and production.
2. Update `.firebaserc` aliases if your project ids differ from the defaults in the repo.
3. Create a Firebase Web App for each deployed environment.
4. Configure frontend environment values for each environment.
5. Configure Firebase Functions runtime environment values or secrets.
6. Confirm inbound Firestore routes match the Postmark recipients you will use.

## Frontend Environment Values

Set these for hosted frontend builds:

```env
VITE_DEMO_MODE=false
VITE_USE_FIREBASE_EMULATORS=false
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
```

Firebase web config is expected to be visible in browser builds. GitHub or hosting environment secrets still keep environment-specific deployment configuration easier to manage.

## Functions Environment Values

Configure these for deployed Functions as needed:

```env
APP_BASE_URL=
POSTMARK_INBOUND_WEBHOOK_SECRET=
POSTMARK_INBOUND_ALLOWED_RECIPIENTS=
POSTMARK_SERVER_TOKEN=
POSTMARK_FROM_EMAIL=
POSTMARK_MESSAGE_STREAM=outbound
BOOTSTRAP_PLATFORM_ADMIN_SECRET=
```

Do not put Functions-only secrets in frontend build environments.

## Manual Deploy

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Notes:

- `createTestAccount`, `seedLocalReferenceData`, and `processInboundEmail` are blocked outside local or explicitly enabled environments.
- `postmarkInboundWebhook` is public by design, but requires the configured shared secret.
- `sendQueuedNotices` is manual/admin-triggered. Outbound mail is not scheduled automatically yet.

## GitHub Environments

The repo supports separate Hosting deploy targets through GitHub Environments:

- `main` branch maps to GitHub environment `production`
- `staging` branch maps to GitHub environment `staging`

Use the same secret names in both environments, with environment-specific values.

Recommended GitHub environment secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_FUNCTIONS_REGION`
- `GEMINI_API_KEY`, if Gemini-enabled frontend builds are enabled

## GitHub Auto Deploy

The repository includes GitHub Actions for Firebase Hosting:

- Pushes to `main` deploy Firebase Hosting live.
- Pull requests deploy a Firebase Hosting preview channel.

Workflow files:

- [.github/workflows/firebase-hosting-merge.yml](../.github/workflows/firebase-hosting-merge.yml)
- [.github/workflows/firebase-hosting-staging.yml](../.github/workflows/firebase-hosting-staging.yml)
- [.github/workflows/firebase-hosting-pull-request.yml](../.github/workflows/firebase-hosting-pull-request.yml)

Recommended setup notes:

- Keep Functions deploy manual until auth, mail, and production data flows are stable.
- Keep Postmark secrets out of GitHub Actions build environments unless you add a Functions deploy workflow.
- If Capacitor support is added later, reuse the same build-time environment model before running `npx cap sync`.
