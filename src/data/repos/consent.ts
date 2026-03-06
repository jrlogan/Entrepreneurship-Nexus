
import { ConsentPolicy, ConsentEvent } from '../../domain/consent/types';
import { MOCK_CONSENT_POLICIES, MOCK_CONSENT_EVENTS } from '../mockData';
import { AccessLevel } from '../../domain/types';

export class ConsentRepo {
  
  // Core Check: Does Viewer have active policy for Subject?
  // ecosystemId is accepted for context scoping (even if policies are currently global)
  hasOperationalAccess(viewerOrgId: string, subjectOrgId: string, ecosystemId?: string): boolean {
      if (!viewerOrgId || !subjectOrgId) return false;
      if (viewerOrgId === subjectOrgId) return true;
      
      const policy = MOCK_CONSENT_POLICIES.find(p => 
          p.resourceId === subjectOrgId && 
          p.viewerId === viewerOrgId && 
          p.isActive
      );
      
      // Access is granted if policy exists and level is sufficient (anything > none)
      return !!policy && ['read', 'write', 'admin'].includes(policy.accessLevel);
  }

  // Grant access (Create or Update Policy)
  grantAccess(resourceId: string, viewerId: string, level: AccessLevel): void {
    const existing = MOCK_CONSENT_POLICIES.find(p => p.resourceId === resourceId && p.viewerId === viewerId);
    
    if (existing) {
        existing.accessLevel = level;
        existing.isActive = true;
        existing.updatedAt = new Date().toISOString();
    } else {
        MOCK_CONSENT_POLICIES.push({
            id: `pol_${Date.now()}`,
            resourceType: 'organization',
            resourceId,
            viewerId,
            accessLevel: level,
            isActive: true,
            updatedAt: new Date().toISOString()
        });
    }

    // Log the event
    this.logEvent({
        id: `evt_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: resourceId, // Assuming the resource owner granted it
        action: 'granted',
        resourceId,
        viewerId,
        newAccessLevel: level,
        reason: 'Manual approval via portal'
    });
  }

  getPoliciesForEntity(resourceId: string): ConsentPolicy[] {
    return MOCK_CONSENT_POLICIES.filter(p => p.resourceId === resourceId && p.isActive);
  }

  getEventsForEntity(resourceId: string): ConsentEvent[] {
    return MOCK_CONSENT_EVENTS
      .filter(e => e.resourceId === resourceId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  logEvent(event: ConsentEvent): void {
    MOCK_CONSENT_EVENTS.push(event);
  }
}
