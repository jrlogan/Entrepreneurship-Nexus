# CLAUDE.md

Guidance for AI assistants working in this repository. This is the canonical
agent-context file — `GEMINI.md` points here.

## Project overview

Entrepreneurship Nexus is a shared data and coordination layer for regional
entrepreneurial ecosystems: founders, entrepreneur support organizations
(ESOs), funders, and ecosystem administrators. The distinctive part is the
interoperability compact (shared field standards, referral loop, consent-gated
visibility, OIDC identity linking, idempotent partner API) — not the CRM-style
screens around it.

React 19 + Vite + TypeScript frontend, Firebase backend (Auth, Firestore,
Storage, Cloud Functions), Google Gemini for AI features.

See `PLAN.md` for current feature status and priorities — it is kept accurate
and is the best starting point for "what actually exists".

## Layout

- `src/app/` — shell, query-string routing, `AuthProvider`, config
- `src/domain/` — pure business logic, types, access policy. **Most tests live
  here; put new logic here rather than in components.**
- `src/data/repos/` — repository pattern; each repo has an in-memory and a
  Firestore implementation selected by `AppRepos`
- `src/features/` — feature modules (referrals, directory, calendar, admin, …)
- `src/services/` — Firebase/Gemini clients
- `functions/src/` — Cloud Functions (`index.ts` is a monolith; prefer adding
  new surfaces as separate modules)

## Conventions

- **Go through the repos.** Components should use `AppRepos` via
  `useRepos()` rather than calling Firestore directly.
- **Domain logic is pure and tested.** Access control, redaction, referral
  transitions, and nav gating all live in `src/domain/` as pure functions with
  unit tests. Don't fork this logic into components — several of these were
  previously duplicated by hand and drifted.
- **Type checking is enforced.** `npm run build` runs `tsc --noEmit` first and
  CI runs `npm run typecheck`. Don't introduce `any` to get past an error.
- **Security rules are tested.** Changes to `firestore.rules` must keep
  `npm run test:rules:emulated` green; add a case when you change access.
- Ecosystem tenancy in rules reads `people/{id}.ecosystem_ids`, denormalized
  from `person_memberships` by the `syncPersonEcosystems` trigger. If you add
  a membership write path, that trigger keeps it in sync — don't hand-roll it.

## Visual style

Before adding visible UI, read `/mnt/extra_storage/makehaven-webdev/STYLE.md`.
The canonical MakeHaven brand color is **red `#8b1919`**, with display headings
in Roboto Condensed and body in Montserrat.

This app uses the Tailwind Play CDN (`<script src="https://cdn.tailwindcss.com">`
in `index.html`), so there is no `tailwind.config.js` and brand tokens aren't
compiled in. For new branded UI, prefer one of:

1. Use the brand hex via Tailwind's arbitrary-value syntax — `bg-[#8b1919]`,
   `text-[#8b1919]`, `hover:bg-[#710a0a]` — reserved for true brand moments.
2. Or, if/when this app moves to a real Vite + Tailwind setup, port the brand
   `extend` block from `STYLE.md` §3C and switch to `bg-makehaven` etc.

Don't introduce another component library without explicit user sign-off.

## Commands

```bash
npm run dev                  # Vite dev server (port 3000)
npm run typecheck            # tsc --noEmit
npm test                     # vitest unit tests
npm run test:rules:emulated  # Firestore rules tests (boots the emulator)
npm run local:start          # full local env: emulators + Vite
npm --prefix functions test  # Cloud Functions unit tests
```
