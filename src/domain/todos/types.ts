
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed';
export type TodoSource = 'manual' | 'advisor' | 'system_workflow';

export interface Todo {
  id: string;
  ecosystem_id: string;
  owner_id: string; // The Person this todo belongs to
  
  title: string;
  description?: string;
  status: TodoStatus;
  source: TodoSource;
  due_date?: string; // ISO Date String

  // Metadata for auditing & lineage
  created_at: string;
  created_by: string; // Person ID or 'system'
  interaction_id?: string; // Optional: Link to a specific interaction/meeting note
  
  // Logic Links
  suggestion_reference_id?: string; // If created from an AdvisorSuggestion
  linked_resource_id?: string; // ID of an Org, Person, or Resource related to this task
  action_url?: string; // Direct link to perform action (e.g. external form)
}
