
export type MetricKind = 'snapshot' | 'interval';
// Expanded aggregation to handle time vs entity dimensions distinctively
export type TimeAggregation = 'last' | 'sum' | 'avg' | 'count' | 'unique_count' | 'max' | 'min';
export type EntityAggregation = 'sum' | 'avg' | 'count' | 'unique_count';

export type MetricScope = 'person' | 'organization' | 'initiative' | 'ecosystem';
export type MetricDataSource = 'manual' | 'computed' | 'event_derived';
export type MetricUnit = 'number' | 'currency' | 'hours' | 'boolean' | 'enum' | 'text' | 'count';
export type MetricValueType = 'number' | 'string' | 'boolean' | 'json';
export type MetricPrivacy = 'public' | 'internal' | 'operational_sensitive' | 'aggregate_only';

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  kind: MetricKind;
  
  // New: Split aggregation logic
  aggregation: {
    within_time: TimeAggregation;
    across_entities: EntityAggregation;
  };
  
  unit: MetricUnit;
  value_type: MetricValueType;
  scope: MetricScope;
  source: MetricDataSource;
  
  // Configuration
  options?: string[]; // For enum units
  enum_key?: string; // Reference to global ENUMS
  computation_key?: string; // For derived metrics
  privacy: MetricPrivacy;
  tags?: string[];
}

export interface MetricSetDefinition {
  id: string;
  name: string;
  description: string;
  metric_ids: string[];
  trigger_context?: string; 
  recommended_period?: 'annual' | 'quarterly' | 'monthly' | 'ad_hoc';
}

// Enhanced Observation Record (Backward compatible with FlexibleMetricValue)
export interface MetricObservation {
  id: string;
  metric_id: string;
  
  // Context
  ecosystem_id?: string;
  scope_type: MetricScope; // 'organization', 'person', etc.
  scope_id: string; // The ID of the organization/person
  
  // Time Dimension
  timestamp: string; // ISO Date (The 'As Of' date for snapshots, or occurrence date for events)
  period_start?: string; // For interval summaries (e.g. "Jan 1")
  period_end?: string;   // For interval summaries (e.g. "Jan 31")
  
  // Value
  value: any;
  
  // Metadata
  context_id?: string; // Link to Assignment ID if applicable
  notes?: string;
  source_record_refs?: string[]; // IDs of Interactions/Referrals that justified this value
}

// Alias for backward compatibility
export type FlexibleMetricValue = {
  entity_id: string; // Maps to scope_id
} & Omit<MetricObservation, 'scope_id' | 'scope_type'>;

export interface ReportResult {
  metric_set_id: string;
  scope_id?: string; // If reporting on a specific entity
  period_start?: string;
  period_end?: string;
  as_of?: string;
  results: {
    metric: MetricDefinition;
    value: any;
    status: 'auto' | 'reported' | 'confirmed';
    observation_count?: number;
  }[];
}

// --- Collection Workflow Types ---

export type AssignmentStatus = 'pending' | 'submitted' | 'completed' | 'overdue';

export interface MetricAssignment {
  id: string;
  metric_set_id: string;
  ecosystem_id: string;
  
  // Who/What is being measured
  scope_type: MetricScope;
  scope_id: string;
  
  // Assignment details
  assigned_to_id?: string; // Specific user responsible (optional, else defaults to scope owner)
  assigned_by_id: string;
  assigned_at: string;
  
  // Timing requirements
  status: AssignmentStatus;
  due_date: string;
  
  // The period this assignment covers (pre-filled defaults for the user)
  period_start?: string;
  period_end?: string;
  as_of_date?: string; // Default 'as-of' for snapshots
  
  completed_at?: string;
  completed_by?: string;
}
