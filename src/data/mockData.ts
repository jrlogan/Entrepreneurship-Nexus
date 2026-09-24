
import { Organization, Person, Interaction, Referral, Ecosystem, Service } from '../domain/types';
import { ConsentPolicy, ConsentEvent } from '../domain/consent/types';

// Re-export broken out mocks
export * from './mock/interactions';

// --- Ecosystems ---

export const NEW_HAVEN_ECOSYSTEM: Ecosystem = {
  id: 'eco_new_haven',
  name: 'New Haven Innovation Cluster',
  region: 'New Haven, CT',
  settings: {
    interaction_privacy_default: 'network_shared',
    feature_flags: {
      api_console: true,
      inbound_intake: true,
    }
  },
  portal_links: [],
  tags: ['ClimateTech', 'BioTech', 'SaaS', 'Main Street']
};

export const CT_MAKERSPACES_ECOSYSTEM: Ecosystem = {
  id: 'eco_ct_makers',
  name: 'CT Makerspaces Network',
  region: 'Statewide',
  settings: {
    interaction_privacy_default: 'eso_private',
    feature_flags: {
      api_console: true,
      inbound_intake: true,
    }
  },
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

export const MAIL_TEST_ECOSYSTEM: Ecosystem = {
  id: 'eco_mail_test',
  name: 'Mail Flow Test',
  region: 'Staging',
  settings: {
    interaction_privacy_default: 'eso_private',
    feature_flags: {
      api_console: true,
      inbound_intake: true,
    }
  },
  portal_links: [],
  tags: ['Mail QA', 'Staging']
};

export const ALL_ECOSYSTEMS = [NEW_HAVEN_ECOSYSTEM, CT_MAKERSPACES_ECOSYSTEM, MAIL_TEST_ECOSYSTEM];

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
  roles: ['eso', 'resource'],
  org_type: 'nonprofit',
  owner_characteristics: [],
  classification: { industry_tags: ['Makerspace', 'Education'], naics_code: '611000' },
  external_refs: [
    { source: 'Quickbooks', id: 'QB_MH_99', owner_org_id: 'org_makehaven' } // Internal ref
  ],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  support_offerings: ['workspace', 'product_development', 'business_coaching', 'networking'],
  ecosystem_ids: ['eco_new_haven', 'eco_ct_makers'],
  // Example webhooks used to live on this doc; they now live in the
  // /organizations/{orgId}/webhooks subcollection and are seeded via the
  // repo (not via this mock object) if a demo needs them.
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
  org_type: 'government_agency',
  owner_characteristics: [],
  classification: { industry_tags: ['Venture Capital', 'Government'], naics_code: '523999' },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  support_offerings: ['funding', 'business_coaching', 'networking'],
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
  roles: [],
  org_type: 'startup',
  owner_characteristics: ['woman_owned', 'veteran_owned'],
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
  roles: [],
  org_type: 'startup',
  owner_characteristics: [],
  classification: {
      industry_tags: ['Manufacturing'],
      naics_code: '333900'
  },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  support_offerings: ['workspace', 'networking', 'marketing'],
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
  roles: [],
  org_type: 'startup',
  owner_characteristics: ['minority_owned'],
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
  roles: [],
  org_type: 'startup',
  owner_characteristics: ['minority_owned'],
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
  org_type: 'small_business',
  owner_characteristics: ['minority_owned', 'woman_owned'],
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
  roles: [],
  org_type: 'startup',
  owner_characteristics: [],
  classification: { industry_tags: ['Tech'], naics_code: '' },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'restricted',
  authorized_eso_ids: [],
  support_offerings: [],
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
  org_type: 'other',
  owner_characteristics: [],
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
    description: 'Life sciences venture capital and foundation focused on regional innovation.',
    url: 'https://biogen.com/ventures',
    tax_status: 'for_profit',
    version: 1,
    roles: ['funder'],
    org_type: 'nonprofit',
    owner_characteristics: [],
    classification: { industry_tags: ['Venture Capital', 'BioTech'], naics_code: '523999' },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    tags: ['Life Sciences', 'High Growth', 'Equity'],
    description_auto_generated: true
};

export const ELM_CAPITAL: Organization = {
    id: 'org_elm_cap_007',
    name: 'Elm City Capital',
    description: 'Angel group focused on early-stage New Haven startups.',
    url: 'https://elmcitycapital.com',
    tax_status: 'for_profit',
    version: 1,
    roles: ['funder'],
    org_type: 'nonprofit',
    owner_characteristics: [],
    classification: { industry_tags: ['Angel Investment'], naics_code: '523999' },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    tags: ['Seed', 'Angel', 'New Haven']
};

export const COMMUNITY_FOUNDATION: Organization = {
    id: 'org_comm_found_008',
    name: 'The Community Foundation for Greater New Haven',
    description: 'Supporting nonprofits and community initiatives in the New Haven region.',
    url: 'https://cfgnh.org',
    tax_status: 'non_profit',
    version: 1,
    roles: ['funder'],
    org_type: 'nonprofit',
    owner_characteristics: [],
    classification: { industry_tags: ['Foundation', 'Philanthropy'], naics_code: '813211' },
    external_refs: [],
    managed_by_ids: [],
    operational_visibility: 'open',
    authorized_eso_ids: [],
    ecosystem_ids: ['eco_new_haven'],
    tags: ['Non-profit', 'Social Impact', 'Local']
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
    ELM_CAPITAL,
    COMMUNITY_FOUNDATION
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
    // Sarah granted MakeHaven access to DarkStar's operational data.
    // 'read' rather than 'write': the portal's grant control issues read
    // access, and a demo showing an ESO with write access over a founder's
    // record invites exactly the question the compact exists to answer.
    {
        id: 'pol_001',
        resourceType: 'organization',
        resourceId: 'org_darkstar_001',
        viewerId: 'org_makehaven',
        accessLevel: 'read',
        isActive: true,
        updatedAt: '2026-03-12T15:20:00.000Z',
        grantedVia: 'self',
        ecosystemId: 'eco_new_haven'
    }
];

// Every grant must have a matching audit event. A policy with an empty history
// reads as access that appeared from nowhere — the opposite of what the
// consent model promises, and the first thing a privacy-minded reviewer checks.
export const MOCK_CONSENT_EVENTS: ConsentEvent[] = [
    {
        id: 'evt_001',
        timestamp: '2026-03-12T15:20:00.000Z',
        actorId: 'person_002',            // Sarah Connor, the founder herself
        action: 'granted',
        resourceId: 'org_darkstar_001',
        viewerId: 'org_makehaven',
        newAccessLevel: 'read',
        grantedVia: 'self',
        reason: 'Granted from the founder portal so MakeHaven staff could see programme history.'
    },
    {
        id: 'evt_002',
        timestamp: '2026-01-08T10:05:00.000Z',
        actorId: 'person_002',
        action: 'acknowledged',
        resourceId: 'org_darkstar_001',
        viewerId: 'eco_new_haven',
        reason: 'Accepted the network compact and privacy notice at sign-up.'
    }
];

// --- Re-added Mock Data for Application Logic ---

// Referrals
export const MOCK_REFERRALS: Referral[] = [
  {
    id: 'ref_001',
    referring_org_id: 'org_makehaven',
    receiving_org_id: 'org_ct_innovations',
    subject_person_id: 'person_002', // Sarah Connor
    subject_org_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
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
    ecosystem_id: 'eco_new_haven',
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
    participation_type: 'membership',
    start_date: '2023-01-10',
    status: 'active',
    description: 'Full access to woodshop and metalshop.'
  },
  {
    id: 'svc_002',
    name: 'Incubator Office Rental',
    provider_org_id: 'org_makehaven',
    recipient_org_id: 'org_darkstar_001', // Linked to company
    participation_type: 'rental',
    start_date: '2023-03-01',
    status: 'active',
    description: 'Office 304, 2 desks.'
  },
  {
    id: 'svc_003',
    name: 'ClimateHaven Accelerator Application',
    provider_org_id: 'org_ct_innovations',
    recipient_org_id: 'org_darkstar_001',
    participation_type: 'application',
    start_date: '2026-02-10',
    status: 'applied',
    description: 'Application submitted for the spring hardware commercialization cohort.'
  },
  {
    id: 'svc_004',
    name: 'Advanced Composites Bootcamp',
    provider_org_id: 'org_makehaven',
    recipient_person_id: 'EAZOJGUdrqn2TbbbKBqon8OUOSoJ',
    participation_type: 'event',
    start_date: '2025-11-06',
    end_date: '2025-11-08',
    status: 'past',
    description: 'Three-day technical bootcamp on marine composites and fabrication workflows.'
  }
];
