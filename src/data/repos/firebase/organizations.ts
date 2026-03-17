import { queryCollection, whereEquals, whereNotEquals, getDocument, setDocument, updateDocument, deleteDocument, whereIn } from '../../../services/firestoreClient';
import type { Organization, ApiKey, Webhook, OwnerCharacteristic } from '../../../domain/organizations/types';
import type { ViewerContext } from '../../../domain/access/policy';
import { explainOrgAccess, canViewOperationalDetails } from '../../../domain/access/policy';
import { redactOrganization } from '../../../domain/access/redaction';
import { ConsentRepo } from '../consent';

const normalizeOrganization = (org: Organization & { demographics?: { minority_owned?: boolean; woman_owned?: boolean; veteran_owned?: boolean } }): Organization => {
  // Backwards compat: convert old boolean demographics object to owner_characteristics array
  const legacyDemographics = (org as any).demographics as { minority_owned?: boolean; woman_owned?: boolean; veteran_owned?: boolean } | undefined;
  const derivedCharacteristics: OwnerCharacteristic[] = Array.isArray(org.owner_characteristics)
    ? org.owner_characteristics
    : [];
  if (legacyDemographics && derivedCharacteristics.length === 0) {
    if (legacyDemographics.minority_owned) derivedCharacteristics.push('minority_owned');
    if (legacyDemographics.woman_owned) derivedCharacteristics.push('woman_owned');
    if (legacyDemographics.veteran_owned) derivedCharacteristics.push('veteran_owned');
  }
  return {
  ...org,
  description: org.description || '',
  tax_status: org.tax_status || 'for_profit',
  roles: Array.isArray(org.roles) ? org.roles : [],
  org_type: org.org_type || undefined,
  owner_characteristics: derivedCharacteristics,
  certifications: Array.isArray(org.certifications) ? org.certifications : [],
  classification: {
    naics_code: org.classification?.naics_code || '',
    industry_tags: Array.isArray(org.classification?.industry_tags) ? org.classification.industry_tags : [],
  },
  external_refs: Array.isArray(org.external_refs) ? org.external_refs : [],
  managed_by_ids: Array.isArray(org.managed_by_ids) ? org.managed_by_ids : [],
  operational_visibility: org.operational_visibility || 'open',
  authorized_eso_ids: Array.isArray(org.authorized_eso_ids) ? org.authorized_eso_ids : [],
  support_offerings: Array.isArray(org.support_offerings) ? org.support_offerings : [],
  version: org.version || 1,
  ecosystem_ids: Array.isArray(org.ecosystem_ids) ? org.ecosystem_ids : [],
  api_keys: Array.isArray(org.api_keys) ? org.api_keys : [],
  webhooks: Array.isArray(org.webhooks) ? org.webhooks : [],
  tags: Array.isArray(org.tags) ? org.tags : [],
  external_ids: org.external_ids || {},
  };
};

export class FirebaseOrganizationsRepo {
  constructor(private consentRepo: ConsentRepo) {}

  async getAll(viewer: ViewerContext, ecosystemId?: string): Promise<(Organization & { _access: { level: 'basic' | 'detailed', reason: string } })[]> {
    const scope = ecosystemId || viewer.ecosystemId;
    if (!scope) return [];

    // Note: Firestore does not support combining array-contains-any with != in a single query.
    // Filter archived orgs in memory instead.
    const constraints = [whereIn('ecosystem_ids', [scope])];
    const orgs = (await queryCollection<Organization>('organizations', constraints))
      .filter(org => org.status !== 'archived')
      .map(normalizeOrganization);

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
    return org ? normalizeOrganization(org) : undefined;
  }

  async add(org: Organization): Promise<void> {
    const now = new Date().toISOString();
    const doc = {
        ...normalizeOrganization(org),
        status: org.status || 'active',
        version: org.version || 1,
        created_at: org.created_at || now,
        updated_at: org.updated_at || now,
    };
    await setDocument('organizations', org.id, doc);
  }

  async getArchived(ecosystemId: string): Promise<Organization[]> {
    // Platform-archived orgs still in this ecosystem
    const [globalArchived, ecosystemRemoved] = await Promise.all([
      queryCollection<Organization>('organizations', [whereIn('ecosystem_ids', [ecosystemId]), whereEquals('status', 'archived')]),
      queryCollection<Organization>('organizations', [whereIn('removed_from_ecosystem_ids', [ecosystemId])]),
    ]);
    const seen = new Set<string>();
    return [...globalArchived, ...ecosystemRemoved]
      .map(normalizeOrganization)
      .filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  }

  async delete(id: string): Promise<void> {
    await deleteDocument('organizations', id);
  }

  async update(id: string, updates: Partial<Organization>): Promise<void> {
    const updateDoc = { ...updates, updated_at: new Date().toISOString() };
    await updateDocument('organizations', id, updateDoc);
  }

  async getApiKeys(orgId: string): Promise<ApiKey[]> {
    const org = await this.getById(orgId);
    return org?.api_keys || [];
  }

  async generateApiKey(orgId: string, label: string): Promise<ApiKey | null> {
    const org = await this.getById(orgId);
    if (!org) {
      return null;
    }

    const existingKeys = Array.isArray(org.api_keys) ? org.api_keys : [];
    const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const fullKey = `sk_live_${randomPart}`;
    const redactedPrefix = `sk_live_...${randomPart.substring(randomPart.length - 4)}`;

    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      label,
      prefix: redactedPrefix,
      created_at: new Date().toISOString(),
      status: 'active',
    };

    await updateDocument('organizations', orgId, {
      api_keys: [...existingKeys, newKey],
      updated_at: new Date().toISOString(),
    } as any);

    return { ...newKey, prefix: fullKey };
  }

  async revokeApiKey(orgId: string, keyId: string): Promise<void> {
    const org = await this.getById(orgId);
    if (!org) {
      return;
    }

    const nextKeys = (org.api_keys || []).map((key) => (
      key.id === keyId ? { ...key, status: 'revoked' as const } : key
    ));

    await updateDocument('organizations', orgId, {
      api_keys: nextKeys,
      updated_at: new Date().toISOString(),
    } as any);
  }

  async getWebhooks(orgId: string): Promise<Webhook[]> {
    const org = await this.getById(orgId);
    return org?.webhooks || [];
  }

  async addWebhook(orgId: string, webhook: Omit<Webhook, 'id' | 'created_at' | 'status' | 'secret'>): Promise<Webhook | null> {
    const org = await this.getById(orgId);
    if (!org) {
      return null;
    }

    const nextWebhook: Webhook = {
      id: `wh_${Date.now()}`,
      created_at: new Date().toISOString(),
      status: 'active',
      secret: `whsec_${Math.random().toString(36).substring(2, 22)}`,
      ...webhook,
    };

    await updateDocument('organizations', orgId, {
      webhooks: [...(org.webhooks || []), nextWebhook],
      updated_at: new Date().toISOString(),
    } as any);

    return nextWebhook;
  }

  async deleteWebhook(orgId: string, webhookId: string): Promise<void> {
    const org = await this.getById(orgId);
    if (!org) {
      return;
    }

    await updateDocument('organizations', orgId, {
      webhooks: (org.webhooks || []).filter((hook) => hook.id !== webhookId),
      updated_at: new Date().toISOString(),
    } as any);
  }
}
