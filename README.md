# Entrepreneurship Nexus (EcosystemOS)

A centralized 'System of Systems' for entrepreneurial ecosystems, featuring federated data, HSDS-compliant tracking, and AI-driven longitudinal impact measurement.

This platform bridges the gap between **Entrepreneurs** (Founders), **Entrepreneur Support Organizations** (ESOs), and **Funders** through a shared data layer and role-specific interfaces.

---

## 🌟 Key Features

### 🧠 AI Advisor & Voice Interface
*   **Generative Advice Engine**: Powered by Gemini, the system analyzes ecosystem resources, user stage, and available ESOs to generate context-aware advice.
*   **Voice-to-Action**: Users can speak to the advisor ("How do I find funding?") and receive spoken responses via Text-to-Speech (TTS).
*   **In-Line Action Acceptance**: AI suggestions (Tasks or Referrals) can be accepted with a single click, instantly converting unstructured advice into structured database records.
*   **Interaction Summarization**: Automated summarization of meeting notes using generative AI.

### 🏢 ESO & Network Management
*   **Initiative Tracking**: Manage active projects (e.g., "New Product Launch", "Series A Prep") moving through customizable stage-gate pipelines.
*   **Federated Directory**: HSDS-compliant profiles with NAICS classification, demographics, and deduplication logic.
*   **Interaction Logging**: granular privacy controls (`Network Shared` vs `ESO Private`) for meeting notes and emails.
*   **Smart Referrals**: Structured referral system (Pending -> Accepted -> Completed) with outcome tracking.

### 🚀 Client Portal (Entrepreneur View)
*   **My Business**: A focused dashboard for founders to manage their team, profile, and initiatives.
*   **Action & Advice Center**: A consolidated view of AI-generated advice and manual tasks.
*   **External Resources**: Configurable, audience-specific links to external ecosystem tools (Grants, Equipment Booking, Events).

### ⚙️ System Architecture
*   **Data Quality Engine**: Automated fuzzy matching to identify and merge duplicate organization records across the federation.
*   **Role-Based Access Control (RBAC)**: Support for complex personas, including users who are both "ESO Staff" and "Founders" (Dual-Role support).
*   **API-First Design**: Developer console for managing API keys and webhooks to integrate with Salesforce, HubSpot, and AirTable.

---

## 🏗️ Architecture & Standards

*   **Frontend**: React 18 (Vite), Tailwind CSS
*   **AI Layer**: Google GenAI SDK (Gemini 2.5 Flash / Pro)
*   **Data Standard**: Compliant with Human Services Data Specification (HSDS) 3.0
*   **State Management**: In-memory repository pattern (mocked for demo, swappable for SQL/NoSQL).

---

## 🚀 Getting Started

1.  **Clone the repository**
2.  **Install dependencies**: `npm install`
3.  **Set up Environment**:
    *   Copy `.env.example` to `.env`
    *   Add your `API_KEY` for Google GenAI.
4.  **Run Development Server**: `npm run dev`

## Local Firebase Workflow

For local auth, Firestore, and function testing:

Quick start:

```bash
npm run local:start
```

Manual flow:

1. Set these in `.env`:
   - `VITE_DEMO_MODE=false`
   - `VITE_USE_FIREBASE_EMULATORS=true`
2. Start the app with `npm run dev`
3. Start emulators with `npm run firebase:emulators`
4. Seed reference data with `npm run simulate:seed-local`
5. Create a test account with `npm run simulate:create-auth-user`
6. Sign into the app using the Firebase auth panel
7. Simulate inbound email intake with `npm run simulate:inbound-email`
8. Simulate a Postmark-style inbound webhook with `npm run simulate:postmark-inbound`
9. Run an end-to-end invite acceptance flow with `npm run simulate:full-invite-flow`
10. Seed the full local role matrix with `npm run simulate:seed-test-accounts`

Local defaults:

- project id: `entrepreneurship-nexus-local`
- shared test password: `Password123!`
- platform admin: `coach@makehaven.org`
- ecosystem manager: `ecosystem.admin@newhaven.example.org`
- ESO admin: `eso.admin@makehaven.org`
- ESO staff: `eso.staff@makehaven.org`
- ESO coach: `eso.coach@makehaven.org`
- partner ESO admin: `eso.admin@ctinnovations.org`
- entrepreneur: `founder@darkstarmarine.com`

## Firebase Deployment

Before a real deploy:

1. Create non-local Firebase projects for staging and production.
2. Update `.firebaserc` aliases if your actual project ids differ from:
   - `staging` => `entrepreneurship-nexus-staging`
   - `prod` => `entrepreneurship-nexus`
3. Create a Firebase Web App and fill the `VITE_FIREBASE_*` values in your deployment environment.
4. Set `VITE_DEMO_MODE=false` and `VITE_USE_FIREBASE_EMULATORS=false` in the hosted frontend environment.
5. Set Functions runtime env values for:
   - `APP_BASE_URL`
   - `POSTMARK_INBOUND_WEBHOOK_SECRET`
   - `POSTMARK_INBOUND_ALLOWED_RECIPIENTS`
   - `POSTMARK_SERVER_TOKEN`
   - `POSTMARK_FROM_EMAIL`
   - `POSTMARK_MESSAGE_STREAM`
6. Confirm your inbound Firestore route in `inbound_routes` matches the Postmark recipient you will use.

This repo now includes Firebase Hosting config for the Vite SPA in `firebase.json`.

Deploy flow:

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Notes:

- `createTestAccount`, `seedLocalReferenceData`, and `processInboundEmail` are now blocked outside local or explicitly enabled environments.
- `postmarkInboundWebhook` remains public by design, but requires the configured shared secret.
- `sendQueuedNotices` is still manual/admin-triggered. Outbound mail is not scheduled automatically yet.

## GitHub Environments

This repo now supports separate Hosting deploy targets through GitHub Environments.

- `main` branch => GitHub environment `production`
- `staging` branch => GitHub environment `staging`

Use the same secret names in both environments, but give them environment-specific values.

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
- `GEMINI_API_KEY` if used

For staging, `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID` should both be `entrepreneurship-nexus-staging`.

## Staging Mail Testing

Use a dedicated Firebase staging project plus a staging-only ecosystem for repeated inbound mail testing.

- Firebase alias: `staging`
- Recommended project id: `entrepreneurship-nexus-staging`
- Staging ecosystem id: `eco_mail_test`
- Recommended inbound route: `mail-test+introduction@inbound.entrepreneurship.nexus`

Seed the staging mail-test fixtures:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging npm run staging:seed-mail-test
```

Clean up staging-generated mail artifacts while keeping the seeded route and organizations:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging npm run staging:cleanup-mail-test
```

Simulate an inbound Postmark webhook against staging:

```bash
FIREBASE_PROJECT_ID=entrepreneurship-nexus-staging \
FIREBASE_FUNCTIONS_BASE_URL=https://us-central1-entrepreneurship-nexus-staging.cloudfunctions.net \
POSTMARK_INBOUND_WEBHOOK_SECRET=YOUR_STAGING_SECRET \
NEXUS_MAIL_TEST_ROUTE_ADDRESS=mail-test+introduction@inbound.entrepreneurship.nexus \
npm run simulate:postmark-inbound
```

Recommended workflow:

1. Deploy Functions and Hosting to `staging`.
2. Bootstrap your staging admin into `eco_mail_test`.
3. Seed the staging mail-test route and organizations.
4. Point a dedicated Postmark inbound stream at the staging webhook URL.
5. Run repeated inbound tests in staging.
6. Periodically run the cleanup script to remove generated draft records, referrals, notices, and intake payloads.

## First Platform Admin

The deployed app currently shows the normal Firebase auth gate. That is expected.

Because invite and approval flows assume an existing admin, the first `platform_admin` must be bootstrapped once. This repo now includes a secret-gated HTTP function for that:

- `bootstrapPlatformAdmin`

Required Functions env:

- `BOOTSTRAP_PLATFORM_ADMIN_SECRET`

Example request after Functions are deployed:

```bash
curl -X POST "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/bootstrapPlatformAdmin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: YOUR_BOOTSTRAP_PLATFORM_ADMIN_SECRET" \
  -d '{
    "email": "you@example.com",
    "password": "CHOOSE_A_STRONG_PASSWORD",
    "first_name": "Your",
    "last_name": "Name",
    "ecosystem_id": "eco_new_haven",
    "organization_id": ""
  }'
```

Behavior:

- works only when no `platform_admin` exists yet
- creates the Firebase Auth user if needed
- creates the `people` record
- creates an active `person_memberships` record with role `platform_admin`

After this succeeds:

1. sign in through the deployed app
2. verify admin access works
3. rotate or remove `BOOTSTRAP_PLATFORM_ADMIN_SECRET`

## GitHub Auto Deploy

This repo now includes GitHub Actions to mirror the Boat Club flow:

- push to `main` deploys Firebase Hosting live
- pull requests deploy a Firebase Hosting preview channel

The workflows are:

- [.github/workflows/firebase-hosting-merge.yml](/mnt/extra_storage/makehaven-webdev/Entrepreneurship-Nexus/.github/workflows/firebase-hosting-merge.yml)
- [.github/workflows/firebase-hosting-pull-request.yml](/mnt/extra_storage/makehaven-webdev/Entrepreneurship-Nexus/.github/workflows/firebase-hosting-pull-request.yml)

Required GitHub repository secrets:

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
- `GEMINI_API_KEY` if you want Gemini-enabled frontend builds

Recommended setup notes:

- Keep Functions deploy manual until auth, mail, and production data flows are stable.
- Keep Postmark secrets out of GitHub Actions build env unless you later add a Functions deploy workflow.
- Firebase web config is safe to expose to the client, but GitHub Secrets still give you a cleaner deployment workflow.
- If you later add Capacitor, reuse the same build-time env model for `npm run build` before `npx cap sync`.

## 📘 Planning Notes

* [BCC Introduction Intake Plan](docs/bcc-introduction-intake-plan.md)
* [Firebase Architecture Draft](docs/firebase-architecture-draft.md)
* [Onboarding And Role Model](docs/onboarding-and-role-model.md)
* [MVP ESO Experience](docs/mvp-eso-experience.md)
* [Postmark Integration](docs/postmark-integration.md)

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE.md).
