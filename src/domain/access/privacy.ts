
import { Organization, Interaction, SystemRole } from '../types';

export interface ViewerContext {
    personId: string;
    orgId: string;
    role: SystemRole;
    ecosystemId: string;
}

/**
 * TRUTH TABLE
 * 
 * | Subject Org Visibility | Interaction Confidential? | Viewer Role        | Can See Metadata? | Can See Content? |
 * | :---                   | :---                      | :---               | :---              | :---             |
 * | Open                   | false                     | Partner ESO        | Yes               | Yes              |
 * | Open                   | true                      | Partner ESO        | Yes               | No               |
 * | Restricted             | false                     | Partner (No Perm)  | Yes               | No               |
 * | Restricted             | false                     | Partner (With Perm)| Yes               | Yes              |
 * | Restricted             | true                      | Partner (With Perm)| Yes               | No               |
 * | Any                    | Any                       | Author Org         | Yes               | Yes              |
 * | Any                    | Any                       | System Admin       | Yes               | Yes              |
 */

// 1. Directory Info: Always Visible
export const canViewDirectoryInfo = (viewer: ViewerContext, org: Organization): boolean => {
    return true;
};

// 2. Operational Data (Initiatives, Metrics, Referrals, Interaction Existence)
// Updated: accepts 'hasConsent' boolean (calculated by Repo) instead of checking org.consents
export const canViewOperationalDetails = (viewer: ViewerContext, org: Organization, hasConsent: boolean = false): boolean => {
    if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) return true;
    if (viewer.orgId === org.id) return true;
    
    if (hasConsent) return true;

    return org.operational_visibility === 'open';
};

// 3. Interaction Content (Notes)
// Updated: accepts 'hasConsent' boolean via subjectOrg access check logic
export const canViewInteractionContent = (viewer: ViewerContext, interaction: Interaction, subjectOrg: Organization, hasConsent: boolean = false): boolean => {
    // Admins and Authors always see
    if (['platform_admin', 'ecosystem_manager'].includes(viewer.role)) return true;
    if (interaction.author_org_id === viewer.orgId) return true;

    // Confidential override (Overrides everything else)
    if (interaction.note_confidential) return false;

    // Fallback to Org Operational Visibility
    return canViewOperationalDetails(viewer, subjectOrg, hasConsent);
};

// 4. Interaction Metadata (Who helping who)
export const canViewInteractionMetadata = (viewer: ViewerContext, interaction: Interaction): boolean => {
    // Visible across the ecosystem even when restricted
    // Assuming viewer is a authenticated ecosystem participant
    return true; 
};
