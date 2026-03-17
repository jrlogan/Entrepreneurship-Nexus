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
                                                                                                                                                                                         
  ### Phase 3: Demo Impact Features                                                                                                                                                      
  **Goal:** Impress funders with outcomes.                                                                                                                                               
                                                                                                                                                                                         
  - [ ] **3A:** Ecosystem Impact dashboard card (aggregate metrics)                                                                                                                      
  - [ ] **3B:** Referral outcomes report (completion rates, outcomes breakdown)                                                                                                          
  - [ ] **3C:** Committee-focused walkthrough tour                                                                                                                                       
                                                                                                                                                                                         
  ### Phase 4: Internal Improvements (Post-Demo)                                                                                                                                         
  **Goal:** Clean architecture for production.                                                                                                                                           
                                                                                                                                                                                         
  - [ ] Capability system migration sweep (replace role checks)                                                                                                                          
  - [ ] Dynamic role builder UI                                                                                                                                                          
  - [ ] Data quality merge workflow
    - [ ] **Person merge** in DataQualityView (parallel to existing org merge)
      - Detect duplicate people by name similarity / email overlap
      - Winner keeps their primary email; loser's primary moves to winner's `secondary_emails` (deduplicated)
      - Reassign referrals (`subject_person_id`, `referring_person_id`), interactions, and affiliations to winner
      - Archive loser record (`status: 'archived'`)
      - See org merge in `DataQualityView.tsx:handleMergeConfirm` as reference pattern                                                                                                                                                      
                                                                                                                                                                                         
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