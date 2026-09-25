
export type InteractionType = 'meeting' | 'email' | 'call' | 'event' | 'note';
export type InteractionVisibility = 'network_shared' | 'eso_private';

// Interface for the Interaction (Meeting Notes)
import type { RecordAccessTier } from '../access/recordAccess';

export interface Interaction {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  author_org_id: string; // Who created this note

  date: string;
  type: InteractionType;
  
  // General Visibility Scope (Network vs Private to ESO)
  visibility: InteractionVisibility;

  // Specific Privacy Override (Confidentiality)
  // If true, this note is strictly visible ONLY to the authoring organization and system admins.
  // It overrides any "Open" operational visibility settings of the subject organization.
  note_confidential: boolean; 

  notes: string;
  attendees?: string[];
  recorded_by?: string;
  /** The venture founder this is about, when known. */
  subject_person_id?: string | null;
  /** Set by the network view: how much of this record the viewer was given. */
  _access?: RecordAccessTier;

}
