
import { Organization, Initiative, Interaction, Referral, MetricLog, SystemRole } from '../types';
import { ViewerContext } from './privacy';

// --- Constants ---
export const REDACTED_TEXT = "REDACTED";
export const RESTRICTED_INITIATIVE_NAME = "Restricted Project";
export const RESTRICTED_METRIC_NOTE = "Value Hidden";

// --- Admin Viewer for Backward Compatibility ---
export const ADMIN_VIEWER: ViewerContext = {
    personId: 'system_admin',
    orgId: 'org_nexus_admin',
    role: 'platform_admin',
    ecosystemId: 'global'
};

// --- Redactors ---

export function redactOrganization(org: Organization): Organization {
    // Return a shallow copy with sensitive fields removed/masked
    return {
        ...org,
        api_keys: [], // Never show API keys in restricted view
        external_refs: [], // Hide external system IDs (prevents triangulation)
        // Note: Name, Description, and Demographics remain visible as Directory Info
    };
}

export function redactInitiative(init: Initiative): Initiative {
    return {
        ...init,
        name: RESTRICTED_INITIATIVE_NAME,
        description: REDACTED_TEXT,
        notes: REDACTED_TEXT,
        checklists: [] // Hide specific progress details
        // Keep: id, status, current_stage_index, dates (Velocity metadata)
    };
}

export function redactInteraction(int: Interaction): Interaction {
    return {
        ...int,
        notes: REDACTED_TEXT,
        attendees: [], // Hide specific people present
        recorded_by: "Agency Staff", // Mask specific staff member if needed (optional)
        advisor_suggestions: [],
        advisor_acceptances: []
        // Keep: id, date, type, author_org, visibility (Metadata)
    };
}

/**
 * Redacts a Referral to prevent leaking subject identity or sensitivity details.
 * 
 * Subject-Identifying Fields Removed:
 * - subject_person_id: Masked to prevent identifying the specific individual.
 * - subject_org_id: Removed to prevent confirming the specific client org if context is generic.
 * 
 * Content Fields Removed:
 * - notes, response_notes: Free text often contains sensitive context.
 * - outcome, outcome_tags: Specific results (e.g. "Funding Rejected") are sensitive.
 * - owner_id, follow_up_date: Internal processing details.
 */
export function redactReferral(ref: Referral): Referral {
    return {
        ...ref,
        subject_person_id: REDACTED_TEXT, // Mask subject identity
        subject_org_id: undefined,        // Mask subject organization
        notes: REDACTED_TEXT,
        response_notes: REDACTED_TEXT,
        outcome_tags: [],
        outcome: undefined,               // Mask outcome details
        owner_id: undefined,              // Mask internal owner
        follow_up_date: undefined         // Mask internal workflow
        // Keep: id, referring_org_id, receiving_org_id, status, dates (Flow metadata)
    };
}

export function redactMetric(met: MetricLog): MetricLog {
    return {
        ...met,
        value: -1, // Sentinel value for hidden
        notes: RESTRICTED_METRIC_NOTE
        // Keep: type, date, source (Impact metadata)
    };
}
