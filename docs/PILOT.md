# The partner pilot

How a handful of partner organizations join the network, connect their own
systems, and start working together — and what was set aside to keep the MVP
small enough to review.

## Running the pilot

**Operator (network administrator)**

1. Create the network (ecosystem) and your operator account — see
   [first-admin-bootstrap.md](first-admin-bootstrap.md).
2. In **Partners**, invite each partner: organization name, website, and the
   contact who will be its admin. This creates the organization and emails the
   contact an invitation (the link is also shown to copy).
3. Watch **Partners** for who has signed. A partner that has not signed sees
   only its own records and cannot get an API key.

**Each partner's admin**

1. Accept the invitation and sign in.
2. **Joining** walks through the three agreements for the network: the
   Network Membership terms, the Network Compact (what its entrepreneurs are
   told), and the Data Access & Responsibility Agreement. Signing takes about
   ten minutes of reading.
3. **Connect Your System** shows where they stand, their identifiers, the
   consent block for their signup form, and the **integration brief** — the
   complete contract with their identifiers filled in, written so a developer
   or an AI coding assistant can follow it directly.
4. **API Keys & Webhooks**: create the key for their system.

**Each partner's developer (or AI assistant)** follows the brief:

1. Send people when the partner starts working with them
   (`partnerUpsertPerson`), with the entrepreneur's consent answers when given.
2. Send program participation (`partnerUpsertParticipation`).
3. Put the consent block in the signup form.
4. Send, receive and answer referrals (`partnerCreateReferral`,
   `partnerListReferrals` or webhooks, `partnerUpdateReferral`).
5. Optionally, record activity (`partnerLogActivity`).

Staff at partners that have not integrated yet can still use the app directly
(log activity, make and answer referrals) or refer by email (BCC intake).

## Testing without emailing real people

On a staging or sandbox project, set `POSTMARK_SAFE_MODE_REDIRECT` in the
functions config to a shared test inbox. Every message the network sends —
invites, referral notices, consent notices — goes there instead of to the
address on the record, with the intended recipient in the subject line. With
no Postmark token at all, nothing is sent and the flows still complete (the
Partners page shows invite links to copy; `consent_notice_sent` comes back
`false`).

## Where to see it

- **Referrals** — the inbox of referrals to and from your organization.
- **People / Organizations** — the entrepreneurs and ventures you work with,
  plus anyone listed in the directory, with the facts of partners' activity.
- **Reports → Network statistics** — what the partners achieve together.
- `/consent?demo=1` — what entrepreneurs see on the consent page.
- The demo build (`npm run build:demo`) runs everything on sample data with the
  same privacy policy as production.

## What was set aside

`main` was trimmed on 2026-09-24. Everything removed is on the
`archive/full-prototype` branch (tag `v0-full-prototype`), intact and
runnable:

| Module | Why it is out of the MVP |
|---|---|
| Community calendar | An adjacent product; not part of the compact |
| Grant Lab (discovery, drafting) | Adjacent product; depended on Gemini |
| Tasks & AI advisor | Demo-only (localStorage), depended on Gemini |
| Venture Scout | Stub |
| Initiatives & pipelines | Venture progress tracking; participation covers what partners share |
| Metrics manager & economic-impact reports | Ran on mock data; replaced by real network statistics |
| AI profile generation, voice dictation | Gemini dependency with no pilot need |

To bring one back, open a pull request that ports it from the archive branch
as its own module, and have the group agree it belongs:

```bash
git checkout -b feature/<module> main
git checkout archive/full-prototype -- src/features/<module>   # then wire it in
```

Anything that reads other organizations' data must go through the network
view (`src/data/networkView.ts`) and the privacy policy — see
[PRIVACY_MODEL.md](PRIVACY_MODEL.md).
