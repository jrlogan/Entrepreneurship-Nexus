# Ecosystem Analytics & Dashboard Plan

This document defines the Nexus Ecosystem Analytics service: how to compute
collaboration strength, organizational capability, and venture support levels
from real behavioral data, and how to export that as a live Kumu network map.

---

## What the Survey Told Us (Reference Only)

We previously ran a partner survey to understand the ecosystem. It asked:

1. **Service areas** — which of 6 "Ready" stages each org supports
   (Business Concept, Product, Formation, Capital, Sales, Operations),
   rated None / Ad-hoc / Established / Core for specific activities.
2. **Operational scale** — entrepreneurs served, staff, budget.
3. **Partnership strength** — self-reported 0–5 score for each org pair:
   None → Aware → Interacting → Coordinated → Collaborative → Strategic Partner.

The survey gave us a point-in-time snapshot. The goal now is to derive the same
answers — and better ones — continuously from actual activity in the system.

- Survey dimension 1 (service areas) → replaced by `Organization.support_offerings`
  and `Service.participation_type` from real program enrollment data.
- Survey dimension 2 (operational scale) → partially replaced by interaction and
  referral volume counts.
- Survey dimension 3 (partnership strength) → replaced by a behavioral score
  computed from referral flow and co-service patterns. See scoring model below.

No survey data is imported. The survey is a reference for what questions to answer,
not a seed dataset.

---

## Schema: All Analytics Derived from Existing Fields

No new fields are needed on `Interaction`, `Referral`, `Organization`, or `Service`.

| What we want to know | Source field(s) |
|---|---|
| ESO-ESO referral strength | `Referral.referring_org_id`, `receiving_org_id`, `status` |
| ESO-ESO co-service detection | Two ESOs sharing the same `Interaction.organization_id` |
| ESO capability profile | `Organization.support_offerings: SupportNeed[]` |
| ESO engagement style | `Interaction.type` frequency per `author_org_id` |
| ESO program formality | `Service.participation_type` per `provider_org_id` |
| Venture support breadth | Distinct `Interaction.author_org_id` values per venture |
| Venture formal claim count | `Organization.managed_by_ids.length` |
| Venture stage (BCC path) | `InboundParseResult.venture_stage` |
| Venture needs (BCC path) | `InboundParseResult.support_needs` |
| Venture stage (program path) | `Initiative.current_stage_index + pipeline_id` |
| Network growth over time | `Referral.date` / `Interaction.date` — first contact date per pair |

One config field is added to `Ecosystem`:

```ts
// src/domain/ecosystems/types.ts
kumu_map_url?: string;  // Embed URL set by admin after importing Kumu CSV
```

---

## Behavioral Scoring Model

### ESO-to-ESO Connection Strength (0–5 scale)

Mirrors the survey's partnership scale but derived from behavior, not self-report.

**Raw score formula:**
```
raw = (referrals_exchanged    × 1)
    + (accepted_referrals     × 2)
    + (completed_referrals    × 5)
    + (shared_ventures        × 3)   // co-service: both ESOs touched the same venture
    + (if_bidirectional       × 4)   // referrals flow in BOTH directions
```

**Map to 0–5 band:**

| Band | Survey label     | Behavioral threshold (tune per ecosystem) |
|------|------------------|-------------------------------------------|
| 0    | None             | raw = 0, no shared ecosystem activity     |
| 1    | Aware            | In same ecosystem, no direct referrals yet |
| 2    | Interacting      | raw 1–5 (1–2 referrals, one direction)   |
| 3    | Coordinated      | raw 6–14 (3+ referrals OR co-service)    |
| 4    | Collaborative    | raw 15–29 (bidirectional + co-service)   |
| 5    | Strategic        | raw ≥ 30 (high volume, bidirectional, high completion, many shared ventures) |

The raw score is stored on the edge so thresholds can be retuned without
reprocessing the underlying data.

### ESO-to-Venture Connection Strength (1–5 scale)

Captures how deep the relationship between one ESO and one venture has grown.

| Score | Meaning         | Behavioral signal |
|-------|-----------------|-------------------|
| 1     | Initial contact | 1 interaction logged |
| 2     | Active          | 3+ interactions, or a referral received |
| 3     | Engaged         | Active `Service` enrollment |
| 4     | Client          | In `managed_by_ids` (ESO formally claims this venture) |
| 5     | Deep partner    | Multiple active services + sustained interaction history |

This score drives the ESO-venture edge weight in the full-ecosystem Kumu view.

---

## Feature 1: Collaboration & Network Engine

**New file:** `src/domain/analytics/ecosystemNetwork.ts`

### `getEcosystemNetwork(ecosystemId, dateRange?)`

Returns a `KumuNetworkPayload` — the full data structure for Kumu import.

---

### Node Types (Two Filterable Layers)

Every organization becomes a Kumu element with a `type` attribute:

| `type` value | Source | Default visibility |
|---|---|---|
| `eso` | `org.roles.includes('eso')` | Always shown |
| `funder` | `org.roles.includes('funder')` | Always shown |
| `resource` | `org.roles.includes('resource')` | Always shown |
| `venture` | All other orgs | Toggleable |

Kumu's sidebar filtering lets viewers switch between:
- **ESO-only view** — shows only `eso`, `funder`, `resource` nodes and ESO-ESO edges.
  This replicates the original survey map.
- **Full ecosystem view** — adds `venture` nodes and ESO-venture edges.
  Ventures with connections to 3+ ESOs become visually prominent bridge nodes.

---

### ESO Node Attributes (for Kumu decorators)

For each ESO org, compute and attach:

| Attribute | Derived from | Used for |
|---|---|---|
| `dominant_capability` | Most frequent `SupportNeed` in `support_offerings` matched to venture `support_needs` | Node color in Kumu |
| `engagement_style` | Modal `Interaction.type` across all authored interactions: `coaching` (meeting/call), `cohort` (event), `async` (email) | Node shape |
| `program_depth` | Has active `Service` records with `participation_type` = program/residency/membership → `formal`; otherwise `ad_hoc` | Node border |
| `venture_count` | Count of distinct `organization_id` values in authored interactions | Node size |
| `referral_ratio` | Referrals sent ÷ referrals received (> 1 = gateway, < 1 = destination) | Tooltip |

The six support areas from the survey map directly to `SupportNeed` values:

| Survey "Ready" stage    | `SupportNeed` values                                      |
|-------------------------|-----------------------------------------------------------|
| Business Concept        | `business_coaching`                                       |
| Product & Technology    | `product_development`, `manufacturing`                    |
| Formation               | `legal`                                                   |
| Capital & Fundraising   | `funding`                                                 |
| Sales & Marketing       | `sales`, `marketing`                                      |
| Operations              | `hiring`, `workspace`, `networking`                       |

---

### Venture Node Attributes

For each venture org:

| Attribute | Derived from |
|---|---|
| `support_quotient` | Count of distinct `author_org_id` in interactions |
| `eso_count` | `managed_by_ids.length` |
| `current_stage` | `Initiative.current_stage_index` or `InboundParseResult.venture_stage` |
| `primary_need` | `InboundParseResult.support_needs[0]` or `support_offerings[0]` |
| `label` | Real name in internal views; stable hash (`Venture-A19B`) in external exports |

Ventures with `support_quotient ≥ 3` are **bridge nodes** — they connect multiple ESOs
who may not have directly referred to each other. In the full-ecosystem Kumu view these
appear as hubs with spokes radiating to multiple ESO nodes, revealing indirect
collaboration that ESO-only views hide.

---

### Connection Types

Three edge types are exported, each with a `connection_type` attribute for Kumu
filtering and styling:

**1. Referral** — directed, ESO-to-ESO
- From: `referring_org_id`
- To: `receiving_org_id`
- `strength`: raw score from formula above
- `band`: 0–5 mapped label
- `start_date`: date of first referral between this pair ← enables Kumu timeline
- `referral_count`, `accepted_count`, `completed_count`: tooltip data

**2. Co-service** — undirected, ESO-to-ESO
- Created when two ESOs both have `Interaction` records for the same `organization_id`
- `strength`: count of shared ventures
- `start_date`: date both ESOs first co-touched a venture
- Represents indirect collaboration through shared clients, not visible without this analysis

**3. ESO-Venture** — undirected, ESO-to-venture (full ecosystem view only)
- From: `author_org_id`
- To: `organization_id` (the venture)
- `strength`: 1–5 ESO-venture score from formula above
- `start_date`: date of first interaction or referral between this ESO and this venture
- Hidden in ESO-only Kumu filter; visible in full ecosystem view

---

### Time-Based Growth (Kumu Timeline)

Kumu can animate network growth when connections have a `start_date` attribute.
Each edge's `start_date` is the date of the **first** qualifying event between that pair:
- Referral edges: first `Referral.date` between the org pair
- Co-service edges: earliest date both ESOs had an interaction with the same venture
- ESO-Venture edges: first `Interaction.date` or `Referral.date` involving both

This lets the Kumu timeline slider show the network building from its first connection
to the present, making network growth visible month by month.

---

### Kumu Output Types

```ts
interface KumuElement {
  id: string;
  label: string;                    // real name or anonymized hash
  type: 'eso' | 'funder' | 'resource' | 'venture';
  // ESO attributes
  dominant_capability?: string;
  engagement_style?: 'coaching' | 'cohort' | 'async';
  program_depth?: 'formal' | 'ad_hoc';
  venture_count?: number;
  referral_ratio?: number;
  // Venture attributes
  support_quotient?: number;
  eso_count?: number;
  current_stage?: string;
  primary_need?: string;
}

interface KumuConnection {
  from: string;
  to: string;
  connection_type: 'referral' | 'co_service' | 'eso_venture';
  direction: 'directed' | 'undirected';
  strength: number;           // raw score
  band: number;               // 0–5 normalized
  start_date: string;         // ISO date — enables Kumu timeline
  // Referral-specific
  referral_count?: number;
  accepted_count?: number;
  completed_count?: number;
  // Co-service specific
  shared_venture_count?: number;
}

interface KumuNetworkPayload {
  elements: KumuElement[];
  connections: KumuConnection[];
  ecosystem_id: string;
  generated_at: string;
  date_range?: { from: string; to: string };
}
```

---

## Feature 2: Venture Support Heatmap

**New file:** `src/domain/analytics/ventureSupportAnalysis.ts`

### `getVentureSupportAnalysis(ecosystemId)`

**Support Quotient** — for every venture:
```
support_quotient = distinct author_org_id count in interactions where organization_id = venture.id
```

**Segments:**
- `super_supported`: top 10% by `support_quotient`
- `under_supported`: 0–1 interactions in last 90 days OR `managed_by_ids` empty
- `active`: everyone else

The `under_supported` list is the weekly action item for ecosystem managers.

**Service Heatmap** — aggregate `Interaction.type` counts for the current month
across the whole ecosystem, showing where ESO effort is going:
```
{ meeting: 42, call: 18, event: 7, email: 3, note: 12 }
```

**Capability Demand vs. Supply** — cross-reference:
- What ventures say they need: `InboundParseResult.support_needs` aggregated
- What ESOs say they offer: `Organization.support_offerings` aggregated

Gaps between demand and supply indicate unmet ecosystem needs — useful for funder
pitches and program development decisions.

---

## Feature 3: Privacy & Anonymization

**New file:** `src/domain/analytics/anonymize.ts`

Integrates with existing `src/domain/access/redaction.ts`.

```ts
function anonymizeVentureId(orgId: string): string
// Stable hash — same org always gets same token (e.g. "Venture-A19B")
// Non-reversible, consistent across exports

function anonymizeVentureData(org: Organization): AnonymizedVentureRecord
// Keeps: org_type, owner_characteristics, certifications, support_offerings (category only), current_stage
// Strips: name, alternate_name, email, url, ein, external_refs, managed_by_ids, api_keys, webhooks
```

**Privacy rule:**
- ESO, funder, and resource nodes are always named (public institutional actors).
- Venture nodes use real names in internal dashboard views.
- Venture nodes use anonymized hashes in any exported or publicly embeddable Kumu map.

---

## Feature 4: Dashboard Aggregate Payloads

**New file:** `src/domain/analytics/dashboardAggregates.ts`

**Monthly referral time-series** — grouped by `YYYY-MM`:
```ts
interface MonthlyReferralCounts {
  month: string;
  sent: number;
  accepted: number;
  completed: number;
  rejected: number;
}
```

**Pipeline funnel** — count of ventures at each stage, using:
1. `Initiative.current_stage_index` for orgs in formal programs
2. `InboundParseResult.venture_stage` for orgs that entered via BCC intake

**Ghost node list** — org IDs referenced in referrals that have no active record in
`organizations`. These are partners mentioned in real activity but not yet onboarded.
Surface as admin action: "Invite these organizations to complete their profile."

---

## Feature 5: CSV Export

**New utility:** `src/utils/exportAnalytics.ts`

Three export formats:

**Kumu Elements CSV** (`kumu-elements.csv`):
```
Id, Label, Type, Dominant Capability, Engagement Style, Program Depth, Venture Count, Support Quotient, ESO Count, Current Stage
```

**Kumu Connections CSV** (`kumu-connections.csv`):
```
From, To, Connection Type, Direction, Strength, Band, Start Date, Referral Count, Accepted Count, Completed Count, Shared Ventures
```

Both CSVs together form the Kumu "Spreadsheet" import. Kumu uses `Start Date` for
the timeline slider and `Band` for edge weight styling.

**Long-format activity CSV** (for legacy `unpivotData` script and Excel pivot tables):
```
Org | Support Area | Engagement Type | Score
"MakeHaven" | "business_coaching" | "meeting" | 6
"MakeHaven" | "funding" | "event" | 3
```

---

## Materialized Views Strategy

Cross-collection aggregation is expensive in Firestore. Use a hybrid:

**Pre-computed snapshots** (for network + heatmap):
A Cloud Function `computeEcosystemSnapshot` runs on a daily cron and on manual trigger:
- Reads referrals, interactions, orgs, services for the ecosystem
- Computes full `KumuNetworkPayload`, `VentureSupportAnalysis`, `DashboardAggregates`
- Writes to `ecosystem_snapshots/{ecosystemId}`

Dashboard shows `computed_at` timestamp. Ecosystem managers get a "Refresh" button.

**Real-time** (for simple KPI counts):
Total referrals, completion rate, active pipeline counts — stay as live queries.
These are simple counts on a single collection and don't require cross-referencing.

---

## React Chart Components

| Visualization | Component | Data Source |
|---|---|---|
| ESO-ESO referral flow | Sankey (Nivo or recharts-sankey) | Referral connections |
| Org capability radar | Radar (Recharts) | `support_offerings` per ESO |
| Monthly referral trend | Line chart (Recharts) | `MonthlyReferralCounts` |
| Service heatmap | Bar chart (Recharts) | `Interaction.type` aggregates |
| Support demand vs. supply | Side-by-side bar | `support_needs` vs. `support_offerings` |
| Support quotient distribution | Histogram (Recharts) | `support_quotient` per venture |
| Pipeline funnel | Funnel chart (Recharts) | Stage bucket counts |

Recharts for everything. Add Nivo only if the Sankey proves insufficient.

---

## Kumu Integration

The Kumu map is the primary external-facing visualization of the ecosystem.

**v1 — Manual import flow:**
1. Admin clicks "Export Kumu Data" in Reports → downloads `kumu-elements.csv` + `kumu-connections.csv`
2. Admin imports both files into a Kumu project
3. Admin configures Kumu decorators (node color = `Dominant Capability`, size = `Venture Count`, edge weight = `Band`)
4. Admin enables Kumu's timeline slider on `Start Date`
5. Admin configures two Kumu filter presets: "ESO Only" (hide venture nodes/edges) and "Full Ecosystem"
6. Admin copies embed URL into ecosystem settings (`kumu_map_url`)
7. Reports view embeds the live Kumu map

**v2 — Automated (Phase D):**
Cloud Function snapshot pushes updated CSVs to Kumu API on each recompute.
Map URL is stored automatically. No manual import step.

---

## File Layout

```
src/
  domain/
    analytics/
      types.ts                  # KumuElement, KumuConnection, KumuNetworkPayload, etc.
      ecosystemNetwork.ts       # getEcosystemNetwork() — nodes, edges, scores
      ventureSupportAnalysis.ts # getVentureSupportAnalysis()
      dashboardAggregates.ts    # getDashboardAggregates()
      anonymize.ts              # anonymizeVentureData() — integrates with redaction.ts
  utils/
    exportAnalytics.ts          # CSV serializers for Kumu + long-format export
  features/
    reports/
      EcosystemNetworkView.tsx  # New tab: Kumu embed + network stats
      ReportsView.tsx           # Add Ecosystem Network tab
  data/
    repos/
      firebase/
        analyticsSnapshots.ts   # Read/write ecosystem_snapshots collection
```

---

## Schema Addition

```ts
// src/domain/ecosystems/types.ts — add to Ecosystem interface
kumu_map_url?: string;   // Embed URL set by admin after Kumu import
```

No other schema changes. All analytics computed from existing fields.

---

## Implementation Phases

### Phase A: Domain Logic (no UI, no Firebase)
- Add `kumu_map_url` to `Ecosystem`
- Write `src/domain/analytics/types.ts`
- Write `ecosystemNetwork.ts` — node attributes, scoring formulas, all three edge types, `start_date`
- Write `ventureSupportAnalysis.ts` — support quotient, segments, demand/supply gap
- Write `dashboardAggregates.ts` — monthly time-series, funnel, ghost node list
- Write `anonymize.ts`
- Write `exportAnalytics.ts` — Kumu CSV pair + long-format
- Unit tests for all pure functions against mock data

### Phase B: Reports UI
- Add "Ecosystem Network" tab to `ReportsView`
- Kumu embed/link display (reads `kumu_map_url` from ecosystem config)
- Monthly referral trend chart
- Service heatmap bar chart
- Demand vs. supply capability gap chart
- Venture support quotient histogram
- "Download Kumu Data" button (triggers CSV export)

### Phase C: Materialized Snapshots (Firebase)
- Add `analyticsSnapshots` Firestore repo
- Write `computeEcosystemSnapshot` Cloud Function (daily cron + manual trigger)
- Wire dashboard to snapshot with `computed_at` freshness indicator
- Add "Refresh" button for ecosystem managers

### Phase D: Kumu Automation (optional)
- Push updated CSVs to Kumu API from Cloud Function
- Store returned map URL in ecosystem config automatically

---

## Open Questions

1. **Band thresholds**: The 0–5 raw score thresholds are initial guesses. After a few
   months of real data, review the distribution and retune the band boundaries.
   The raw score is stored on every edge so this doesn't require reprocessing.

2. **Venture anonymization in public Kumu**: Confirmed — hashed IDs for any exported
   or embeddable map. Real names in internal dashboard view only.

3. **Snapshot frequency**: Start with daily cron + manual refresh. Escalate to
   on-write triggers if ecosystem managers need same-day accuracy.

4. **Org-client scoping** (see `org_ecosystem_scoping` memory):
   `managed_by_ids` is currently flat across all ecosystems. The `under_supported`
   venture list and ghost node list will make this ambiguity visible. The analytics
   work will likely accelerate the scoping decision.
