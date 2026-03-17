
import type { ExternalRef } from '../organizations/types';

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

// Explicit Membership Model
export interface EcosystemMembership {
  ecosystem_id: string;
  system_role: SystemRole;
  joined_at: string;
}

export interface PersonOrganizationAffiliation {
  organization_id: string;
  role_title?: string;
  relationship_type?: 'founder' | 'owner' | 'employee' | 'advisor' | 'board' | 'other';
  status?: 'active' | 'pending' | 'revoked';
  can_self_manage?: boolean;
  ecosystem_ids?: string[];
  joined_at?: string;
}

// New: People / Contacts
export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  email: string; // Primary email
  secondary_emails?: string[]; // Additional emails for matching (e.g. work + personal)
  avatar_url?: string; // New: Profile photo
  
  // Primary Context (Default)
  role: string; // Job Title
  system_role: SystemRole; // Permissions/Platform Role (Primary/Default)
  organization_id: string; // Link to the organization they belong to
  
  // Multi-tenancy
  ecosystem_id: string; // Primary ecosystem
  memberships: EcosystemMembership[]; // Explicit memberships

  // Multi-organization context
  organization_affiliations?: PersonOrganizationAffiliation[];
  
  // Dual-Role Support (Context Switching)
  secondary_profile?: UserProfile;

  tags?: string[];
  
  // Integration
  external_refs?: ExternalRef[]; // Link people to external IDs (e.g. Salesforce Contact ID)
  external_ids?: Record<string, string>; // Added: Map of external system names to their specific IDs
  
  // Enhanced Profile
  links?: SocialLink[];

  // Personal email templates (stored as named list so user can reuse across referrals)
  referral_templates?: Array<{ id: string; name: string; subject?: string; body: string }>;
}
