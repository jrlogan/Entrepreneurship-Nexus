import type { OrganizationRole, TaxStatus } from '../organizations/types';

export type OpportunityStatus = 'new' | 'qualified' | 'pursuing' | 'submitted' | 'awarded' | 'rejected' | 'archived';
export type Scale = 'local' | 'regional' | 'national' | 'international';
export type ElevationLevel = 0 | 1 | 2 | 3; // 0: Discovery, 1: Network Interest, 2: Elevated (Collaborative), 3: Active Bid
export type GrantOpportunityVisibility = 'network_shared' | 'trusted_network' | 'private_draft';
export type GrantSourceType = 'newsletter' | 'website' | 'aggregator' | 'email_webhook' | 'manual';
export type MatchConfidence = 'low' | 'medium' | 'high';
export type GrantWorkflowQueue = 'monitoring' | 'identification' | 'drafting' | 'results' | 'archived' | 'duplicate';

export interface GrantEligibilityProfile {
  geography_focus?: string[];
  eligible_org_roles?: OrganizationRole[];
  eligible_tax_statuses?: TaxStatus[];
  requires_fiscal_sponsor?: boolean;
  min_budget?: number;
  notes?: string;
}

export interface GrantSourceEvidence {
  source_id?: string;
  source_name: string;
  source_type: GrantSourceType;
  source_url?: string;
  discovered_at: string;
  last_verified_at?: string;
  confidence: MatchConfidence;
}

export interface GrantInterestSignal {
  organization_id: string;
  initiative_id?: string;
  expressed_at: string;
  type: 'watching' | 'eligible' | 'pursuing' | 'participating';
  note?: string;
}

export interface GrantElevationSummary {
  score: number;
  interest_count: number;
  eligible_match_count: number;
  collaboration_ready_match_count: number;
  reasons: string[];
}

export interface PartnershipRecommendation {
  lead_org_id: string;
  partner_org_ids: string[];
  rationale: string;
  suggested_roles: Record<string, string>; // orgId -> role description
}

export interface GrantOpportunity {
  id: string;
  funder_id: string; // Links to Organization with role 'funder'
  funder_name: string;
  title: string;
  summary: string;
  description?: string;
  deadline?: string;
  is_rolling?: boolean;
  award_amount?: {
    min: number;
    max: number;
    currency: string;
  };
  application_url?: string;
  target_audience: 'eso' | 'entrepreneur';
  
  // Research Metadata
  scale: Scale;
  tags: string[];
  relevance_score?: number; // 0-100
  visibility?: GrantOpportunityVisibility;
  eligibility?: GrantEligibilityProfile;
  source_evidence?: GrantSourceEvidence[];
  
  // Network/Collaboration State
  status: OpportunityStatus;
  elevation_level: ElevationLevel;
  interested_eso_ids: string[]; // ESOs "watching"
  pursuing_eso_ids: string[];   // ESOs actively applying
  workflow_queue?: GrantWorkflowQueue;
  workflow_note?: string;
  duplicate_of_grant_id?: string;
  interest_signals?: GrantInterestSignal[];
  elevation_summary?: GrantElevationSummary;
  
  // Results Data
  final_submission_url?: string;
  actual_award_amount?: number;
  submission_date?: string;
  
  // AI Recommendations
  partnership_blueprint?: PartnershipRecommendation;
  
  // Ecosystem Scope
  ecosystem_id: string;
  created_at: string;
  updated_at: string;
}

export interface MonitoredGrantSource {
  id: string;
  name: string;
  url: string;
  type: 'newsletter' | 'website' | 'aggregator' | 'email_webhook';
  status: 'active' | 'inactive';
  last_checked_at?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

// Extension for Initiative to support matching
export interface GrantResearchContext {
  funding_keywords: string[];
  min_grant_amount?: number;
  is_open_for_collaboration: boolean;
  preferred_funder_types?: string[];
  preferred_roles?: string[];
  eligible_geographies?: string[];
}

export interface ExtractedQuestion {
  id: string; // e.g. "q_0", "q_1"
  order: number;
  section_label?: string;
  question_text: string;
  char_limit?: number;
  word_limit?: number;
  hidden?: boolean;
}

export interface DraftAnswer {
  question_id: string;
  text: string;
  last_revised?: string;
  revised_by?: string;
  is_final?: boolean;
}

export interface GrantDraft {
  id: string;
  title: string;
  opportunity_id: string;
  strategy_angle?: string;
  initiative_id?: string;
  lead_org_id: string;
  status: 'extracting' | 'ready' | 'drafting' | 'review' | 'submitted' | 'moved_to_google_doc' | 'error';
  google_doc_url?: string;
  pdf_source_url?: string;
  questions: ExtractedQuestion[];
  answers: DraftAnswer[];
  global_revision_note?: string;
  ecosystem_id: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  processing_error?: string;
}
