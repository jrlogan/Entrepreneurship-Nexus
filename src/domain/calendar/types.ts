export type EventScope = 'local' | 'regional' | 'state' | 'national';

export type EventStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'rejected'
  | 'approved'
  | 'archived';

export type EventVisibility = 'public' | 'ecosystem_only';

export type EventSourceType = 'ical' | 'rss' | 'url_scrape' | 'email_route';

export type EventSourceFilterMode =
  | 'trust'      // Every event from this source is auto-approved (no AI filter)
  | 'classify';  // Run AI classification + confidence routing

export type EventSubmissionType =
  | 'url_submission'
  | 'url_source_poll'
  | 'ical'
  | 'rss'
  | 'email'
  | 'manual';

export interface EventLocation {
  text: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
}

export interface EventOrganizer {
  name: string;
  email?: string;
  org_id?: string;
}

export interface CalendarEvent {
  id: string;

  // Core
  title: string;
  description: string;
  url?: string;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  location?: EventLocation;
  organizer?: EventOrganizer;
  registration_url?: string;

  // Classification
  tags: string[];
  scope: EventScope;
  geographic_tags: string[];

  // Source tracking
  source_type: EventSubmissionType;
  source_id?: string;
  submitted_by?: string;
  submitted_url?: string;
  source_event_id?: string;
  fingerprint: string;

  // AI
  ai_confidence: number;
  ai_flags: string[];
  ai_reasoning?: string;

  // Workflow
  status: EventStatus;
  visibility: EventVisibility;
  source_ecosystem_id: string;
  visible_in_ecosystems: string[];
  cross_ecosystem_status?: Record<string, 'pending' | 'approved' | 'excluded'>;

  // Audit
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  open_flag_count: number;
}

export interface EventSource {
  id: string;
  name: string;
  type: EventSourceType;
  url?: string;
  email_address?: string;
  ecosystem_id: string;
  linked_org_id?: string;

  // Polling
  active: boolean;
  check_interval_hours: number;
  last_checked_at?: string;
  last_check_status?: 'success' | 'error' | 'needs_manual_check';
  last_error?: string;
  consecutive_failures: number;

  // Behavior
  filter_mode: EventSourceFilterMode;
  auto_approve_threshold: number;
  default_scope?: EventScope;
  default_geographic_tags?: string[];
  default_visibility: EventVisibility;
  default_tags?: string[];

  // Audit
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface EventSourceRun {
  id: string;
  source_id: string;
  ecosystem_id: string;
  started_at: string;
  finished_at?: string;
  status: 'success' | 'error' | 'partial';
  events_found: number;
  events_added: number;
  events_deduped: number;
  error?: string;
}

export type EventFlagType =
  | 'wrong_date'
  | 'wrong_location'
  | 'not_relevant'
  | 'duplicate'
  | 'other';

export interface EventFlag {
  id: string;
  event_id: string;
  ecosystem_id: string;
  flagged_by?: string;
  flag_type: EventFlagType;
  notes?: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_by?: string;
  resolved_at?: string;
}

export const DEFAULT_EVENT_TAGS = [
  'funding-investment',
  'pitch-competition',
  'networking-community',
  'education-workshop',
  'mentorship-coaching',
  'manufacturing-making',
  'real-estate-development',
  'technology-innovation',
  'export-international-trade',
  'marketing-sales',
  'legal-compliance',
  'diversity-inclusion',
] as const;

export const DEFAULT_AUTO_APPROVE_THRESHOLD = 0.85;
export const DEFAULT_PENDING_REVIEW_THRESHOLD = 0.5;
