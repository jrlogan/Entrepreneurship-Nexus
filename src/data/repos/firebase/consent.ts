import { queryCollection, whereEquals, setDocument, updateDocument } from '../../../services/firestoreClient';
import type { ConsentPolicy, ConsentEvent, ConsentRequest, ConsentRequestStatus } from '../../../domain/consent/types';
import type { AccessLevel } from '../../../domain/types';
import { ConsentRepo } from '../consent';

export class FirebaseConsentRepo extends ConsentRepo {
  private policyCache = new Map<string, ConsentPolicy[]>();
  private eventCache = new Map<string, ConsentEvent[]>();
  private accessCache = new Map<string, boolean>();

  private getAccessCacheKey(viewerOrgId: string, subjectOrgId: string, ecosystemId?: string) {
    return `${viewerOrgId}::${subjectOrgId}::${ecosystemId || ''}`;
  }

  hasOperationalAccess(viewerOrgId: string, subjectOrgId: string, _ecosystemId?: string): boolean {
    // Synchronous check not feasible with Firestore — callers should use hasOperationalAccessAsync
    if (!viewerOrgId || !subjectOrgId) return false;
    if (viewerOrgId === subjectOrgId) return true;
    return this.accessCache.get(this.getAccessCacheKey(viewerOrgId, subjectOrgId, _ecosystemId)) || false;
  }

  async hasOperationalAccessAsync(viewerOrgId: string, subjectOrgId: string): Promise<boolean> {
    if (!viewerOrgId || !subjectOrgId) return false;
    if (viewerOrgId === subjectOrgId) return true;
    const policies = await queryCollection<ConsentPolicy>('consent_policies', [
      whereEquals('resource_id', subjectOrgId),
      whereEquals('viewer_id', viewerOrgId),
      whereEquals('is_active', true),
    ]);
    const hasAccess = policies.some(p => ['read', 'write', 'admin'].includes(p.accessLevel));
    this.accessCache.set(this.getAccessCacheKey(viewerOrgId, subjectOrgId), hasAccess);
    return hasAccess;
  }

  async grantAccess(
    resourceId: string,
    viewerId: string,
    level: AccessLevel,
    actorId: string,
    opts?: { grantedVia?: ConsentPolicy['grantedVia']; requestId?: string; overrideReason?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    // Check for existing policy to update
    const existing = await queryCollection<ConsentPolicy & { id: string }>('consent_policies', [
      whereEquals('resource_id', resourceId),
      whereEquals('viewer_id', viewerId),
    ]);
    const policyId = existing[0]?.id || `pol_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDocument('consent_policies', policyId, {
      resource_id: resourceId,
      viewer_id: viewerId,
      resource_type: 'organization',
      access_level: level,
      is_active: true,
      updated_at: now,
      granted_via: opts?.grantedVia || 'self',
      request_id: opts?.requestId || null,
    });
    await this.logEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      actorId,
      action: 'granted',
      resourceId,
      viewerId,
      newAccessLevel: level,
      reason: opts?.grantedVia === 'manager_override'
        ? `Ecosystem manager override: ${opts.overrideReason}`
        : opts?.grantedVia === 'eso_request'
        ? 'Approved via ESO access request'
        : 'Manual approval via portal',
      grantedVia: opts?.grantedVia || 'self',
      overrideReason: opts?.overrideReason,
    });
    this.accessCache.set(this.getAccessCacheKey(viewerId, resourceId), true);
    await this.getPoliciesForEntityAsync(resourceId);
    await this.getEventsForEntityAsync(resourceId);
  }

  async revokeAccess(policyId: string, actorId: string, resourceId: string, viewerId: string, reason?: string): Promise<void> {
    const now = new Date().toISOString();
    await updateDocument('consent_policies', policyId, { is_active: false, updated_at: now });
    await this.logEvent({
      id: `evt_revoke_${Date.now()}`,
      timestamp: now,
      actorId,
      action: 'revoked',
      resourceId,
      viewerId,
      reason: reason || 'Revoked via Privacy Dashboard',
    });
    this.accessCache.set(this.getAccessCacheKey(viewerId, resourceId), false);
    await this.getPoliciesForEntityAsync(resourceId);
    await this.getEventsForEntityAsync(resourceId);
  }

  getPoliciesForEntity(resourceId: string): ConsentPolicy[] {
    return this.policyCache.get(resourceId) || [];
  }

  async getPoliciesForEntityAsync(resourceId: string): Promise<ConsentPolicy[]> {
    const raw = await queryCollection<Record<string, unknown>>('consent_policies', [
      whereEquals('resource_id', resourceId),
      whereEquals('is_active', true),
    ]);
    const policies = raw.map(this.normalizePolicy);
    this.policyCache.set(resourceId, policies);
    for (const policy of policies) {
      this.accessCache.set(this.getAccessCacheKey(policy.viewerId, resourceId), ['read', 'write', 'admin'].includes(policy.accessLevel));
    }
    return policies;
  }

  getEventsForEntity(resourceId: string): ConsentEvent[] {
    return this.eventCache.get(resourceId) || [];
  }

  async getEventsForEntityAsync(resourceId: string): Promise<ConsentEvent[]> {
    const raw = await queryCollection<Record<string, unknown>>('consent_events', [
      whereEquals('resource_id', resourceId),
    ]);
    const events = raw
      .map(this.normalizeEvent)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    this.eventCache.set(resourceId, events);
    return events;
  }

  async logEvent(event: ConsentEvent): Promise<void> {
    await setDocument('consent_events', event.id, {
      resource_id: event.resourceId,
      viewer_id: event.viewerId,
      actor_id: event.actorId,
      action: event.action,
      timestamp: event.timestamp,
      new_access_level: event.newAccessLevel || null,
      previous_access_level: event.previousAccessLevel || null,
      reason: event.reason || null,
      granted_via: event.grantedVia || null,
      override_reason: event.overrideReason || null,
    });
  }

  // Consent Request flow
  async createConsentRequest(req: Omit<ConsentRequest, 'id' | 'status' | 'requestedAt'>): Promise<ConsentRequest> {
    const now = new Date().toISOString();
    const id = `creq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record: ConsentRequest = { ...req, id, status: 'pending', requestedAt: now };
    await setDocument('consent_requests', id, {
      ecosystem_id: record.ecosystemId,
      resource_id: record.resourceId,
      requesting_eso_id: record.requestingEsoId,
      requested_by_person_id: record.requestedByPersonId,
      requested_access_level: record.requestedAccessLevel,
      status: 'pending',
      requested_at: now,
      request_message: record.requestMessage || null,
    });
    return record;
  }

  async getConsentRequest(requestId: string): Promise<ConsentRequest | null> {
    const results = await queryCollection<Record<string, unknown>>('consent_requests', [
      whereEquals('__name__', requestId),
    ]);
    // Direct doc fetch not available via queryCollection — use the raw result
    if (!results.length) return null;
    return this.normalizeRequest(results[0]);
  }

  async updateConsentRequestStatus(
    requestId: string,
    status: ConsentRequestStatus,
    respondedByPersonId: string,
    declineReason?: string
  ): Promise<void> {
    await updateDocument('consent_requests', requestId, {
      status,
      responded_at: new Date().toISOString(),
      responded_by_person_id: respondedByPersonId,
      decline_reason: declineReason || null,
    });
  }

  async getPendingRequestsForOrg(resourceId: string): Promise<ConsentRequest[]> {
    const raw = await queryCollection<Record<string, unknown>>('consent_requests', [
      whereEquals('resource_id', resourceId),
      whereEquals('status', 'pending'),
    ]);
    return raw.map(this.normalizeRequest);
  }

  async getRequestsByEso(esoId: string): Promise<ConsentRequest[]> {
    const raw = await queryCollection<Record<string, unknown>>('consent_requests', [
      whereEquals('requesting_eso_id', esoId),
    ]);
    return raw.map(this.normalizeRequest).sort((a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );
  }

  // Onboarding acknowledgment
  async recordOnboardingAcknowledgment(personId: string, ecosystemId: string): Promise<void> {
    const now = new Date().toISOString();
    const id = `ack_${personId}_${ecosystemId}`;
    await setDocument('consent_events', id, {
      resource_id: personId,
      viewer_id: ecosystemId,
      actor_id: personId,
      action: 'acknowledged',
      timestamp: now,
      reason: 'Onboarding data-sharing acknowledgment',
      granted_via: null,
      override_reason: null,
    });
  }

  async hasOnboardingAcknowledgment(personId: string, ecosystemId: string): Promise<boolean> {
    const id = `ack_${personId}_${ecosystemId}`;
    const results = await queryCollection<Record<string, unknown>>('consent_events', [
      whereEquals('resource_id', personId),
      whereEquals('viewer_id', ecosystemId),
      whereEquals('action', 'acknowledged'),
    ]);
    return results.length > 0 || false;
  }

  private normalizePolicy(raw: Record<string, unknown>): ConsentPolicy {
    return {
      id: (raw['id'] as string) || '',
      resourceType: 'organization',
      resourceId: (raw['resource_id'] as string) || '',
      viewerId: (raw['viewer_id'] as string) || '',
      accessLevel: (raw['access_level'] as AccessLevel) || 'read',
      isActive: raw['is_active'] as boolean ?? true,
      updatedAt: (raw['updated_at'] as string) || '',
      grantedVia: (raw['granted_via'] as ConsentPolicy['grantedVia']) || undefined,
      requestId: (raw['request_id'] as string) || undefined,
    };
  }

  private normalizeEvent(raw: Record<string, unknown>): ConsentEvent {
    return {
      id: (raw['id'] as string) || '',
      timestamp: (raw['timestamp'] as string) || '',
      actorId: (raw['actor_id'] as string) || '',
      action: (raw['action'] as ConsentEvent['action']) || 'granted',
      resourceId: (raw['resource_id'] as string) || '',
      viewerId: (raw['viewer_id'] as string) || '',
      newAccessLevel: (raw['new_access_level'] as AccessLevel) || undefined,
      previousAccessLevel: (raw['previous_access_level'] as AccessLevel) || undefined,
      reason: (raw['reason'] as string) || undefined,
      grantedVia: (raw['granted_via'] as ConsentEvent['grantedVia']) || undefined,
      overrideReason: (raw['override_reason'] as string) || undefined,
    };
  }

  private normalizeRequest(raw: Record<string, unknown>): ConsentRequest {
    return {
      id: (raw['id'] as string) || '',
      ecosystemId: (raw['ecosystem_id'] as string) || '',
      resourceId: (raw['resource_id'] as string) || '',
      requestingEsoId: (raw['requesting_eso_id'] as string) || '',
      requestedByPersonId: (raw['requested_by_person_id'] as string) || '',
      requestedAccessLevel: (raw['requested_access_level'] as AccessLevel) || 'read',
      status: (raw['status'] as ConsentRequestStatus) || 'pending',
      requestedAt: (raw['requested_at'] as string) || '',
      respondedAt: (raw['responded_at'] as string) || undefined,
      respondedByPersonId: (raw['responded_by_person_id'] as string) || undefined,
      requestMessage: (raw['request_message'] as string) || undefined,
      declineReason: (raw['decline_reason'] as string) || undefined,
    };
  }
}
