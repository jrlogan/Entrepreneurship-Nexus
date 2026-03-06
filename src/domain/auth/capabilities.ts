
/**
 * CAPABILITIES REGISTRY
 * 
 * This file defines the atomic actions available in the system.
 * Code should check for these CAPABILITIES, not specific Roles.
 */

export const CAPABILITIES = {
    // --- Directory & Data Access ---
    'directory.read_public': 'directory.read_public',       // See public orgs/people
    'directory.read_private': 'directory.read_private',     // See private/restricted orgs (Admin override)
    'directory.create_org': 'directory.create_org',         // Add new organizations
    'directory.update_managed_org': 'directory.update_managed_org', // Update orgs listed in 'managed_by'
    'directory.update_all_orgs': 'directory.update_all_orgs',       // Admin update any org
    
    // --- Interactions ---
    'interaction.create': 'interaction.create',             // Log a meeting/note
    'interaction.view_team': 'interaction.view_team',       // View notes created by my team
    'interaction.view_sensitive': 'interaction.view_sensitive', // View confidential notes (Admin override)

    // --- Metrics & Data Collection ---
    'metrics.view_dashboard': 'metrics.view_dashboard',     // See aggregate ecosystem stats
    'metrics.submit_own': 'metrics.submit_own',             // Entrepreneur submitting their own data
    'metrics.assign_request': 'metrics.assign_request',     // Staff asking a startup for data
    'metrics.verify': 'metrics.verify',                     // Mark data as "Verified"

    // --- Referrals ---
    'referral.create': 'referral.create',
    'referral.manage_incoming': 'referral.manage_incoming', // Accept/Reject referrals sent to my org

    // --- System & Config ---
    'system.manage_users': 'system.manage_users',           // Create/Edit Platform Users
    'system.manage_taxonomy': 'system.manage_taxonomy',     // Edit Data Standards/Enums
    'system.view_api_keys': 'system.view_api_keys',         // Access Developer Console
    'system.configure_ecosystem': 'system.configure_ecosystem' // Edit Pipeline stages, Checklists
} as const;

export type Capability = keyof typeof CAPABILITIES;

// Grouping for UI/Documentation
export const CAPABILITY_GROUPS = {
    'Directory': ['directory.read_public', 'directory.read_private', 'directory.create_org'],
    'Operations': ['interaction.create', 'referral.create', 'metrics.assign_request'],
    'Administration': ['system.manage_users', 'system.configure_ecosystem', 'directory.update_all_orgs']
};
