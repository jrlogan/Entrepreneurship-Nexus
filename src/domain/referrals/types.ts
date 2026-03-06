
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
  
  // Lifecycle & Tracking
  accepted_at?: string;
  declined_at?: string;
  delivered_at?: string;
  closed_at?: string;
  outcome?: string; // New: Standardized Outcome Enum ID
  outcome_tags?: string[]; // e.g. "Funding Received", "Partnership"
  owner_id?: string; // Staff member at receiving org
  follow_up_date?: string;
}
