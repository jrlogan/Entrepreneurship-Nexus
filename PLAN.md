# Entrepreneurship Nexus — Roadmap

**Status as of 2026-09-24.** `main` is the **partner pilot MVP**: the
interoperability core that a group of about five partner organizations can
join, connect their own systems to, and use to refer entrepreneurs, see each
other's program participation and activity, and report together. The fuller
prototype it was cut from is preserved on the `archive/full-prototype` branch
(tag `v0-full-prototype`); see [docs/PILOT.md](docs/PILOT.md) for what moved
there and how to bring pieces back.

## Thesis

Entrepreneurship Nexus is a shared **data and coordination layer** for a
regional entrepreneurial ecosystem — not another CRM. Each organization keeps
its own software and records and agrees to a small shared compact: common
fields, a referral loop that closes, consent the entrepreneur controls, and a
way to recognize the same person across systems.

## What the MVP does

| Area | Status |
|---|---|
| **Partner onboarding** — operator invites a partner; its admin signs the membership terms, compact and data-usage agreement; the Connect Your System page and integration brief take it from there | Built |
| **Partner API** — people, organizations, participation, referrals (create / answer / list), activity, webhooks; idempotent on each partner's own record IDs | Built |
| **Founder consent** — embeddable consent block for partners' signup forms, hosted consent page, consent email, founder privacy settings; terms versioned and hashed | Built |
| **Privacy model** — always / only-with-consent / never, enforced server-side (`getNetworkView` + Firestore rules). See [docs/PRIVACY_MODEL.md](docs/PRIVACY_MODEL.md) | Built |
| **Referrals** — UI, email intake, one-click email actions, partner API | Mature |
| **Directory, people, activity, participation views** | Built on the network view |
| **Network statistics** — entrepreneurs served (deduplicated), collaboration, referral follow-through, participation, per partner; publication view and CSV | Built |
| **Identity** — OIDC federation ("Sign in with [partner]"), dedup and reversible merge | Mature; login-page provider buttons still missing |

## Architecture

- **Frontend:** React 19 + TypeScript + Vite, query-string routing in
  `src/app/App.tsx`, Tailwind via the Play CDN.
- **Reads:** every cross-organization read goes through the network view
  (`src/data/networkView.ts` → `getNetworkView`). Demo mode runs the same
  policy over sample data.
- **Shared pure modules** live in `functions/src/` and are imported by the web
  app too, so server and UI cannot drift: the privacy policy, agreement text,
  consent terms, referral lifecycle, network statistics.
- **Backend:** Firebase Cloud Functions. `functions/src/index.ts` is still a
  monolith; new surfaces are separate modules (`privacy/`, `consent/`,
  `agreements/`, `metrics/`, `referrals/`).

## Before the pilot starts

1. **Deploy to the pilot project** (functions, rules, indexes, hosting) and
   create the network (ecosystem) and the operator account
   ([docs/first-admin-bootstrap.md](docs/first-admin-bootstrap.md)).
2. **Smoke-test against the deployed project.** The new queries are
   single-field or equality-only, which Firestore serves without composite
   indexes; if one reports a missing index, the error includes the link to
   create it.
3. **Consortium review of the pilot agreement text** (versions `0.2-pilot`,
   privacy notice `1.1-pilot`). The founder-facing text was aligned with the
   privacy model in the deck; the group should confirm it.
4. **Decide the open questions** on the deck's list that the pilot touches:
   who operates the node, whether founders see notes written about them.

## Next, once partners are connected

1. **Email notices for API referrals.** Referrals created through the partner
   API notify the receiver by webhook and in-app; they do not yet send the
   intake email that email-intake referrals do.
2. **Login-page SSO providers** from `oidcGetProviders`.
3. **Scale the network view** beyond a pilot (pagination or precomputed
   per-organization views).
4. **Decompose `functions/src/index.ts`.**
5. **Bring back optional modules** from the archive only if the pilot asks for
   them.

## Testing

```bash
npm run typecheck                          # tsc --noEmit (also part of npm run build)
npm test                                   # vitest unit tests
npm run test:rules:emulated                # Firestore rules tests (boots the emulator)
npm --prefix functions test                # functions unit tests (policy, consent, stats…)
npm --prefix functions run test:emulator   # partner API integration tests (emulators)
npm run docs:integration-brief             # regenerate docs/partner-api/INTEGRATION_BRIEF.md
```

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, the functions build
and tests, and the rules tests on every push and PR.
