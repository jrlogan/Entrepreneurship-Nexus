
import { Organization, PipelineDefinition, Initiative, MetricLog, Person, Interaction, Referral, Ecosystem, Service } from './types';

// --- Pipelines ---
// Moved inside ecosystems below, but defined here for reusability if needed, 
// though in this model they belong to the ecosystem config.

const FORGE_PIPELINE: PipelineDefinition = {
  id: 'pipeline_forge_hardware',
  name: 'Manufacturing Readiness (Hardware)',
  context: 'product',
  applicable_types: ['product_startup', 'hardware'],
  stages: [
    { 
      id: 's_forge_1',
      name: 'Appearance Model', 
      description: "Target customer ID'd, renderings complete.",
      criteria: [
        'Renderings complete',
        'Target customer profile defined',
        'Customer interviews (10+)'
      ] 
    },
    { 
      id: 's_forge_2',
      name: 'Proof of Concept', 
      description: "Feasibility demonstrated, risks explored.",
      criteria: [
        'Key technical risks identified',
        'Benchtop prototype functional',
        'Core function demonstrated'
      ]
    },
    { 
      id: 's_forge_3',
      name: 'Engineering Prototype', 
      description: "Subsystems built but not integrated.",
      criteria: [
        'CAD models for all parts',
        'Bill of Materials (BOM) Drafted',
        'Subsystems tested independently'
      ]
    },
    { 
      id: 's_forge_4',
      name: 'Alpha Prototype', 
      description: '"Looks like/Works like." BOM drafted.',
      criteria: [
        'Full system integration',
        'Looks-like / Works-like model built',
        'User testing with prototype'
      ]
    },
    { 
      id: 's_forge_5',
      name: 'Beta Prototype (Engineering)', 
      description: "Production tooling started, quality specs met.",
      criteria: [
        'DFM (Design for Mfg) Review complete',
        'Tooling ordered',
        'Quality control plan drafted'
      ]
    },
    { id: 's_forge_6', name: 'Beta Prototype (Design)', description: "Regulatory/Certification tests passed." },
    { id: 's_forge_7', name: 'Production Environment', description: "Packaging ready, soft launch ready." },
    { id: 's_forge_8', name: 'Pilot Production', description: "Facilities proven, low-rate schedule set." },
    { id: 's_forge_9', name: 'Low Rate Production', description: "Lean improvements set." },
    { id: 's_forge_10', name: 'Manufacturing Full', description: "Commercial growth, continuous improvement." },
  ],
};

const REAL_ESTATE_PIPELINE: PipelineDefinition = {
  id: 'pipeline_real_estate',
  name: 'Real Estate Expansion',
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
    interaction_privacy_default: 'network_shared'
  },
  pipelines: [REAL_ESTATE_PIPELINE], // New Haven focuses on Space/Place
  checklist_templates: [
    {
      id: 'list_admin_01',
      name: 'Administrative Setup',
      items: ['Incorporation Filed', 'EIN Obtained', 'Business Bank Account', 'Insurance Policy']
    },
    {
      id: 'list_ip_01',
      name: 'Intellectual Property',
      items: ['Provisional Patent Filed', 'Trademark Search', 'IP Assignment Agreements']
    }
  ],
  portal_links: [
    {
      id: 'link_grant_01',
      label: 'Apply for Innovation Grant',
      url: '#', // In real app, external URL
      icon: '💰',
      description: 'Annual state funding for hardware startups.'
    },
    {
      id: 'link_events_01',
      label: 'Community Calendar',
      url: '#',
      icon: '📅',
      description: 'Upcoming networking events and workshops.'
    }
  ]
};

export const CT_MAKERSPACES_ECOSYSTEM: Ecosystem = {
  id: 'eco_ct_makers',
  name: 'CT Makerspaces Network',
  region: 'Statewide',
  settings: {
    interaction_privacy_default: 'eso_private' // More private by default
  },
  pipelines: [FORGE_PIPELINE], // Makerspaces focus on Product/Hardware
  checklist_templates: [
    {
      id: 'list_safety_01',
      name: 'Safety Certification',
      items: ['General Shop Safety', 'Fire Safety', 'Machine Guarding']
    }
  ],
  portal_links: [
    {
      id: 'link_equipment_01',
      label: 'Equipment Reservation',
      url: '#',
      icon: '🛠',
      description: 'Book laser cutters and CNC mills.'
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
  roles: ['eso', 'funder'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Makerspace', 'Education'] },
  external_refs: [
    { source: 'Quickbooks', id: 'QB_MH_99', owner_org_id: 'org_makehaven' } // Internal ref
  ],
  managed_by_ids: [],
  visibility: 'public',
  consents: [],
  authorized_eso_ids: []
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
  roles: ['funder', 'eso'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Venture Capital', 'Government'] },
  external_refs: [],
  managed_by_ids: [],
  visibility: 'public',
  consents: [],
  authorized_eso_ids: []
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
  visibility: 'private',
  consents: [
    { target_org_id: 'org_makehaven', access_level: 'write' }
  ],
  authorized_eso_ids: ['org_makehaven'] // MakeHaven is trusted
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
  visibility: 'public',
  consents: [],
  authorized_eso_ids: ['org_makehaven']
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
  visibility: 'public',
  consents: [],
  authorized_eso_ids: []
};

// 4. Stealth Mode Startup - Private and NO Consent (Should be invisible)
export const STEALTH_STARTUP: Organization = {
  id: 'org_stealth_004',
  name: 'Project X',
  description: 'Top secret.',
  tax_status: 'for_profit',
  roles: ['startup'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Tech'], naics_code: '' },
  external_refs: [],
  managed_by_ids: [],
  visibility: 'private',
  consents: [],
  authorized_eso_ids: []
};

// 5. Global Admin Org (Platform Owner)
export const NEXUS_ADMIN_ORG: Organization = {
  id: 'org_nexus_admin',
  name: 'Entrepreneurship Nexus',
  description: 'Platform Administration',
  tax_status: 'other',
  roles: ['eso'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['Government', 'Platform'] },
  external_refs: [],
  managed_by_ids: [],
  visibility: 'private',
  consents: [],
  authorized_eso_ids: []
}

// Export ALL organizations for the directory
export const ALL_ORGANIZATIONS = [MAKEHAVEN, CT_INNOVATIONS, DARKSTAR_MARINE, GREENTECH_SOLUTIONS, HAVEN_COFFEE, STEALTH_STARTUP, NEXUS_ADMIN_ORG];


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
    ecosystem_id: 'eco_new_haven', // Defaults here, but can switch
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
    external_refs: [
        { source: 'HubSpot', id: 'contact_888', owner_org_id: 'org_makehaven' }
    ],
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/jrlogan' }, { platform: 'twitter', url: 'https://x.com/jrlogan' }]
  },
  // 4. ESO Coach / Volunteer (Dave Dual)
  // This person works at MakeHaven AND has his own startup "Stealth Startup"
  {
    id: 'person_dual_001',
    first_name: 'Dave',
    last_name: 'Dual',
    email: 'dave@makehaven.org',
    role: 'Fabrication Coach',
    system_role: 'eso_coach', // Primary Role: Coach at MakeHaven
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_new_haven',
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
    links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/mike-waz' }]
  }
];

// Re-assign initiatives to ecosystems appropriately
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
];

// Note: Dates align with Stage History for visualization
export const MOCK_INTERACTIONS: Interaction[] = [
  // Stage 1 (Jan-Mar)
  {
    id: 'int_004',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_ct_makers', // Interaction happened in Makerspace context
    author_org_id: 'org_ct_innovations',
    date: '2023-02-10',
    type: 'meeting',
    visibility: 'network_shared',
    notes: 'Initial vetting meeting. Discussed appearance model strategy.',
    recorded_by: 'Investment Team',
    attendees: ['Sarah Connor']
  },
  // Stage 2 (Mar-Jun)
  {
    id: 'int_005',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_ct_makers',
    author_org_id: 'org_makehaven',
    date: '2023-04-12',
    type: 'event',
    visibility: 'network_shared',
    notes: 'Attended prototyping workshop. Used laser cutter for POC.',
    recorded_by: 'Shop Manager',
    attendees: ['Sarah Connor']
  },
  // Stage 3 (Jun-Oct)
  {
    id: 'int_001',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_ct_makers',
    author_org_id: 'org_makehaven',
    date: '2023-08-15',
    type: 'meeting',
    visibility: 'network_shared',
    notes: 'Engineering prototype review. Discussed winch motor selection.',
    recorded_by: 'J.R. Logan',
    attendees: ['Sarah Connor']
  },
  // Stage 4 (Oct-Present)
  {
    id: 'int_002',
    organization_id: 'org_greentech_002',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_makehaven',
    date: '2023-10-18',
    type: 'email',
    visibility: 'network_shared',
    notes: 'Introduced Mike to potential composites supplier in Bridgeport.',
    recorded_by: 'J.R. Logan',
    attendees: ['Mike Wazowski']
  },
  {
    id: 'int_003',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_makehaven',
    date: '2023-11-02',
    type: 'note',
    visibility: 'eso_private', // This is private to the ESO
    notes: 'Noticed mention of DarkStar in local press. Alpha prototype looking good.',
    recorded_by: 'J.R. Logan'
  }
];

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
