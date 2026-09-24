# The privacy model, and where it is enforced

This is the model presented to the consortium ("The Federated Compact" deck),
and what the code does to keep it. Partners agree to it when they sign the
network agreements; entrepreneurs agree to it on the consent terms.

## The model

| | What | Who sees it |
|---|---|---|
| **Always shared** | Name and email; each organization's own records with the entrepreneur; the *fact* of each other's activity — which partner, what kind (meeting, program, referral), when, status | Staff at organizations that actually work with the entrepreneur |
| **Only with consent** | Listing in the network directory | Partners who do *not* already work with them |
| | Details of another organization's records — program names, descriptions, referral outcomes | Partners who work with them, if the entrepreneur shares with all of them or with that partner |
| **Never shared** | Interaction notes; referral notes outside the two parties; financials; each organization's internal record IDs (`external_refs`) | Only the organization that wrote them |

Consent choices are **off by default**, **per network**, and **revocable**.
An organization "works with" an entrepreneur when it has itself recorded
something about them: a participation it provides, a referral it sent or
received (a declined referral does not count for the receiver), an activity it
logged, a record it pushed through the API, or a venture it manages. Working
with a venture counts as working with its founders, and vice versa.

Operators (ecosystem managers, platform admins) see the facts across the
network, to run it and produce statistics — never details or notes.

An organization that has **not signed** the network agreements sees only its
own records and gets no API key.

Entrepreneurs see everything about themselves except staff notes. Whether
founders should see notes written about them is an open question for the
consortium (it is on the deck's discussion list).

## Where it is enforced

| Layer | File | What it does |
|---|---|---|
| The policy | `functions/src/privacy/policy.ts` | One pure function, `buildNetworkView(viewer, data)`, decides what each viewer sees and at which tier (`full` / `detail` / `fact`). Tested in `policy.test.ts`. |
| The read path | `functions/src/privacy/networkView.ts` (`getNetworkView`) | Loads a network with the Admin SDK, resolves the viewer from server-side records (role, organization, whether it signed), and returns only the policy's output. |
| The rules | `firestore.rules` | Interactions, referrals and participations are readable directly only by the organization that owns them; ventures only by their people and managing ESOs; directory profiles and consent records only by their parties. Nobody — operators included — can read another organization's notes with the raw SDK. Tested in `src/test/firestore.rules.test.ts`. |
| The app | `src/data/networkView.ts` | Every repo's cross-organization read goes through the network view. The demo applies the *same* policy function to sample data. |
| Partner API | `functions/src/partnerApi.ts` | Partners resolve only their own record IDs (lookups fail closed); webhook payloads never carry notes (`payloadRedaction.ts`); referrals require `entrepreneur_agreed`. |
| Statistics | `functions/src/metrics/networkStats.ts` | Computed over everything, but only counts leave. A publication view hides counts under five. |

## Consent, end to end

- **Terms**: `functions/src/consent/terms.ts` builds the summary, choices and
  full documents from the canonical agreement text
  (`functions/src/agreements/content.ts`) with a `terms_hash`. Consent is
  always recorded against a hash, so it is clear which words were accepted.
- **Collected** in a partner's own signup form (the embeddable block
  `public/embed/nexus-consent.js`, or `getConsentTerms`), on the hosted page
  (`/consent?token=`, from `partnerCreateConsentLink` or the consent email), or
  in the founder's own privacy settings in the app.
- **Recorded** by `functions/src/consent/recordConsent.ts`: agreement
  acceptances with version and hash, the directory and detail-sharing choices
  on `network_profiles/{personId}`, and an audit trail.
- A GET never records consent (email scanners follow links). Signing in with a
  partner's account (SSO) is not consent.

## Known limits

- Support organizations' own documents (ESOs, funders) are readable by any
  member, including any record IDs other partners attached to them. They
  describe organizations, not entrepreneurs.
- Referrals that arrive by email (BCC intake) are reviewed in Inbound Intake,
  so the operators doing that review see those emails, including the
  introduction text.
- The network view loads a whole network per request. Fine for a pilot of a
  handful of partners; it will need pagination or precomputed views at scale.
- Founders pushed by a partner, who later create their own account, may be
  asked to accept the terms again at first sign-in.
