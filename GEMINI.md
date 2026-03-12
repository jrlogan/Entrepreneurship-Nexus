# Gemini Project Context: Entrepreneurship Nexus (EcosystemOS)

A centralized 'System of Systems' for entrepreneurial ecosystems, featuring federated data, HSDS-compliant tracking, and AI-driven longitudinal impact measurement.

## 🚀 Project Overview

*   **Purpose**: Bridges the gap between Entrepreneurs (Founders), Entrepreneur Support Organizations (ESOs), and Funders through a shared data layer.
*   **Core Tech Stack**:
    *   **Frontend**: React 19 (Vite), TypeScript, Tailwind CSS.
    *   **Backend**: Firebase (Authentication, Firestore, Cloud Functions).
    *   **AI Layer**: Google GenAI SDK (Gemini 2.0 Flash/Pro).
    *   **Data Standards**: Human Services Data Specification (HSDS) 3.0.
*   **Architecture**: Repository pattern for data access, allowing for seamless switching between mock data (demo mode) and live Firebase storage.

## 🛠 Building and Running

### Prerequisites
*   Node.js (v18+ recommended)
*   Firebase CLI (`npm install -g firebase-tools`)
*   Google GenAI API Key (for AI features)

### Key Commands
*   `npm install`: Install dependencies.
*   `npm run dev`: Start the Vite development server (defaults to port 3000).
*   `npm run local:start`: Orchestrates a full local development environment including Firebase emulators and the Vite server.
*   `npm run firebase:emulators`: Starts Firebase Auth, Firestore, and Functions emulators.
*   `npm run build`: Build the frontend for production.
*   `npm run build:functions`: Build the Cloud Functions (TypeScript to JS).

### Data Simulation & Seeding
The project includes several scripts to simulate ecosystem activity:
*   `npm run simulate:seed-test-accounts`: Seeds the full local role matrix (Admin, ESO Staff, Founders, etc.).
*   `npm run simulate:seed-local`: Seeds reference data (Organizations, Routes).
*   `npm run simulate:inbound-email`: Simulates an inbound email intake flow.
*   `npm run simulate:full-invite-flow`: Executes a complete invite-to-acceptance flow.

## 🏗 Architecture & Conventions

### Directory Structure
*   `src/app/`: Application shell, routing, `AuthProvider`, and global configuration.
*   `src/data/`: Data access layer. Uses a repository pattern (`AppRepos`) to abstract Firestore/Mock logic.
*   `src/domain/`: Core business logic, TypeScript types, and access control policies (`ViewerContext`).
*   `src/features/`: Functional modules (Dashboard, Directory, Pipelines, Referrals, etc.).
*   `src/services/`: Client initializers for Firebase, Gemini, and other external services.
*   `functions/`: Firebase Cloud Functions for privileged operations (Intake, Invites, Admin).
*   `scripts/`: Automation for local development and testing.

### Development Patterns
*   **Repository Pattern**: Components should interact with data through `AppRepos` (available via `AppDataContext`) rather than direct Firestore calls.
*   **Role-Based Access Control (RBAC)**: Access is governed by `system_role` (e.g., `platform_admin`, `eso_admin`, `entrepreneur`) and `ViewerContext`.
*   **Dual-Role Support**: The system supports users who hold multiple memberships (e.g., being an ESO staff member in one ecosystem and a Founder in another).
*   **HSDS Compliance**: Data models for organizations and services follow the Human Services Data Specification.

### AI Integration
*   The **AI Advisor** uses Gemini to generate context-aware advice.
*   **Voice Interface**: Supports voice-to-action and TTS for advisor interactions.
*   **Structured Output**: AI suggestions are designed to be converted into structured database records (Tasks, Referrals) with minimal friction.

## 📘 Documentation
Detailed planning and architectural notes can be found in the `docs/` directory:
*   `docs/firebase-architecture-draft.md`: Detailed plan for Firebase integration.
*   `docs/onboarding-and-role-model.md`: Explanation of the multi-ecosystem role system.
*   `docs/bcc-introduction-intake-plan.md`: Strategy for email-based referral intake.
