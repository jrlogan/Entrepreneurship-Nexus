
export type OrganizationRole = 'startup' | 'funder' | 'eso'; // ESO = Entrepreneur Support Organization
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
  
  // Flexible Tagging
  tags?: string[];
}
