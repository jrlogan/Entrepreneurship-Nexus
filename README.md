
# Entrepreneurship Nexus

<p>
  <a href="https://demo.entrepreneurship.nexus">
    <img alt="Open live demo" src="https://img.shields.io/badge/Open%20Live%20Demo-demo.entrepreneurship.nexus-0f766e?style=for-the-badge">
  </a>
</p>

Entrepreneurship Nexus is an open-source platform for coordinating regional entrepreneurial ecosystems across founders, entrepreneur support organizations, funders, and ecosystem administrators.

It is intended for ecosystem operators and higher-level conveners, such as foundations, state agencies, regional economic development groups, and backbone organizations, that support multiple programs or ecosystems and need a shared data layer.

The project combines role-specific workflows with API-first interoperability so data can move between systems instead of being repeatedly entered by hand. It is designed to connect with partner CRMs, intake tools, reporting systems, email workflows, and other ecosystem infrastructure while preserving appropriate privacy and access boundaries.

## Project Status

`main` is the **partner pilot MVP**: the interoperability core for a small group
of partner organizations (around five) to join a network, connect their own
systems, and coordinate. It supports:

- **Partner onboarding** — invite a partner, have its admin sign the network
  agreements, then hand its developer (or AI coding assistant) a complete,
  pre-filled integration brief
- **Partner API** — people, organizations, program participation, referrals
  (send, answer, list), activity, webhooks; idempotent on each partner's own IDs
- **Founder consent** — an embeddable consent block for partners' own signup
  forms, a hosted consent page, and founder privacy settings, all against
  versioned, hashed terms
- **A privacy model enforced server-side** — always shared / only with consent /
  never shared, see [docs/PRIVACY_MODEL.md](docs/PRIVACY_MODEL.md)
- **Referrals** across the UI, email intake and the API
- **Network statistics** — entrepreneurs served (counted once), collaboration,
  referral follow-through, participation — anonymous and aggregate

The fuller exploratory prototype (community calendar, grant lab, AI advisor,
initiatives and more) is preserved on the `archive/full-prototype` branch. See
[docs/PILOT.md](docs/PILOT.md) for how the pilot runs and what was set aside.

## Who It Is For

Entrepreneurship Nexus is built for organizations that coordinate across many support providers, not just a single program. Typical users and sponsors include:

- Regional entrepreneurship ecosystem conveners
- Foundations funding multiple entrepreneur support programs
- State or municipal agencies tracking business support outcomes
- University, workforce, or economic development networks
- Backbone organizations that need shared referrals, metrics, and reporting

The value proposition is a shared operational and data layer: reduce duplicate data entry, improve referral visibility, support cross-organization reporting, and make it easier for existing systems to interoperate through APIs and automation.

## Tech Stack

- React 19, TypeScript, and Vite
- Firebase Auth, Firestore, Storage, Hosting, and Cloud Functions
- Firebase Emulator Suite for local integration work
- Vitest, Node test runner, and Playwright
- Data model concepts aligned with Human Services Data Specification (HSDS)

## Quickstart

Want to inspect the app before running it locally? Open the [live demo](https://demo.entrepreneurship.nexus).

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
- [The Partner Pilot](docs/PILOT.md)
- [Privacy Model](docs/PRIVACY_MODEL.md)
- [Partner Integration Brief](docs/partner-api/INTEGRATION_BRIEF.md)
- [Partner API OpenAPI Spec](docs/partner-api/openapi.yaml)
- [Partner API Playbook](docs/partner-api/PLAYBOOK.md)

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
