
import { Interaction } from '../../domain/interactions/types';

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
    note_confidential: false,
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
    note_confidential: false,
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
    note_confidential: false,
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
    note_confidential: false,
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
    note_confidential: false,
    notes: 'Noticed mention of DarkStar in local press. Alpha prototype looking good.',
    recorded_by: 'J.R. Logan'
  },
  {
    id: 'int_006',
    organization_id: 'org_biogen_006',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_ct_innovations',
    date: '2023-11-20',
    type: 'meeting',
    visibility: 'network_shared',
    note_confidential: false,
    notes: 'Reviewing clinical trial data for Series B round.',
    recorded_by: 'Investment Officer',
    attendees: ['BioGen CEO']
  },
  {
    id: 'int_007',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_elm_cap_007',
    date: '2023-11-25',
    type: 'call',
    visibility: 'eso_private',
    note_confidential: false,
    notes: 'Introductory call. Sarah seems sharp. Winch tech is niche but profitable.',
    recorded_by: 'John Money',
    attendees: ['Sarah Connor']
  },
  // Stealth Interaction
  {
    id: 'int_stealth_001',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_makehaven', // Logged by MakeHaven, but notes private to author or restricted content
    date: '2023-11-15',
    type: 'meeting',
    visibility: 'network_shared', // Shared metadata, but content restricted if org is private
    note_confidential: true,
    notes: 'Discussed confidential patent strategy for Project X.',
    recorded_by: 'J.R. Logan',
    attendees: ['Alex Mystery']
  },
  {
    id: 'int_stealth_002',
    organization_id: 'org_stealth_004',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_makehaven',
    date: '2023-12-01',
    type: 'meeting',
    visibility: 'network_shared',
    note_confidential: true,
    notes: 'Internal engineering review. Discussed propulsion schematics.',
    recorded_by: 'J.R. Logan',
    attendees: ['Alex Mystery', 'Felix Phantom']
  },
  // AI Advisor Example
  {
    id: 'int_advisor_001',
    organization_id: 'org_darkstar_001',
    ecosystem_id: 'eco_new_haven',
    author_org_id: 'org_makehaven',
    date: '2023-11-28',
    type: 'meeting',
    visibility: 'network_shared',
    note_confidential: false,
    notes: 'Quarterly Check-in. Discussed manufacturing scale-up challenges.',
    recorded_by: 'J.R. Logan (AI Assisted)',
    attendees: ['Sarah Connor'],
    advisor_run_id: 'run_genai_12345',
    advisor_suggestions: [
        {
            id: 'sugg_001',
            title: 'Manufacturing Grant Opportunity',
            reason: 'Company is entering low-rate production and matches the CT MFG Voucher profile.',
            type: 'resource',
            confidence_score: 92,
            target_id: 'link_grant_01',
            priority: 'high'
        },
        {
            id: 'sugg_002',
            title: 'Intro to MassChallenge',
            reason: 'Based on current stage and industry (Maritime/DefTech), they are a strong candidate for the next cohort.',
            type: 'action',
            confidence_score: 75,
            priority: 'medium'
        }
    ],
    advisor_acceptances: [
        {
            audit_event: {
                event: 'suggestion_accepted',
                suggestion_id: 'sugg_001',
                actor_id: 'person_001',
                timestamp: '2023-11-28T14:05:00Z'
            }
        }
    ]
  }
];
