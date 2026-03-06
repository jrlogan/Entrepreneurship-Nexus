
export type MetricType = 
  | 'revenue' 
  | 'jobs_ft' 
  | 'jobs_pt' 
  | 'capital_raised' 
  | 'patents_filed' 
  | 'customer_count'
  | 'grant_funding';

export type MetricSource = 'self_reported' | 'verified' | 'interaction_log';

export interface MetricLog {
  id: string;
  organization_id: string;
  ecosystem_id: string;
  date: string; // ISO Date string
  metric_type: MetricType;
  value: number;
  source: MetricSource;
  notes?: string; // Context (e.g. "Series A closing")
  interaction_id?: string; // Link to the meeting where this was captured
}
