
export type ReferralStatus = 'pending' | 'accepted' | 'rejected' | 'completed';
export type ReferralIntakeType = 'referral' | 'self_introduction' | 'access_request';

export interface Referral {
  id: string;
  ecosystem_id: string | null; // Added: Ecosystem scoping
  referring_org_id: string | null; // Who sent it (nullable for BCC)
  referring_person_id?: string | null; // Staff member who made the referral (if known)
  receiving_org_id: string | null; // Who received it (nullable for BCC)
  subject_person_id: string | null; // Who is being introduced
  subject_org_id?: string | null; // What company are they with
  date: string;
  status: ReferralStatus;
  notes: string; // The "Intro" note
  intake_type?: ReferralIntakeType;
  response_notes?: string; // Notes from the receiver
  intro_email_sent?: boolean; // New: Automatic email
  source?: 'manual_ui' | 'bcc_intake' | 'api' | null; // Added: Origin tracking
  
  // Lifecycle & Tracking
  accepted_at?: string;
  invite_sent_at?: string;   // ← add this line
  declined_at?: string;
  delivered_at?: string;
  closed_at?: string;
  outcome?: string; // New: Standardized Outcome Enum ID
  outcome_tags?: string[]; // e.g. "Funding Received", "Partnership"
  owner_id?: string; // Staff member at receiving org
  follow_up_date?: string;
}
