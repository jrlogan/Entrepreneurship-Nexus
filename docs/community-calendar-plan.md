# Community Calendar Plan

This document defines the Community Calendar feature: a multi-source, AI-assisted
event aggregation system that produces filterable, subscribable iCal feeds scoped
to each ecosystem and the platform as a whole.

---

## Problem

Entrepreneurial event listings are fragmented across ESO partner websites, email
newsletters, and manual calendars. Keeping any single calendar current requires
updates in multiple places, and most ESO staff cover more than entrepreneurship so
their personal feeds are noisy. This feature aggregates events from many sources,
uses AI to filter and classify them, and lets ecosystem admins curate the result
rather than manually enter everything.

---

## Resolved Design Decisions

| Topic | Decision |
|-------|----------|
| Feed URLs | `/ecosystems/{id}/calendar/feed.ics` (scoped) + `/calendar/feed.ics` (aggregate) |
| Scraping | Gemini `url_context` tool; verify SDK support before Phase 2; fallback is raw fetch + HTML as text for static pages |
| Email routing | New `route_type: "calendar_submission"` in `inbound_routes`; uses existing wildcard catch-all at `*@incoming.entrepreneurship.nexus`; per-ecosystem addresses like `events+{ecosystemSlug}@incoming.entrepreneurship.nexus` |
| Confidence routing | ≥0.85 → auto_approved · 0.50–0.84 → pending_review · <0.50 → rejected (soft, restorable) |
| Cross-ecosystem | State/national public events route to geographically relevant ecosystems; land in their pending queue first |
| Primary submission UX | URL paste → AI extracts; full manual form is secondary fallback |
| Public submission | Deferred — logged-in users only for Phase 1 |
| Tag ownership | Ecosystem managers + ESO admins; shared library with ecosystem-local tags; propose-to-shared workflow for platform-level tags |
| Source bootstrap | Seed from existing ESO/partner org records; prioritize orgs with active event pages |
| Error flagging | Anyone can flag a visible event; flags surface in admin curation queue for resolution |

---

## Architecture

```
INGESTION                    AI PIPELINE              STORAGE              OUTPUT
─────────────────────────    ─────────────────────    ──────────────────   ──────────────────────
URL submission (logged in) ──┐                        events               /ecosystems/{id}/
                             ├──► processEventUrl ──► event_sources          calendar/feed.ics
Scheduled source poll ───────┤    (Gemini extract     event_source_runs    /calendar/feed.ics
  • iCal/RSS parse           │     + classify)        calendar_tags
  • HTML url_context         │         │              event_flags
                             │         ▼
Email inbound ───────────────┘   confidence routing
  events+{slug}@incoming...        ≥0.85 → auto_approved
  (existing wildcard catch-all)    0.50–0.84 → pending_review
                                   <0.50 → rejected
                                         │
                                         ▼
                                   cross-ecosystem
                                   geo routing
                                   (state/national →
                                    other ecosystem queues)
```

`processEventUrl` is the shared core callable — invoked by the UI submission flow,
by `pollEventSources` internally, and by `processCalendarEmail` after email-to-text
extraction. One AI pipeline, three ingestion entry points.

---

## Data Model

### `events` collection

```typescript
{
  // Core
  id: string
  title: string
  description: string
  url: string
  start_time: Timestamp
  end_time: Timestamp
  location: { text: string, city?: string, state?: string, lat?: number, lng?: number }
  organizer: { name: string, email?: string, org_id?: string }
  registration_url?: string

  // Classification
  tags: string[]
  scope: 'local' | 'regional' | 'state' | 'national'
  geographic_tags: string[]          // e.g. ['CT', 'new-haven-metro']

  // Source tracking
  source_type: 'url_submission' | 'url_source_poll' | 'ical' | 'rss' | 'email' | 'manual'
  source_id?: string                 // ref to event_sources doc
  submitted_by?: string              // user ID for manual/url submissions
  submitted_url?: string             // original URL submitted
  source_event_id?: string           // external UID for dedup within a source
  fingerprint: string                // hash(normalized title + date + location) for cross-source dedup

  // AI
  ai_confidence: number              // 0.0–1.0
  ai_flags: string[]                 // e.g. ['missing_date', 'possible_duplicate', 'national_scope']
  ai_reasoning: string

  // Workflow
  status: 'auto_approved' | 'pending_review' | 'rejected' | 'approved' | 'archived'
  visibility: 'public' | 'ecosystem_only'
  source_ecosystem_id: string
  visible_in_ecosystems: string[]    // source ecosystem + approved cross-posts
  cross_ecosystem_status: Record<string, 'pending' | 'approved' | 'excluded'>

  // Audit
  reviewed_by?: string
  reviewed_at?: Timestamp
  created_at: Timestamp
  updated_at: Timestamp
  open_flag_count: number            // denormalized for queue badge
}
```

### `event_sources` collection

```typescript
{
  id: string
  name: string
  type: 'ical' | 'rss' | 'url_scrape' | 'email_route'
  url?: string
  email_address?: string             // events+{slug}@incoming.entrepreneurship.nexus
  ecosystem_id: string
  linked_org_id?: string             // ties back to existing ESO/partner org record

  // Polling
  active: boolean
  check_interval_hours: number       // default 24
  last_checked_at?: Timestamp
  last_check_status?: 'success' | 'error' | 'needs_manual_check'
  last_error?: string
  consecutive_failures: number       // auto-disable after threshold

  // Behavior
  auto_approve_threshold: number     // default 0.85, per-source override
  default_scope?: string             // hint to AI (e.g. 'local' for a town chamber)
  default_geographic_tags?: string[] // hint to AI for location context
  default_visibility: 'public' | 'ecosystem_only'

  // Audit
  created_by: string
  created_at: Timestamp
}
```

### `event_source_runs` collection

One document per poll attempt — source ID, timestamp, status, events found/added/deduped.
Used for source health monitoring in the admin view.

### `calendar_tags` collection

```typescript
{
  id: string                         // slug, e.g. 'funding-investment'
  label: string                      // e.g. 'Funding & Investment'
  scope: 'shared' | 'ecosystem'
  ecosystem_id?: string              // set when scope = 'ecosystem'
  proposed_for_shared: boolean
  usage_count: number                // denormalized
}
```

### `event_flags` collection

```typescript
{
  event_id: string
  flagged_by?: string                // user ID if logged in, null if anonymous
  flag_type: 'wrong_date' | 'wrong_location' | 'not_relevant' | 'duplicate' | 'other'
  notes: string
  status: 'open' | 'resolved' | 'dismissed'
  created_at: Timestamp
  resolved_by?: string
  resolved_at?: Timestamp
}
```

### Existing collections modified

- `inbound_routes` — new `route_type: "calendar_submission"`
- `ecosystems` — add `geo_state: string`, `geo_metros: string[]`, `geo_adjacent: string[]`

---

## Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `pollEventSources` | Scheduled (every 4–6 hrs) | Iterate active sources; dispatch to iCal/RSS/scrape handlers |
| `processEventUrl` | Callable | Core pipeline: Gemini extract → classify → fingerprint → dedup → route to status |
| `generateCalendarFeed` | HTTP GET | Produce iCal output for any feed URL pattern |
| `processCalendarEmail` | Postmark webhook branch | New dispatch path in existing webhook handler |
| `resolveEventFlag` | Callable | Admin resolves a flagged event |

---

## AI Pipeline (Gemini)

Each ingested event passes through a structured Gemini call:

```typescript
// Input: event content (extracted from URL, feed, or email)
// Output schema:
{
  is_entrepreneurial: boolean
  confidence: number              // 0.0–1.0
  reasoning: string
  suggested_tags: string[]
  scope: 'local' | 'regional' | 'state' | 'national'
  geographic_tags: string[]
  normalized_location: string
  cleaned_description: string     // remove boilerplate/promotional noise
  is_duplicate_of?: string        // event ID if near-duplicate detected
  flags: string[]                 // 'missing_date', 'possible_duplicate', etc.
}
```

Confidence thresholds are configurable per source. Start conservative and loosen
as trust in the classifier builds.

---

## Deduplication

Two-level:

1. **Exact** — match on `source_event_id` within same source, or `fingerprint`
   (hash of normalized title + date + location) across sources
2. **Fuzzy** — Gemini similarity check for events that passed exact checks but
   look nearly identical; merges sources onto one canonical event record

---

## Cross-Ecosystem Geographic Routing

Events with `scope: 'state'` or `scope: 'national'` and `visibility: 'public'` are
candidates for cross-posting. An event appears in ecosystem B (not its source
ecosystem A) when:

1. Event `geographic_tags` overlaps with ecosystem B's `geo_state` or `geo_adjacent`
2. Ecosystem B has not explicitly excluded it

Cross-ecosystem candidates land in the target ecosystem's `pending_review` queue.
Admins confirm relevance before the event publishes there. Over time, consistent
approval patterns could be codified as auto-rules per ecosystem.

---

## Tag Taxonomy (Initial)

Tags are stored as slugs. This list is a starting point — ESO admins and ecosystem
managers can add ecosystem-local tags and propose any for promotion to the shared
library.

- Funding & Investment
- Pitch & Competition
- Networking & Community
- Education & Workshop
- Mentorship & Coaching
- Manufacturing & Making
- Real Estate & Development
- Technology & Innovation
- Export & International Trade
- Marketing & Sales
- Legal & Compliance
- Diversity & Inclusion

---

## Feed URL Structure

```
# Ecosystem-scoped
/ecosystems/{ecosystemId}/calendar/feed.ics
/ecosystems/{ecosystemId}/calendar/feed.ics?tags=funding,pitch
/ecosystems/{ecosystemId}/calendar/feed.ics?scope=local
/ecosystems/{ecosystemId}/calendar/feed.ics?scope=state

# Platform aggregate
/calendar/feed.ics
/calendar/feed.ics?state=CT&tags=funding
/calendar/feed.ics?scope=national
```

Each ecosystem's feed includes locally-sourced events plus cross-ecosystem
state/national events approved as relevant to them.

---

## Frontend Module: `src/features/calendar/`

| Route | Access | Purpose |
|-------|--------|---------|
| `/ecosystems/{id}/calendar` | Public | Filterable event list; subscribe button; flag button per event |
| `/ecosystems/{id}/calendar/admin` | Ecosystem Manager, ESO Admin | Curation queue (pending + flagged), source management, tag management, source health |
| `/calendar` | Public | Platform aggregate view |

The curation queue shows AI confidence and reasoning inline. Bulk approve/reject
for efficiency. Source health (last run, error rate, events/run) lives in the
admin view.

### Access Control

| Role | Permissions |
|------|------------|
| Public | Read approved public events; subscribe to iCal feeds; flag events |
| Entrepreneur (logged in) | Above + submit events via URL |
| ESO Staff | Curate events for their ecosystem |
| Ecosystem Manager | Manage sources, approve/reject, manage tags, manage feeds |
| Platform Admin | Full access across all ecosystems; promote tags to shared library |

---

## Source Bootstrapping

A script (or admin UI action) iterates existing ESO/partner org records and
generates a suggested `event_source` for each, pre-populated from `org.website_url`.
When an admin adds a source URL, Gemini pre-analyzes the page to detect whether
it has an iCal feed, RSS feed, or is a plain HTML events page, and sets
`source_type` accordingly.

Priority order for source types:
1. iCal feed — structured, reliable, no scraping needed
2. RSS feed — structured
3. HTML events page — Gemini `url_context` scrape
4. Email forward — good for newsletters and announcement lists

---

## Implementation Phases

### Phase 1 — Foundation (2 weeks)
- `events`, `event_sources`, `event_source_runs`, `calendar_tags`, `event_flags`
  collections with Firestore security rules and indexes
- `processEventUrl` Cloud Function (Gemini extract + classify)
- URL submission UI for logged-in users (primary path)
- Manual event entry form (secondary path)
- Basic calendar view per ecosystem + platform root
- `generateCalendarFeed` iCal endpoint

### Phase 2 — Source Monitoring (2 weeks)
*Pre-work: verify Gemini `url_context` SDK availability (see Technical Investigations below)*
- `event_sources` admin UI with link-to-org and bootstrapping from existing org records
- AI source pre-analysis on URL add (detect iCal/RSS/HTML type)
- `pollEventSources` scheduled function (iCal + RSS + url_scrape via Gemini)
- Deduplication (fingerprint + AI fuzzy check)
- Source health monitoring; auto-disable after repeated consecutive failures
- Admin curation queue with AI reasoning visible; bulk actions

### Phase 3 — Email Ingestion (1 week)
- `calendar_submission` route type in `inbound_routes`
- Per-ecosystem inbound email addresses active via existing wildcard catch-all routing
- `processCalendarEmail` branch in existing Postmark webhook handler

### Phase 4 — Cross-Ecosystem + Flags (1 week)
- Geo profile fields on ecosystem documents (`geo_state`, `geo_metros`, `geo_adjacent`)
- Cross-ecosystem routing logic in `processEventUrl`
- Cross-ecosystem pending queue in admin curation view
- `event_flags` collection + flag UI (public-facing) + admin resolution flow

### Phase 5 — Polish (1 week)
- Tag library management UI (shared vs local; propose-to-shared workflow)
- Feed URL generator with filter builder (copy-to-clipboard)
- Source bootstrapping script from existing org records
- Public event submission (deferred from Phase 1)

---

## Technical Investigations (Before Phase 2)

- **Gemini `url_context`**: Confirm the `@google/generative-ai` SDK version in the
  project exposes the URL context tool. If not, evaluate upgrading vs. using raw
  `fetch` + pass static HTML to Gemini as text. JS-rendered pages would require a
  separate solution (Puppeteer in Cloud Functions, or a service like Browserless).
- **Postmark wildcard routing**: Confirm the catch-all at `*@incoming.entrepreneurship.nexus`
  is configured to forward all addresses to the existing webhook endpoint, so
  `events+{slug}@...` addresses work without per-address Postmark configuration.
