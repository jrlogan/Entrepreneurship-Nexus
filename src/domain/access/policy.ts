
import { Organization, Interaction, SystemRole } from '../types';
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

/**
 * TRUTH TABLE
 * ... (Rest of file remains unchanged, redacted below for brevity but preserved in real file) ...
 */

// 1. Directory Info: Always Visible
export const canViewDirectoryInfo = (viewer: ViewerContext, org: Organization): boolean => {
    return true;
};

// 2. Operational Data (Initiatives, Metrics, Referrals, Interaction Existence)
export const canViewOperationalDetails = (viewer: ViewerContext, org: Organization, hasConsent: boolean = false): boolean => {
    // Legacy Role Check (Migration Path: Replace with capabilities over time)
    if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) return true;
    
    // New Capability Check (Hybrid approach)
    if (viewerHasCapability(viewer, 'directory.read_private')) return true;

    if (viewer.orgId === org.id) return true;
    if (hasConsent) return true;

    return org.operational_visibility === 'open';
};

// Alias for backward compatibility / explicit naming
export const canViewOrgDetailed = canViewOperationalDetails;

export const explainOrgAccess = (viewer: ViewerContext, org: Organization, hasConsent: boolean = false): { level: 'basic' | 'detailed', reason: string } => {
    if (canViewOperationalDetails(viewer, org, hasConsent)) {
        if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) return { level: 'detailed', reason: 'Admin Privilege' };
        if (viewer.orgId === org.id) return { level: 'detailed', reason: 'Owner' };
        if (hasConsent) return { level: 'detailed', reason: 'Consent Granted' };
        return { level: 'detailed', reason: 'Public Data' };
    }
    return { level: 'basic', reason: 'Restricted (No Consent)' };
};

// 3. Interaction Content (Notes)
export const canViewInteractionContent = (viewer: ViewerContext, interaction: Interaction, subjectOrg: Organization, hasConsent: boolean = false): boolean => {
    if (interaction.author_org_id === viewer.orgId) return true;
    if (viewer.role === 'platform_admin') return true;
    if (interaction.note_confidential) return false;

    if (interaction.visibility === 'eso_private') {
        if (viewer.role === 'ecosystem_manager') return true;
        return false;
    }

    if (viewer.role === 'ecosystem_manager') return true;

    return canViewOperationalDetails(viewer, subjectOrg, hasConsent);
};

// 4. Interaction Metadata (Who helping who)
export const canViewInteractionMetadata = (viewer: ViewerContext, interaction: Interaction): boolean => {
    return true; 
};

export const explainInteractionAccess = (viewer: ViewerContext, interaction: Interaction, subjectOrg: Organization, hasConsent: boolean = false): { visible: boolean, reason: string } => {
    if (!canViewInteractionMetadata(viewer, interaction)) return { visible: false, reason: 'Hidden' };

    if (canViewInteractionContent(viewer, interaction, subjectOrg, hasConsent)) {
        if (interaction.author_org_id === viewer.orgId) return { visible: true, reason: 'Author' };
        if (viewer.role === 'platform_admin') return { visible: true, reason: 'Platform Admin' };
        return { visible: true, reason: 'Shared Access' };
    }
    
    if (interaction.note_confidential) return { visible: false, reason: 'Confidential Note' };
    if (interaction.visibility === 'eso_private') return { visible: false, reason: 'Private to Agency' };
    
    return { visible: false, reason: 'Restricted Context' };
};

// 5. Ecosystem Scoping (Tenancy Enforcement)
export const validateEcosystemScope = (viewer: ViewerContext, requestedId?: string): string => {
    const contextId = viewer.ecosystemId;
    if (!requestedId) return contextId;
    if (requestedId === contextId) return contextId;
    if (viewer.role === 'platform_admin') return requestedId;
    console.warn(`Security Warning: User ${viewer.personId} attempted to access ecosystem ${requestedId} from context ${contextId}. Scoped to ${contextId}.`);
    return contextId;
};
