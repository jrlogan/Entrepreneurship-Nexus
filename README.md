
# Entrepreneurship Nexus

Entrepreneurship Nexus is an open-source platform for coordinating regional entrepreneurial ecosystems across founders, entrepreneur support organizations, funders, and ecosystem administrators.

It is intended for ecosystem operators and higher-level conveners, such as foundations, state agencies, regional economic development groups, and backbone organizations, that support multiple programs or ecosystems and need a shared data layer.

The project combines role-specific workflows with API-first interoperability so data can move between systems instead of being repeatedly entered by hand. It is designed to connect with partner CRMs, intake tools, reporting systems, email workflows, and other ecosystem infrastructure while preserving appropriate privacy and access boundaries.

## Project Status

This repository is under active development. The current app supports:

- Demo-mode workflows using in-memory data
- Firebase-backed local development with Auth, Firestore, Functions, and Storage emulators
- Early deployment support for Firebase Hosting and Cloud Functions
- Postmark-style inbound email intake for referral workflows
- Partner API planning and OpenAPI documentation

Some areas are still evolving, especially production deployment automation, partner integrations, and long-term reporting workflows.

## Who It Is For

Entrepreneurship Nexus is built for organizations that coordinate across many support providers, not just a single program. Typical users and sponsors include:

- Regional entrepreneurship ecosystem conveners
- Foundations funding multiple entrepreneur support programs
- State or municipal agencies tracking business support outcomes
- University, workforce, or economic development networks
- Backbone organizations that need shared referrals, metrics, and reporting

The value proposition is a shared operational and data layer: reduce duplicate data entry, improve referral visibility, support cross-organization reporting, and make it easier for existing systems to interoperate through APIs and automation.

## Core Features

- Ecosystem organization and contact directory
- Role-based access for platform admins, ecosystem managers, ESO staff, and entrepreneurs
- Founder portal for ventures, initiatives, actions, and ecosystem resources
- Structured referral and introduction workflows
- Inbound email intake for referrals and manual review
- Interaction logging with network-shared and ESO-private visibility
- Data quality tools for duplicate detection and record cleanup
- Metrics and reporting foundations for ecosystem impact tracking
- AI-assisted advising and summarization experiments
- Partner API and webhook design for external systems
- Automation-oriented integration patterns that reduce manual data entry

## Tech Stack

- React 19, TypeScript, and Vite
- Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions
- Firebase Emulator Suite for local integration work
- Vitest, Node test runner, and Playwright
- Google Gemini integrations through Google GenAI SDKs
- Data model concepts aligned with Human Services Data Specification (HSDS)

## Quickstart

Install dependencies and run the app in demo mode:

```bash
npm install
cp .env.example .env
npm run dev
```

By default, `.env.example` enables demo mode. Demo mode is the easiest way to inspect the frontend without configuring Firebase.

For Firebase-backed local development, see [Local Development](docs/local-development.md).

## Common Commands

```bash
npm run dev
npm run build
npm run test
npm run test:e2e
npm run preview
```

Firebase Functions have their own package and tests:

```bash
npm --prefix functions install
npm --prefix functions run build
npm --prefix functions test
```

## Documentation

- [Local Development](docs/local-development.md)
- [Firebase Deployment](docs/firebase-deployment.md)
- [Email Intake Testing](docs/email-intake-testing.md)
- [First Platform Admin Bootstrap](docs/first-admin-bootstrap.md)
- [Postmark Integration](docs/postmark-integration.md)
- [Firebase Architecture Draft](docs/firebase-architecture-draft.md)
- [Onboarding and Role Model](docs/onboarding-and-role-model.md)
- [MVP ESO Experience](docs/mvp-eso-experience.md)
- [BCC Introduction Intake Plan](docs/bcc-introduction-intake-plan.md)
- [Partner API Playbook](docs/partner-api/PLAYBOOK.md)
- [Partner API OpenAPI Spec](docs/partner-api/openapi.yaml)

## Environment Configuration

Public configuration templates are committed as:

- [.env.example](.env.example)
- [functions/.env.example](functions/.env.example)

Do not commit real environment files. The repository ignores `.env`, `.env.*`, `functions/.env`, and `functions/.env.*`.

Before publishing or deploying from a fork, review your git history for secrets and rotate any credentials that may have been committed previously.

## Deployment

The repository includes Firebase Hosting and Functions configuration. Deployment requires your own Firebase projects, environment values, and service account setup.

Start with [Firebase Deployment](docs/firebase-deployment.md).

## Contributing

This project is still changing quickly. Before opening a large pull request, start with an issue or discussion that describes the workflow, data model change, or integration you want to add.

For code changes:

- Keep changes scoped to one feature or fix
- Add or update tests for behavior changes
- Avoid committing generated build output, local emulator data, or environment files
- Run the relevant tests before submitting

## Security

Do not open public issues that include credentials, personal data, webhook secrets, service account JSON, or production Firebase project details.

If you find a security issue, report it privately to the maintainers before publishing details.

## License

This project is open source and available under the [MIT License](LICENSE.md).
