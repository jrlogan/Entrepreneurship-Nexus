# Collaborative Grant Research & Network Intelligence

## Vision
To transform the "Grant Research" task from an isolated back-office burden into a **Network Collaboration Catalyst**. By leveraging the shared data in Nexus (Orgs, Initiatives, and Capabilities), the system proactively identifies opportunities for ESOs to apply for large-scale funding together.

## Core Concepts

### 1. The Funder Registry (Shared Resource)
Instead of every ESO maintaining their own list of funders, Nexus provides a shared **Funder Directory**. 
- AI-enriched profiles (mission, geographic focus, funding history).
- Collaborative notes: "ESO A had a good experience with this program officer."

### 2. Opportunity "Elevation" Levels
Grants move through a lifecycle of network visibility:
- **Level 0 (Discovery):** A grant is found via webhook or search.
- **Level 1 (Sensing):** System flags it as a "High Collective Fit." ESOs can "Star" it.
- **Level 2 (Elevated):** Once 3+ ESOs show interest, it is elevated to a **Collaborative Opportunity**.
- **Level 3 (Action):** A **Partnership Blueprint** is generated, and a shared Pipeline is created.

### 3. Initiative-to-Grant Matching
The AI Advisor scans **Active Initiatives** (Programs) across all ESOs to score fit.
- *Example:* A grant for "Urban Farming" automatically pings ESOs with "Agriculture" or "Sustainability" initiatives.

## Technical Architecture

### Data Models
- `GrantOpportunity`: The central record for a funding call.
- `PartnershipBlueprint`: AI-generated strategy for who should lead and who should partner.
- `MonitoredSource`: Feed management for incoming opportunities.

### AI Matchmaking Logic
The **Nexus Advisor** (Gemini) uses the following context:
1. **Grant Description** (Summary, Eligibility, Priorities).
2. **ESO Initiatives** (What they are currently doing).
3. **ESO Capabilities** (Facilities, Staffing, Past Successes).
4. **Network History** (Who has partnered successfully before).

## User Workflows

### For the "Scout" (Discovery)
- Set up **Monitored Sources** (Newsletters, RSS, Webhooks).
- Review the "Inbound Queue" and promote grants to the Network Feed.

### For the ESO Director (Collaboration)
- View the "Collaborative Opportunities" dashboard.
- Flag "Interest" in a national grant.
- Review "AI Partnership Suggestions" and invite other ESOs to a bid.

### For the Network Manager (Elevation)
- See which grants are "trending" in the network.
- Officially "Elevate" a grant to a regional priority.
- Assign a fiscal lead for a collective application.

## Roadmap
1. **Funder Registry:** Shared view in Directory.
2. **Opportunity Feed:** Basic discovery and manual "Interest" flagging.
3. **AI Matchmaker:** Automated fit scoring for Initiatives.
4. **Blueprint Engine:** AI-generated collaborative strategies.
5. **Shared Pipeline:** Multi-ESO tracking of grant applications.

## Fit With Current Codebase
- Nexus already has a working **network sharing model** for operational data through organization visibility plus explicit partner access grants. This should govern which initiative/program data is available for grant matchmaking.
- The current app already supports `Initiative.grant_research_context`, but initiatives are not broadly populated or normalized yet, so collaboration quality depends on improving initiative structure before relying on AI.
- The current grants UI is a **demo surface** with mock opportunities. It is a good place to validate network workflows, but not yet a full persistence or intake pipeline.

## Immediate Spec Improvements

### 1. Make Collaboration Governance Explicit
- Shared grant collaboration should use the existing visibility model:
  - `network_shared` for broad trusted-network collaboration
  - `trusted_network` for grants visible to approved ESO partners only
  - `private_draft` for opportunities still being qualified by one organization
- Collaborative notes about funders or officers should inherit the same visibility controls.

### 2. Normalize Initiatives Before Heavy AI
- Add a normalized initiative profile so an initiative can describe either:
  - an ESO program
  - a business support program
  - a product line
  - a project
  - a grant-funded program
- Each initiative should have:
  - normalized focus areas
  - geography tags
  - collaboration visibility
  - collaboration modes / likely partner roles
- `grant_research_context` should remain the lightweight matching layer, but it should sit on top of normalized initiative metadata rather than free text alone.

### 3. Treat Matching As Structured Qualification First
- Before AI partnership recommendations, each `GrantOpportunity` should carry:
  - source evidence and verification status
  - eligibility profile
  - visibility
  - explicit interest signals
  - elevation summary
- Deterministic qualification should answer:
  - is this relevant
  - who appears eligible
  - who is open to collaboration
  - does this require a fiscal lead or sponsor

### 4. Replace Fixed Star Thresholds
- Elevation should not be based only on `3+` stars.
- A better promotion rule combines:
  - visible initiative fit
  - collaboration readiness
  - explicit ESO interest
  - scale / strategic importance
  - source confidence
  - fiscal-lead requirements

### 5. Reorder the Roadmap Around Risk
1. **Shared opportunity intake and verification**
2. **Manual interest signaling and trusted-network visibility**
3. **Initiative normalization for ESO programs and business program lines**
4. **Deterministic matching and elevation scoring**
5. **AI-generated partnership blueprints**
6. **Shared application pipeline / collective execution**
