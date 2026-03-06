
import { SystemRole } from '../types';
import { CAPABILITIES, Capability } from './capabilities';

/**
 * COMPATIBILITY BRIDGE
 * 
 * This maps existing hardcoded roles (SystemRole) to the new Capability system.
 * This ensures that as we migrate code to check capabilities, existing users
 * maintain their expected access levels.
 */

const COMMON_BASE: Capability[] = [
    'directory.read_public'
];

export const ROLE_CAPABILITY_MAP: Record<SystemRole, Capability[]> = {
    'platform_admin': [
        ...Object.values(CAPABILITIES) // Superuser has everything
    ],

    'ecosystem_manager': [
        ...COMMON_BASE,
        'directory.read_private', // Regional visibility
        'directory.update_all_orgs',
        'system.manage_users',
        'system.configure_ecosystem',
        'system.manage_taxonomy',
        'metrics.view_dashboard',
        'interaction.view_sensitive'
    ],

    'eso_admin': [
        ...COMMON_BASE,
        'directory.create_org',
        'directory.update_managed_org',
        'interaction.create',
        'interaction.view_team',
        'referral.create',
        'referral.manage_incoming',
        'metrics.assign_request',
        'metrics.verify',
        'metrics.view_dashboard',
        'system.view_api_keys' // Often manages integrations
    ],

    'eso_staff': [
        ...COMMON_BASE,
        'directory.create_org',
        'directory.update_managed_org',
        'interaction.create',
        'interaction.view_team',
        'referral.create',
        'referral.manage_incoming',
        'metrics.assign_request',
        'metrics.verify'
    ],

    'eso_coach': [
        ...COMMON_BASE,
        'interaction.create',
        'referral.create',
        'metrics.assign_request' // Coaches often ask for updates
    ],

    'entrepreneur': [
        ...COMMON_BASE,
        'metrics.submit_own',
        'interaction.create' // Can log their own notes
        // Note: Entrepreneurs generally have very scoped access via "Ownership" logic, 
        // which is separate from these role-based capabilities.
    ]
};

// Type definition for a configurable Ecosystem Role (Future feature)
export interface EcosystemRoleDefinition {
    id: string;
    name: string;
    description: string;
    capabilities: Capability[];
}
