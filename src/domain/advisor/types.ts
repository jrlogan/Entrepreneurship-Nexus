
export type SuggestionType = 'action' | 'resource' | 'referral' | 'connection';

export interface AdvisorSuggestion {
  id: string; // Generated ID (can be transient)
  title: string;
  reason: string;
  type: SuggestionType;
  confidence_score: number; // 0-100
  
  // Contextual Payload
  target_id?: string; // ID of the resource, org, or person suggested
  action_url?: string; // URL if it's a direct resource link
  priority?: 'high' | 'medium' | 'low';
}

export interface AdvisorResponse {
  suggestions: AdvisorSuggestion[];
}

export interface AdvisorResource {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface AdvisorConfig {
  system_instruction_template: string;
  max_suggestions: number;
  min_confidence: number;
  
  // New Settings
  enable_advisor_suggestions: boolean;
  enable_referral_suggestions: boolean;
  resources: AdvisorResource[];
}

export interface AdvisorAcceptanceResult {
  todo_payload?: any; // Partial<Todo>
  referral_payload?: any; // Partial<Referral>
  audit_event: {
    event: 'suggestion_accepted';
    suggestion_id: string;
    actor_id: string;
    timestamp: string;
  };
}
