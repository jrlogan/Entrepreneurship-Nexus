
import { MetricDefinition, MetricSetDefinition } from './reporting_types';

// --- 1. Activity / Operational Metrics ---
export const ACTIVITY_METRICS: MetricDefinition[] = [
  {
    id: 'activity_interactions_count',
    name: 'Total Interactions',
    description: 'Number of recorded meetings, calls, or notes.',
    kind: 'interval',
    aggregation: { within_time: 'count', across_entities: 'sum' },
    unit: 'count',
    value_type: 'number',
    scope: 'organization',
    source: 'event_derived',
    computation_key: 'count_interactions',
    privacy: 'internal'
  },
  {
    id: 'activity_hours_supported',
    name: 'Hours of Support',
    description: 'Estimated time spent supporting this entity.',
    kind: 'interval',
    aggregation: { within_time: 'sum', across_entities: 'sum' },
    unit: 'hours',
    value_type: 'number',
    scope: 'organization',
    source: 'event_derived',
    computation_key: 'sum_interaction_hours',
    privacy: 'internal'
  },
  {
    id: 'activity_referrals_sent',
    name: 'Referrals Sent',
    description: 'Outbound referrals made for this entity.',
    kind: 'interval',
    aggregation: { within_time: 'count', across_entities: 'sum' },
    unit: 'count',
    value_type: 'number',
    scope: 'organization',
    source: 'event_derived',
    computation_key: 'count_referrals_sent',
    privacy: 'internal'
  }
];

// --- 2. Impact / Economic Metrics ---
export const IMPACT_METRICS: MetricDefinition[] = [
  {
    id: 'impact_jobs_ft',
    name: 'Full-Time Jobs',
    description: 'Number of FTE employees.',
    kind: 'snapshot',
    aggregation: { within_time: 'last', across_entities: 'sum' },
    unit: 'count',
    value_type: 'number',
    scope: 'organization',
    source: 'manual',
    privacy: 'operational_sensitive'
  },
  {
    id: 'impact_revenue_annual',
    name: 'Annual Revenue',
    description: 'Gross revenue for the fiscal year.',
    kind: 'interval',
    aggregation: { within_time: 'sum', across_entities: 'sum' },
    unit: 'currency',
    value_type: 'number',
    scope: 'organization',
    source: 'manual',
    privacy: 'operational_sensitive'
  },
  {
    id: 'impact_capital_raised',
    name: 'Total Capital Raised',
    description: 'Cumulative investment funding.',
    kind: 'snapshot',
    aggregation: { within_time: 'last', across_entities: 'sum' },
    unit: 'currency',
    value_type: 'number',
    scope: 'organization',
    source: 'manual', // Could be derived from 'Funding' pipeline later
    privacy: 'operational_sensitive'
  },
  {
    id: 'impact_revenue_band_quarterly',
    name: 'Quarterly Revenue (Band)',
    description: 'Approximate revenue for the current quarter.',
    kind: 'interval',
    aggregation: { within_time: 'last', across_entities: 'count' }, // Count distribution of bands
    unit: 'enum',
    value_type: 'string',
    options: ['Pre-Revenue', '< $10k', '$10k - $50k', '$50k - $250k', '$250k+'],
    scope: 'organization',
    source: 'manual',
    privacy: 'operational_sensitive'
  }
];

// --- 3. Makerspace / Facility Stats ---
export const FACILITY_METRICS: MetricDefinition[] = [
    {
        id: 'facility_sqft',
        name: 'Facility Size (SqFt)',
        kind: 'snapshot',
        aggregation: { within_time: 'last', across_entities: 'sum' },
        unit: 'number',
        value_type: 'number',
        scope: 'organization',
        source: 'manual',
        privacy: 'public'
    },
    {
        id: 'facility_active_members',
        name: 'Active Members',
        kind: 'snapshot',
        aggregation: { within_time: 'last', across_entities: 'sum' },
        unit: 'count',
        value_type: 'number',
        scope: 'organization',
        source: 'manual',
        privacy: 'public'
    }
];

export const ALL_METRIC_DEFINITIONS = [
    ...ACTIVITY_METRICS,
    ...IMPACT_METRICS,
    ...FACILITY_METRICS
];

// --- Metric Sets (Collection Bundles) ---

export const METRIC_SETS: MetricSetDefinition[] = [
  {
    id: 'set_org_overview',
    name: 'Organization Overview',
    description: 'Live automated stats from platform activity.',
    metric_ids: ['activity_interactions_count', 'activity_hours_supported', 'activity_referrals_sent'],
    recommended_period: 'ad_hoc'
  },
  {
    id: 'set_quarterly_checkin',
    name: 'Quarterly Founder Check-in',
    description: 'Quick health check on growth and needs.',
    metric_ids: ['impact_jobs_ft', 'impact_revenue_band_quarterly'],
    trigger_context: 'quarterly_task',
    recommended_period: 'quarterly'
  },
  {
      id: 'set_annual_impact',
      name: 'Annual Impact Survey',
      description: 'Detailed economic impact reporting.',
      metric_ids: ['impact_jobs_ft', 'impact_revenue_annual', 'impact_capital_raised'],
      recommended_period: 'annual'
  },
  {
      id: 'set_annual_facility',
      name: 'Annual Facility Baseline',
      description: 'Capacity reporting for spaces.',
      metric_ids: ['facility_sqft', 'facility_active_members'],
      trigger_context: 'annual_survey',
      recommended_period: 'annual'
  }
];
