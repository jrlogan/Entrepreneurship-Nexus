
import { 
    MetricDefinition, 
    MetricSetDefinition, 
    MetricObservation, 
    ReportResult,
    MetricScope,
    MetricAssignment,
    AssignmentStatus
} from '../../domain/metrics/reporting_types';
import { ALL_METRIC_DEFINITIONS, METRIC_SETS as SYSTEM_METRIC_SETS } from '../../domain/metrics/reporting_config';
import { MOCK_INTERACTIONS, MOCK_REFERRALS } from '../mockData';
import { ViewerContext } from '../../domain/access/policy';

interface ReportParams {
    ecosystem_id?: string;
    scope_type: MetricScope;
    scope_id?: string; // If null, aggregate all in ecosystem
    period_start?: string; // YYYY-MM-DD
    period_end?: string;
    as_of?: string; // Defaults to now
}

export class FlexibleMetricsRepo {
  private observations: MetricObservation[] = [];
  private customMetricSets: MetricSetDefinition[] = [];
  private assignments: MetricAssignment[] = [];

  constructor() {
    this.loadFromStorage();
    if (this.observations.length === 0) {
        this.seedMockValues();
    }
  }

  private loadFromStorage() {
      if (typeof window === 'undefined') return;
      try {
          const storedObs = localStorage.getItem('nexus_metrics_observations');
          if (storedObs) this.observations = JSON.parse(storedObs);

          const storedAssigns = localStorage.getItem('nexus_metrics_assignments');
          if (storedAssigns) this.assignments = JSON.parse(storedAssigns);

          const storedSets = localStorage.getItem('nexus_metrics_custom_sets');
          if (storedSets) this.customMetricSets = JSON.parse(storedSets);
      } catch (e) {
          console.error("Failed to load metrics data", e);
      }
  }

  private saveToStorage() {
      if (typeof window === 'undefined') return;
      localStorage.setItem('nexus_metrics_observations', JSON.stringify(this.observations));
      localStorage.setItem('nexus_metrics_assignments', JSON.stringify(this.assignments));
      localStorage.setItem('nexus_metrics_custom_sets', JSON.stringify(this.customMetricSets));
  }

  // --- Configuration Access ---
  
  getDefinitions(): MetricDefinition[] {
    return ALL_METRIC_DEFINITIONS;
  }

  getMetricSets(): MetricSetDefinition[] {
    return [...SYSTEM_METRIC_SETS, ...this.customMetricSets];
  }

  getMetricSet(id: string): MetricSetDefinition | undefined {
    return this.getMetricSets().find(s => s.id === id);
  }

  createMetricSet(set: MetricSetDefinition): void {
      this.customMetricSets.push(set);
      this.saveToStorage();
  }

  // --- Assignment Management ---

  listAssignments(viewer: ViewerContext): MetricAssignment[] {
      let relevant = this.assignments.filter(a => a.ecosystem_id === viewer.ecosystemId);
      if (viewer.role === 'entrepreneur') {
          relevant = relevant.filter(a => a.assigned_to_id === viewer.personId || a.scope_id === viewer.orgId);
      }
      return relevant.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }

  createAssignment(assignment: MetricAssignment): void {
      this.assignments.push(assignment);
      this.saveToStorage();
  }

  updateAssignmentStatus(id: string, status: AssignmentStatus, actorId: string): void {
      const assign = this.assignments.find(a => a.id === id);
      if (assign) {
          assign.status = status;
          if (status === 'completed') {
              assign.completed_at = new Date().toISOString();
              assign.completed_by = actorId;
          }
          this.saveToStorage();
      }
  }

  // --- Observation Management ---

  saveObservation(obs: MetricObservation): void {
    if (!obs.timestamp) obs.timestamp = new Date().toISOString();
    
    if (obs.context_id) {
        const existingIdx = this.observations.findIndex(o => 
            o.metric_id === obs.metric_id && 
            o.context_id === obs.context_id
        );
        if (existingIdx >= 0) {
            this.observations[existingIdx] = obs;
        } else {
            this.observations.push(obs);
        }
    } else {
        this.observations.push(obs);
    }
    this.saveToStorage();
  }

  getObservationsForAssignment(assignmentId: string): MetricObservation[] {
      return this.observations.filter(o => o.context_id === assignmentId);
  }

  // --- Reporting Logic ---

  getReport(metricSetId: string, params: ReportParams): ReportResult {
    const set = this.getMetricSet(metricSetId);
    if (!set) return { metric_set_id: metricSetId, results: [] };

    const results = set.metric_ids.map(metricId => {
      const def = ALL_METRIC_DEFINITIONS.find(d => d.id === metricId);
      if (!def) return null;

      let value: any = null;
      let status: 'auto' | 'reported' | 'confirmed' = 'reported';
      
      const obs = this.getObservations(def, params);

      // Check if derived
      if (def.source === 'event_derived' || def.source === 'computed') {
        const derivedValue = this.computeDerivedValue(def, params);
        
        // If we have stored observations for this derived metric in this period/context,
        // it means the user "Confirmed" or "Snapshot" it.
        // We prioritize the confirmed snapshot to ensure the report matches what was submitted.
        if (obs.length > 0) {
            value = this.aggregateObservations(def, obs);
            status = 'confirmed';
        } else {
            value = derivedValue;
            status = 'auto';
        }
      } else {
        // Manual metrics
        value = this.aggregateObservations(def, obs);
        status = 'reported';
      }

      return {
        metric: def,
        value,
        status, // Replaces 'is_derived'
        observation_count: obs.length
      };
    }).filter(Boolean) as any[];

    return {
      metric_set_id: metricSetId,
      scope_id: params.scope_id,
      results
    };
  }

  public calculateDerived(metricId: string, params: ReportParams): any {
      const def = ALL_METRIC_DEFINITIONS.find(d => d.id === metricId);
      if (!def) return 0;
      return this.computeDerivedValue(def, params);
  }

  private computeDerivedValue(def: MetricDefinition, params: ReportParams): any {
    const start = params.period_start || '1970-01-01';
    const end = params.period_end || new Date().toISOString();
    
    let interactions = MOCK_INTERACTIONS.filter(i => i.date >= start && i.date <= end);
    let referrals = MOCK_REFERRALS.filter(r => r.date >= start && r.date <= end);

    if (params.scope_id) {
        if (params.scope_type === 'organization') {
            interactions = interactions.filter(i => i.organization_id === params.scope_id);
            referrals = referrals.filter(r => r.referring_org_id === params.scope_id);
        }
    }

    switch (def.computation_key) {
        case 'count_interactions':
            return interactions.length;
        case 'sum_interaction_hours':
            return interactions.reduce((acc, i) => {
                if (i.type === 'meeting') return acc + 1;
                if (i.type === 'event') return acc + 2;
                if (i.type === 'call') return acc + 0.5;
                return acc + 0.25;
            }, 0);
        case 'count_referrals_sent':
            return referrals.length;
        default:
            return 0;
    }
  }

  private getObservations(def: MetricDefinition, params: ReportParams): MetricObservation[] {
      let relevant = this.observations.filter(o => o.metric_id === def.id);
      
      if (params.scope_id) {
          relevant = relevant.filter(o => o.scope_id === params.scope_id);
      }

      // Filter by Time
      if (def.kind === 'interval' && params.period_start) {
          // Keep observations that fall within or overlap the period (simplified)
          relevant = relevant.filter(o => o.timestamp >= params.period_start! && o.timestamp <= (params.period_end || new Date().toISOString()));
      }

      return relevant.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private aggregateObservations(def: MetricDefinition, obs: MetricObservation[]): any {
      if (obs.length === 0) return 0;

      const method = def.aggregation.within_time;

      if (method === 'last') {
          return obs[0].value;
      }
      if (method === 'sum') {
          return obs.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      }
      if (method === 'count') {
          return obs.length;
      }
      if (method === 'max') {
          return Math.max(...obs.map(o => Number(o.value) || 0));
      }
      if (method === 'min') {
          return Math.min(...obs.map(o => Number(o.value) || 0));
      }
      
      return obs[0].value;
  }

  private seedMockValues() {
    const dsId = 'org_darkstar_001';
    this.saveObservation({
        id: 'obs_init_1',
        metric_id: 'impact_revenue_annual',
        scope_type: 'organization',
        scope_id: dsId,
        timestamp: '2023-01-01',
        value: 150000
    });
    this.saveObservation({
        id: 'obs_init_2',
        metric_id: 'impact_jobs_ft',
        scope_type: 'organization',
        scope_id: dsId,
        timestamp: '2023-11-01',
        value: 4
    });
  }
}
