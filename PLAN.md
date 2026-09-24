# Entrepreneurship Nexus — Roadmap

**Status as of 2026-08-27.** This file describes what is actually built today
and what comes next. Prior versions of this document described a v0.9
in-memory prototype and were badly out of date; treat this as the single
current roadmap and update it when the picture changes.

## Thesis

Entrepreneurship Nexus is a shared **data and coordination layer** for a
regional entrepreneurial ecosystem — not another CRM. The differentiator is
the interoperability compact: shared field standards, a referral loop with
acknowledgement and follow-up ownership, consent-gated visibility, identity
linking via OIDC, and an idempotent partner API so records converge across
organizations instead of being re-entered by hand.

The partner API is the most mature and most distinctive part of the system.
Everything else should be judged by whether it strengthens that.

## Architecture (current, not aspirational)

- **Frontend:** React 19 + TypeScript + Vite. Query-string routing in
  `src/app/App.tsx` (no router library). Tailwind via the Play CDN.
- **Data access:** repository pattern (`src/data/repos/`). `AppRepos` picks a
  Firestore-backed or in-memory implementation per repo based on
  `isFirebaseEnabled() && !CONFIG.IS_DEMO_MODE`.
- **Domain layer:** `src/domain/` — pure, dependency-free, and where the test
  coverage lives (access policy, redaction, role/capability map, referral
  transitions, nav access).
- **Backend:** Firebase Cloud Functions (`functions/src/`) — ~50 HTTP
  endpoints, callables, and Firestore triggers. `index.ts` is a monolith and
  is a known refactor target.
- **AI:** Google Gemini for grant extraction, ESO profile generation, calendar
  classification, and the advisor experiments.

## Feature status

| Area | Status |
|---|---|
| Partner API, webhooks, OIDC federation | **Mature** — scoped API keys, HMAC-signed webhooks, tiered redaction, dedup |
| Referrals (incl. email intake + one-click actions) | **Mature** — lifecycle centralized in `src/domain/referrals/transitions.ts` |
| Inbound email intake (Postmark/BCC) | **Mature** — dual idempotency, well-tested parsers |
| Directory, people, organizations, consent | **Mature** |
| Invites / onboarding / roles | **Mostly built** |
| Community calendar | **Built, unproven in production** |
| Ecosystem config & tenancy | **Firestore-backed** as of Aug 2026 (was hardcoded) |
| SSO (MakeHaven/Drupal) | **Half-built** — works via `/sso/<providerId>` deep link; no provider buttons on the login page |
| Grants / collaborative grant lab | **Half-built** — discovery works; drafting is partly simulated |
| Metrics & impact reporting | **Demo-only** ⚠️ — `MetricsRepo` / `FlexibleMetricsRepo` still read mock data and localStorage |
| Tasks (todos) | **Demo-only** ⚠️ |
| AI advisor | **Demo-only** ⚠️ — localStorage-backed |
| Venture Scout | **Stub** |
| Ecosystem analytics / Kumu | **Doc-only** — see `docs/ecosystem-analytics-dashboard-plan.md`, not started |
| Node-to-node federation (peering) | **Doc-only** — see `docs/self-hosting.md` |

## Access & privacy model

Roles: `platform_admin`, `ecosystem_manager`, `eso_admin`, `eso_staff`,
`eso_coach`, `entrepreneur`. The authority is `people/{id}.system_role` plus
the `person_memberships` collection. Firebase custom claims are written but
not currently read by rules — either wire them up or remove them.

**Enforcement split (important):**

- **Enforced server-side (firestore.rules, tested in
  `src/test/firestore.rules.test.ts`):** cross-ecosystem tenancy on
  interactions, referrals, initiatives, and grants; interaction authorship
  integrity; person self-escalation; ecosystem config writes.
- **Still client-side only:** within an ecosystem, `eso_private` /
  `note_confidential` filtering and consent-gated operational detail
  (`src/domain/access/policy.ts`). Closing this needs either per-party
  queries or a redacting Cloud Function read path.

Rules read `people/{id}.ecosystem_ids`, a denormalized array kept in sync from
`person_memberships` by the `syncPersonEcosystems` trigger — rules can `get()`
a document but cannot query a collection.

## Next priorities

1. **Finish the privacy model.** Move within-ecosystem interaction visibility
   (`eso_private`, `note_confidential`, consent) behind rules or a redacting
   read path. This is the last big gap between what the product promises and
   what it enforces.
2. **Make metrics real.** `MetricsRepo` and `FlexibleMetricsRepo` are the
   funder-facing story and currently report on mock data. Needs a Firestore
   schema, rules, and conversion of the synchronous call sites.
3. **Login-page SSO providers.** Render buttons from `oidcGetProviders` so
   "Sign in with [ESO]" is true without a deep link.
4. **Separate demo and production deploy targets.** `firebase.json` points the
   `demo` and `prod` hosting targets at the same `dist` directory, so which
   build lands where depends on shell env at deploy time. Also ensure
   `ALLOW_LOCAL_ONLY_FUNCTIONS` can never be true in a production project.
5. **Decompose `functions/src/index.ts`** into `shared/`, `email/`, `inbound/`,
   `invites/`, `consent/`, `seed/`.
6. **Decide on scope.** Calendar, grant drafting, Venture Scout, todos, and
   the AI advisor are adjacent products competing for attention with the
   federation compact. Either back them properly or label them clearly as
   experiments.

## Testing

```bash
npm run typecheck            # tsc --noEmit (also runs as part of npm run build)
npm test                     # vitest unit tests
npm run test:rules:emulated   # Firestore rules tests (starts the emulator)
npm run test:e2e             # Playwright
npm --prefix functions test           # pure unit tests
npm --prefix functions run test:emulator  # emulator-backed integration tests
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, the functions
build and tests, and the rules tests on every push and PR.
