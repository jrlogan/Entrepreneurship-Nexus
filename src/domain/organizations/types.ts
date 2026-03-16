
import type { SupportNeed } from '../inbound/types';

export type OrganizationRole =
  | 'startup'
  | 'small_business'
  | 'nonprofit'
  | 'government'
  | 'education'
  | 'funder'
  | 'service_provider'
  | 'workspace'
  | 'community_org'
  | 'anchor_institution'
  | 'eso'; // ESO = Entrepreneur Support Organization
export type TaxStatus = 'non_profit' | 'for_profit' | 'government' | 'other';

export interface ExternalRef {
  source: string; // e.g. "Salesforce", "HubSpot", "Quickbooks"
  id: string;     // The ID in that external system
  owner_org_id?: string; // The ESO in THIS system that owns this reference. If null, it's a global/public ref.
}

export type OperationalVisibility = 'open' | 'restricted';
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

export interface Webhook {
  id: string;
  url: string;
  description?: string;
  events: string[]; // e.g. ['referral.received', 'organization.created']
  secret: string; // Signing secret (whsec_...)
  status: 'active' | 'inactive' | 'failed';
  created_at: string;
  last_delivery?: string;
  // Configuration for payload type
  payload_format?: 'full_resource' | 'delta'; // Default 'full_resource'
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
  logo_url?: string; // New: Brand image
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
  operational_visibility: OperationalVisibility; // Replaces 'visibility'
  // consents: Consent[]; // REMOVED: Managed via ConsentPolicy repo now
  authorized_eso_ids: string[]; // List of ESOs the client has trusted (Legacy/Metadata)
  
  // Lifecycle
  status?: 'active' | 'archived'; // For soft deletion / merging

  // API & Integration
  version: number; // For Optimistic Concurrency Control (prevents overwrite of newer data)
  api_keys?: ApiKey[]; // Only visible to admins of this org
  webhooks?: Webhook[]; // New: Webhook subscriptions

  // Multi-tenancy
  ecosystem_ids: string[]; // Organizations can participate in multiple ecosystems
  removed_from_ecosystem_ids?: string[]; // Ecosystems this org was explicitly removed from (soft remove per ecosystem)
  
  // External ID Mapping
  external_ids?: Record<string, string>; // Added: Map of external system names to their specific IDs

  // Flexible Tagging
  tags?: string[];

  // ESO Service Catalog
  support_offerings?: SupportNeed[];

  // Referral intake settings (for receiving organizations)
  referral_intake_prefs?: {
    // Set to true if this org manages its own communications with entrepreneurs
    // and does not want Nexus to send the referral_follow_up intro to the referred person.
    suppress_entrepreneur_intro?: boolean;
    // Override the email address used for inbound referral notifications.
    // Falls back to the organization's primary email field.
    intake_contact_email?: string;
  };

  // Email templates editable by ESO staff (named list so staff can pick per-situation)
  referral_templates?: Array<{ id: string; name: string; subject?: string; body: string }>;
}
