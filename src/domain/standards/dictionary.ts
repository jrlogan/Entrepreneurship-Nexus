
// This file defines the metadata for the Data Standards view.
// It describes the shape of the data for documentation and discussion purposes.

export interface FieldDefinition {
    name: string;
    type: string;
    required: boolean;
    description: string;
    enumRef?: string; // If this field uses a specific taxonomy
}

export interface EntityDefinition {
    id: string;
    name: string;
    description: string;
    fields: FieldDefinition[];
}

export const DATA_DICTIONARY: EntityDefinition[] = [
    {
        id: 'organization',
        name: 'Organization',
        description: 'The core entity representing a business, non-profit, or agency within the ecosystem. Compliant with HSDS 3.0.',
        fields: [
            { name: 'id', type: 'string (uuid)', required: true, description: 'Unique system identifier.' },
            { name: 'name', type: 'string', required: true, description: 'Legal or common name of the entity.' },
            { name: 'roles', type: 'array', required: true, description: 'Functional roles in the ecosystem: eso (support org), funder (provides capital), workspace (physical space).', enumRef: 'OrganizationRole' },
            { name: 'org_type', type: 'string', required: false, description: 'Entity classification — startup, small_business, business, nonprofit, government_agency, or other.', enumRef: 'OrganizationType' },
            { name: 'tax_status', type: 'enum', required: true, description: 'IRS tax designation.', enumRef: 'TaxStatus' },
            { name: 'industry_tags', type: 'array<string>', required: false, description: 'Flexible tagging for sector (e.g. BioTech, SaaS).' },
            { name: 'naics_code', type: 'string', required: false, description: 'North American Industry Classification System code.' },
            { name: 'logo_url', type: 'string (url)', required: false, description: 'Brand image/logo URL.' },
            { name: 'operational_visibility', type: 'enum', required: true, description: 'Controls whether operational data (metrics, initiatives) is shared.', enumRef: 'OperationalVisibility' },
            { name: 'managed_by_ids', type: 'array<string>', required: false, description: 'List of ESOs that claim this org as a client.' },
            { name: 'ecosystem_ids', type: 'array<string>', required: true, description: 'Ecosystems this organization participates in (Multi-tenancy).' },
            { name: 'owner_characteristics', type: 'array', required: false, description: 'Demographic characteristics of the owner(s).', enumRef: 'OwnerCharacteristic' },
            { name: 'certifications', type: 'array', required: false, description: 'Formal government or third-party certifications held.', enumRef: 'OrgCertification' },
            { name: 'tags', type: 'array<string>', required: false, description: 'Ad-hoc system tags.' },
            { name: 'external_refs', type: 'array', required: false, description: 'IDs from external systems (Salesforce, HubSpot, State Registry).' }
        ]
    },
    {
        id: 'person',
        name: 'Person',
        description: 'An individual in the network. Can be an entrepreneur, mentor, or staff member.',
        fields: [
            { name: 'id', type: 'string (uuid)', required: true, description: 'Unique system identifier.' },
            { name: 'first_name', type: 'string', required: true, description: 'First Name.' },
            { name: 'last_name', type: 'string', required: true, description: 'Last Name.' },
            { name: 'email', type: 'string (email)', required: true, description: 'Primary contact email.' },
            { name: 'avatar_url', type: 'string (url)', required: false, description: 'Profile picture.' },
            { name: 'system_role', type: 'enum', required: true, description: 'Platform permission level.', enumRef: 'SystemRole' },
            { name: 'organization_id', type: 'string', required: true, description: 'Primary affiliation.' },
            { name: 'role', type: 'string', required: false, description: 'Job title (e.g. CEO, Program Manager).' },
            { name: 'memberships', type: 'array', required: true, description: 'Explicit ecosystem memberships and join dates.' },
            { name: 'secondary_profile', type: 'object', required: false, description: 'Allows staff to also act as entrepreneurs (Dual-Role).' }
        ]
    },
    {
        id: 'interaction',
        name: 'Interaction',
        description: 'A touchpoint between an ESO and a Client (e.g. Meeting, Email, Event).',
        fields: [
            { name: 'date', type: 'date (ISO)', required: true, description: 'When the interaction occurred.' },
            { name: 'type', type: 'enum', required: true, description: 'The medium of interaction.', enumRef: 'InteractionType' },
            { name: 'visibility', type: 'enum', required: true, description: 'Sharing scope (Network vs Private).', enumRef: 'InteractionVisibility' },
            { name: 'notes', type: 'string', required: true, description: 'Unstructured summary of the event.' },
            { name: 'note_confidential', type: 'boolean', required: false, description: 'Strict privacy override. If true, content is hidden from network partners.' },
            { name: 'advisor_suggestions', type: 'array', required: false, description: 'Snapshot of AI recommendations generated during logging.' }
        ]
    },
    {
        id: 'initiative',
        name: 'Initiative',
        description: 'A long-running project or goal tracked against a stage-gate pipeline or checklist.',
        fields: [
            { name: 'name', type: 'string', required: true, description: 'Project Title.' },
            { name: 'description', type: 'string', required: false, description: 'Project narrative/goals.' },
            { name: 'pipeline_id', type: 'string', required: false, description: 'Which journey map this initiative follows (Optional for checklist-only).' },
            { name: 'current_stage_index', type: 'integer', required: true, description: 'Current position in the pipeline.' },
            { name: 'status', type: 'enum', required: true, description: 'Active state of work.', enumRef: 'InitiativeStatus' },
            { name: 'start_date', type: 'date', required: false, description: 'Target start date.' },
            { name: 'target_end_date', type: 'date', required: false, description: 'Target completion date.' },
            { name: 'checklists', type: 'array', required: false, description: 'Flexible task lists attached to the project.' },
            { name: 'stage_history', type: 'array', required: false, description: 'Longitudinal log of stage movements for velocity tracking.' }
        ]
    },
    {
        id: 'referral',
        name: 'Referral',
        description: 'A structured hand-off of a client from one organization to another.',
        fields: [
            { name: 'referring_org_id', type: 'string', required: true, description: 'Sender.' },
            { name: 'receiving_org_id', type: 'string', required: true, description: 'Recipient.' },
            { name: 'status', type: 'enum', required: true, description: 'Workflow state.', enumRef: 'ReferralStatus' },
            { name: 'outcome', type: 'enum', required: false, description: 'Result of the referral (e.g. Funding Secured).', enumRef: 'ReferralOutcome' },
            { name: 'outcome_tags', type: 'array<string>', required: false, description: 'Free-text tags describing specific results.' },
            { name: 'owner_id', type: 'string', required: false, description: 'Staff member responsible for managing the referral.' },
            { name: 'follow_up_date', type: 'date', required: false, description: 'Reminder date for check-in.' }
        ]
    }
];
