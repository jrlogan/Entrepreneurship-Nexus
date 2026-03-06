
import { AdvisorSuggestion, AdvisorAcceptanceResult } from '../advisor/types';

export type InteractionType = 'meeting' | 'email' | 'call' | 'event' | 'note';
export type InteractionVisibility = 'network_shared' | 'eso_private';

// Interface for the Interaction (Meeting Notes)
export interface Interaction {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  author_org_id: string; // Who created this note
  
  // Optional Linkage to specific Project/Initiative
  initiative_id?: string;

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

  // AI Advisor Extensions
  advisor_run_id?: string;
  advisor_suggestions?: AdvisorSuggestion[]; // Snapshot of suggestions made during this interaction
  advisor_acceptances?: AdvisorAcceptanceResult[]; // Decisions made on those suggestions
}
