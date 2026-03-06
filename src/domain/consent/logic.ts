
import { OperationalVisibility, AccessLevel } from '../types';
import { ConsentPolicy, ConsentCheckResult } from './types';

/**
 * Determines if a viewer has access to a specific resource.
 * 
 * Rules:
 * 1. If resource is Public, everyone has 'read' access (unless a policy grants 'write').
 * 2. If resource is Private, access is 'none' unless a generic policy exists.
 * 3. Specific policies override defaults.
 */
export const getEffectiveConsent = (
    resourceId: string,
    resourceVisibility: OperationalVisibility,
    viewerOrgId: string,
    policies: ConsentPolicy[]
): ConsentCheckResult => {
    // 1. Find direct policy for this viewer
    const policy = policies.find(p => 
        p.resourceId === resourceId && 
        p.viewerId === viewerOrgId && 
        p.isActive
    );

    if (policy) {
        return {
            hasAccess: true,
            effectiveLevel: policy.accessLevel,
            policyId: policy.id,
            reason: 'Direct consent policy found.'
        };
    }

    // 2. Fallback to Visibility settings
    if (resourceVisibility === 'open') {
        return {
            hasAccess: true,
            effectiveLevel: 'read', // Public implies Read-Only
            reason: 'Resource is public.'
        };
    }

    // 3. Private and no policy
    return {
        hasAccess: false,
        effectiveLevel: 'none',
        reason: 'Resource is private and no consent granted.'
    };
};
