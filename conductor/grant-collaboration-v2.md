# Plan: Enhanced Collaborative Grant Research (4-Tab Workflow)

## Objective
Transform the Grants feature into a comprehensive 4-stage collaborative workflow: **Monitoring**, **Identification**, **Drafting**, and **Results**. This will facilitate network-wide collaboration on funding opportunities, from discovery to submission.

## Key Files & Context
- `src/domain/grants/types.ts`: Domain models for grants, drafts, and sources.
- `src/data/mockData.ts`: Mock data for development and demo.
- `src/data/repos/grants.ts`: Data access layer for grants.
- `src/features/grants/GrantsView.tsx`: Main UI component.

## Implementation Plan

### Phase 1: Data Model & Repository Enhancements
1. **Update Types** (`src/domain/grants/types.ts`):
    - Update `GrantWorkflowQueue` to: `'monitoring' | 'identification' | 'drafting' | 'results' | 'archived' | 'duplicate'`.
    - Add `final_submission_url` and `awarded_amount` to `GrantOpportunity` for the Results stage.
    - Ensure `GrantDraft` supports PDF source reference.
2. **Expand Mock Data** (`src/data/mockData.ts`):
    - Add `MOCK_MONITORED_SOURCES` for the Monitoring tab.
    - Add `MOCK_GRANT_DRAFTS` linked to existing `MOCK_GRANTS`.
    - Update `MOCK_GRANTS` to distribute across the new queues.
3. **Update Repository** (`src/data/repos/grants.ts`):
    - Add `getMonitoredSources()` and `getDrafts()`.
    - Add `promoteToDraft(opportunityId, initiativeId, initialData)` method.

### Phase 2: UI Refactoring (`src/features/grants/GrantsView.tsx`)
1. **Tab Navigation**:
    - Replace the 2-button toggle with a 4-tab navigation bar: **Monitoring**, **Identification**, **Drafting**, **Results**.
2. **Monitoring Tab**:
    - Display a list of `MonitoredGrantSource` items.
    - Include status (Active/Inactive) and "Last Checked" indicators.
3. **Identification Tab**:
    - Based on the current "Discovery Feed".
    - Add "Promote to Draft" action which opens a modal to select an initiative and lead ESO.
4. **Drafting Tab**:
    - Display active `GrantDraft` records.
    - Detail View:
        - Summary of funder/opportunity.
        - "Interested" vs "Intention to Participate" signals.
        - Question Extraction Section (Simulated): List of questions and collaborative text areas for answers.
        - "Lock for Google Doc" action to freeze Nexus editing.
5. **Results Tab**:
    - Display grants with status `submitted`, `awarded`, or `rejected`.
    - Show award stats and links to final submitted documents.

### Phase 3: Interactive Features
1. **Promote to Draft Modal**:
    - Allow users to customize the initiative context.
    - Notify other interested ESOs (simulated).
2. **Drafting Workspace**:
    - Implement a "Save Version" pattern for collaborative answers.
    - Add "Move to Google Doc" state that disables Nexus editing and displays a link.

## Verification & Testing
1. **Navigation**: Verify clicking each tab loads the correct subset of data.
2. **Workflow Progression**: 
    - Verify "Promote to Draft" moves a grant from Identification to Drafting.
    - Verify a submitted draft moves to the Results tab.
3. **Collaboration Signals**: Check that interest signals are updated across ESOs in the mock data.
4. **Drafting UI**: Ensure the question/answer interface is functional for editing and saving versions.
