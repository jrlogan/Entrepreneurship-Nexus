
// Part 1 & 2: Data Interfaces

export interface PortalLink {
  id: string;
  label: string;
  url: string;
  icon?: string; // emoji or svg name
  description?: string;
}

export interface Ecosystem {
  id: string;
  name: string;
  region: string;
  settings: {
    interaction_privacy_default: 'network_shared' | 'eso_private';
  };
  // Configurable checklists available to all initiatives in this ecosystem
  checklist_templates?: ChecklistTemplate[];
  // Configurable pipelines specific to this ecosystem
  pipelines: PipelineDefinition[];
  // Admin configurable links for the client portal
  portal_links?: PortalLink[];
}

export interface ChecklistTemplate {
  id: string;
  name: string; // e.g. "Legal & Admin"
  items: string[]; // e.g. ["Incorporation Documents", "EIN Obtained", "Bank Account Open"]
}

export interface ChecklistProgress {
  template_id: string;
  items_checked: Record<string, boolean>; // {"Incorporation Documents": true}
}

export type OrganizationRole = 'startup' | 'funder' | 'eso'; // ESO = Entrepreneur Support Organization
export type TaxStatus = 'non_profit' | 'for_profit' | 'government' | 'other';

export interface ExternalRef {
  source: string; // e.g. "Salesforce", "HubSpot", "Quickbooks"
  id: string;     // The ID in that external system
  owner_org_id?: string; // The ESO in THIS system that owns this reference. If null, it's a global/public ref.
}

export type Visibility = 'public' | 'private';
export type AccessLevel = 'read' | 'write' | 'admin';

export interface Consent {
  target_org_id: string; // The org allowed to see data
  access_level: AccessLevel;
}

export interface ApiKey {
  id: string;
  label: string;
  prefix: string; // e.g. "sk_live_..."
  created_at: string;
  last_used?: string;
  status: 'active' | 'revoked';
}

// HSDS 3.0 Compliant Organization with Extensions
export interface Organization {
  // HSDS Core Fields
  id: string;
  name: string;
  alternate_name?: string;
  description: string;
  email?: string;
  url?: string;
  tax_status: TaxStatus;
  year_incorporated?: number;
  region?: string;
  
  // Identification
  ein?: string; // Tax ID for precise matching

  // Extensions
  roles: OrganizationRole[];
  demographics: {
    minority_owned: boolean;
    woman_owned: boolean;
    veteran_owned: boolean;
  };
  classification: {
    naics_code?: string;
    industry_tags: string[];
  };
  external_refs: ExternalRef[];
  
  // New: Relationship Management
  managed_by_ids: string[]; // IDs of ESO orgs that count this org as a client
  
  // Privacy
  visibility: Visibility;
  consents: Consent[];
  authorized_eso_ids: string[]; // List of ESOs the client has trusted
  
  // API & Integration
  api_keys?: ApiKey[]; // Only visible to admins of this org
}

// System Roles for User Management
export type SystemRole = 
  | 'platform_admin'    // Super Admin (Sees all ecosystems)
  | 'ecosystem_manager' // Regional Admin (Sees all orgs in region)
  | 'eso_admin'         // Manages specific ESO settings & staff
  | 'eso_staff'         // Standard employee of an ESO
  | 'eso_coach'         // Volunteer/Mentor at an ESO
  | 'entrepreneur';     // Founder/Client

// Secondary Profile for Dual-Role Users (e.g. Staff who is also a Founder)
export interface UserProfile {
  system_role: SystemRole;
  organization_id: string;
  role_title: string; // Job Title in this context
}

export interface SocialLink {
  platform: 'linkedin' | 'twitter' | 'website' | 'github' | 'other';
  url: string;
}

// New: People / Contacts
export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  
  // Primary Context (Default)
  role: string; // Job Title
  system_role: SystemRole; // Permissions/Platform Role
  organization_id: string; // Link to the organization they belong to
  
  // Multi-tenancy
  ecosystem_id: string;
  
  // Dual-Role Support (Context Switching)
  secondary_profile?: UserProfile;

  tags?: string[];
  
  // Integration
  external_refs?: ExternalRef[]; // Link people to external IDs (e.g. Salesforce Contact ID)
  
  // Enhanced Profile
  links?: SocialLink[];
}

export interface PipelineStage {
  id: string; // Added ID for history tracking
  name: string;
  description: string;
  criteria?: string[]; // Checklist items required to pass this stage
}

export interface PipelineDefinition {
  id: string;
  name: string;
  context: 'venture' | 'product' | 'grant'; // Context helps assign pipeline to correct entity aspect
  applicable_types: string[];
  stages: PipelineStage[];
}

export interface StageHistoryLog {
  stage_index: number;
  stage_id: string;
  entered_at: string; // ISO Date
  exited_at?: string; // ISO Date (null if current)
}

export interface Initiative {
  id: string;
  organization_id: string;
  pipeline_id: string;
  name: string;
  current_stage_index: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  ecosystem_id: string; // Scoped to ecosystem
  notes?: string;
  
  // Longitudinal Tracking
  stage_history: StageHistoryLog[];
  
  // Configurable Ecosystem Checklists
  checklists: ChecklistProgress[];
}

export type MetricType = 'revenue' | 'jobs_ft' | 'jobs_pt';
export type MetricSource = 'self_reported' | 'verified';

export interface MetricLog {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  date: string; // ISO Date string
  metric_type: MetricType;
  value: number;
  source: MetricSource;
}

export type InteractionType = 'meeting' | 'email' | 'call' | 'event' | 'note';
export type InteractionVisibility = 'network_shared' | 'eso_private';

// Interface for the Interaction (Meeting Notes) example for Security Rules
export interface Interaction {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  author_org_id: string; // Who created this note
  date: string;
  type: InteractionType;
  visibility: InteractionVisibility;
  notes: string;
  attendees?: string[];
  recorded_by?: string;
}

export type ReferralStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export interface Referral {
  id: string;
  referring_org_id: string; // Who sent it
  receiving_org_id: string; // Who received it
  subject_person_id: string; // Who is being introduced
  subject_org_id?: string; // What company are they with
  date: string;
  status: ReferralStatus;
  notes: string; // The "Intro" note
  response_notes?: string; // Notes from the receiver
  intro_email_sent?: boolean; // New: Automatic email
}

// Ongoing Services (Long-range interactions)
export interface Service {
  id: string;
  name: string; // e.g. "Incubator Tenant", "Makerspace Membership"
  provider_org_id: string; // The ESO providing the service
  
  // Recipient can be Organization OR Person
  recipient_org_id?: string; 
  recipient_person_id?: string;
  
  start_date: string;
  end_date?: string; // Null if ongoing
  status: 'active' | 'past';
  description?: string;
}

// Data Quality
export interface DuplicateMatch {
  primary_id: string;
  duplicate_id: string;
  confidence_score: number; // 0-100
  match_reason: string[]; // e.g., ["Same Website", "Similar Name"]
}
