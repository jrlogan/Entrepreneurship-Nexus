
import type { Organization, ApiKey, Webhook, ExternalRef } from '../../domain/organizations/types';
import type { Revision } from '../../domain/audit/types';
import { ALL_ORGANIZATIONS } from '../mockData';
import { ViewerContext, explainOrgAccess, canViewOperationalDetails } from '../../domain/access/policy';
import { redactOrganization } from '../../domain/access/redaction';
import { ConsentRepo } from './consent';

interface IngestionResult {
    status: 'created' | 'updated' | 'error';
    entity: Organization;
    message: string;
}

export class OrganizationsRepo {
  // In-memory history store (In a real DB, this would be a separate 'audit_logs' table)
  private history: Revision<Organization>[] = [];

  constructor(private consentRepo: ConsentRepo) {
    // Initialize mock history for demo purposes
    this.seedMockHistory();
  }

  // --- Ingestion Logic (Federated Data Sync) ---
  
  /**
   * Simulates receiving a payload from an external system (Salesforce, HubSpot, etc).
   * Handles ID matching and optimistic updates.
   */
  upsertFromExternal(source: string, payload: any): IngestionResult {
      // 1. Try to find match by External ID
      const externalId = payload.external_id;
      let existing = ALL_ORGANIZATIONS.find(o => 
          o.external_refs.some(ref => ref.source === source && ref.id === externalId)
      );

      // 2. If no external ID match, check for System ID (if provided in payload)
      if (!existing && payload.id) {
          existing = ALL_ORGANIZATIONS.find(o => o.id === payload.id);
      }

      if (existing) {
          // UPDATE
          const updates: Partial<Organization> = {
              name: payload.name || existing.name,
              description: payload.description || existing.description,
              url: payload.url || existing.url,
              version: (existing.version || 1) + 1
          };
          
          this.update(existing.id, updates, { id: `sys_sync_${source}`, label: `${source} Integration`, type: 'system' });
          
          return {
              status: 'updated',
              entity: { ...existing, ...updates },
              message: `Updated record ${existing.id} (v${updates.version}) from ${source}.`
          };
      } else {
          // CREATE
          // Note: If this is a duplicate name, the Data Quality Engine (DataQualityView) will catch it later.
          // We intentionally allow the create here to demonstrate the deduplication workflow.
          
          const newOrg: Organization = {
              id: `org_${source.toLowerCase()}_${Date.now()}`,
              name: payload.name,
              description: payload.description || '',
              url: payload.url || '',
              tax_status: payload.tax_status || 'for_profit',
              roles: payload.roles || ['startup'],
              demographics: payload.demographics || { minority_owned: false, woman_owned: false, veteran_owned: false },
              classification: payload.classification || { industry_tags: [], naics_code: '' },
              external_refs: [{ source, id: externalId || `gen_${Date.now()}` }],
              managed_by_ids: [],
              operational_visibility: 'open',
              authorized_eso_ids: [],
              ecosystem_ids: ['eco_new_haven'], // Defaulting for demo
              version: 1
          };

          this.add(newOrg);
          
          return {
              status: 'created',
              entity: newOrg,
              message: `Created new record ${newOrg.id} from ${source}.`
          };
      }
  }

  // Viewer-Aware Method
  getAll(viewer: ViewerContext, ecosystemId?: string): (Organization & { _access: { level: 'basic' | 'detailed', reason: string } })[] {
    let orgs = ALL_ORGANIZATIONS;
    
    if (ecosystemId) {
      orgs = orgs.filter(o => o.ecosystem_ids?.includes(ecosystemId));
    }

    // Map each org to include its access explanation and redact if necessary
    return orgs.map(org => {
      const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, org.id, viewer.ecosystemId);
      const access = explainOrgAccess(viewer, org, hasConsent);
      let safeOrg = org;
      
      // If basic access only, apply redaction to the object structure itself if needed
      // Note: Directory info is always public, so redactOrganization mostly strips internals like API keys
      if (access.level === 'basic') {
          safeOrg = redactOrganization(org);
      } else {
          // Even if detailed, never return API keys or webhooks in a list view
          safeOrg = { ...org, api_keys: [], webhooks: [] };
      }

      return { ...safeOrg, _access: access };
    });
  }

  // Viewer-Aware Detail Fetch
  getByIdForViewer(viewer: ViewerContext, id: string): Organization | undefined {
      const org = this.getById(id); // Internal fetch
      if (!org) return undefined;

      const hasConsent = this.consentRepo.hasOperationalAccess(viewer.orgId, org.id, viewer.ecosystemId);

      // Check permissions
      if (canViewOperationalDetails(viewer, org, hasConsent)) {
          // If viewer is owner or admin, they might see keys, otherwise strip them
          if (viewer.orgId === org.id || viewer.role === 'platform_admin') {
              return org;
          }
          return { ...org, api_keys: [], webhooks: [] };
      }

      // Restricted View
      return redactOrganization(org);
  }

  // Legacy/Internal: Returns raw data (effectively Admin access)
  getById(id: string): Organization | undefined {
    return ALL_ORGANIZATIONS.find(o => o.id === id);
  }

  add(org: Organization): void {
    ALL_ORGANIZATIONS.push(org);
    this.logChange(org, 'create', { id: 'user_current', label: 'Current User', type: 'user' }, 'Created new organization');
  }

  /**
   * Update with Audit Logging
   * @param actor - Identify who made the change (API Key ID or User ID)
   */
  update(id: string, updates: Partial<Organization>, actor?: { id: string, label: string, type: 'user'|'api_key'|'system' }): void {
    const orgIndex = ALL_ORGANIZATIONS.findIndex(o => o.id === id);
    if (orgIndex >= 0) {
        const oldOrg = ALL_ORGANIZATIONS[orgIndex];
        
        // 1. Snapshot the OLD state before updating (so we can revert TO this)
        // Or alternatively, log the NEW state. Standard practice is usually to log the state *resulting* from the action.
        // Let's log the NEW state, but we need to keep a history chain. 
        // Actually, to rollback, we need the state BEFORE the change.
        
        // Strategy: We save the object AS IT WAS before the update.
        this.logChange(oldOrg, 'update', actor, `Updated fields: ${Object.keys(updates).join(', ')}`);

        // 2. Apply Update
        const updatedOrg = { ...oldOrg, ...updates, version: (oldOrg.version || 1) + 1 };
        ALL_ORGANIZATIONS[orgIndex] = updatedOrg;
    }
  }

  /**
   * Rollback to a specific revision
   */
  rollback(id: string, revisionId: string, actor: { id: string, label: string }): boolean {
      const org = this.getById(id);
      if (!org) return false;

      const revision = this.history.find(r => r.id === revisionId);
      if (!revision) return false;

      // 1. Log the Rollback itself (save current bad state in case we need to re-roll-forward)
      this.logChange(org, 'rollback', { ...actor, type: 'user' }, `Rolled back to revision from ${new Date(revision.timestamp).toLocaleDateString()}`);

      // 2. Restore the snapshot
      // We keep the ID and maybe some specific fields, or just hard overwrite?
      // Hard overwrite usually safer for "undo", but bump version
      const restoredOrg = {
          ...revision.snapshot,
          version: (org.version || 1) + 1,
          id: org.id // Ensure ID consistency
      };

      const index = ALL_ORGANIZATIONS.findIndex(o => o.id === id);
      ALL_ORGANIZATIONS[index] = restoredOrg;
      
      return true;
  }

  getHistory(id: string): Revision<Organization>[] {
      return this.history
        .filter(h => h.entityId === id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // --- Internal Audit Helper ---
  private logChange(
      org: Organization, 
      action: 'create'|'update'|'delete'|'rollback', 
      actor: { id: string, label: string, type: 'user'|'api_key'|'system' } = { id: 'system', label: 'System', type: 'system' },
      summary?: string
  ) {
      const revision: Revision<Organization> = {
          id: `rev_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
          entityId: org.id,
          timestamp: new Date().toISOString(),
          action,
          actor,
          changesSummary: summary,
          snapshot: JSON.parse(JSON.stringify(org)) // Deep copy
      };
      this.history.push(revision);
  }

  private seedMockHistory() {
      // 1. DarkStar Marine
      const dsId = 'org_darkstar_001';
      const ds = ALL_ORGANIZATIONS.find(o => o.id === dsId);
      if (ds) {
          this.history.push({
              id: 'rev_mock_1',
              entityId: dsId,
              timestamp: '2023-10-01T10:00:00Z',
              action: 'create',
              actor: { id: 'user_sarah', label: 'Sarah Connor', type: 'user' },
              changesSummary: 'Initial profile creation',
              snapshot: { ...ds, name: 'DarkStar Marine' }
          });
          this.history.push({
              id: 'rev_mock_2',
              entityId: dsId,
              timestamp: '2023-11-15T14:30:00Z',
              action: 'update',
              actor: { id: 'user_jr', label: 'J.R. Logan', type: 'user' },
              changesSummary: 'Verified tax status and added tags',
              snapshot: { ...ds, name: 'DarkStar Marine', classification: { ...ds.classification, industry_tags: ['Maritime', 'Robotics'] } }
          });
          // Simulated API Update that happened recently (Snapshot of state BEFORE that)
          this.history.push({
              id: 'rev_mock_3',
              entityId: dsId,
              timestamp: '2023-12-01T09:00:00Z',
              action: 'update',
              actor: { id: 'key_sfdc_sync', label: 'Salesforce Sync', type: 'api_key' },
              changesSummary: 'Automated CRM Sync',
              snapshot: { ...ds, description: 'Old description before sync override...' }
          });
      }

      // 2. GreenTech Solutions
      const gtId = 'org_greentech_002';
      const gt = ALL_ORGANIZATIONS.find(o => o.id === gtId);
      if (gt) {
          this.history.push({
              id: 'rev_mock_gt_1',
              entityId: gtId,
              timestamp: '2023-09-15T08:00:00Z',
              action: 'create',
              actor: { id: 'user_mike', label: 'Mike Wazowski', type: 'user' },
              changesSummary: 'Self-registered via portal',
              snapshot: { ...gt, name: 'Green Tech Inc' } // Old name
          });
          this.history.push({
              id: 'rev_mock_gt_2',
              entityId: gtId,
              timestamp: '2023-10-01T11:20:00Z',
              action: 'update',
              actor: { id: 'user_admin', label: 'System Admin', type: 'user' },
              changesSummary: 'Corrected legal name and merged duplicate',
              snapshot: { ...gt, name: 'GreenTech Solutions' } 
          });
      }
  }

  // API Key Management (Strictly Owner/Admin)
  getApiKeys(orgId: string): ApiKey[] {
    const org = this.getById(orgId);
    return org?.api_keys || [];
  }

  generateApiKey(orgId: string, label: string): ApiKey | null {
    const org = this.getById(orgId);
    if (!org) return null;

    if (!org.api_keys) org.api_keys = [];

    // Simulate a secure key generation
    const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const fullKey = `sk_live_${randomPart}`;
    const prefix = `sk_live_...${randomPart.substring(randomPart.length - 4)}`;

    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      label,
      prefix, 
      created_at: new Date().toISOString(),
      status: 'active'
    };

    org.api_keys.push(newKey);
    return { ...newKey, prefix: fullKey }; 
  }

  revokeApiKey(orgId: string, keyId: string): void {
    const org = this.getById(orgId);
    if (org && org.api_keys) {
      const key = org.api_keys.find(k => k.id === keyId);
      if (key) {
        key.status = 'revoked';
      }
    }
  }

  // Webhook Management
  getWebhooks(orgId: string): Webhook[] {
    const org = this.getById(orgId);
    return org?.webhooks || [];
  }

  addWebhook(orgId: string, webhook: Omit<Webhook, 'id' | 'created_at' | 'status' | 'secret'>): Webhook | null {
    const org = this.getById(orgId);
    if (!org) return null;
    if (!org.webhooks) org.webhooks = [];
    
    const newWebhook: Webhook = {
        id: `wh_${Date.now()}`,
        created_at: new Date().toISOString(),
        status: 'active',
        secret: 'whsec_' + Math.random().toString(36).substr(2, 20),
        ...webhook
    };
    org.webhooks.push(newWebhook);
    return newWebhook;
  }

  deleteWebhook(orgId: string, webhookId: string): void {
      const org = this.getById(orgId);
      if (org && org.webhooks) {
          org.webhooks = org.webhooks.filter(w => w.id !== webhookId);
      }
  }
}
