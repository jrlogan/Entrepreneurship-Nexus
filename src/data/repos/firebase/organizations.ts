import { queryCollection, whereEquals, whereNotEquals, getDocument, setDocument, updateDocument, deleteDocument, whereIn } from '../../../services/firestoreClient';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../../../services/firebaseApp';
import { callFunction } from '../../../services/functionsClient';
import type { Organization, ApiKey, Webhook, OwnerCharacteristic } from '../../../domain/organizations/types';
import type { ViewerContext } from '../../../domain/access/policy';
import { explainOrgAccess, canViewOperationalDetails } from '../../../domain/access/policy';
import { redactOrganization } from '../../../domain/access/redaction';
import { ConsentRepo } from '../consent';
import type { IngestionResult } from '../organizations';

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
  // api_keys and webhooks moved to subcollections to prevent broad enumeration
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

    return Promise.all(orgs.map(async org => {
      const hasConsent = await this.consentRepo.hasOperationalAccessAsync(viewer.orgId, org.id, viewer.ecosystemId);
      const access = explainOrgAccess(viewer, org, hasConsent);
      let safeOrg = org;
      
      if (access.level === 'basic') {
          safeOrg = redactOrganization(org);
      } else {
          // Sensitive keys are now in a subcollection, no longer on the org doc.
      }

      return { ...safeOrg, _access: access };
    }));
  }

  async getByIdForViewer(viewer: ViewerContext, id: string): Promise<Organization | undefined> {
      const org = await this.getById(id);
      if (!org) return undefined;

      const hasConsent = await this.consentRepo.hasOperationalAccessAsync(viewer.orgId, org.id, viewer.ecosystemId);

      if (canViewOperationalDetails(viewer, org, hasConsent)) {
          return org;
      }

      return redactOrganization(org);
  }

  async getById(id: string): Promise<Organization | undefined> {
    const org = await getDocument<Organization>('organizations', id);
    return org ? normalizeOrganization(org) : undefined;
  }

  /**
   * External-system upsert used by the API Console simulator. Matches by
   * (source, external_id) ref first, then by explicit payload.id.
   */
  async upsertFromExternal(source: string, payload: any): Promise<IngestionResult> {
    const externalId = payload.external_id;
    const all = (await queryCollection<Organization>('organizations', [])).map(normalizeOrganization);
    let existing = externalId
      ? all.find(o => o.external_refs.some(ref => ref.source === source && ref.id === externalId))
      : undefined;
    if (!existing && payload.id) {
      existing = all.find(o => o.id === payload.id);
    }

    if (existing) {
      const updates: Partial<Organization> = {
        name: payload.name || existing.name,
        description: payload.description || existing.description,
        url: payload.url || existing.url,
        version: (existing.version || 1) + 1,
      };
      await this.update(existing.id, updates);
      return {
        status: 'updated',
        entity: { ...existing, ...updates },
        message: `Updated record ${existing.id} (v${updates.version}) from ${source}.`,
      };
    }

    const newOrg: Organization = normalizeOrganization({
      id: `org_${source.toLowerCase()}_${Date.now()}`,
      name: payload.name,
      description: payload.description || '',
      url: payload.url || '',
      tax_status: payload.tax_status || 'for_profit',
      roles: payload.roles || [],
      org_type: payload.org_type || 'startup',
      owner_characteristics: payload.owner_characteristics || [],
      classification: payload.classification || { industry_tags: [], naics_code: '' },
      external_refs: [{ source, id: externalId || `gen_${Date.now()}` }],
      managed_by_ids: [],
      operational_visibility: 'open',
      authorized_eso_ids: [],
      ecosystem_ids: payload.ecosystem_ids || [],
      version: 1,
      external_ids: {},
    } as Organization);
    await this.add(newOrg);
    return {
      status: 'created',
      entity: newOrg,
      message: `Created new record ${newOrg.id} from ${source}.`,
    };
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

  // API keys are stored in /organizations/{orgId}/api_keys subcollection
  async getApiKeys(orgId: string): Promise<ApiKey[]> {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await getDocs(collection(db, 'organizations', orgId, 'api_keys'));
    return snap.docs.map((d) => d.data() as ApiKey);
  }

  async generateApiKey(orgId: string, label: string): Promise<ApiKey | null> {
    // Delegates to the generatePartnerApiKey Callable Function. The full key
    // is generated server-side with crypto.randomBytes; only its SHA-256 hash
    // and a display prefix are persisted in the /api_keys subcollection.
    const result = await callFunction<
      { orgId: string; label: string },
      {
        id: string;
        label: string;
        prefix: string;
        created_at: string;
        status: 'active' | 'revoked';
        full_key: string;
      }
    >('generatePartnerApiKey', { orgId, label });

    return {
      id: result.id,
      label: result.label,
      prefix: result.full_key, // UI reveals full_key once then discards.
      created_at: result.created_at,
      status: result.status,
    };
  }

  async revokeApiKey(orgId: string, keyId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;
    await updateDocument(`organizations/${orgId}/api_keys`, keyId, {
      status: 'revoked',
      updated_at: new Date().toISOString(),
    } as any);
  }

  // Webhooks are stored in a subcollection at /organizations/{orgId}/webhooks
  // (not on the org doc) so the signing secret is only accessible to callers
  // allowed by the subcollection rules — platform admin or ESO operators of
  // this org. Any authenticated user reading the org doc no longer sees them.

  async getWebhooks(orgId: string): Promise<Webhook[]> {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await getDocs(collection(db, 'organizations', orgId, 'webhooks'));
    return snap.docs.map((d) => d.data() as Webhook);
  }

  async addWebhook(orgId: string, webhook: Omit<Webhook, 'id' | 'created_at' | 'status' | 'secret'>): Promise<Webhook | null> {
    const db = getFirestoreDb();
    if (!db) return null;

    // The signing secret is the HMAC key the server uses to sign every
    // outbound delivery, so it must be unguessable. It was previously
    // generated here with Math.random() — V8's xorshift128+, whose state is
    // recoverable from a few outputs — which would let anyone who could
    // predict it forge signed deliveries to the partner's endpoint.
    //
    // Secrets are minted server-side with crypto-grade randomness. The
    // browser gets it once, in the response, and never generates it.
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) {
      throw new Error('A secure random source is unavailable; cannot create a webhook signing secret.');
    }
    const material = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const nextWebhook: Webhook = {
      id: `wh_${Date.now()}`,
      created_at: new Date().toISOString(),
      status: 'active',
      secret: `whsec_${material}`,
      ...webhook,
    };

    await setDoc(doc(db, 'organizations', orgId, 'webhooks', nextWebhook.id), nextWebhook);
    return nextWebhook;
  }

  async deleteWebhook(orgId: string, webhookId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;
    await deleteDoc(doc(db, 'organizations', orgId, 'webhooks', webhookId));
  }
}
