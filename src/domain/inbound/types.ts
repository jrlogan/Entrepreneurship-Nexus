export type InboundActivityType = 'introduction' | 'referral' | 'followup' | 'outcome' | 'grant';
export type InboundParseStatus = 'pending' | 'parsed' | 'failed';
export type InboundReviewStatus = 'unreviewed' | 'needs_review' | 'approved' | 'rejected';
export type IntroContactPermission = 'on_file' | 'newly_confirmed' | 'not_confirmed' | 'unknown';
export type VentureStage =
  | 'idea'
  | 'prototype'
  | 'early_revenue'
  | 'sustaining'
  | 'multi_person'
  | 'established'
  | 'unknown';
export type SupportNeed =
  | 'funding'
  | 'legal'
  | 'business_coaching'
  | 'product_development'
  | 'manufacturing'
  | 'marketing'
  | 'sales'
  | 'hiring'
  | 'workspace'
  | 'networking'
  | 'other';

export interface InboundRoute {
  id: string;
  route_address: string;
  ecosystem_id: string;
  activity_type: InboundActivityType;
  allowed_sender_domains: string[];
  is_active: boolean;
}

export interface AuthorizedSenderDomain {
  id: string;
  ecosystem_id: string;
  organization_id: string;
  domain: string;
  is_active: boolean;
  access_policy?: 'approved' | 'invite_only' | 'request_access' | 'blocked';
  allow_sender_affiliation?: boolean;
  allow_auto_acknowledgement?: boolean;
  allow_invite_prompt?: boolean;
}

export interface InboundMessage {
  id: string;
  provider: 'postmark' | 'imap' | 'manual' | 'unknown';
  provider_message_id?: string;
  message_id_header?: string;
  route_address: string;
  ecosystem_id: string;
  activity_type: InboundActivityType;
  from_email: string;
  to_emails: string[];
  cc_emails?: string[];
  subject: string;
  text_body?: string;
  html_body?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ name: string; content_type: string; size_bytes?: number }>;
  raw_payload?: Record<string, unknown>;
  parse_status: InboundParseStatus;
  review_status: InboundReviewStatus;
  received_at: string;
}

export interface InboundParseResult {
  id: string;
  inbound_message_id: string;
  candidate_person_email?: string;
  candidate_person_name?: string;
  candidate_venture_name?: string;
  candidate_receiving_org_id?: string;
  candidate_referring_org_id?: string;
  intro_contact_permission?: IntroContactPermission;
  venture_stage?: VentureStage;
  support_needs?: SupportNeed[];
  confidence: number;
  needs_review_reasons: string[];
}

export interface ResolvePersonRequest {
  email?: string;
  full_name?: string;
  organization_name?: string;
  ecosystem_id?: string;
}

export interface ResolvePersonResult {
  match_found: boolean;
  confidence: number;
  person_id?: string;
  organization_id?: string;
  network_profile_url?: string;
}

export interface ResolveOrganizationRequest {
  name: string;
  domain?: string;
  ecosystem_id?: string;
}

export interface ResolveOrganizationResult {
  match_found: boolean;
  confidence: number;
  organization_id?: string;
}
