
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

## 📘 Planning Notes

* [BCC Introduction Intake Plan](docs/bcc-introduction-intake-plan.md)
* [Firebase Architecture Draft](docs/firebase-architecture-draft.md)
* [Onboarding And Role Model](docs/onboarding-and-role-model.md)
* [MVP ESO Experience](docs/mvp-eso-experience.md)
* [Postmark Integration](docs/postmark-integration.md)

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE.md).
