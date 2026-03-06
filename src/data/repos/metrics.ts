
import type { MetricLog } from '../../domain/metrics/types';
import { METRIC_LOGS, ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, canViewOperationalDetails } from '../../domain/access/policy';
import { redactMetric, ADMIN_VIEWER } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

export class MetricsRepo {
  
  constructor(private consentRepo: ConsentRepo) {}

  // Get all metrics visible to viewer based on role and scope
  getAll(viewer: ViewerContext): MetricLog[] {
      // 1. Ecosystem Scoping could be applied here if logs had ecosystem_id
      // For now, we assume METRIC_LOGS contains mix, filter by role context

      // Admin / Eco Manager: See All
      if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) {
          return METRIC_LOGS;
      }
      
      // ESO: See Managed Clients
      if (['eso_admin', 'eso_staff', 'eso_coach'].includes(viewer.role)) {
          const managedOrgs = ALL_ORGANIZATIONS
            .filter(o => o.managed_by_ids?.includes(viewer.orgId))
            .map(o => o.id);
          return METRIC_LOGS.filter(m => managedOrgs.includes(m.organization_id));
      }

      // Entrepreneur: See Own
      if (viewer.role === 'entrepreneur') {
          return METRIC_LOGS.filter(m => m.organization_id === viewer.orgId);
      }

      return [];
  }

  // Legacy: Admin View
  getByOrg(orgId: string): MetricLog[] {
    return this.getByOrgForViewer(ADMIN_VIEWER, orgId);
  }

  // Viewer-Aware
  getByOrgForViewer(viewer: ViewerContext, orgId: string): MetricLog[] {
      const logs = METRIC_LOGS
        .filter(m => m.organization_id === orgId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const org = ALL_ORGANIZATIONS.find(o => o.id === orgId);
      
      if (org) {
          const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, org.id, viewer.ecosystemId);
          if (canViewOperationalDetails(viewer, org, hasConsent)) {
              return logs;
          }
      }

      return logs.map(redactMetric);
  }

  // Get the latest value for a specific metric type for an organization
  getLatestValue(orgId: string, metricType: string): MetricLog | undefined {
    const orgMetrics = this.getByOrg(orgId);
    return orgMetrics.find(m => m.metric_type === metricType);
  }

  add(metric: MetricLog): void {
    METRIC_LOGS.push(metric);
  }

  // Batch add from interaction
  addBatch(metrics: MetricLog[]): void {
      METRIC_LOGS.push(...metrics);
  }
}
