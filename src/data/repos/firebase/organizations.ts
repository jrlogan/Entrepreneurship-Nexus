import { queryCollection, whereEquals, getDocument, setDocument, updateDocument, whereIn } from '../../../services/firestoreClient';
import type { Organization, ApiKey, Webhook } from '../../../domain/organizations/types';
import type { ViewerContext } from '../../../domain/access/policy';
import { explainOrgAccess, canViewOperationalDetails } from '../../../domain/access/policy';
import { redactOrganization } from '../../../domain/access/redaction';
import { ConsentRepo } from '../consent';

export class FirebaseOrganizationsRepo {
  constructor(private consentRepo: ConsentRepo) {}

  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<(Organization & { _access: { level: 'basic' | 'detailed', reason: string } })[]> {
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];

    const constraints = [whereIn('ecosystem_ids', [scope])];
    const orgs = await queryCollection<Organization>('organizations', constraints);

    return orgs.map(org => {
      const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, org.id, viewer.ecosystemId);
      const access = explainOrgAccess(viewer, org, hasConsent);
      let safeOrg = org;
      
      if (access.level === 'basic') {
          safeOrg = redactOrganization(org);
      } else {
          // Strip sensitive keys from list view
          safeOrg = { ...org, api_keys: [], webhooks: [] };
      }

      return { ...safeOrg, _access: access };
    });
  }

  async getByIdForViewer(viewer: ViewerContext, id: string): Promise<Organization | undefined> {
      const org = await this.getById(id);
      if (!org) return undefined;

      const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, org.id, viewer.ecosystemId);

      if (canViewOperationalDetails(viewer, org, hasConsent)) {
          if (viewer.orgId === org.id || viewer.role === 'platform_admin') {
              return org;
          }
          return { ...org, api_keys: [], webhooks: [] };
      }

      return redactOrganization(org);
  }

  async getById(id: string): Promise<Organization | undefined> {
    const org = await getDocument<Organization>('organizations', id);
    return org || undefined;
  }

  async add(org: Organization): Promise<void> {
    const now = new Date().toISOString();
    const doc = {
        ...org,
        status: org.status || 'active',
        version: org.version || 1,
        created_at: org.created_at || now,
        updated_at: org.updated_at || now,
    };
    await setDocument('organizations', org.id, doc);
  }

  async update(id: string, updates: Partial<Organization>): Promise<void> {
    const updateDoc = {
        ...updates,
        updated_at: new Date().toISOString()
    };
    await updateDocument('organizations', id, updateDoc);
  }

  async getApiKeys(orgId: string): Promise<ApiKey[]> {
    const org = await this.getById(orgId);
    return org?.api_keys || [];
  }

  async getWebhooks(orgId: string): Promise<Webhook[]> {
    const org = await this.getById(orgId);
    return org?.webhooks || [];
  }
}
