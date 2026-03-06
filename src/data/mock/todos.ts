
import { Todo } from '../../domain/todos/types';
import { MOCK_PEOPLE, NEW_HAVEN_ECOSYSTEM } from '../mockData';

const sarahId = 'person_002'; // Entrepreneur
const jrId = 'person_001'; // ESO Admin
const neoId = 'person_admin_000'; // Platform Admin
const coachId = 'person_dual_001'; // Coach

export const MOCK_TODOS: Todo[] = [
  // --- Sarah Connor (Entrepreneur) ---
  {
    id: 'todo_001',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Complete Profile Registration',
    description: 'Fill out the missing demographics info in your profile settings.',
    status: 'completed',
    source: 'system_workflow',
    created_at: '2023-10-01T10:00:00Z',
    created_by: 'system',
    due_date: '2023-10-05T00:00:00Z'
  },
  {
    id: 'todo_002',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Review "Administrative Setup" Checklist',
    description: 'Ensure you have your EIN and bank account set up before applying for grants.',
    status: 'pending',
    source: 'advisor',
    created_at: '2023-11-10T14:30:00Z',
    created_by: 'system_advisor',
    linked_resource_id: 'list_admin_01'
  },
  {
    id: 'todo_003',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Reach out to CT Innovations',
    description: 'Based on your recent milestone, it might be time to discuss pre-seed funding.',
    status: 'in_progress',
    source: 'manual',
    created_at: '2023-11-12T09:15:00Z',
    created_by: sarahId,
    action_url: 'https://ctinnovations.com/contact'
  },
  {
    id: 'todo_004',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Prepare Q4 Investor Update',
    description: 'Compile metrics on prototype velocity and burn rate for the quarterly newsletter.',
    status: 'pending',
    source: 'manual',
    created_at: '2023-11-28T09:00:00Z',
    created_by: sarahId,
    due_date: '2023-12-15T00:00:00Z'
  },
  {
    id: 'todo_005',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Register for "Climate Tech Summit"',
    description: 'Recommended event: Great opportunity to meet specialized investors.',
    status: 'pending',
    source: 'advisor',
    created_at: '2023-11-29T11:20:00Z',
    created_by: 'system_advisor',
    action_url: 'https://example.com/climate-summit-reg'
  },
  {
    id: 'todo_006',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Sign MakerSpace Waiver',
    description: 'Required before using the CNC machine.',
    status: 'completed',
    source: 'system_workflow',
    created_at: '2023-10-15T13:00:00Z',
    created_by: 'system'
  },
  {
    id: 'todo_007',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Review SBIR Grant Eligibility',
    description: 'Your venture classification (Deep Tech) makes you a strong candidate for federal SBIR Phase I funding.',
    status: 'pending',
    source: 'advisor',
    created_at: '2023-12-05T09:00:00Z',
    created_by: 'system_advisor',
    action_url: 'https://www.sbir.gov/'
  },
  {
    id: 'todo_008',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Update Cap Table',
    description: 'You indicated a new angel investment. Ensure your equity distribution records are current.',
    status: 'pending',
    source: 'advisor',
    created_at: '2023-12-06T14:00:00Z',
    created_by: 'system_advisor'
  },
  // Task Assigned by Coach (Dave Dual) to Sarah
  {
    id: 'todo_coach_assignment_01',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: sarahId,
    title: 'Upload CNC Safety Cert',
    description: 'Please upload your certificate so we can clear you for independent machine use.',
    status: 'pending',
    source: 'manual',
    created_at: '2023-12-05T10:00:00Z',
    created_by: coachId,
    due_date: '2023-12-10T00:00:00Z'
  },

  // --- J.R. Logan (ESO Admin - Default User) ---
  {
    id: 'todo_eso_001',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: jrId,
    title: 'Review Pending Referrals (3)',
    description: 'New referral requests from ClimateHaven waiting for review.',
    status: 'pending',
    source: 'system_workflow',
    created_at: '2023-11-30T09:00:00Z',
    created_by: 'system'
  },
  {
    id: 'todo_eso_002',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: jrId,
    title: 'Update MakerSpace Equipment List',
    description: 'The new laser cutter needs to be added to the resource portal.',
    status: 'in_progress',
    source: 'manual',
    created_at: '2023-11-29T10:00:00Z',
    created_by: jrId
  },
  {
    id: 'todo_eso_003',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: jrId,
    title: 'Follow up with DarkStar Marine',
    description: 'Check in on their grant application progress.',
    status: 'pending',
    source: 'advisor',
    created_at: '2023-11-28T14:00:00Z',
    created_by: 'system_advisor'
  },

  // --- Neo Nexus (Platform Admin) ---
  {
    id: 'todo_admin_001',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: neoId,
    title: 'System Health Check',
    description: 'Verify webhook latency statistics for Salesforce integration.',
    status: 'pending',
    source: 'system_workflow',
    created_at: '2023-12-01T08:00:00Z',
    created_by: 'system'
  },
  {
    id: 'todo_admin_002',
    ecosystem_id: NEW_HAVEN_ECOSYSTEM.id,
    owner_id: neoId,
    title: 'Resolve Data Duplicates',
    description: 'Data Quality Engine detected 2 high-confidence matches.',
    status: 'pending',
    source: 'system_workflow',
    created_at: '2023-12-01T08:30:00Z',
    created_by: 'system'
  }
];
