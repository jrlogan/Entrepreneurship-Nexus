
import { Organization, PipelineDefinition, Initiative, MetricLog, Person, Interaction, Referral, Ecosystem, Service } from '../domain/types';
import { ConsentPolicy, ConsentEvent } from '../domain/consent/types';

// Re-export broken out mocks
export * from './mock/interactions';

// --- Pipelines ---

const FORGE_PIPELINE: PipelineDefinition = {
  id: 'pipeline_forge_hardware',
  name: 'Manufacturing Readiness (Hardware)',
  description: 'A standard TRL-based pipeline for physical product development, from concept to mass production.',
  context: 'product',
  applicable_types: ['product_startup', 'hardware'],
  stages: [
    { 
      id: 's_forge_1',
      name: 'Appearance Model', 
      description: "Target customer with specific problem identified. Rendered images and mockups for exploration and verification of specific market and customer requirements, and beginning translation to technical specs and manufacturing processes."
    },
    { 
      id: 's_forge_2',
      name: 'Proof of Concept', 
      description: "Key parts and assemblies complete and able to be tested using models and simulations. Might not look like a product, but demonstrates feasibility and explores risks. Developing product requirements and engineering documentation."
    },
    { 
      id: 's_forge_3',
      name: 'Engineering Prototype', 
      description: "Full subsystems built independently, but not yet totally integrated into the product package."
    },
    { 
      id: 's_forge_4',
      name: 'Alpha Prototype (Looks/Works Like)', 
      description: "Subsystems combined, and designed to test and evaluate basic processes for flaws. Bill of materials and assembly instructions developed. Customer requirements should be validated."
    },
    { 
      id: 's_forge_5',
      name: 'Beta Prototype Engineering', 
      description: "Beginning multi-unit production with “production type” tooling. Product development process progresses through completing engineering tests and meeting quality and other product specifications."
    },
    { 
      id: 's_forge_6',
      name: 'Beta Prototype Design', 
      description: "Product built using scale production quality tooling, materials and processes. Bill of process developed. Ready for validation of quality in customer tests and regulatory and/or certification tests."
    },
    { 
      id: 's_forge_7',
      name: 'Production Environment Developed', 
      description: "Nearly complete use of production materials, processes, and assemblies. Product meets all the requirements for the market. Packaging & shipping in place for soft launch, and regulatory documents complete."
    },
    { 
      id: 's_forge_8',
      name: 'Pilot Production', 
      description: "System design is complete and stable for a successful pilot production run. Materials, tooling, test equipment and facilities are proven and are available to meet the planned low rate production schedule."
    },
    { 
      id: 's_forge_9',
      name: 'Low Rate Production', 
      description: "All systems engineering and design requirements are met with minimal system changes required. Low-rate production complete. Manufacturing process review and efficiencies explored. Lean manufacturing improvements set in place."
    },
    { 
      id: 's_forge_10',
      name: 'Manufacturing Full', 
      description: "All processes in place for commercial growth, entering production and sustainment phases. Lean practices are well established and continuous process improvements are ongoing."
    },
  ],
};

const REAL_ESTATE_PIPELINE: PipelineDefinition = {
  id: 'pipeline_real_estate',
  name: 'Real Estate Expansion',
  description: 'Stages for acquiring commercial space, from needs assessment to move-in.',
  context: 'venture',
  applicable_types: ['generic'],
  stages: [
    { id: 's_re_1', name: 'Needs Assessment', description: 'Determine square footage and location requirements.', criteria: ['Budget defined', 'Square footage calculated'] },
    { id: 's_re_2', name: 'Site Selection', description: 'Tour properties and select top candidates.', criteria: ['3 sites visited', 'Top choice selected'] },
    { id: 's_re_3', name: 'Lease Negotiation', description: 'LOI and Lease signing.' },
    { id: 's_re_4', name: 'Build Out', description: 'Construction and renovation.' },
    { id: 's_re_5', name: 'Occupancy', description: 'Move in.' }
  ]
};

// --- Ecosystems ---

export const NEW_HAVEN_ECOSYSTEM: Ecosystem = {
  id: 'eco_new_haven',
  name: 'New Haven Innovation Cluster',
  region: 'New Haven, CT',
  settings: {
    interaction_privacy_default: 'open'
  },
  pipelines: [REAL_ESTATE_PIPELINE, FORGE_PIPELINE], // Added FORGE here for demo visibility
  checklist_templates: [
    {
      id: 'list_admin_01',
      name: 'Administrative Setup',
      description: 'Core legal steps for any new business.',
      items: ['Incorporation Filed', 'EIN Obtained', 'Business Bank Account', 'Insurance Policy']
    },
    {
      id: 'list_ip_01',
      name: 'Intellectual Property',
      description: 'Protecting your ideas before public disclosure.',
      items: ['Provisional Patent Filed', 'Trademark Search', 'IP Assignment Agreements']
    },
    {
      id: 'list_new_biz_01',
      name: 'Establishing a New Business',
      description: 'Comprehensive guide for starting up in CT.',
      items: [
        'Determine Business Structure (LLC, Corp, etc.)',
        'Register Name with Secretary of State',
        'Obtain Employer Identification Number (EIN)',
        'Open Business Bank Account',
        'Register for State Taxes (DRS)',
        'Obtain Necessary Licenses & Permits',
        'Setup Accounting Software',
        'Define Brand Identity'
      ]
    }
  ],
  portal_links: [
    {
      id: 'link_grant_01',
      label: 'Apply for Innovation Grant',
      url: '#',
      icon: '💰',
      description: 'Annual state funding for hardware startups.',
      audience: 'entrepreneur'
    },
    {
      id: 'link_events_01',
      label: 'Community Calendar',
      url: '#',
      icon: '📅',
      description: 'Upcoming networking events and workshops.',
      audience: 'all'
    }
  ],
  tags: ['ClimateTech', 'BioTech', 'SaaS', 'Main Street']
};

export const CT_MAKERSPACES_ECOSYSTEM: Ecosystem = {
  id: 'eco_ct_makers',
  name: 'CT Makerspaces Network',
  region: 'Statewide',
  settings: {
    interaction_privacy_default: 'restricted'
  },
  pipelines: [FORGE_PIPELINE],
  checklist_templates: [
    {
      id: 'list_safety_01',
      name: 'Safety Certification',
      description: 'Requirements to use shop equipment independently.',
      items: ['General Shop Safety', 'Fire Safety', 'Machine Guarding']
    }
  ],
  portal_links: [
    {
      id: 'link_equipment_01',
      label: 'Equipment Reservation',
      url: '#',
      icon: '🛠',
      description: 'Book laser cutters and CNC mills.',
      audience: 'all'
    }
  ]
};

export const ALL_ECOSYSTEMS = [NEW_HAVEN_ECOSYSTEM, CT_MAKERSPACES_ECOSYSTEM];

// Part 3: Example Organization Data

// 0. MakeHaven (The "My Organization" Context)
export const MAKEHAVEN: Organization = {
  id: 'org_makehaven',
  name: 'MakeHaven',
  description: 'A makerspace and incubator for local entrepreneurs.',
  email: 'info@makehaven.org',
  url: 'https://makehaven.org',
  tax_status: 'non_profit',
  ein: '06-1234567',
  year_incorporated: 2012,
  region: 'New Haven, CT',
  version: 5,
  roles: ['eso', 'funder'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Makerspace', 'Education'], naics_code: '611000' },
  external_refs: [
    { source: 'Quickbooks', id: 'QB_MH_99', owner_org_id: 'org_makehaven' } // Internal ref
  ],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven', 'eco_ct_makers'],
  // New: Example Webhooks for API Demo
  webhooks: [
    {
        id: 'wh_civicrm_01',
        url: 'https://civicrm.makehaven.org/api/hooks/nexus',
        description: 'Sync Member & Donor Data to CiviCRM',
        events: ['organization.created', 'organization.updated', 'referral.received'],
        secret: 'whsec_MhCivi_2024_Alpha',
        status: 'active',
        created_at: '2023-02-10T09:00:00Z',
        last_delivery: '2023-11-28T14:30:00Z',
        payload_format: 'full_resource'
    },
    {
        id: 'wh_airtable_02',
        url: 'https://hooks.airtable.com/workflows/v1/appClimateHaven/sync',
        description: 'Climate Haven Portfolio Sync (Airtable)',
        events: ['initiative.created', 'metric.logged'],
        secret: 'whsec_AirTable_CH_Sync_9988',
        status: 'active',
        created_at: '2023-06-20T09:15:00Z',
        last_delivery: '2023-11-29T08:45:00Z',
        payload_format: 'delta'
    }
  ]
};

// 0.5 CT Innovations (Another ESO)
export const CT_INNOVATIONS: Organization = {
  id: 'org_ct_innovations',
  name: 'CT Innovations',
  description: 'State venture capital and innovation arm.',
  email: 'info@ctinnovations.com',
  url: 'https://ctinnovations.com',
  tax_status: 'government',
  year_incorporated: 1995,
  version: 1,
  roles: ['funder', 'eso'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Venture Capital', 'Government'], naics_code: '523999' },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
};

// 1. DarkStar Marine - Private but consented to MakeHaven
export const DARKSTAR_MARINE: Organization = {
  id: 'org_darkstar_001',
  name: 'DarkStar Marine',
  alternate_name: 'DSM Tech',
  description: 'Autonomous winch systems for deep-sea salvage operations.',
  email: 'contact@darkstarmarine.com',
  url: 'https://darkstarmarine.com',
  tax_status: 'for_profit',
  ein: '45-9876543',
  year_incorporated: 2022,
  version: 3,
  roles: ['startup'],
  demographics: {
    minority_owned: false,
    woman_owned: true,
    veteran_owned: true,
  },
  classification: {
    naics_code: '333923', // Overhead Traveling Crane, Hoist, and Monorail System Manufacturing
    industry_tags: ['Maritime', 'Robotics', 'Defense'],
  },
  external_refs: [
    // CT Innovations uses Salesforce
    { source: 'Salesforce', id: '0015f00000G7x9A', owner_org_id: 'org_ct_innovations' },
    // MakeHaven uses HubSpot
    { source: 'HubSpot', id: 'HS_COMP_882', owner_org_id: 'org_makehaven' },
    // Public/Global Ref
    { source: 'Crunchbase', id: 'cb_102938' } 
  ],
  managed_by_ids: ['org_makehaven'],
  operational_visibility: 'restricted',
  authorized_eso_ids: ['org_makehaven'], // MakeHaven is trusted
  ecosystem_ids: ['eco_new_haven', 'eco_ct_makers']
};

// 1.5 Duplicate DarkStar (For Data Quality Demo)
export const DARK_STAR_LLC: Organization = {
  id: 'org_darkstar_dup_999',
  name: 'Dark Star Marine LLC', // Name similar but distinct
  description: 'Marine robotics and winches.', 
  email: 'info@darkstarmarine.com',
  url: 'https://darkstarmarine.com', // Exact URL match triggers high confidence dedupe
  tax_status: 'for_profit',
  version: 1,
  roles: ['startup'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { 
      industry_tags: ['Manufacturing'], 
      naics_code: '333900' 
  },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
};

// 2. GreenTech Solutions - Public
export const GREENTECH_SOLUTIONS: Organization = {
  id: 'org_greentech_002',
  name: 'GreenTech Solutions',
  alternate_name: 'GTS',
  description: 'Sustainable packaging materials made from mycelium.',
  email: 'hello@greentech.io',
  url: 'https://greentech.io',
  tax_status: 'for_profit',
  ein: '22-3334445',
  year_incorporated: 2021,
  version: 1,
  roles: ['startup'],
  demographics: {
    minority_owned: true,
    woman_owned: false,
    veteran_owned: false,
  },
  classification: {
    naics_code: '322220',
    industry_tags: ['CleanTech', 'Manufacturing', 'Sustainability'],
  },
  external_refs: [
     { source: 'HubSpot', id: 'HS_COMP_991', owner_org_id: 'org_makehaven' }
  ],
  managed_by_ids: ['org_makehaven'],
  operational_visibility: 'open',
  authorized_eso_ids: ['org_makehaven'],
  ecosystem_ids: ['eco_new_haven']
};

// 2.5 Duplicate GreenTech (Another Data Quality Demo)
export const GREENTECH_INC: Organization = {
  id: 'org_greentech_dup_888',
  name: 'Green Tech Inc',
  description: 'Packaging solutions.',
  email: 'contact@greentech.io',
  url: 'https://greentech.io', // Match
  tax_status: 'for_profit',
  version: 1,
  roles: ['startup'],
  demographics: {
    minority_owned: true,
    woman_owned: false,
    veteran_owned: false,
  },
  classification: {
    naics_code: '322220',
    industry_tags: ['Manufacturing'],
  },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
};

// 3. Haven Coffee Co - Public
export const HAVEN_COFFEE: Organization = {
  id: 'org_haven_003',
  name: 'Haven Coffee Co',
  description: 'Community-focused coffee roaster and cafe.',
  email: 'brew@haven.coffee',
  url: 'https://haven.coffee',
  tax_status: 'for_profit',
  ein: '11-2223334',
  year_incorporated: 2019,
  version: 1,
  roles: ['eso'],
  demographics: {
    minority_owned: true,
    woman_owned: true,
    veteran_owned: false,
  },
  classification: {
    naics_code: '722515',
    industry_tags: ['Food & Bev', 'Retail'],
  },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
};

// 4. Stealth Mode Startup - Private and NO Consent (Should be invisible)
export const STEALTH_STARTUP: Organization = {
  id: 'org_stealth_004',
  name: 'Project X',
  description: 'Top secret.',
  tax_status: 'for_profit',
  version: 1,
  roles: ['startup'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Tech'], naics_code: '' },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'restricted',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
};

// 5. Global Admin Org (Platform Owner)
export const NEXUS_ADMIN_ORG: Organization = {
  id: 'org_nexus_admin',
  name: 'Entrepreneurship Nexus',
  description: 'Platform Administration',
  tax_status: 'other',
  version: 1,
  roles: ['eso'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Government', 'Platform'], naics_code: '' },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'restricted',
  authorized_eso_ids: [],
  ecosystem_ids: ['eco_new_haven']
}

// 6. BioGen (Funder Target)
export const BIOGEN: Organization = {
    id: 'org_biogen_006',
    name: 'BioGen Ventures',
    description: 'Life sciences venture capital.',
    tax_status: 'for_profit',
    version: 1,
    roles: ['funder'],
    demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
    classification: { industry_tags: ['Venture Capital', 'BioTech'], naics_code: '523999' },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven']
};

export const ELM_CAPITAL: Organization = {
    id: 'org_elm_cap_007',
    name: 'Elm City Capital',
    description: 'Angel group.',
    tax_status: 'for_profit',
    version: 1,
    roles: ['funder'],
    demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
    classification: { industry_tags: ['Angel Investment'], naics_code: '523999' },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven']
};

// Export ALL organizations for the directory
export const ALL_ORGANIZATIONS = [
    MAKEHAVEN, 
    CT_INNOVATIONS, 
    DARKSTAR_MARINE, 
    DARK_STAR_LLC, // Added Duplicate
    GREENTECH_SOLUTIONS, 
    GREENTECH_INC, // Added Duplicate
    HAVEN_COFFEE, 
    STEALTH_STARTUP, 
    NEXUS_ADMIN_ORG, 
    BIOGEN, 
    ELM_CAPITAL
];


// --- People Data ---
export const MOCK_PEOPLE: Person[] = [
  // 1. Platform Super Admin
  {
    id: 'person_admin_000',
    first_name: 'Neo',
    last_name: 'Nexus',
    email: 'admin@nexus.org',
    role: 'System Architect',
    system_role: 'platform_admin',
    organization_id: 'org_nexus_admin',
    ecosystem_id: 'eco_new_haven', 
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'platform_admin', joined_at: '2023-01-01' }
    ],
    links: [{ platform: 'github', url: 'https://github.com/nexus' }]
  },
  // 2. Ecosystem Manager (Regional Leader)
  {
    id: 'person_eco_001',
    first_name: 'Kate',
    last_name: 'Ecosystem',
    email: 'kate@newhaven.gov',
    role: 'Economic Dev Director',
    system_role: 'ecosystem_manager',
    organization_id: 'org_nexus_admin', // Technically employed by city/gov
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'ecosystem_manager', joined_at: '2023-01-01' }
    ],
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/kate-eco' }]
  },
  // 3. ESO Admin (J.R.)
  {
    id: 'person_001',
    first_name: 'J.R.',
    last_name: 'Logan',
    email: 'jr@makehaven.org',
    role: 'Executive Director',
    system_role: 'eso_admin',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'eso_admin', joined_at: '2012-01-01' },
        { ecosystem_id: 'eco_ct_makers', system_role: 'eso_admin', joined_at: '2015-01-01' }
    ],
    external_refs: [
        { source: 'HubSpot', id: 'contact_888', owner_org_id: 'org_makehaven' }
    ],
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/jrlogan' }, { platform: 'twitter', url: 'https://x.com/jrlogan' }]
  },
  // 4. ESO Coach / Volunteer (Dave Dual)
  {
    id: 'person_dual_001',
    first_name: 'Dave',
    last_name: 'Dual',
    email: 'dave@makehaven.org',
    role: 'Fabrication Coach',
    system_role: 'eso_coach', // Primary Role: Coach at MakeHaven
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'eso_coach', joined_at: '2020-01-01' }
    ],
    // Secondary Profile: Entrepreneur
    secondary_profile: {
      system_role: 'entrepreneur',
      organization_id: 'org_stealth_004',
      role_title: 'Founder'
    },
    links: [{ platform: 'website', url: 'https://davedual.com' }]
  },
  // 5. Entrepreneur (Sarah)
  {
    id: 'person_002',
    first_name: 'Sarah',
    last_name: 'Connor',
    email: 'sarah@darkstarmarine.com',
    role: 'CEO',
    system_role: 'entrepreneur',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'entrepreneur', joined_at: '2022-01-01' },
        { ecosystem_id: 'eco_ct_makers', system_role: 'entrepreneur', joined_at: '2023-01-01' }
    ],
    external_refs: [
        { source: 'Salesforce', id: 'contact_0035f00000ABC', owner_org_id: 'org_ct_innovations' },
        { source: 'HubSpot', id: 'hs_contact_999', owner_org_id: 'org_makehaven' }
    ],
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/sarah-connor-tech' }]
  },
  // 6. Entrepreneur (Mike)
  {
    id: 'person_003',
    first_name: 'Mike',
    last_name: 'Wazowski',
    email: 'mike@greentech.io',
    role: 'Lead Engineer',
    system_role: 'entrepreneur',
    organization_id: 'org_greentech_002',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'entrepreneur', joined_at: '2021-05-01' }
    ],
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/mike-waz' }]
  },
  // 7. Alex Mystery (Project X Founder)
  {
    id: 'person_004',
    first_name: 'Alex',
    last_name: 'Mystery',
    email: 'alex@projectx.com',
    role: 'Founder',
    system_role: 'entrepreneur',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'entrepreneur', joined_at: '2023-09-01' }
    ],
    links: []
  },
  // 8. Felix Phantom (Project X Engineer - should be hidden in restricted view)
  {
    id: 'person_stealth_002',
    first_name: 'Felix',
    last_name: 'Phantom',
    email: 'felix@projectx.com',
    role: 'Lead Engineer',
    system_role: 'entrepreneur',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'entrepreneur', joined_at: '2023-09-15' }
    ],
    links: []
  },
  // 9. Gwen Ghost (Project X Lawyer - should be hidden in restricted view)
  {
    id: 'person_stealth_003',
    first_name: 'Gwen',
    last_name: 'Ghost',
    email: 'gwen@projectx.com',
    role: 'Legal Counsel',
    system_role: 'entrepreneur',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'entrepreneur', joined_at: '2023-10-01' }
    ],
    links: []
  },
  // 10. Sam Staff (Standard ESO Employee)
  {
    id: 'person_staff_001',
    first_name: 'Sam',
    last_name: 'Staff',
    email: 'sam@makehaven.org',
    role: 'Program Manager',
    system_role: 'eso_staff',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
    memberships: [
        { ecosystem_id: 'eco_new_haven', system_role: 'eso_staff', joined_at: '2023-01-01' }
    ],
    links: []
  }
];

export const MOCK_CONSENT_POLICIES: ConsentPolicy[] = [
    // Sarah allows MakeHaven to see her private org data
    {
        id: 'pol_001',
        resourceType: 'organization',
        resourceId: 'org_darkstar_001',
        viewerId: 'org_makehaven',
        accessLevel: 'write',
        isActive: true,
        updatedAt: '2023-01-01'
    }
];

export const MOCK_CONSENT_EVENTS: ConsentEvent[] = [];

// --- Re-added Mock Data for Application Logic ---

export const INITIATIVE_A: Initiative = {
  id: 'init_winch_v1',
  organization_id: 'org_darkstar_001',
  pipeline_id: 'pipeline_forge_hardware',
  name: 'New Winch Product',
  current_stage_index: 3, 
  status: 'active',
  ecosystem_id: 'eco_ct_makers', // Hardware happens in Makerspace Network
  stage_history: [
    { stage_index: 0, stage_id: 's_forge_1', entered_at: '2023-01-10', exited_at: '2023-03-15' },
    { stage_index: 1, stage_id: 's_forge_2', entered_at: '2023-03-16', exited_at: '2023-06-20' },
    { stage_index: 2, stage_id: 's_forge_3', entered_at: '2023-06-21', exited_at: '2023-10-01' },
    { stage_index: 3, stage_id: 's_forge_4', entered_at: '2023-10-02' } 
  ],
  checklists: [
    { template_id: 'list_safety_01', items_checked: { 'General Shop Safety': true } }
  ]
};

export const INITIATIVE_B: Initiative = {
  id: 'init_warehouse_exp',
  organization_id: 'org_darkstar_001',
  pipeline_id: 'pipeline_real_estate',
  name: 'Warehouse Expansion',
  current_stage_index: 1, // Stage 2
  status: 'active',
  ecosystem_id: 'eco_new_haven', // Real Estate is Regional
  stage_history: [
    { stage_index: 0, stage_id: 's_re_1', entered_at: '2023-09-01', exited_at: '2023-10-15' },
    { stage_index: 1, stage_id: 's_re_2', entered_at: '2023-10-16' }
  ],
  checklists: []
};

export const INITIATIVE_C: Initiative = {
  id: 'init_grant_training',
  organization_id: 'org_darkstar_001', // Sarah's Org
  pipeline_id: 'pipeline_real_estate', // Reusing pipeline for demo simplicity (using RE stages as proxy for "grant stages")
  name: 'Workforce Training Grant',
  current_stage_index: 0,
  status: 'active',
  ecosystem_id: 'eco_new_haven', // Regional
  stage_history: [
    { stage_index: 0, stage_id: 's_re_1', entered_at: '2023-11-10' }
  ],
  checklists: []
};

// Additional Initiatives for variety
export const INITIATIVE_D: Initiative = {
    id: 'init_greentech_1',
    organization_id: 'org_greentech_002',
    pipeline_id: 'pipeline_forge_hardware',
    name: 'Mycelium Packaging Pilot',
    current_stage_index: 2,
    status: 'active',
    ecosystem_id: 'eco_ct_makers',
    stage_history: [],
    checklists: []
};

export const INITIATIVE_E: Initiative = {
    id: 'init_haven_coffee_1',
    organization_id: 'org_haven_003',
    pipeline_id: 'pipeline_real_estate',
    name: 'New Location Search',
    current_stage_index: 1,
    status: 'active',
    ecosystem_id: 'eco_new_haven',
    stage_history: [],
    checklists: []
};

export const INITIATIVE_F: Initiative = {
    id: 'init_stealth_1',
    organization_id: 'org_stealth_004',
    pipeline_id: 'pipeline_forge_hardware',
    name: 'Project X Prototype',
    current_stage_index: 4,
    status: 'active',
    ecosystem_id: 'eco_ct_makers',
    stage_history: [],
    checklists: []
};

export const INITIATIVE_G: Initiative = {
    id: 'init_biogen_1',
    organization_id: 'org_biogen_006',
    pipeline_id: 'pipeline_real_estate',
    name: 'Lab Space Expansion',
    current_stage_index: 3,
    status: 'active',
    ecosystem_id: 'eco_new_haven',
    stage_history: [],
    checklists: []
};

export const INITIATIVE_H: Initiative = {
    id: 'init_darkstar_rec',
    organization_id: 'org_darkstar_001',
    pipeline_id: 'pipeline_forge_hardware',
    name: 'Recruiting Engineering Lead',
    current_stage_index: 0,
    status: 'active',
    ecosystem_id: 'eco_new_haven',
    stage_history: [],
    checklists: []
};

export const INITIATIVE_STEALTH_1 = INITIATIVE_F;

// Metrics
export const METRIC_LOGS: MetricLog[] = [
  {
    id: 'log_001',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    date: '2023-01-15',
    metric_type: 'revenue',
    value: 0,
    source: 'self_reported',
  },
  {
    id: 'log_002',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    date: '2023-06-30',
    metric_type: 'revenue',
    value: 15000,
    source: 'verified',
  },
  {
    id: 'log_003',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    date: '2023-06-30',
    metric_type: 'jobs_ft',
    value: 3,
    source: 'self_reported',
  },
  // Project X (Stealth) Metrics
  {
    id: 'log_stealth_01',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    date: '2023-11-01',
    metric_type: 'capital_raised',
    value: 2500000,
    source: 'verified',
    notes: 'Seed round closed (Confidential)'
  },
  {
    id: 'log_stealth_02',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    date: '2023-11-01',
    metric_type: 'jobs_ft',
    value: 12,
    source: 'self_reported'
  }
];

// Referrals
export const MOCK_REFERRALS: Referral[] = [
  {
    id: 'ref_001',
    referring_org_id: 'org_makehaven',
    receiving_org_id: 'org_ct_innovations',
    subject_person_id: 'person_002', // Sarah Connor
    subject_org_id: 'org_darkstar_001',
    date: '2023-11-05',
    status: 'pending',
    notes: 'DarkStar is looking for Series A funding. They have a solid prototype and defense interest.'
  },
  {
    id: 'ref_002',
    referring_org_id: 'org_ct_innovations',
    receiving_org_id: 'org_makehaven',
    subject_person_id: 'person_003', // Mike Wazowski
    subject_org_id: 'org_greentech_002',
    date: '2023-10-25',
    status: 'accepted',
    notes: 'GreenTech needs physical space for their bio-lab buildout.',
    response_notes: 'Accepted. We have scheduled a tour for Nov 1st.',
    intro_email_sent: true
  }
];

// Services
export const MOCK_SERVICES: Service[] = [
  {
    id: 'svc_001',
    name: 'Makerspace Membership',
    provider_org_id: 'org_makehaven',
    recipient_person_id: 'person_002', // Sarah Connor
    start_date: '2023-01-10',
    status: 'active',
    description: 'Full access to woodshop and metalshop.'
  },
  {
    id: 'svc_002',
    name: 'Incubator Office Rental',
    provider_org_id: 'org_makehaven',
    recipient_org_id: 'org_darkstar_001', // Linked to company
    start_date: '2023-03-01',
    status: 'active',
    description: 'Office 304, 2 desks.'
  }
];
