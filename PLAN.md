  # EcosystemOS Implementation Plan                                                                                                                                                      
                                                                                                                                                                                         
  ## 🎯 Vision                                                                                                                                                                           
  A "System of Systems" bridging Entrepreneurs, ESOs, and Funders through federated data, privacy-by-design consent, and CRM integration.                                                
                                                                                                                                                                                         
  ## 🏗 Architecture Status (v0.9 Prototype)                                                                                                                                              
  - **Frontend:** React 19 + Tailwind (Vite)                                                                                                                                             
  - **Data Layer:** In-Memory Repository Pattern (production-swappable)                                                                                                                  
  - **AI:** Google Gemini 2.5 for Voice/Chat Advisor                                                                                                                                     
                                                                                                                                                                                         
  ### What's Complete ✅                                                                                                                                                                 
  - HSDS-compliant data schema                                                                                                                                                           
  - Repository layer (Orgs, People, Interactions, Referrals, Consent, Metrics)                                                                                                           
  - Referral workflow (Pending → Accepted → Completed with outcomes)                                                                                                                     
  - Consent logic in `domain/access/` (policy checks, redaction)                                                                                                                         
  - API Console with webhook simulator, endpoint docs, sync patterns                                                                                                                     
  - Role-based views and theming                                                                                                                                                         
  - Capability-based permission system (v2)                                                                                                                                              
                                                                                                                                                                                         
  ### What's In Progress 🔨                                                                                                                                                              
  - Privacy Settings UI (`OrganizationDetailView.tsx` Privacy tab is placeholder)                                                                                                        
  - "Request Access" button for ESOs viewing restricted orgs                                                                                                                             
  - Subject person selection in referral creation                                                                                                                                        
                                                                                                                                                                                         
  ---                                                                                                                                                                                    
                                                                                                                                                                                         
  ## 📍 Roadmap (Committee Demo Focus)                                                                                                                                                   
                                                                                                                                                                                         
  ### Phase 1: Complete the Privacy Story (HIGH PRIORITY)                                                                                                                                
  **Goal:** Entrepreneurs can control data access, ESOs can request it.                                                                                                                  
                                                                                                                                                                                         
  - [ ] **1A:** Privacy tab UI - show/toggle `operational_visibility`, list consenting ESOs                                                                                              
    - File: `src/features/directory/OrganizationDetailView.tsx` (line ~256)                                                                                                              
    - Uses: `repos.consent.getPoliciesForEntity()`                                                                                                                                       
                                                                                                                                                                                         
  - [ ] **1B:** Consent audit trail - show history of grants/revokes                                                                                                                     
    - File: Same as above                                                                                                                                                                
    - Uses: `repos.consent.getEventsForEntity()`                                                                                                                                         
                                                                                                                                                                                         
  - [ ] **1C:** "Request Access" button on restricted org views                                                                                                                          
    - File: `src/features/directory/OrganizationDetailView.tsx`                                                                                                                          
    - Creates referral with `outcome_tags: ['Access Request']`                                                                                                                           
                                                                                                                                                                                         
  - [ ] **1D:** Grant access from entrepreneur portal                                                                                                                                    
    - File: `src/features/portal/MyVenturesView.tsx`                                                                                                                                     
    - Extend existing `handleGrantAccess` function                                                                                                                                       
                                                                                                                                                                                         
  ### Phase 2: Referral Polish                                                                                                                                                           
  **Goal:** Complete the handoff story.                                                                                                                                                  
                                                                                                                                                                                         
  - [ ] **2A:** Subject person selection in `CreateReferralModal.tsx`                                                                                                                    
  - [ ] **2B:** Email preview for intro_email_sent referrals
  - [ ] **2C: Referral to resource orgs** — Allow ESOs to refer clients to any org (including for-profit
    resource providers, banks, law firms, etc.), not just other ESOs. The receiving org may not be
    a platform user — referral would go out as an email notification only.

  - [ ] **2D: Entrepreneur referral confirmation** — If a referral's receiving org never updates status
    after a reasonable period, send the entrepreneur a prompt: "Did this connection happen?"
    Simple yes/no that updates referral status from the client side.

  - [ ] **2E: Referral close review** — When a referral is marked complete/closed, ask the entrepreneur
    for feedback on the receiving org:
    - 5-star rating or NPS score (1–10) with optional free-text comment
    - Reviews stored per referral, linked to receiving org
    - **Privacy rules:** Individual reviews NOT visible to the reviewed org (prevents gaming/pressure)
    - Ecosystem manager CAN see individual reviews for oversight
    - Aggregate rating (avg score, count) visible publicly on org profile
    - Enables ecosystem health tracking: are connections actually happening and are they useful?                                                                                                                             
                                                                                                                                                                                         
  ### Phase 3: Demo Impact Features                                                                                                                                                      
  **Goal:** Impress funders with outcomes.                                                                                                                                               
                                                                                                                                                                                         
  - [ ] **3A:** Ecosystem Impact dashboard card (aggregate metrics)                                                                                                                      
  - [ ] **3B:** Referral outcomes report (completion rates, outcomes breakdown)                                                                                                          
  - [ ] **3C:** Committee-focused walkthrough tour                                                                                                                                       


  ### Phase 3+: Metric Collections — SourceLink-Informed Enhancements
  **Reference:** Reviewed SourceLink's "Client Snapshot" modal (2026-03-17). Key takeaways for future metric collection work:

  - [ ] **Snapshot type** — add `snapshot_type: 'baseline' | 'follow_up' | 'exit'` to metric collections.
    Enables longitudinal tracking: measure *change* over time, not just point-in-time values.
    Baseline on first engagement, follow-up periodically, exit at end of relationship.

  - [ ] **Obstacles field** — standardized checkbox list per client snapshot:
    `commercial_insurance, credit, experience, family, financing, government_regulation,
    health_insurance, language, legal, location, market, natural_disaster, operations, staffing, time`
    Consistent across portfolio → enables "financing was #1 obstacle" reporting.

  - [ ] **Outcomes field** — impact tracking checkboxes per snapshot:
    `started_business, decided_to_start, decided_not_to_start, expanded_operations,
    expanded_products, decided_not_to_expand, increased_sales, decreased_sales,
    raised_equity, secured_loan, secured_grant, closed_business, improved_operations,
    increased_employees, decreased_employees, changed_business_model, changed_target_market,
    solved_operational_problem, strategic_alliance_formed`
    Critical for ESO funder impact reporting — currently no equivalent in Nexus.

  - [ ] **Jobs created/saved** — split by `full_time` and `part_time`.
    Standard federal reporting metric required by SBDCs, MEPs, and most federally-funded ESOs.

  - [ ] **Business stage** — a field on the snapshot itself (not just org_type), tracks progression over time.

  - [ ] **Overall satisfaction** — client satisfaction rating per snapshot period.
                                                                                                                                                                                         
  ### Phase 4: Internal Improvements (Post-Demo)                                                                                                                                         
  **Goal:** Clean architecture for production.                                                                                                                                           
                                                                                                                                                                                         
  - [ ] Capability system migration sweep (replace role checks)                                                                                                                          
  - [ ] Dynamic role builder UI                                                                                                                                                          
  - [ ] **Ecosystem selection & approval onboarding flow**
    - After a new user creates their personal account (Google or email/password), present an
      ecosystem selection screen before they enter the app
    - List available ecosystems with checkboxes or cards; each may show a short description
    - Each ecosystem can be in one of three join modes:
      - `open` — user is auto-approved on selection
      - `requires_agreement` — user must accept terms/data-sharing agreement before joining
      - `requires_approval` — ecosystem manager reviews the user's profile before granting access
    - Membership request stored in `ecosystem_join_requests` collection (person_id, ecosystem_id,
      status: pending|approved|rejected, submitted_at, reviewed_by, note)
    - Ecosystem manager sees pending join requests in Ecosystem Config view
    - User can join multiple ecosystems; their sidebar switcher shows only joined ecosystems
    - **Current behavior (interim):** new users are auto-enrolled in the first/default ecosystem so
      the app is immediately usable. Ecosystem selection replaces this once built.

  - [ ] **Auto-populate email domain from org URL** — When an org has a `url` set, automatically
    add the domain (e.g. `makehaven.org` from `https://makehaven.org`) to the org's allowed email
    domains list used for invite routing. Can be manually removed. Prevents needing to enter it twice.

    - [ ] Data quality merge workflow
    - [ ] **Person merge** in DataQualityView (parallel to existing org merge)
      - Detect duplicate people by name similarity / email overlap
      - Winner keeps their primary email; loser's primary moves to winner's `secondary_emails` (deduplicated)
      - Reassign referrals (`subject_person_id`, `referring_person_id`), interactions, and affiliations to winner
      - Archive loser record (`status: 'archived'`)
      - See org merge in `DataQualityView.tsx:handleMergeConfirm` as reference pattern                                                                                                                                                      

  ### Phase 6: Collaborative Grant Research (NEW)
  **Goal:** Transform grant discovery into a network collaboration catalyst.
  Reference: `docs/COLLABORATIVE_GRANT_RESEARCH.md`

  - [ ] **6A: Shared Funder Registry**
    - Show AI-enriched funder profiles in Directory
    - Collaborative notes on funders

  - [ ] **6B: Opportunity Discovery Feed**
    - Ingest grants via Postmark webhook
    - Shared research pool for the network

  - [ ] **6C: Initiative-Driven Matchmaking**
    - AI Advisor scores grants against ESO active Initiatives
    - "Flag Interest" to signal readiness to partner

  - [ ] **6D: Collaborative Elevation & Blueprints**
    - AI generates Partnership Blueprints for national grants
    - Propose lead applicant and complementary roles

  - [ ] **6E: Shared Grant Pipeline**
    - Track collective applications across multiple ESOs
    - Cross-agency tasks and milestones
                                                                                                                                                                                         

  ### Phase 4+: Taxonomy & Classification — E3 Survey Insights
  **Reference:** Innovation ARC E3 Partner Relationships survey (2025). Reviewed for alignment
  with regional ecosystem vocabulary and data structures already in use by CT partners.

  - [ ] **Add `informal_group` to OrganizationType**
    Survey includes "Informal Group" as a valid entity type — covers early coalitions, meetup
    organizers, and networks that are real ecosystem players but not legally incorporated.
    New set: `startup | small_business | business | nonprofit | government_agency | informal_group | other`

  - [ ] **Align SupportNeed values to E3 6-stage framework**
    Survey's "Support Areas" use a stage-based vocabulary already familiar to CT partners:
    `business_concept | product_technology | formation | capital_fundraising | sales_marketing | operations`
    Current `inbound/types.ts` SupportNeed values are close but not aligned. Updating would make
    Nexus intake data directly comparable to E3 survey responses and regional reporting.

  - [ ] **Structured industry tag enum (replace free-form strings)**
    Current `classification.industry_tags` is free-form. Survey uses a consistent regional list:
    `life_sciences_biotech | climatetech_clean_energy | advanced_manufacturing |
    quantum_computing | software_it_data | fintech | consumer_products |
    food_beverage_hospitality | arts_creative_economy | social_enterprise | other`
    Replacing free-form with an enum enables cross-org filtering and reporting. Free-form
    `tags` field remains for anything outside this list.

  - [ ] **E3 Readiness pipeline template**
    Survey Q12-17 define a 6-stage ESO capability/client journey framework with specific
    sub-tasks per stage, rated None/Ad-hoc/Established/Core. This maps directly to our
    pipeline/initiative system. Build as a standard pipeline template ESOs can adopt:
    - Business Concept Ready (problem definition, market research, value prop, biz model canvas)
    - Product Ready (product definition, IP, concept testing, prototyping, production costs)
    - Formation Ready (business structure, legal registration, certifications, banking)
    - Capital Ready (capital needs, target providers, documentation, pitch, milestones)
    - Sales Ready (customer ID, channels, marketing, sales pitch, retention)
    - Operations Ready (hiring, policies, facility, production capacity, distribution)

  - [ ] **ESO relationship strength scoring**
    Survey Q18 asks ESOs to self-rate relationships with other orgs on a 0–5 scale:
    None → Aware → Interacting → Coordinated → Collaborative → Strategic Partner
    Nexus can auto-compute this from real referral and interaction data rather than
    asking ESOs to self-report. Feeds directly into analytics/network graph (Kumu export).
    Formula idea: 0 referrals/interactions = None, 1-2 interactions = Aware, active referrals
    = Coordinated+, mutual referrals + high frequency = Collaborative/Strategic.

  ### Phase 5: Technical Audit & Security (Post-Demo Refinement)
  **Goal:** Harden the platform for production-scale traffic and security.

  - [ ] **Security & Performance Optimization**
    - [ ] **Firebase Custom Claims:** Migrate `system_role` checks in `firestore.rules` from `get()` calls to Custom Claims to reduce latency and costs.
    - [ ] **O(1) API Key Lookup:** Replace O(n) organization scanning in Cloud Functions with a dedicated `api_keys` collection keyed by hash.
    - [ ] **App Check & Rate Limiting:** Implement Firebase App Check and rate limiting on public endpoints like `resolvePerson` and `resolveOrganization`.

  - [ ] **Architecture & Technical Debt**
    - [ ] **Type Safety Sweep:** Replace `any` types in Cloud Functions with strict `Request`/`Response` types from `firebase-functions/v2`.
    - [ ] **Legacy Field Cleanup:** Standardize on `organization_id` and remove legacy `primary_organization_id` aliases across the codebase.
    - [ ] **Scalable Deduplication:** Implement "blocking" (e.g., zip-code or name-prefix filtering) in `detectDuplicates` to avoid O(n²) performance issues.

  - [ ] **UX & Robustness**
    - [ ] **Founder-First Experience:** Develop a dedicated dashboard for Entrepreneurs focused on their longitudinal journey and pipeline progress.
    - [ ] **Global Error Boundary:** Implement a centralized notification system to handle and display Firebase permission errors to users.
    - [ ] **Comprehensive Audit Logging:** Ensure sensitive actions (UI-driven views, data exports) trigger entries in the `audit_logs` collection.

  ---                                                                                                                                                                                    
                                                                                                                                                                                         
  ## 🤖 Master Prompts                                                                                                                                                                   
                                                                                                                                                                                         
  ### Phase 1A: Privacy Tab UI                                                                                                                                                           
  In src/features/directory/OrganizationDetailView.tsx, the Privacy tab                                                                                                                  
  (around line 256) shows placeholder text. Replace it with:                                                                                                                             
                                                                                                                                                                                         
  1. Current operational_visibility value with a toggle switch                                                                                                                           
  2. List of ESOs with consent (from repos.consent.getPoliciesForEntity)                                                                                                                 
  3. "Revoke Access" button next to each ESO                                                                                                                                             
                                                                                                                                                                                         
  Match the existing card styling. Use existing repos.consent methods.                                                                                                                   
  Keep changes in this single file.                                                                                                                                                      
                                                                                                                                                                                         
  ### Phase 1C: Request Access Button                                                                                                                                                    
  In OrganizationDetailView.tsx, when canViewOperationalDetails returns                                                                                                                  
  false, add a "Request Access" button that:                                                                                                                                             
                                                                                                                                                                                         
  1. Creates a referral with referring_org_id = viewer's org                                                                                                                             
  2. Sets outcome_tags to ['Access Request']                                                                                                                                             
  3. Shows confirmation message                                                                                                                                                          
  4. Disables if pending request exists                                                                                                                                                  
                                                                                                                                                                                         
  Use repos.referrals.add(). Single file change only.                                                                                                                                    
                                                                                                                                                                                         
  ### Phase 3A: Impact Dashboard                                                                                                                                                         
  In DashboardView.tsx, add an "Ecosystem Impact" card showing:                                                                                                                          
                                                                                                                                                                                         
  1. Aggregate jobs created, revenue, capital raised                                                                                                                                     
  2. Source breakdown (self-reported vs verified)                                                                                                                                        
                                                                                                                                                                                         
  Use repos.metrics.getAll() and aggregate. Match existing card style.                                                                                                                   
                                                                                                                                                                                         
  ---                                                                                                                                                                                    
                                                                                                                                                                                         
  ## 📝 Design Principles                                                                                                                                                                
  1. **Additive Changes:** Never break existing features; extend them.                                                                                                                   
  2. **Single File Per Prompt:** Avoid multi-file refactors.                                                                                                                             
  3. **Mock First:** Full UI with mock data before backend concerns.                                                                                                                     
  4. **Type Safety:** All domain objects strictly typed in `src/domain`.                                                                                                                 
  5. **Test After Each Change:** Verify before next prompt.                                                                                                                              
                                                                                                                                                                                         
  ## 🎬 Demo Script (Committee Presentation)                                                                                                                                             
  1. Directory → Show org with "Private" badge                                                                                                                                           
  2. Click org → Show locked tabs → Click "Request Access"                                                                                                                               
  3. Switch to entrepreneur view → Show request → Grant access                                                                                                                           
  4. Return to ESO → Tabs now unlocked → Show operational details                                                                                                                        
  5. Create referral → Hand off to another ESO                                                                                                                                           
  6. Switch to receiving ESO → Accept → Log follow-up → Close with outcome                                                                                                               
  7. API Console → Show webhook configuration → "This is how Salesforce syncs"                                                                                                           
  8. Impact Dashboard → Show aggregate outcomes                                                                                                                                          
                                                                                                                                                                                         
  ---                                                                                                                                                                                    
                                                                                                                                                                                         
  ## 🔧 Key File Locations                                                                                                                                                               
  - Privacy/Consent logic: `src/domain/access/policy.ts`, `src/domain/access/redaction.ts`                                                                                               
  - Consent repo: `src/data/repos/consent.ts`                                                                                                                                            
  - Referral types: `src/domain/referrals/types.ts`                                                                                                                                      
  - Referral repo: `src/data/repos/referrals.ts`                                                                                                                                         
  - API Console: `src/features/admin/APIConsoleView.tsx`                                                                                                                                 
  - Mock data: `src/data/mockData.ts` 