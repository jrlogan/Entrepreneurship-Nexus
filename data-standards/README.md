# Data standard

Published, versioned definitions of the shared vocabulary partners map onto.

| Version | Status | Contents |
|---|---|---|
| **v1.1** | **current** | 17 controlled vocabularies · 6 entities · 57 fields |
| v1.0 | superseded | 10 vocabularies, hand-extracted; drifted from the app (see below) |

**Use v1.1.** It is generated directly from the running application's
definitions, so the published standard and the code cannot disagree:

```bash
node scripts/generate-data-standard.mjs          # regenerate
node scripts/generate-data-standard.mjs --check  # fail if stale (CI)
```

Source of truth: `src/domain/standards/enums.ts` (vocabularies) and
`src/domain/standards/dictionary.ts` (entities and fields).

## What changed in v1.1

v1.0 was transcribed by hand and fell behind. v1.1 adds `OrganizationType`,
`OwnerCharacteristic`, `OrgCertification`, `SupportNeed`, `VentureStage`,
`ReferralOutcome`, `OperationalVisibility`, and `ServiceParticipationType`;
expands `MetricType` (adds `capital_raised`, `grant_funding`, `patents_filed`,
`customer_count`) and `MetricSource` (adds `interaction_log`); and corrects
`OrganizationRole` to `eso · funder · resource` (v1.0 incorrectly listed
`startup`, which is an *organization type*, not an ecosystem role).

v1.0 is left in place so existing references resolve. Nothing reads it.

## How to use it

The vocabularies are deliberately **generous, not minimal**. Map your own
terms onto them once; keep your own vocabulary internally; send only what you
can map. Fields you don't collect are simply absent — no organization is
obliged to collect anything to participate.

Adding to the standard is a versioned, explicit act (v1.1 → v1.2), and old
integrations keep working.
