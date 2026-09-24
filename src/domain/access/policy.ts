
import { Organization, SystemRole } from '../types';
import { ROLE_CAPABILITY_MAP } from '../auth/role_capability_map';
import { Capability } from '../auth/capabilities';

export interface ViewerContext {
    personId: string;
    orgId: string;
    role: SystemRole;
    ecosystemId: string;
    // New: The effective list of actions this viewer can perform
    capabilities?: string[]; 
}

// --- Capability Helpers ---

export const getCapabilitiesForRole = (role: SystemRole): string[] => {
    return ROLE_CAPABILITY_MAP[role] || [];
};

export const viewerHasCapability = (viewer: ViewerContext, cap: Capability): boolean => {
    // 1. Check if capabilities are pre-calculated on the viewer object
    if (viewer.capabilities) {
        return viewer.capabilities.includes(cap);
    }
    
    // 2. Fallback: Lookup based on role (Backward compatibility)
    const caps = getCapabilitiesForRole(viewer.role);
    return caps.includes(cap);
};

export const viewerHasAnyCapability = (viewer: ViewerContext, caps: Capability[]): boolean => {
    return caps.some(c => viewerHasCapability(viewer, c));
};

// Record-level visibility (who may see which organization's records about
// whom) is NOT decided here. It lives in functions/src/privacy/policy.ts and
// is applied server-side by the getNetworkView Cloud Function — see
// src/data/networkView.ts. This file only holds role capabilities.

/**
 * The visibility setting in force for one network.
 *
 * "Open" means the founder has shared their record details with every
 * partner they work with in that network — a consent choice, so it is off by
 * default and made per network. The legacy org-wide `operational_visibility`
 * field is ignored: it defaulted to 'open' for years, so it records no choice.
 *
 * Must agree with the server-side policy (functions/src/privacy/policy.ts,
 * hasDetailConsent), which is what actually enforces it.
 */
export const effectiveVisibility = (
    org: Pick<Organization, 'operational_visibility' | 'operational_visibility_by_ecosystem'>,
    ecosystemId?: string
): Organization['operational_visibility'] => {
    if (!ecosystemId) return 'restricted';
    return org.operational_visibility_by_ecosystem?.[ecosystemId] === 'open' ? 'open' : 'restricted';
};
