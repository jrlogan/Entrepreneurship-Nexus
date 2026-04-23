# Local Development

This project can run in two local modes:

- Demo mode, which uses in-memory data and is fastest for frontend inspection
- Firebase emulator mode, which uses local Auth, Firestore, Functions, and Storage emulators

## Demo Mode

```bash
npm install
cp .env.example .env
npm run dev
```

The default `.env.example` values keep `VITE_DEMO_MODE=true`.

## Firebase Emulator Mode

Set these values in `.env`:

```env
VITE_DEMO_MODE=false
VITE_USE_FIREBASE_EMULATORS=true
```

Then start the local stack:

```bash
npm run local:start
```

If you prefer to run each process manually:

```bash
npm run dev
npm run firebase:emulators
```

## Local Data and Auth Helpers

After the emulators are running, the helper scripts can seed data and create local users:

```bash
npm run simulate:seed-local
npm run simulate:create-auth-user
npm run simulate:seed-test-accounts
```

The local scripts are intended for emulator and development projects only. Do not enable local-only helper endpoints in production.

## Local Referral and Email Intake Simulation

```bash
npm run simulate:inbound-email
npm run simulate:postmark-inbound
npm run simulate:full-invite-flow
npm run simulate:preview-local-notices
```

For the full fixture suite, see [Email Intake Testing](email-intake-testing.md).

## Local Defaults

The local emulator workflow defaults to:

- Firebase project id: `entrepreneurship-nexus-local`
- Firebase Functions region: `us-central1`
- Auth emulator port: `59099`
- Firestore emulator port: `58080`
- Functions emulator port: `55001`

Use `.env.example` as the source of truth for configurable local values.
